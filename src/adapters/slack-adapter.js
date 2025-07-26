const { App } = require('@slack/bolt');
const BaseBotAdapter = require('./base-adapter');
const MessageHandler = require('../handlers/message-handler');
const FileProcessor = require('../handlers/file-processor');

/**
 * Slack専用ボットアダプター
 */
class SlackBotAdapter extends BaseBotAdapter {
  constructor(config) {
    super(config);
    
    // 再接続試行回数の管理
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectStopped = false;
    
    // Slack Appの初期化
    this.app = new App({
      token: this.config.slack.botToken,
      signingSecret: this.config.slack.signingSecret,
      socketMode: this.config.slack.socketMode,
      appToken: this.config.slack.appToken,
      port: this.config.slack.port
    });

    this.messageHandler = new MessageHandler(this);
    this.setupEventListeners();
    this.setupSocketEventListeners();
  }

  /**
   * Slack Bot初期化
   */
  async initialize() {
    this.log('info', 'Slack Bot initialized');
  }

  /**
   * Slack Bot開始
   */
  async start() {
    try {
      if (!this.config.slack.botToken) {
        throw new Error('SLACK_BOT_TOKEN が設定されていません。.env ファイルを確認してください。');
      }

      this.log('info', 'Slack Bot を開始しています...');
      
      // Socket Mode エラー処理の強化
      if (this.config.slack.socketMode) {
        this.setupSocketModeErrorHandling();
        await this.app.start();
        this.log('info', '⚡️ Slack Bot (Socket Mode) が開始されました！');
      } else {
        await this.app.start(this.config.slack.port);
        this.log('info', `⚡️ Slack Bot が開始されました！ポート: ${this.config.slack.port}`);
      }
      
      this.isConnected = true;
      
      // 接続成功時に再接続カウンターをリセット
      this.resetReconnectCounter();
      
      // Claude健康状態チェック
      const isClaudeHealthy = await this.checkClaudeHealth();
      this.log('info', `Claude Code SDK: ${isClaudeHealthy ? '✅ 正常' : '❌ エラー'}`);
      
      if (!isClaudeHealthy) {
        this.log('warn', 'Claude Code SDKに問題があります。botは制限された機能で動作します。');
      }
      
    } catch (error) {
      this.log('error', 'Slack Bot の開始に失敗しました:', error);
      throw error;
    }
  }

  /**
   * Slack Bot停止
   */
  async stop() {
    try {
      if (this.app) {
        await this.app.stop();
        this.isConnected = false;
        this.log('info', 'Slack Bot stopped');
      }
    } catch (error) {
      this.log('error', 'Error stopping Slack Bot:', error);
    }
  }

  /**
   * Slackイベントリスナーの設定
   */
  setupEventListeners() {
    // メッセージイベント
    this.app.message(async ({ message, say, client }) => {
      const normalizedMessage = this.normalizeMessage(message);
      const context = { 
        originalMessage: message, 
        say, 
        client, 
        platform: 'slack' 
      };
      await this.messageHandler.handleMessage(normalizedMessage, context);
    });

    // メンションイベント
    this.app.event('app_mention', async ({ event, say, client }) => {
      const normalizedMessage = this.normalizeMessage(event, true);
      const context = { 
        originalMessage: event, 
        say, 
        client, 
        platform: 'slack' 
      };
      await this.messageHandler.handleMessage(normalizedMessage, context);
    });

    // スラッシュコマンド: /ask
    this.app.command('/ask', async ({ command, ack, say, client }) => {
      await ack();
      
      const question = command.text;
      if (!question || question.trim() === '') {
        await say('質問を入力してください。使用方法: `/ask あなたの質問`');
        return;
      }

      this.log('info', `スラッシュコマンド質問: "${question}" by ${command.user_name}`);

      const normalizedMessage = {
        content: question,
        author: {
          id: command.user_id,
          username: command.user_name,
          displayName: command.user_name
        },
        channel: {
          id: command.channel_id,
          name: command.channel_name,
          type: 'channel'
        },
        isBot: false,
        isSystem: false,
        hasPrefix: false,
        isDM: false,
        isMentioned: false,
        isSlashCommand: true,
        timestamp: Date.now(),
        attachments: []
      };

      const context = { 
        originalMessage: command, 
        say, 
        client, 
        platform: 'slack',
        isSlashCommand: true 
      };

      await this.messageHandler.handleMessage(normalizedMessage, context);
    });

    // スラッシュコマンド: /reset
    this.app.command('/reset', async ({ command, ack, say }) => {
      await ack();
      
      const success = await this.resetConversation();
      const message = success 
        ? '🔄 会話履歴をリセットしました。新しい会話を開始します。'
        : '🔄 会話履歴をリセットしました。新しい会話を開始します。';
      
      await say(message);
    });

    // スラッシュコマンド: /help
    this.app.command('/help', async ({ command, ack, say }) => {
      await ack();
      
      const helpMessage = this.getSlackHelpMessage();
      await say(helpMessage);
    });

    // エラーハンドリング
    this.app.error((error) => {
      this.log('error', 'Slack アプリエラー:', error);
    });

    // プロセス終了時の処理
    process.on('SIGINT', () => {
      this.log('info', 'Slack Bot を終了しています...');
      this.stop();
      process.exit(0);
    });
  }

  /**
   * Slackメッセージを正規化
   * @param {Object} message - Slackメッセージ
   * @param {boolean} isMention - メンションイベントかどうか
   * @returns {Object} 正規化されたメッセージ
   */
  normalizeMessage(message, isMention = false) {
    const hasPrefix = false; // Slackでは通常プレフィックスを使用しない
    const isDM = message.channel_type === 'im';
    
    return {
      content: message.text || '',
      author: {
        id: message.user,
        username: message.username || message.user,
        displayName: message.username || message.user
      },
      channel: {
        id: message.channel,
        name: message.channel,
        type: message.channel_type || 'channel'
      },
      isBot: message.bot_id !== undefined,
      isSystem: message.subtype === 'bot_message' && message.text === undefined,
      hasPrefix,
      isDM,
      isMentioned: isMention,
      prefix: '',
      timestamp: parseFloat(message.ts) * 1000,
      attachments: message.files || []
    };
  }

  /**
   * プラットフォーム固有の制限値取得
   * @returns {Object} Slack制限値
   */
  getPlatformLimits() {
    return this.config.slack.limits;
  }

  /**
   * Slackにメッセージ送信
   * @param {Object} context - Slack固有のコンテキスト
   * @param {string} message - 送信するメッセージ
   */
  async sendMessage(context, message) {
    try {
      if (context.isSlashCommand) {
        // スラッシュコマンドの場合は say を使用
        await context.say(message);
      } else {
        // 通常のメッセージの場合
        await context.say(message);
      }
    } catch (error) {
      this.log('error', 'Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Slackにファイル送信
   * @param {Object} context - Slack固有のコンテキスト
   * @param {Array} files - 送信するファイル情報
   * @param {string} message - 添付メッセージ
   */
  async sendFiles(context, files, message) {
    try {
      // 複数ファイルを一度に送信（files.uploadV2対応）
      const fileUploads = files.map(file => ({
        file: require('fs').createReadStream(file.path),
        filename: file.name,
        title: file.name
      }));

      await context.client.files.uploadV2({
        channel_id: context.originalMessage.channel,
        file_uploads: fileUploads,
        initial_comment: message
      });
    } catch (error) {
      this.log('error', 'Failed to send files:', error);
      throw error;
    }
  }

  /**
   * Slackにエラーメッセージ送信
   * @param {Object} context - Slack固有のコンテキスト
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
   * メンション除去（Slack形式）
   * @param {string} input - 入力文字列
   * @returns {string} メンション除去後の文字列
   */
  removeMentions(input) {
    // Slack形式のメンション除去: <@U1234567> や <@U1234567|username>
    return input.replace(/<@[UW][A-Z0-9]+(\|[^>]+)?>/g, '').trim();
  }

  /**
   * Socket Mode接続イベントリスナーの設定
   */
  setupSocketModeErrorHandling() {
    // グローバルエラーハンドラーでSocket Mode接続エラーを処理
    const originalHandler = process.listeners('unhandledRejection');
    
    process.on('unhandledRejection', (reason, promise) => {
      if (reason && reason.message && reason.message.includes('server explicit disconnect')) {
        this.log('warn', 'Socket Mode接続が切断されました（server explicit disconnect）');
        this.log('info', '再接続を試行中...');
        // エラーを無視して継続
        return;
      }
      
      if (reason && reason.message && reason.message.includes('Unhandled event')) {
        this.log('warn', 'Socket Mode状態管理エラー:', reason.message);
        return;
      }
      
      // その他のエラーは既存のハンドラーに委譲
      if (originalHandler.length > 0) {
        originalHandler[0].call(process, reason, promise);
      } else {
        throw reason;
      }
    });
  }

  setupSocketEventListeners() {
    if (!this.config.slack.socketMode) {
      return;
    }

    // Socket Mode クライアントのイベントリスナー
    if (this.app.client && this.app.client.socketModeClient) {
      const socketClient = this.app.client.socketModeClient;
      
      // 接続成功時
      socketClient.addEventListener('open', () => {
        this.log('info', 'Socket Mode 接続が確立されました');
        this.resetReconnectCounter();
      });
      
      // 接続失敗・切断時
      socketClient.addEventListener('close', (event) => {
        this.log('warn', `Socket Mode 接続が切断されました: ${event.code} ${event.reason}`);
        this.handleReconnection();
      });
      
      // エラー時
      socketClient.addEventListener('error', (error) => {
        this.log('error', 'Socket Mode エラー:', error);
        this.handleReconnection();
      });
    }
  }

  /**
   * 再接続処理の制御
   */
  handleReconnection() {
    if (this.reconnectStopped) {
      this.log('warn', '再接続が停止されています。手動で再開してください。');
      return;
    }

    this.reconnectAttempts++;
    this.log('info', `再接続試行 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.reconnectStopped = true;
      this.log('error', `最大再接続試行回数(${this.maxReconnectAttempts})に達しました。再接続を停止します。`);
      this.log('info', 'Bot を再起動するか、手動で接続を復旧してください。');
      return;
    }
  }

  /**
   * 再接続カウンターをリセット
   */
  resetReconnectCounter() {
    if (this.reconnectAttempts > 0 || this.reconnectStopped) {
      this.log('info', '接続が安定しました。再接続カウンターをリセットしました。');
    }
    this.reconnectAttempts = 0;
    this.reconnectStopped = false;
  }

  /**
   * Slack用ヘルプメッセージ取得
   * @returns {string} ヘルプメッセージ
   */
  getSlackHelpMessage() {
    return `
🤖 *Kamui Bot ヘルプ*

*基本的な使い方:*
• \`@${this.config.slack.botName} メッセージ\` - メンション形式
• DM でも利用可能

*スラッシュコマンド:*
• \`/ask 質問内容\` - Claude Code SDKに質問
• \`/reset\` - 会話履歴をリセット
• \`/help\` - このヘルプを表示

*会話機能:*
• 会話は自動的に継続されます
• Claude Code SDK の全機能を利用可能

*プラットフォーム:* Slack
    `;
  }
}

module.exports = SlackBotAdapter;