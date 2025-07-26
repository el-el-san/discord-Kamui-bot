/**
 * プラットフォーム非依存の共通メッセージハンドラー
 */
class MessageHandler {
  constructor(adapter) {
    this.adapter = adapter;
  }

  /**
   * メッセージ処理のメインロジック
   * @param {Object} normalizedMessage - 正規化されたメッセージ
   * @param {Object} context - プラットフォーム固有のコンテキスト
   */
  async handleMessage(normalizedMessage, context) {
    try {
      this.adapter.log('info', '[DEBUG] handleMessage started');
      
      // 基本的なフィルタリング
      if (!this.shouldProcessMessage(normalizedMessage)) {
        this.adapter.log('info', '[DEBUG] Message should not be processed, returning');
        return;
      }
      this.adapter.log('info', '[DEBUG] Message passed shouldProcessMessage check');

      // 入力のクリーンアップ
      const cleanInput = this.cleanupInput(normalizedMessage);
      this.adapter.log('info', `[DEBUG] Clean input: "${cleanInput}"`);
      
      if (!cleanInput || cleanInput.trim() === '') {
        this.adapter.log('info', '[DEBUG] Clean input is empty, sending error message');
        await this.adapter.sendMessage(context, '何かメッセージを入力してください。');
        return;
      }

      this.adapter.log('info', `受信: ${normalizedMessage.author.username} - "${cleanInput}"`);

      // 特別なコマンド処理
      this.adapter.log('info', '[DEBUG] Checking special commands');
      if (await this.handleSpecialCommands(cleanInput, context)) {
        this.adapter.log('info', '[DEBUG] Handled as special command, returning');
        return;
      }
      this.adapter.log('info', '[DEBUG] Not a special command, proceeding to Claude processing');

      // Claudeでの処理（タイムアウト付き - 内部タイムアウトと一致）
      this.adapter.log('info', 'Starting Claude processing...');
      const response = await Promise.race([
        this.adapter.processWithClaude(cleanInput, true),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Claude processing timeout after 185 seconds')), 185000)
        )
      ]);
      this.adapter.log('info', 'Claude response received:', response ? `${response.length} chars` : 'empty');

      // レスポンス送信
      this.adapter.log('info', 'Sending response to user...');
      try {
        await this.sendResponse(context, response);
        this.adapter.log('info', 'Response sent successfully');
      } catch (sendError) {
        this.adapter.log('error', 'Failed to send response:', sendError);
        throw sendError;
      }

      // 生成されたファイルの検索と添付
      try {
        this.adapter.log('info', 'Checking for generated files...');
        await this.attachGeneratedFiles(context);
        this.adapter.log('info', 'File attachment check completed');
      } catch (fileError) {
        this.adapter.log('error', 'Failed to attach files:', fileError);
        // ファイル添付失敗は非致命的なエラーとして処理
      }

    } catch (error) {
      this.adapter.log('error', '[DEBUG] Exception caught in handleMessage:', error);
      this.adapter.log('error', '[DEBUG] Error stack:', error.stack);
      this.adapter.log('error', 'メッセージ処理エラー:', error);
      try {
        await this.adapter.sendErrorMessage(context, error);
        this.adapter.log('info', '[DEBUG] Error message sent to user');
      } catch (sendError) {
        this.adapter.log('error', '[DEBUG] Failed to send error message:', sendError);
      }
    }
  }

  /**
   * メッセージを処理すべきかの判定
   * @param {Object} normalizedMessage - 正規化されたメッセージ
   * @returns {boolean} 処理すべきかどうか
   */
  shouldProcessMessage(normalizedMessage) {
    // Bot自身のメッセージは無視
    if (normalizedMessage.isBot) return false;

    // システムメッセージは無視
    if (normalizedMessage.isSystem) return false;

    // 空のメッセージは無視
    if (!normalizedMessage.content || normalizedMessage.content.trim() === '') return false;

    // メンション、プレフィックス、DM チェック
    const hasPrefix = normalizedMessage.hasPrefix;
    const isDM = normalizedMessage.isDM;
    const isMentioned = normalizedMessage.isMentioned;
    
    // スラッシュコマンドかどうかをチェック（contextに基づく）
    const isSlashCommand = normalizedMessage.isSlashCommand;

    // プレフィックス付きコマンド、DM、メンション、またはスラッシュコマンドの場合のみ処理
    return hasPrefix || isDM || isMentioned || isSlashCommand;
  }

  /**
   * 入力のクリーンアップ
   * @param {Object} normalizedMessage - 正規化されたメッセージ
   * @returns {string} クリーンアップされた入力
   */
  cleanupInput(normalizedMessage) {
    let input = normalizedMessage.content;
    
    if (normalizedMessage.hasPrefix) {
      // プレフィックスを除去
      input = input.slice(normalizedMessage.prefix.length).trim();
    } else if (normalizedMessage.isMentioned) {
      // メンションを除去（プラットフォーム固有の処理）
      input = this.removeMentions(input);
    }

    return input;
  }

  /**
   * メンション除去（プラットフォーム固有処理は継承先で実装）
   * @param {string} input - 入力文字列
   * @returns {string} メンション除去後の文字列
   */
  removeMentions(input) {
    // デフォルト実装（Discord形式）
    return input.replace(/<@!?\d+>/g, '').trim();
  }

  /**
   * 特別なコマンド処理
   * @param {string} input - ユーザー入力
   * @param {Object} context - プラットフォーム固有のコンテキスト
   * @returns {Promise<boolean>} 特別なコマンドとして処理されたかどうか
   */
  async handleSpecialCommands(input, context) {
    const lowerInput = input.toLowerCase();

    // リセットコマンド
    if (lowerInput === '/reset' || lowerInput === 'リセット') {
      try {
        await this.adapter.resetConversation();
        await this.adapter.sendMessage(context, '🔄 会話履歴をリセットしました。新しい会話を開始します。');
      } catch (error) {
        this.adapter.log('error', 'Reset error:', error);
        await this.adapter.sendMessage(context, '🔄 会話履歴をリセットしました。新しい会話を開始します。');
      }
      return true;
    }

    // ヘルプコマンド
    if (lowerInput === '/help' || lowerInput === 'ヘルプ') {
      const helpMessage = this.getHelpMessage();
      await this.adapter.sendMessage(context, helpMessage);
      return true;
    }

    return false;
  }

  /**
   * ヘルプメッセージ取得
   * @returns {string} ヘルプメッセージ
   */
  getHelpMessage() {
    const platformName = this.adapter.constructor.name.replace('BotAdapter', '');
    
    return `
🤖 **Kamui Bot ヘルプ**

**基本的な使い方:**
• メンション形式でボットに話しかける
• プレフィックス形式 (\`!\`)
• DM でも利用可能

**特別なコマンド:**
• \`/reset\` または \`リセット\` - 会話履歴をリセット
• \`/help\` または \`ヘルプ\` - このヘルプを表示

**会話機能:**
• 会話は自動的に継続されます
• Claude Code SDK の全機能を利用可能

**プラットフォーム:** ${platformName}
    `;
  }

  /**
   * レスポンス送信（長いメッセージの分割処理含む）
   * @param {Object} context - プラットフォーム固有のコンテキスト
   * @param {string} response - 送信するレスポンス
   */
  async sendResponse(context, response) {
    this.adapter.log('info', `sendResponse called with response length: ${response ? response.length : 0}`);
    
    if (!response || response.trim() === '') {
      this.adapter.log('warn', 'Response is empty, sending default message');
      await this.adapter.sendMessage(context, '申し訳ありませんが、応答を生成できませんでした。');
      return;
    }

    const limits = this.adapter.getPlatformLimits();
    const maxLength = limits.messageLength;
    
    this.adapter.log('info', `Response length: ${response.length}, max length: ${maxLength}`);
    
    if (response.length <= maxLength) {
      this.adapter.log('info', 'Sending single message');
      await this.adapter.sendMessage(context, response);
    } else {
      // 長いメッセージを分割して送信
      const chunks = this.splitMessage(response, maxLength);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const prefix = i === 0 ? '' : `（続き ${i + 1}/${chunks.length}）\n`;
        await this.adapter.sendMessage(context, prefix + chunk);
        
        // 連続送信の間隔を空ける
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  }

  /**
   * 長いメッセージを指定した長さで分割
   * @param {string} text - 分割するテキスト
   * @param {number} maxLength - 最大長
   * @returns {string[]} - 分割されたテキストの配列
   */
  splitMessage(text, maxLength) {
    const chunks = [];
    let currentChunk = '';

    const lines = text.split('\n');
    
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 <= maxLength) {
        currentChunk += (currentChunk ? '\n' : '') + line;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
        
        // 1行が長すぎる場合は強制分割
        if (line.length > maxLength) {
          for (let i = 0; i < line.length; i += maxLength) {
            chunks.push(line.slice(i, i + maxLength));
          }
        } else {
          currentChunk = line;
        }
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  /**
   * 生成されたファイルを検索してプラットフォームに添付
   * @param {Object} context - プラットフォーム固有のコンテキスト
   */
  async attachGeneratedFiles(context) {
    try {
      const FileProcessor = require('./file-processor');
      const recentFiles = FileProcessor.findRecentFiles();
      
      if (recentFiles.length > 0) {
        const limits = this.adapter.getPlatformLimits();
        const validFiles = recentFiles.filter(file => file.size <= limits.fileSize);
        
        if (validFiles.length > 0) {
          this.adapter.log('info', `Attaching ${validFiles.length} generated files`);
          
          const fileTypes = [...new Set(validFiles.map(f => FileProcessor.getFileIcon(f.name)))];
          const iconText = fileTypes.join('');
          const message = `${iconText} 生成されたファイル (${validFiles.length}個):`;
          
          await this.adapter.sendFiles(context, validFiles, message);
          
          // 送信完了後、ローカルファイルを削除
          await FileProcessor.deleteUploadedFiles(validFiles);
        }
      }
    } catch (error) {
      this.adapter.log('error', 'File attachment error:', error);
    }
  }
}

module.exports = MessageHandler;