const BaseBotAdapter = require('./base-adapter');
const { messagingApi } = require('@line/bot-sdk');
const crypto = require('crypto');
const express = require('express');
const MessageHandler = require('../handlers/message-handler');
const FileProcessor = require('../handlers/file-processor');

/**
 * LINE Bot プラットフォーム用アダプター
 */
class LineBotAdapter extends BaseBotAdapter {
  constructor(config) {
    super(config);
    this.client = null;
    this.app = null;
    this.server = null;
    this.messageHandler = new MessageHandler(this);
    this.fileProcessor = new FileProcessor();
    
    // LINE固有の制限値
    this.limits = {
      maxMessageLength: 5000,  // LINEメッセージの最大文字数
      maxFiles: 1,             // 同時送信ファイル数上限
      maxFileSize: 100 * 1024 * 1024, // 100MB
      supportedFileTypes: ['image', 'video', 'audio', 'file']
    };
  }

  /**
   * LINE Bot初期化
   */
  async initialize() {
    try {
      // 設定検証
      this.validateConfig();

      // LINE Messaging API クライアント初期化
      this.client = new messagingApi.MessagingApiClient({
        channelAccessToken: this.config.line.channelAccessToken
      });

      // Express アプリケーション初期化
      this.app = express();
      this.setupWebhook();

      this.log('info', 'LINE Bot adapter initialized successfully');
    } catch (error) {
      this.log('error', 'Failed to initialize LINE Bot adapter:', error);
      throw error;
    }
  }

  /**
   * 設定検証
   */
  validateConfig() {
    if (!this.config.line) {
      throw new Error('LINE configuration is missing');
    }

    const required = ['channelAccessToken', 'channelSecret'];
    for (const field of required) {
      if (!this.config.line[field]) {
        throw new Error(`LINE ${field} is required`);
      }
    }

    if (!this.config.line.webhookPort) {
      this.config.line.webhookPort = 3000;
      this.log('warn', 'No webhook port specified, using default: 3000');
    }
  }

  /**
   * Webhook設定
   */
  setupWebhook() {
    // JSON解析ミドルウェア（raw bodyも保持、POSTのみ）
    this.app.use('/webhook', (req, res, next) => {
      // GETリクエストはボディ処理をスキップ
      if (req.method === 'GET') {
        return next();
      }
      
      // POSTリクエストのみボディ処理
      express.raw({ type: 'application/json' })(req, res, (err) => {
        if (err) return next(err);
        if (req.body) {
          req.rawBody = req.body;
          req.body = JSON.parse(req.body.toString());
        }
        next();
      });
    });

    // ヘルスチェック endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        platform: 'LINE',
        timestamp: new Date().toISOString() 
      });
    });

    // LINE Webhook Verify用テストエンドポイント（POSTより先に配置）
    this.app.get('/webhook', (req, res) => {
      this.log('info', 'LINE Webhook Verify request received (GET)');
      res.status(200).send('OK');
    });

    // Webhook endpoint（POST処理）
    this.app.post('/webhook', this.handleWebhook.bind(this));

    this.log('info', 'Webhook endpoints configured');
  }

  /**
   * Webhook処理
   */
  async handleWebhook(req, res) {
    const startTime = Date.now();
    try {
      this.log('info', `📨 Webhook received: ${req.method} ${req.url}`);
      
      // レスポンス用タイムアウト（LINEは20秒以内に応答が必要）
      const webhookTimeout = setTimeout(() => {
        if (!res.headersSent) {
          this.log('warn', 'Webhook timeout, sending OK response');
          res.status(200).send('OK');
        }
      }, parseInt(process.env.WEBHOOK_RESPONSE_TIMEOUT) || 15000); // webhook応答タイムアウト

      //署名検証
      const signature = req.get('x-line-signature');
      if (!this.validateSignature(req.rawBody, this.config.line.channelSecret, signature)) {
        clearTimeout(webhookTimeout);
        this.log('warn', 'Invalid LINE signature');
        return res.status(401).send('Unauthorized');
      }

      // イベント処理
      const events = req.body.events || [];
      this.log('info', `📋 Processing ${events.length} event(s)`);
      
      // 並列処理ではなく順次処理に変更してメモリ使用量を削減
      for (const event of events) {
        try {
          await this.handleEvent(event);
        } catch (eventError) {
          this.log('error', `Event processing error for event ${event.type}:`, eventError);
          // 個別のイベント処理エラーは続行
        }
      }

      clearTimeout(webhookTimeout);
      const processingTime = Date.now() - startTime;
      this.log('info', `✅ Webhook processed successfully in ${processingTime}ms`);
      
      if (!res.headersSent) {
        res.status(200).send('OK');
      }
    } catch (error) {
      this.log('error', 'Webhook handling error:', error);
      if (!res.headersSent) {
        res.status(500).send('Internal Server Error');
      }
    }
  }

  /**
   * イベント処理
   */
  async handleEvent(event) {
    const eventStart = Date.now();
    let eventTimeout;
    
    try {
      this.log('info', `🔔 Event received: ${event.type}`);
      
      // イベント処理タイムアウト（5分）
      eventTimeout = setTimeout(() => {
        this.log('warn', `Event processing timeout for ${event.type} after 5 minutes`);
      }, parseInt(process.env.EVENT_PROCESSING_TIMEOUT) || 300000);
      
      // メッセージイベントのみ処理
      if (event.type !== 'message') {
        this.log('info', `⏭️ Skipping non-message event: ${event.type}`);
        return;
      }

      // テキストメッセージのみ処理
      if (event.message.type !== 'text') {
        this.log('info', `⏭️ Non-text message: ${event.message.type}, sending error response`);
        await this.sendMessage(event, '申し訳ありませんが、テキストメッセージのみサポートしています。');
        return;
      }

      const messageText = event.message.text;
      const userId = event.source.userId;
      this.log('info', `💬 Processing message: "${messageText}" from user: ${userId}`);

      // メッセージを正規化してハンドラーに渡す
      const normalizedMessage = this.normalizeMessage(event);
      
      // メッセージ処理を非同期で実行（ブロッキングを避ける）
      setImmediate(async () => {
        try {
          await this.messageHandler.handleMessage(normalizedMessage, event);
          this.log('info', `✅ Message processed successfully in ${Date.now() - eventStart}ms`);
        } catch (handlerError) {
          this.log('error', 'Message handler error:', handlerError);
          await this.sendErrorMessage(event, handlerError);
        } finally {
          clearTimeout(eventTimeout);
        }
      });

    } catch (error) {
      this.log('error', 'Event handling error:', error);
      await this.sendErrorMessage(event, error);
    } finally {
      if (eventTimeout) {
        clearTimeout(eventTimeout);
      }
    }
  }

  /**
   * Bot開始
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.line.webhookPort, () => {
          this.isConnected = true;
          this.log('info', `LINE Bot webhook listening on port ${this.config.line.webhookPort}`);
          resolve();
        });

        this.server.on('error', (error) => {
          this.log('error', 'Server error:', error);
          reject(error);
        });

      } catch (error) {
        this.log('error', 'Failed to start LINE Bot:', error);
        reject(error);
      }
    });
  }

  /**
   * Bot停止
   */
  async stop() {
    try {
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        this.server = null;
      }
      
      this.isConnected = false;
      this.log('info', 'LINE Bot stopped successfully');
    } catch (error) {
      this.log('error', 'Error stopping LINE Bot:', error);
      throw error;
    }
  }

  /**
   * メッセージ送信
   */
  async sendMessage(context, message) {
    try {
      const userId = context.source?.userId || context.userId;
      if (!userId) {
        throw new Error('No userId found in context');
      }

      // メッセージ長制限チェック
      if (message.length > this.limits.maxMessageLength) {
        const chunks = this.splitMessage(message, this.limits.maxMessageLength);
        for (const chunk of chunks) {
          await this.client.pushMessage({
            to: userId,
            messages: [{ type: 'text', text: chunk }]
          });
        }
      } else {
        await this.client.pushMessage({
          to: userId,
          messages: [{ type: 'text', text: message }]
        });
      }

      this.log('debug', `Message sent to user ${userId}`);
    } catch (error) {
      this.log('error', 'Failed to send message:', error);
      throw error;
    }
  }

  /**
   * ファイル送信（画像とビデオのみサポート）
   */
  async sendFiles(context, files, message) {
    try {
      const userId = context.source?.userId || context.userId;
      if (!userId) {
        throw new Error('No userId found in context');
      }

      this.log('info', `Sending ${files.length} file(s) to user ${userId}`);
      
      // メッセージがある場合は先に送信
      if (message && message.trim()) {
        await this.sendMessage(context, message);
      }
      
      for (const file of files) {
        const mimeType = FileProcessor.getMimeType(file.name);
        const isImage = mimeType.startsWith('image/');
        const isVideo = mimeType.startsWith('video/');
        const isAudio = mimeType.startsWith('audio/');
        
        if (isImage || isVideo || isAudio) {
          // 画像・動画・音声ファイルは直接送信
          let messageType = 'file';
          if (isImage) messageType = 'image';
          else if (isVideo) messageType = 'video';
          else if (isAudio) messageType = 'audio';
          
          await this.sendMediaFile(userId, file, messageType);
        } else {
          // その他のファイルはファイル情報をテキストで送信
          const fileInfo = `📎 ${FileProcessor.getFileIcon(file.name)} ${file.name}\n` +
                          `サイズ: ${FileProcessor.formatFileSize(file.size)}\n` +
                          `タイプ: ${mimeType}`;
          await this.sendMessage(context, fileInfo);
        }
      }
      
      this.log('info', `Successfully sent ${files.length} file(s)`);
    } catch (error) {
      this.log('error', 'Failed to send files:', error);
      throw error;
    }
  }

  /**
   * メディアファイル送信
   */
  async sendMediaFile(userId, file, messageType) {
    try {
      // LINEはHTTPS URLが必要なため、一時的にHTTPサーバーでファイルを提供
      const publicUrl = await this.createTemporaryFileUrl(file);
      
      let messageObj;
      
      if (messageType === 'image') {
        messageObj = {
          type: 'image',
          originalContentUrl: publicUrl,
          previewImageUrl: publicUrl
        };
      } else if (messageType === 'video') {
        // 動画の場合、サムネイル画像を生成または代替画像を使用
        const thumbnailUrl = await this.getVideoThumbnailUrl(file, publicUrl);
        messageObj = {
          type: 'video',
          originalContentUrl: publicUrl,
          previewImageUrl: thumbnailUrl
        };
      } else if (messageType === 'audio') {
        // 音声ファイルの場合
        // LINEは m4a形式を推奨しているが、WAVも送信可能
        const fs = require('fs');
        const stat = fs.statSync(file.path);
        const duration = await this.getAudioDuration(file);
        
        // WAVファイルの場合はm4aへの変換を試みる（ffmpegが必要）
        let audioUrl = publicUrl;
        if (file.name.toLowerCase().endsWith('.wav')) {
          const convertedUrl = await this.convertWavToM4a(file, publicUrl);
          if (convertedUrl) {
            audioUrl = convertedUrl;
            this.log('info', 'WAV file converted to M4A for better LINE compatibility');
          }
        }
        
        messageObj = {
          type: 'audio',
          originalContentUrl: audioUrl,
          duration: duration // ミリ秒単位の再生時間
        };
      } else {
        throw new Error(`Unsupported message type: ${messageType}`);
      }

      // メッセージ送信
      await this.client.pushMessage({
        to: userId,
        messages: [messageObj]
      });

      this.log('info', `Media file sent: ${file.name} (${messageType})`);
      
      // 送信完了から少し待ってファイルを削除（LINEがダウンロード開始する時間を確保）
      // 動画の場合は関連するサムネイルファイルも削除
      setTimeout(async () => {
        await this.deleteLocalFileWithRelated(file, messageType);
      }, parseInt(process.env.TEMP_FILE_CLEANUP_DELAY) || 30000); // 一時ファイル削除遅延
      
    } catch (error) {
      this.log('error', `Failed to send media file ${file.name}:`, error);
      
      // フォールバック: ファイル情報をテキストで送信
      const fileInfo = `🖼️ ファイル: ${file.name}\n` +
                      `サイズ: ${FileProcessor.formatFileSize(file.size)}\n` +
                      `※ 直接送信に失敗したためファイル情報のみ表示`;
      await this.client.pushMessage({
        to: userId,
        messages: [{ type: 'text', text: fileInfo }]
      });
    }
  }

  /**
   * WAVファイルをM4Aに変換
   */
  async convertWavToM4a(file, originalUrl) {
    try {
      const { execSync } = require('child_process');
      const fs = require('fs');
      const path = require('path');
      
      // ffmpegが利用可能か確認
      try {
        execSync('which ffmpeg', { stdio: 'ignore' });
        
        // M4Aファイルパスを生成
        const m4aPath = file.path.replace(/\.wav$/i, '.m4a');
        
        // 変換コマンド実行
        const cmd = `ffmpeg -i "${file.path}" -c:a aac -b:a 128k "${m4aPath}" -y 2>/dev/null`;
        execSync(cmd, { timeout: parseInt(process.env.FFMPEG_TIMEOUT) || 10000 });
        
        if (fs.existsSync(m4aPath)) {
          // M4Aファイル用のファイルオブジェクト作成
          const m4aFile = {
            path: m4aPath,
            name: path.basename(m4aPath),
            size: fs.statSync(m4aPath).size
          };
          
          // M4A用のURLを作成
          const m4aUrl = await this.createTemporaryFileUrl(m4aFile);
          
          // M4Aファイルの削除はメインファイルと一緒に行うので、ここでは削除しない
          
          return m4aUrl;
        }
      } catch (error) {
        this.log('debug', 'ffmpeg not available or conversion failed:', error.message);
      }
      
      // 変換できない場合はnullを返す
      return null;
      
    } catch (error) {
      this.log('error', 'Error converting WAV to M4A:', error);
      return null;
    }
  }

  /**
   * 音声ファイルの再生時間取得（ミリ秒単位）
   */
  async getAudioDuration(file) {
    try {
      const { execSync } = require('child_process');
      
      // ffprobeが利用可能か確認
      try {
        execSync('which ffprobe', { stdio: 'ignore' });
        
        // ffprobeで音声の長さを取得
        const cmd = `ffprobe -i "${file.path}" -show_entries format=duration -v quiet -of csv="p=0"`;
        const durationStr = execSync(cmd, { encoding: 'utf8' }).trim();
        const durationSec = parseFloat(durationStr);
        
        if (!isNaN(durationSec)) {
          // 秒をミリ秒に変換
          return Math.round(durationSec * 1000);
        }
      } catch (error) {
        this.log('debug', 'ffprobe not available or failed to get duration:', error.message);
      }
      
      // ffprobeが使えない場合、またはエラーの場合はデフォルト値を返す
      // WAVファイルの場合はファイルサイズから推定することも可能
      const fs = require('fs');
      const stat = fs.statSync(file.path);
      
      // WAVファイルの場合、簡易的に推定（44.1kHz, 16bit, ステレオと仮定）
      if (file.name.toLowerCase().endsWith('.wav')) {
        // WAVヘッダー44バイトを除いて、1秒あたり176,400バイトと仮定
        const audioDataSize = stat.size - 44;
        const estimatedSeconds = audioDataSize / 176400;
        return Math.round(estimatedSeconds * 1000);
      }
      
      // その他の形式やエラー時は60秒をデフォルトとする
      return parseInt(process.env.FILE_SERVE_TIMEOUT) || 60000;
      
    } catch (error) {
      this.log('error', 'Error getting audio duration:', error);
      return parseInt(process.env.FILE_SERVE_TIMEOUT) || 60000; // デフォルト60秒
    }
  }

  /**
   * 動画のサムネイルURL取得
   */
  async getVideoThumbnailUrl(file, videoUrl) {
    try {
      const fs = require('fs');
      const path = require('path');
      const { execSync } = require('child_process');
      
      // ffmpegが利用可能か確認
      try {
        execSync('which ffmpeg', { stdio: 'ignore' });
        
        // サムネイル生成（最初のフレームを使用、1秒目が存在しない短い動画にも対応）
        const thumbnailPath = file.path.replace(/\.[^/.]+$/, '_thumb.jpg');
        
        // まず動画の長さを取得
        let seekTime = '00:00:00'; // デフォルトは最初のフレーム
        try {
          const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file.path}"`;
          const duration = parseFloat(execSync(durationCmd, { encoding: 'utf8' }).trim());
          
          if (!isNaN(duration) && duration > 1) {
            // 1秒以上の動画の場合は1秒目を使用
            seekTime = '00:00:01';
          }
        } catch (durError) {
          this.log('debug', 'Could not get video duration, using first frame');
        }
        
        // サムネイル生成（高品質設定）
        const ffmpegCmd = `ffmpeg -i "${file.path}" -ss ${seekTime} -vframes 1 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -q:v 2 "${thumbnailPath}" -y 2>/dev/null`;
        
        try {
          execSync(ffmpegCmd, { timeout: parseInt(process.env.FFMPEG_TIMEOUT) || 10000 });
          
          if (fs.existsSync(thumbnailPath)) {
            // サムネイル用のファイルオブジェクト作成
            const thumbnailFile = {
              path: thumbnailPath,
              name: path.basename(thumbnailPath),
              size: fs.statSync(thumbnailPath).size
            };
            
            // サムネイル用のURLを作成
            const thumbnailUrl = await this.createTemporaryFileUrl(thumbnailFile);
            
            // サムネイルファイルの削除はメインファイルと一緒に行うので、ここでは削除しない
            
            return thumbnailUrl;
          }
        } catch (ffmpegError) {
          this.log('warn', `Failed to generate thumbnail with ffmpeg: ${ffmpegError.message}`);
        }
      } catch (whichError) {
        this.log('debug', 'ffmpeg not available for thumbnail generation');
      }
      
      // ffmpegが使えない場合は、デフォルトの動画アイコン画像を返す
      // または動画URLをそのまま返す（LINEが自動でサムネイルを生成する場合がある）
      const defaultThumb = await this.getDefaultVideoThumbnailUrl();
      return defaultThumb || videoUrl;
      
    } catch (error) {
      this.log('error', 'Error generating video thumbnail:', error);
      return videoUrl; // エラー時は動画URLをそのまま返す
    }
  }

  /**
   * デフォルトの動画サムネイルURL取得または生成
   */
  async getDefaultVideoThumbnailUrl() {
    // デフォルトのサムネイル画像がある場合はそのURLを返す
    if (this.config.line.defaultVideoThumbnail) {
      return this.config.line.defaultVideoThumbnail;
    }
    
    // デフォルトサムネイル画像を生成（黒背景に再生ボタン）
    try {
      const fs = require('fs');
      const path = require('path');
      const { execSync } = require('child_process');
      
      const defaultThumbPath = path.join(process.cwd(), 'default_video_thumb.jpg');
      
      // すでに存在する場合はそれを使用
      if (fs.existsSync(defaultThumbPath)) {
        const defaultThumbFile = {
          path: defaultThumbPath,
          name: 'default_video_thumb.jpg',
          size: fs.statSync(defaultThumbPath).size
        };
        return await this.createTemporaryFileUrl(defaultThumbFile);
      }
      
      // ffmpegで黒背景に白い再生ボタンを生成
      const createCmd = `ffmpeg -f lavfi -i "color=c=black:s=1280x720:d=1" -vf "drawtext=text='▶':fontcolor=white:fontsize=120:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 "${defaultThumbPath}" -y 2>/dev/null`;
      
      try {
        execSync(createCmd, { timeout: 5000 });
        
        if (fs.existsSync(defaultThumbPath)) {
          const defaultThumbFile = {
            path: defaultThumbPath,
            name: 'default_video_thumb.jpg',
            size: fs.statSync(defaultThumbPath).size
          };
          return await this.createTemporaryFileUrl(defaultThumbFile);
        }
      } catch (error) {
        this.log('debug', 'Could not create default thumbnail:', error.message);
      }
    } catch (error) {
      this.log('debug', 'Error in getDefaultVideoThumbnailUrl:', error);
    }
    
    return null;
  }

  /**
   * 一時的なファイルURL作成
   */
  async createTemporaryFileUrl(file) {
    const path = require('path');
    const crypto = require('crypto');
    
    // ランダムなファイルIDを生成
    const fileId = crypto.randomBytes(16).toString('hex');
    const fileName = path.basename(file.path);
    
    // 静的ファイル提供用のルートを追加
    this.app.get(`/temp/${fileId}/${fileName}`, (req, res) => {
      const fs = require('fs');
      
      try {
        if (!fs.existsSync(file.path)) {
          return res.status(404).send('File not found');
        }
        
        const mimeType = FileProcessor.getMimeType(fileName);
        const stat = fs.statSync(file.path);
        
        // 適切なヘッダーを設定（LINEのプレビュー用）
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.setHeader('Accept-Ranges', 'bytes');
        
        // Range リクエストの処理（動画プレビュー用）
        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          const chunksize = (end - start) + 1;
          
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
          res.setHeader('Content-Length', chunksize);
          
          const fileStream = fs.createReadStream(file.path, { start, end });
          fileStream.pipe(res);
        } else {
          // 通常のリクエスト
          const fileStream = fs.createReadStream(file.path);
          fileStream.pipe(res);
        }
        
        // デバッグログを1回だけ出力（初回アクセス時のみ）
        if (!req.headers.range || req.headers.range === 'bytes=0-') {
          this.log('debug', `Serving temp file: ${fileName}`);
        }
        
      } catch (error) {
        this.log('error', `Error serving temp file: ${error}`);
        res.status(500).send('Internal Server Error');
      }
    });
    
    // publicUrlが設定されている場合はそれを使用、なければlocalhostを使用
    let baseUrl = this.config.line.publicUrl;
    
    // publicUrlが設定されていない場合は警告
    if (!baseUrl) {
      this.log('warn', 'LINE_PUBLIC_URL not configured. Media files may not work.');
      baseUrl = `http://localhost:${this.config.line.webhookPort}`;
    }
    
    // HTTPSでない場合は警告
    if (!baseUrl.startsWith('https://')) {
      this.log('warn', 'LINE_PUBLIC_URL is not HTTPS. LINE requires HTTPS URLs for media.');
    }
    
    const publicUrl = `${baseUrl}/temp/${fileId}/${fileName}`;
    
    this.log('info', `Created temporary file URL: ${publicUrl}`);
    return publicUrl;
  }

  /**
   * ローカルファイル削除
   */
  async deleteLocalFile(file) {
    try {
      const fs = require('fs');
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
        this.log('info', `✅ Local file deleted: ${file.name}`);
      }
    } catch (error) {
      this.log('error', `Failed to delete local file ${file.name}:`, error);
    }
  }

  /**
   * ローカルファイルと関連ファイルを削除
   */
  async deleteLocalFileWithRelated(file, messageType) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // メインファイルを削除
      await this.deleteLocalFile(file);
      
      // 動画の場合、サムネイルファイルも削除
      if (messageType === 'video') {
        const thumbnailPath = file.path.replace(/\.[^/.]+$/, '_thumb.jpg');
        if (fs.existsSync(thumbnailPath)) {
          fs.unlinkSync(thumbnailPath);
          this.log('info', `✅ Thumbnail deleted: ${path.basename(thumbnailPath)}`);
        }
      }
      
      // 音声ファイルの場合、変換されたM4Aファイルも削除
      if (messageType === 'audio' && file.name.toLowerCase().endsWith('.wav')) {
        const m4aPath = file.path.replace(/\.wav$/i, '.m4a');
        if (fs.existsSync(m4aPath)) {
          fs.unlinkSync(m4aPath);
          this.log('info', `✅ Converted M4A deleted: ${path.basename(m4aPath)}`);
        }
      }
      
      // 一時ファイルストレージからも削除
      if (this.tempFileStorage && this.tempFileStorage.size > 0) {
        for (const [key, value] of this.tempFileStorage.entries()) {
          if (value.filePath === file.path || 
              value.filePath.includes(file.name.replace(/\.[^/.]+$/, ''))) {
            this.tempFileStorage.delete(key);
            this.log('debug', `Removed from temp storage: ${key}`);
          }
        }
      }
    } catch (error) {
      this.log('error', `Failed to delete related files for ${file.name}:`, error);
    }
  }

  /**
   * エラーメッセージ送信
   */
  async sendErrorMessage(context, error) {
    const errorMessage = this.getErrorMessage(error);
    try {
      await this.sendMessage(context, errorMessage);
    } catch (sendError) {
      this.log('error', 'Failed to send error message:', sendError);
    }
  }

  /**
   * メッセージ正規化（LINE → 共通形式）
   */
  normalizeMessage(event) {
    return {
      platform: 'line',
      userId: event.source.userId,
      userName: event.source.userId, // LINEではユーザー名を直接取得不可
      channelId: event.source.type === 'group' ? event.source.groupId : 
                event.source.type === 'room' ? event.source.roomId : 'direct',
      content: event.message.text, // 'text' → 'content' に変更
      text: event.message.text,
      timestamp: new Date(event.timestamp),
      isDirectMessage: event.source.type === 'user',
      isDM: event.source.type === 'user',
      isBotMentioned: true, // LINEでは基本的に全メッセージがBot宛て
      isMentioned: true,
      hasPrefix: false, // LINEではプレフィックス不要
      isBot: false, // ユーザーからのメッセージなのでfalse
      isSystem: false, // システムメッセージではない
      isSlashCommand: false, // LINEにはスラッシュコマンドなし
      isButtonClick: false, // ボタンクリックではない
      rawEvent: event,
      replyToken: event.replyToken,
      source: event.source
    };
  }

  /**
   * プラットフォーム制限値取得
   */
  getPlatformLimits() {
    return this.limits;
  }

  /**
   * LINE署名検証
   */
  validateSignature(body, channelSecret, signature) {
    if (!signature || !channelSecret) {
      return false;
    }
    
    const hash = crypto.createHmac('sha256', channelSecret).update(body).digest('base64');
    return signature === hash;
  }

  /**
   * メッセージ分割
   */
  splitMessage(message, maxLength) {
    const chunks = [];
    let currentChunk = '';
    
    const lines = message.split('\n');
    
    for (const line of lines) {
      if ((currentChunk + line + '\n').length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        // 1行が制限を超える場合は強制分割
        if (line.length > maxLength) {
          for (let i = 0; i < line.length; i += maxLength) {
            chunks.push(line.substring(i, i + maxLength));
          }
        } else {
          currentChunk = line + '\n';
        }
      } else {
        currentChunk += line + '\n';
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
}

module.exports = LineBotAdapter;