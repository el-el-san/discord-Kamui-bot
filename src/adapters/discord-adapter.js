const { Client, GatewayIntentBits, Events, AttachmentBuilder, REST, Routes } = require('discord.js');
const BaseBotAdapter = require('./base-adapter');
const MessageHandler = require('../handlers/message-handler');

/**
 * Discord専用ボットアダプター
 */
class DiscordBotAdapter extends BaseBotAdapter {
  constructor(config) {
    super(config);
    
    // Discord クライアントの初期化
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
      ]
    });

    this.messageHandler = new MessageHandler(this);
    this.commands = require('../commands');
  }

  /**
   * Discord Bot初期化
   */
  async initialize() {
    this.setupEventListeners();
    this.log('info', 'Discord Bot initialized');
  }

  /**
   * Discord Bot開始
   */
  async start() {
    try {
      if (!this.config.discord.token) {
        throw new Error('DISCORD_BOT_TOKEN が設定されていません。.env ファイルを確認してください。');
      }

      this.log('info', 'Bot を開始しています...');
      await this.client.login(this.config.discord.token);
    } catch (error) {
      this.log('error', 'Bot の開始に失敗しました:', error);
      throw error;
    }
  }

  /**
   * Discord Bot停止
   */
  async stop() {
    try {
      if (this.client) {
        this.client.destroy();
        this.isConnected = false;
        this.log('info', 'Discord Bot stopped');
      }
    } catch (error) {
      this.log('error', 'Error stopping Discord Bot:', error);
    }
  }

  /**
   * イベントリスナーの設定
   */
  setupEventListeners() {
    // Bot準備完了イベント
    this.client.once(Events.ClientReady, async (readyClient) => {
      this.isConnected = true;
      this.log('info', `${readyClient.user.tag} がログインしました！`);
      this.log('info', `Bot名: ${this.config.discord.botName}`);
      
      // スラッシュコマンドを自動登録
      await this.deploySlashCommands(readyClient);
      
      // Claude健康状態チェック
      const isClaudeHealthy = await this.checkClaudeHealth();
      this.log('info', `Claude Code SDK: ${isClaudeHealthy ? '✅ 正常' : '❌ エラー'}`);
      
      if (!isClaudeHealthy) {
        this.log('warn', 'Claude Code SDKに問題があります。botは制限された機能で動作します。');
      }
    });

    // メッセージ受信イベント
    this.client.on(Events.MessageCreate, async (message) => {
      const normalizedMessage = this.normalizeMessage(message);
      const context = { originalMessage: message, platform: 'discord' };
      await this.messageHandler.handleMessage(normalizedMessage, context);
    });

    // スラッシュコマンドイベント
    this.client.on(Events.InteractionCreate, async (interaction) => {
      await this.handleInteraction(interaction);
    });

    // エラーハンドリング
    this.client.on(Events.Error, (error) => {
      this.log('error', 'Discord クライアントエラー:', error);
    });

    // プロセス終了時の処理
    process.on('SIGINT', () => {
      this.log('info', 'Bot を終了しています...');
      this.stop();
      process.exit(0);
    });
  }

  /**
   * Discordメッセージを正規化
   * @param {Message} message - Discordメッセージ
   * @returns {Object} 正規化されたメッセージ
   */
  normalizeMessage(message) {
    const hasPrefix = message.content.startsWith(this.config.discord.prefix);
    const isDM = message.channel.type === 1; // DM_CHANNEL
    const isMentioned = message.mentions.has(this.client.user);

    return {
      content: message.content,
      author: {
        id: message.author.id,
        username: message.author.username,
        displayName: message.author.displayName || message.author.username
      },
      channel: {
        id: message.channel.id,
        name: message.channel.name,
        type: message.channel.type
      },
      isBot: message.author.bot,
      isSystem: message.system,
      hasPrefix,
      isDM,
      isMentioned,
      prefix: this.config.discord.prefix,
      timestamp: message.createdTimestamp,
      attachments: Array.from(message.attachments.values())
    };
  }

  /**
   * プラットフォーム固有の制限値取得
   * @returns {Object} Discord制限値
   */
  getPlatformLimits() {
    return this.config.discord.limits;
  }

  /**
   * Discordにメッセージ送信
   * @param {Object} context - Discord固有のコンテキスト
   * @param {string} message - 送信するメッセージ
   */
  async sendMessage(context, message) {
    try {
      this.log('info', `Attempting to send message: "${message.substring(0, 100)}..."`);
      const discordMessage = context.originalMessage;
      if (context.interaction) {
        // スラッシュコマンドの場合
        this.log('info', 'Using interaction.editReply for slash command');
        await context.interaction.editReply(message);
        this.log('info', 'interaction.editReply completed successfully');
      } else {
        // 通常のメッセージの場合
        this.log('info', 'Using message.reply for regular message');
        await discordMessage.reply(message);
        this.log('info', 'message.reply completed successfully');
      }
    } catch (error) {
      this.log('error', 'Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Discordにファイル送信
   * @param {Object} context - Discord固有のコンテキスト
   * @param {Array} files - 送信するファイル情報
   * @param {string} message - 添付メッセージ
   */
  async sendFiles(context, files, message) {
    try {
      const attachments = files.map(file => 
        new AttachmentBuilder(file.path, { name: file.name })
      );

      const discordMessage = context.originalMessage;
      if (context.interaction) {
        // スラッシュコマンドの場合
        await context.interaction.followUp({
          content: message,
          files: attachments
        });
      } else {
        // 通常のメッセージの場合
        await discordMessage.channel.send({
          content: message,
          files: attachments
        });
      }
    } catch (error) {
      this.log('error', 'Failed to send files:', error);
      throw error;
    }
  }

  /**
   * Discordにエラーメッセージ送信
   * @param {Object} context - Discord固有のコンテキスト
   * @param {Error} error - エラーオブジェクト
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
   * スラッシュコマンドインタラクション処理
   * @param {Interaction} interaction - Discordインタラクション
   */
  async handleInteraction(interaction) {
    try {
      // スラッシュコマンドでない場合は無視
      if (!interaction.isChatInputCommand()) return;

      const { commandName, options } = interaction;
      this.log('info', `スラッシュコマンド実行: /${commandName} by ${interaction.user.tag}`);

      // defer reply を送信（処理時間がかかる可能性があるため）
      await interaction.deferReply();

      const context = { originalMessage: null, interaction, platform: 'discord' };

      switch (commandName) {
        case 'ask': {
          const question = options.getString('question');
          if (!question) {
            await interaction.editReply('質問を入力してください。');
            return;
          }

          this.log('info', `スラッシュコマンド質問: "${question}"`);

          // MessageHandlerを使用して処理
          const normalizedMessage = {
            content: question,
            author: {
              id: interaction.user.id,
              username: interaction.user.username,
              displayName: interaction.user.displayName || interaction.user.username
            },
            channel: {
              id: interaction.channelId,
              name: interaction.channel?.name,
              type: interaction.channel?.type
            },
            isBot: false,
            isSystem: false,
            hasPrefix: false,
            isDM: false,
            isMentioned: false,
            isSlashCommand: true,  // スラッシュコマンドフラグを追加
            timestamp: Date.now(),
            attachments: []
          };

          this.log('info', 'Calling messageHandler.handleMessage...');
          try {
            await this.messageHandler.handleMessage(normalizedMessage, context);
            this.log('info', 'messageHandler.handleMessage completed');
          } catch (error) {
            this.log('error', 'messageHandler.handleMessage failed:', error);
            await interaction.editReply('処理中にエラーが発生しました。もう一度お試しください。');
          }
          break;
        }

        case 'reset': {
          const success = await this.resetConversation();
          const message = success 
            ? '🔄 会話履歴をリセットしました。新しい会話を開始します。'
            : '🔄 会話履歴をリセットしました。新しい会話を開始します。';
          await interaction.editReply(message);
          break;
        }

        case 'help': {
          const helpMessage = this.messageHandler.getHelpMessage();
          await interaction.editReply(helpMessage);
          break;
        }

        default:
          await interaction.editReply('❌ 不明なコマンドです。');
      }

    } catch (error) {
      this.log('error', 'スラッシュコマンド処理エラー:', error);
      await this.sendInteractionErrorResponse(interaction, error);
    }
  }

  /**
   * インタラクションエラーレスポンス送信
   * @param {Interaction} interaction - Discordインタラクション
   * @param {Error} error - エラーオブジェクト
   */
  async sendInteractionErrorResponse(interaction, error) {
    const errorMessage = this.getErrorMessage(error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply(errorMessage);
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      this.log('error', 'Failed to send error response:', replyError);
    }
  }

  /**
   * スラッシュコマンド自動登録
   * @param {Client} readyClient - Discord クライアント
   */
  async deploySlashCommands(readyClient) {
    try {
      this.log('info', 'スラッシュコマンドを登録しています...');

      if (!this.config.discord.clientId) {
        this.log('warn', 'DISCORD_CLIENT_ID環境変数が設定されていません。スラッシュコマンドの登録をスキップします。');
        this.log('info', '.envファイルにDISCORD_CLIENT_ID=your_bot_client_idを追加してください。');
        return;
      }

      // Discord REST APIクライアントの作成
      const rest = new REST({ version: '10' }).setToken(this.config.discord.token);

      // コマンドをJSON形式に変換
      const commandData = this.commands.map(command => command.toJSON());

      // グローバルスラッシュコマンド登録
      const data = await rest.put(
        Routes.applicationCommands(this.config.discord.clientId),
        { body: commandData }
      );

      this.log('info', `${data.length}個のスラッシュコマンドを正常に登録しました！`);
      this.log('info', '登録されたコマンド:');
      commandData.forEach(cmd => {
        this.log('info', `  • /${cmd.name} - ${cmd.description}`);
      });
      this.log('info', 'グローバルコマンドの反映には最大1時間かかる場合があります。');

    } catch (error) {
      this.log('error', 'スラッシュコマンドの登録中にエラーが発生しました:', error);
      
      if (error.code === 50001) {
        this.log('info', 'ヒント: BOTに必要な権限が不足している可能性があります。');
      } else if (error.code === 50013) {
        this.log('info', 'ヒント: アプリケーションコマンドの権限が不足しています。');
        this.log('info', 'BOTの招待URLに"applications.commands"スコープが含まれているか確認してください。');
      }
      
      this.log('warn', 'スラッシュコマンドなしでBotを続行します。');
    }
  }
}

module.exports = DiscordBotAdapter;