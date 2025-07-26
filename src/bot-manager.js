const config = require('./config/config');

/**
 * プラットフォーム選択・管理クラス
 */
class BotManager {
  constructor() {
    this.adapters = new Map();
    this.activeAdapters = [];
  }

  /**
   * 設定に基づいてアダプターを初期化
   */
  async initialize() {
    const platform = config.platform.toLowerCase();
    
    console.log(`🚀 Bot Manager initializing for platform: ${platform}`);

    try {
      switch (platform) {
        case 'discord':
          await this.initializeDiscord();
          break;
        case 'slack':
          await this.initializeSlack();
          break;
        case 'both':
          await this.initializeDiscord();
          await this.initializeSlack();
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}. Supported: 'discord', 'slack', 'both'`);
      }

      console.log(`✅ Bot Manager initialized with ${this.activeAdapters.length} adapter(s)`);
    } catch (error) {
      console.error('❌ Failed to initialize Bot Manager:', error);
      throw error;
    }
  }

  /**
   * Discord アダプター初期化
   */
  async initializeDiscord() {
    try {
      if (!config.discord.token) {
        console.warn('⚠️  DISCORD_BOT_TOKEN not found. Skipping Discord initialization.');
        return;
      }

      const DiscordBotAdapter = require('./adapters/discord-adapter');
      const discordAdapter = new DiscordBotAdapter(config);
      
      await discordAdapter.initialize();
      
      this.adapters.set('discord', discordAdapter);
      this.activeAdapters.push(discordAdapter);
      
      console.log('✅ Discord adapter initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Discord adapter:', error);
      throw error;
    }
  }

  /**
   * Slack アダプター初期化
   */
  async initializeSlack() {
    try {
      if (!config.slack.botToken) {
        console.warn('⚠️  SLACK_BOT_TOKEN not found. Skipping Slack initialization.');
        return;
      }

      const SlackBotAdapter = require('./adapters/slack-adapter');
      const slackAdapter = new SlackBotAdapter(config);
      
      await slackAdapter.initialize();
      
      this.adapters.set('slack', slackAdapter);
      this.activeAdapters.push(slackAdapter);
      
      console.log('✅ Slack adapter initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Slack adapter:', error);
      throw error;
    }
  }

  /**
   * 全アダプターを開始
   */
  async startAll() {
    if (this.activeAdapters.length === 0) {
      throw new Error('No adapters initialized. Check your configuration.');
    }

    console.log(`🚀 Starting ${this.activeAdapters.length} bot adapter(s)...`);

    const startPromises = this.activeAdapters.map(async (adapter) => {
      try {
        await adapter.start();
        const platformName = adapter.constructor.name.replace('BotAdapter', '');
        console.log(`✅ ${platformName} bot started successfully`);
        return { adapter, success: true };
      } catch (error) {
        const platformName = adapter.constructor.name.replace('BotAdapter', '');
        console.error(`❌ Failed to start ${platformName} bot:`, error);
        return { adapter, success: false, error };
      }
    });

    const results = await Promise.allSettled(startPromises);
    const successCount = results.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;

    console.log(`🎉 Bot Manager started: ${successCount}/${this.activeAdapters.length} adapters running`);

    if (successCount === 0) {
      throw new Error('All bot adapters failed to start');
    }

    // 失敗したアダプターを削除
    this.activeAdapters = this.activeAdapters.filter((adapter, index) => {
      const result = results[index];
      return result.status === 'fulfilled' && result.value.success;
    });

    return successCount;
  }

  /**
   * 全アダプターを停止
   */
  async stopAll() {
    if (this.activeAdapters.length === 0) {
      console.log('No active adapters to stop');
      return;
    }

    console.log(`🛑 Stopping ${this.activeAdapters.length} bot adapter(s)...`);

    const stopPromises = this.activeAdapters.map(async (adapter) => {
      try {
        await adapter.stop();
        const platformName = adapter.constructor.name.replace('BotAdapter', '');
        console.log(`✅ ${platformName} bot stopped successfully`);
      } catch (error) {
        const platformName = adapter.constructor.name.replace('BotAdapter', '');
        console.error(`❌ Error stopping ${platformName} bot:`, error);
      }
    });

    await Promise.allSettled(stopPromises);
    
    this.activeAdapters = [];
    this.adapters.clear();
    
    console.log('🛑 All bot adapters stopped');
  }

  /**
   * 特定のプラットフォームのアダプターを取得
   * @param {string} platform - プラットフォーム名
   * @returns {Object|null} アダプターインスタンス
   */
  getAdapter(platform) {
    return this.adapters.get(platform.toLowerCase()) || null;
  }

  /**
   * アクティブなアダプター一覧を取得
   * @returns {Array} アクティブなアダプターの配列
   */
  getActiveAdapters() {
    return [...this.activeAdapters];
  }

  /**
   * 動作状況を取得
   * @returns {Object} 状況情報
   */
  getStatus() {
    const status = {
      totalAdapters: this.adapters.size,
      activeAdapters: this.activeAdapters.length,
      adapters: {}
    };

    for (const [platform, adapter] of this.adapters.entries()) {
      status.adapters[platform] = {
        connected: adapter.isConnected,
        className: adapter.constructor.name
      };
    }

    return status;
  }

  /**
   * 設定情報を取得
   * @returns {Object} 設定の要約
   */
  getConfigSummary() {
    return {
      platform: config.platform,
      discord: {
        enabled: !!config.discord.token,
        hasClientId: !!config.discord.clientId
      },
      slack: {
        enabled: !!config.slack.botToken,
        socketMode: config.slack.socketMode,
        hasAppToken: !!config.slack.appToken
      }
    };
  }

  /**
   * グレースフルシャットダウンのセットアップ
   */
  setupGracefulShutdown() {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    signals.forEach((signal) => {
      process.on(signal, async () => {
        console.log(`\n📡 Received ${signal}. Gracefully shutting down...`);
        
        try {
          await this.stopAll();
          console.log('✅ Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          console.error('❌ Error during graceful shutdown:', error);
          process.exit(1);
        }
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      this.stopAll().finally(() => process.exit(1));
    });
  }
}

module.exports = BotManager;