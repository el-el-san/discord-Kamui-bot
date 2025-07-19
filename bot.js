const { Client, GatewayIntentBits, Events, AttachmentBuilder, REST, Routes } = require('discord.js');
const config = require('./config/config');
const ClaudeProcessor = require('./utils/claude');
const commands = require('./commands');
const fs = require('fs');
const path = require('path');

/**
 * Discord Bot メインクラス
 */
class KamuiBot {
  constructor() {
    // Discord クライアントの初期化
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
      ]
    });

    // Claude プロセッサーの初期化
    this.claude = new ClaudeProcessor();

    // イベントリスナーの設定
    this.setupEventListeners();
  }

  /**
   * イベントリスナーの設定
   */
  setupEventListeners() {
    // Bot準備完了イベント
    this.client.once(Events.ClientReady, async (readyClient) => {
      console.log(`✅ ${readyClient.user.tag} がログインしました！`);
      console.log(`🤖 Bot名: ${config.discord.botName}`);
      
      // スラッシュコマンドを自動登録
      await this.deploySlashCommands(readyClient);
      
      // Claude健康状態チェック
      const isClaudeHealthy = await this.claude.checkHealth();
      console.log(`🧠 Claude Code SDK: ${isClaudeHealthy ? '✅ 正常' : '❌ エラー'}`);
      
      if (!isClaudeHealthy) {
        console.warn('⚠️  Claude Code SDKに問題があります。botは制限された機能で動作します。');
      }
    });

    // メッセージ受信イベント
    this.client.on(Events.MessageCreate, async (message) => {
      await this.handleMessage(message);
    });

    // スラッシュコマンドイベント
    this.client.on(Events.InteractionCreate, async (interaction) => {
      await this.handleInteraction(interaction);
    });

    // エラーハンドリング
    this.client.on(Events.Error, (error) => {
      console.error('❌ Discord クライアントエラー:', error);
    });

    // プロセス終了時の処理
    process.on('SIGINT', () => {
      console.log('\\n🔄 Bot を終了しています...');
      this.client.destroy();
      process.exit(0);
    });
  }

  /**
   * メッセージハンドリング
   * @param {Message} message - Discordメッセージ
   */
  async handleMessage(message) {
    try {
      // Bot自身のメッセージは無視
      if (message.author.bot) return;

      // システムメッセージは無視
      if (message.system) return;

      // 空のメッセージは無視
      if (!message.content || message.content.trim() === '') return;

      // メンション、プレフィックス、DM チェック
      const hasPrefix = message.content.startsWith(config.discord.prefix);
      const isDM = message.channel.type === 1; // DM_CHANNEL
      const isMentioned = message.mentions.has(this.client.user);

      // プレフィックス付きコマンド、DM、またはメンションの場合のみ処理
      if (!hasPrefix && !isDM && !isMentioned) return;

      // 入力をクリーンアップ
      let input = message.content;
      
      if (hasPrefix) {
        // プレフィックスを除去
        input = input.slice(config.discord.prefix.length).trim();
      } else if (isMentioned) {
        // メンションを除去
        input = input.replace(/<@!?\d+>/g, '').trim();
      }

      // 空の入力は無視
      if (!input) {
        await message.reply('何かメッセージを入力してください。');
        return;
      }

      console.log(`📨 受信: ${message.author.tag} - "${input}"`);

      // 特別なコマンド処理
      if (input.toLowerCase() === '/reset' || input.toLowerCase() === 'リセット') {
        await message.channel.sendTyping();
        try {
          await this.claude.resetConversation();
          await message.reply('🔄 会話履歴をリセットしました。新しい会話を開始します。');
        } catch (error) {
          console.error('Reset error:', error);
          await message.reply('🔄 会話履歴をリセットしました。新しい会話を開始します。');
        }
        return;
      }

      if (input.toLowerCase() === '/help' || input.toLowerCase() === 'ヘルプ') {
        const helpMessage = `
🤖 **Kamui Bot ヘルプ**

**基本的な使い方:**
• \`@KAMUI_CODE メッセージ\` - メンション形式
• \`!メッセージ\` - プレフィックス形式
• DM でも利用可能

**特別なコマンド:**
• \`/reset\` または \`リセット\` - 会話履歴をリセット
• \`/help\` または \`ヘルプ\` - このヘルプを表示

**会話機能:**
• 会話は自動的に継続されます
• Claude Code SDK の全機能を利用可能
        `;
        await message.reply(helpMessage);
        return;
      }

      // "タイピング中"インジケータを表示
      await message.channel.sendTyping();

      // 会話継続判定（リセットでない限り継続）
      const continueConversation = true;

      // ストリーミング表示用の変数
      let streamingMessage = null;
      let accumulatedText = '';
      let lastUpdateTime = 0;
      const updateThreshold = 2000; // 2秒間隔で更新

      // ストリーミングコールバック関数
      const onStream = async (chunk, type) => {
        try {
          console.log(`Stream chunk (${type}):`, chunk);
          
          // テキストタイプのみDiscordに表示
          if (type === 'text' || type === 'final_result') {
            accumulatedText += chunk;
            
            const now = Date.now();
            // 2秒間隔または最終結果の場合のみ更新
            if (now - lastUpdateTime > updateThreshold || type === 'final_result') {
              lastUpdateTime = now;
              
              if (!streamingMessage && accumulatedText.trim()) {
                // 初回メッセージ送信
                streamingMessage = await message.reply(accumulatedText);
              } else if (streamingMessage && accumulatedText.trim()) {
                // メッセージ更新（文字数制限チェック）
                const content = accumulatedText.length > 2000 
                  ? accumulatedText.substring(0, 1990) + '...'
                  : accumulatedText;
                await streamingMessage.edit(content);
              }
            }
          } else if (type === 'tool_use') {
            // ツール使用通知
            if (!streamingMessage) {
              streamingMessage = await message.reply(chunk);
            } else {
              const updatedContent = accumulatedText + (accumulatedText ? '\n\n' : '') + chunk;
              await streamingMessage.edit(updatedContent.length > 2000 
                ? updatedContent.substring(0, 1990) + '...'
                : updatedContent);
            }
          }
        } catch (streamError) {
          console.error('Streaming error:', streamError);
        }
      };

      // Claudeに処理を依頼
      const response = await this.claude.processInput(input, continueConversation);
      console.log('Claude response received:', response);

      // 最終レスポンスを送信
      await this.sendResponse(message, response);

      // 生成されたファイルの検索と添付
      await this.attachGeneratedFiles(message);

    } catch (error) {
      console.error('❌ メッセージ処理エラー:', error);
      await this.sendErrorResponse(message, error);
    }
  }

  /**
   * レスポンス送信（長いメッセージの分割処理含む）
   * @param {Message} message - 元のメッセージ
   * @param {string} response - 送信するレスポンス
   */
  async sendResponse(message, response) {
    if (!response || response.trim() === '') {
      await message.reply('申し訳ありませんが、応答を生成できませんでした。');
      return;
    }

    // Discordの文字数制限（2000文字）を考慮
    const maxLength = 2000;
    
    if (response.length <= maxLength) {
      await message.reply(response);
    } else {
      // 長いメッセージを分割して送信
      const chunks = this.splitMessage(response, maxLength);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const prefix = i === 0 ? '' : `（続き ${i + 1}/${chunks.length}）\\n`;
        await message.channel.send(prefix + chunk);
        
        // 連続送信の間隔を空ける
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  }

  /**
   * エラーレスポンス送信
   * @param {Message} message - 元のメッセージ
   * @param {Error} error - エラーオブジェクト
   */
  async sendErrorResponse(message, error) {
    console.error('Detailed error:', error);
    
    const errorMessages = {
      timeout: '⏱️ 処理がタイムアウトしました。もう一度お試しください。',
      network: '🌐 ネットワークエラーが発生しました。',
      claude: '🧠 Claude Code SDKでエラーが発生しました。',
      default: '❌ 申し訳ありませんが、エラーが発生しました。'
    };

    let errorMessage = errorMessages.default;
    
    if (error.message.includes('timeout')) {
      errorMessage = errorMessages.timeout;
    } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
      errorMessage = errorMessages.network;
    } else if (error.message.includes('Claude') || error.message.includes('process exited')) {
      errorMessage = errorMessages.claude + `\n詳細: ${error.message}`;
    }

    await message.reply(errorMessage);
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

    const lines = text.split('\\n');
    
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 <= maxLength) {
        currentChunk += (currentChunk ? '\\n' : '') + line;
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
   * 生成されたファイルを検索してDiscordに添付
   * @param {Message} message - 元のメッセージ
   */
  async attachGeneratedFiles(message) {
    try {
      const currentDir = process.cwd();
      const files = fs.readdirSync(currentDir);
      
      // 全メディアファイルタイプを検索
      const mediaExtensions = [
        // 画像
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.tiff',
        // 動画
        '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v',
        // 音声
        '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma',
        // 3Dモデル
        '.obj', '.fbx', '.gltf', '.glb', '.dae', '.3ds', '.blend', '.stl',
        // その他
        '.zip', '.rar', '.7z', '.tar', '.gz'
      ];
      const recentFiles = [];
      
      // 10分以内に作成されたファイルを検索
      const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
      
      for (const file of files) {
        const filePath = path.join(currentDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isFile() && stats.mtime.getTime() > tenMinutesAgo) {
          const ext = path.extname(file).toLowerCase();
          if (mediaExtensions.includes(ext)) {
            recentFiles.push({
              path: filePath,
              name: file,
              size: stats.size
            });
          }
        }
      }
      
      // ファイルサイズ制限チェック（25MB）
      const maxSize = 25 * 1024 * 1024;
      const validFiles = recentFiles.filter(file => file.size <= maxSize);
      
      if (validFiles.length > 0) {
        console.log(`📎 Attaching ${validFiles.length} generated files`);
        
        const attachments = validFiles.map(file => 
          new AttachmentBuilder(file.path, { name: file.name })
        );
        
        // ファイルタイプに応じたアイコンを選択
        const getFileIcon = (filename) => {
          const ext = path.extname(filename).toLowerCase();
          if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.tiff'].includes(ext)) return '🖼️';
          if (['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'].includes(ext)) return '🎬';
          if (['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'].includes(ext)) return '🎵';
          if (['.obj', '.fbx', '.gltf', '.glb', '.dae', '.3ds', '.blend', '.stl'].includes(ext)) return '🗿';
          return '📎';
        };

        const fileTypes = [...new Set(validFiles.map(f => getFileIcon(f.name)))];
        const iconText = fileTypes.join('');

        // ファイルを添付して送信
        await message.channel.send({
          content: `${iconText} 生成されたファイル (${validFiles.length}個):`,
          files: attachments
        });

        // 送信完了後、ローカルファイルを削除
        await this.deleteUploadedFiles(validFiles);
      }
    } catch (error) {
      console.error('File attachment error:', error);
    }
  }

  /**
   * スラッシュコマンドインタラクション処理
   * @param {Interaction} interaction - Discordインタラクション
   */
  async handleInteraction(interaction) {
    try {
      // スラッシュコマンドでない場合は無視
      if (!interaction.isChatInputCommand()) return;

      const { commandName, options } = interaction;
      console.log(`⚡ スラッシュコマンド実行: /${commandName} by ${interaction.user.tag}`);

      // defer reply を送信（処理時間がかかる可能性があるため）
      await interaction.deferReply();

      switch (commandName) {
        case 'ask': {
          const question = options.getString('question');
          if (!question) {
            await interaction.editReply('質問を入力してください。');
            return;
          }

          console.log(`📨 スラッシュコマンド質問: "${question}"`);

          // Claudeに処理を依頼
          const response = await this.claude.processInput(question, true);
          
          // レスポンスを送信
          await this.sendInteractionResponse(interaction, response);
          
          // 生成されたファイルの検索と添付
          await this.attachGeneratedFilesToInteraction(interaction);
          break;
        }

        case 'reset': {
          try {
            await this.claude.resetConversation();
            await interaction.editReply('🔄 会話履歴をリセットしました。新しい会話を開始します。');
          } catch (error) {
            console.error('Reset error:', error);
            await interaction.editReply('🔄 会話履歴をリセットしました。新しい会話を開始します。');
          }
          break;
        }

        case 'help': {
          const helpMessage = `
🤖 **Kamui Bot ヘルプ**

**スラッシュコマンド:**
• \`/ask question:[質問]\` - Claude Code SDKに質問
• \`/reset\` - 会話履歴をリセット
• \`/help\` - このヘルプを表示

**従来の使い方:**
• \`@KAMUI_CODE メッセージ\` - メンション形式
• \`!メッセージ\` - プレフィックス形式
• DM でも利用可能

**会話機能:**
• 会話は自動的に継続されます
• Claude Code SDK の全機能を利用可能
          `;
          await interaction.editReply(helpMessage);
          break;
        }

        default:
          await interaction.editReply('❌ 不明なコマンドです。');
      }

    } catch (error) {
      console.error('❌ スラッシュコマンド処理エラー:', error);
      await this.sendInteractionErrorResponse(interaction, error);
    }
  }

  /**
   * インタラクションレスポンス送信
   * @param {Interaction} interaction - Discordインタラクション
   * @param {string} response - 送信するレスポンス
   */
  async sendInteractionResponse(interaction, response) {
    if (!response || response.trim() === '') {
      await interaction.editReply('申し訳ありませんが、応答を生成できませんでした。');
      return;
    }

    // Discordの文字数制限（2000文字）を考慮
    const maxLength = 2000;
    
    if (response.length <= maxLength) {
      await interaction.editReply(response);
    } else {
      // 長いメッセージを分割して送信
      const chunks = this.splitMessage(response, maxLength);
      
      // 最初のチャンクでeditReply
      await interaction.editReply(chunks[0]);
      
      // 残りのチャンクはfollowUp
      for (let i = 1; i < chunks.length; i++) {
        const chunk = chunks[i];
        const prefix = `（続き ${i + 1}/${chunks.length}）\n`;
        await interaction.followUp(prefix + chunk);
        
        // 連続送信の間隔を空ける
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  }

  /**
   * インタラクションエラーレスポンス送信
   * @param {Interaction} interaction - Discordインタラクション
   * @param {Error} error - エラーオブジェクト
   */
  async sendInteractionErrorResponse(interaction, error) {
    console.error('Detailed interaction error:', error);
    
    const errorMessages = {
      timeout: '⏱️ 処理がタイムアウトしました。もう一度お試しください。',
      network: '🌐 ネットワークエラーが発生しました。',
      claude: '🧠 Claude Code SDKでエラーが発生しました。',
      default: '❌ 申し訳ありませんが、エラーが発生しました。'
    };

    let errorMessage = errorMessages.default;
    
    if (error.message.includes('timeout')) {
      errorMessage = errorMessages.timeout;
    } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
      errorMessage = errorMessages.network;
    } else if (error.message.includes('Claude') || error.message.includes('process exited')) {
      errorMessage = errorMessages.claude + `\n詳細: ${error.message}`;
    }

    try {
      if (interaction.deferred) {
        await interaction.editReply(errorMessage);
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      console.error('Failed to send error response:', replyError);
    }
  }


  /**
   * インタラクションで生成されたファイルを添付
   * @param {Interaction} interaction - Discordインタラクション
   */
  async attachGeneratedFilesToInteraction(interaction) {
    try {
      const currentDir = process.cwd();
      const files = fs.readdirSync(currentDir);
      
      // 全メディアファイルタイプを検索
      const mediaExtensions = [
        // 画像
        '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.tiff',
        // 動画
        '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v',
        // 音声
        '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma',
        // 3Dモデル
        '.obj', '.fbx', '.gltf', '.glb', '.dae', '.3ds', '.blend', '.stl',
        // その他
        '.zip', '.rar', '.7z', '.tar', '.gz'
      ];
      const recentFiles = [];
      
      // 10分以内に作成されたファイルを検索
      const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
      
      for (const file of files) {
        const filePath = path.join(currentDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isFile() && stats.mtime.getTime() > tenMinutesAgo) {
          const ext = path.extname(file).toLowerCase();
          if (mediaExtensions.includes(ext)) {
            recentFiles.push({
              path: filePath,
              name: file,
              size: stats.size
            });
          }
        }
      }
      
      // ファイルサイズ制限チェック（25MB）
      const maxSize = 25 * 1024 * 1024;
      const validFiles = recentFiles.filter(file => file.size <= maxSize);
      
      if (validFiles.length > 0) {
        console.log(`📎 Attaching ${validFiles.length} generated files to interaction`);
        
        const attachments = validFiles.map(file => 
          new AttachmentBuilder(file.path, { name: file.name })
        );
        
        // ファイルタイプに応じたアイコンを選択
        const getFileIcon = (filename) => {
          const ext = path.extname(filename).toLowerCase();
          if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.tiff'].includes(ext)) return '🖼️';
          if (['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'].includes(ext)) return '🎬';
          if (['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'].includes(ext)) return '🎵';
          if (['.obj', '.fbx', '.gltf', '.glb', '.dae', '.3ds', '.blend', '.stl'].includes(ext)) return '🗿';
          return '📎';
        };

        const fileTypes = [...new Set(validFiles.map(f => getFileIcon(f.name)))];
        const iconText = fileTypes.join('');

        // ファイルを添付して送信
        await interaction.followUp({
          content: `${iconText} 生成されたファイル (${validFiles.length}個):`,
          files: attachments
        });

        // 送信完了後、ローカルファイルを削除
        await this.deleteUploadedFiles(validFiles);
      }
    } catch (error) {
      console.error('File attachment error for interaction:', error);
    }
  }

  /**
   * アップロード完了したファイルを削除
   * @param {Array} files - 削除するファイル情報の配列
   */
  async deleteUploadedFiles(files) {
    try {
      console.log(`🗑️ アップロード完了したファイルを削除中... (${files.length}個)`);
      
      for (const file of files) {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`✅ 削除完了: ${file.name}`);
          } else {
            console.log(`⚠️ ファイルが存在しません: ${file.name}`);
          }
        } catch (deleteError) {
          console.error(`❌ ファイル削除エラー (${file.name}):`, deleteError.message);
        }
      }
      
      console.log(`🗑️ ファイル削除処理完了 (${files.length}個)`);
    } catch (error) {
      console.error('❌ ファイル削除処理でエラーが発生しました:', error);
    }
  }

  /**
   * スラッシュコマンド自動登録
   * @param {Client} readyClient - Discord クライアント
   */
  async deploySlashCommands(readyClient) {
    try {
      console.log('🚀 スラッシュコマンドを登録しています...');

      if (!process.env.CLIENT_ID) {
        console.warn('⚠️  CLIENT_ID環境変数が設定されていません。スラッシュコマンドの登録をスキップします。');
        console.log('💡 .envファイルにCLIENT_ID=your_bot_client_idを追加してください。');
        return;
      }

      // Discord REST APIクライアントの作成
      const rest = new REST({ version: '10' }).setToken(config.discord.token);

      // コマンドをJSON形式に変換
      const commandData = commands.map(command => command.toJSON());

      // グローバルスラッシュコマンド登録
      const data = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commandData }
      );

      console.log(`✅ ${data.length}個のスラッシュコマンドを正常に登録しました！`);
      console.log('📋 登録されたコマンド:');
      commandData.forEach(cmd => {
        console.log(`  • /${cmd.name} - ${cmd.description}`);
      });
      console.log('⏰ グローバルコマンドの反映には最大1時間かかる場合があります。');

    } catch (error) {
      console.error('❌ スラッシュコマンドの登録中にエラーが発生しました:', error);
      
      if (error.code === 50001) {
        console.log('💡 ヒント: BOTに必要な権限が不足している可能性があります。');
      } else if (error.code === 50013) {
        console.log('💡 ヒント: アプリケーションコマンドの権限が不足しています。');
        console.log('   BOTの招待URLに"applications.commands"スコープが含まれているか確認してください。');
      }
      
      console.warn('⚠️  スラッシュコマンドなしでBotを続行します。');
    }
  }

  /**
   * Bot開始
   */
  async start() {
    try {
      if (!config.discord.token) {
        throw new Error('DISCORD_BOT_TOKEN が設定されていません。.env ファイルを確認してください。');
      }

      console.log('🚀 Bot を開始しています...');
      await this.client.login(config.discord.token);
    } catch (error) {
      console.error('❌ Bot の開始に失敗しました:', error);
      process.exit(1);
    }
  }
}

// Bot インスタンスを作成して開始
const bot = new KamuiBot();
bot.start();