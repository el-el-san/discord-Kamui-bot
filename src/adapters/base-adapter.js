const ClaudeProcessor = require('../utils/claude');

/**
 * プラットフォーム非依存のBot基底クラス
 */
class BaseBotAdapter {
  constructor(config) {
    this.config = config;
    this.claude = new ClaudeProcessor();
    this.isConnected = false;
  }

  /**
   * Bot初期化（サブクラスで実装）
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Bot開始（サブクラスで実装）
   */
  async start() {
    throw new Error('start() must be implemented by subclass');
  }

  /**
   * Bot停止（サブクラスで実装）
   */
  async stop() {
    throw new Error('stop() must be implemented by subclass');
  }

  /**
   * メッセージ送信（サブクラスで実装）
   * @param {Object} context - プラットフォーム固有のコンテキスト
   * @param {string} message - 送信するメッセージ
   */
  async sendMessage(context, message) {
    throw new Error('sendMessage() must be implemented by subclass');
  }

  /**
   * ファイル送信（サブクラスで実装）
   * @param {Object} context - プラットフォーム固有のコンテキスト
   * @param {Array} files - 送信するファイル情報
   */
  async sendFiles(context, files) {
    throw new Error('sendFiles() must be implemented by subclass');
  }

  /**
   * エラーメッセージ送信（サブクラスで実装）
   * @param {Object} context - プラットフォーム固有のコンテキスト
   * @param {Error} error - エラーオブジェクト
   */
  async sendErrorMessage(context, error) {
    throw new Error('sendErrorMessage() must be implemented by subclass');
  }

  /**
   * プラットフォーム固有のメッセージ正規化（サブクラスで実装）
   * @param {Object} rawMessage - プラットフォーム固有のメッセージ
   * @returns {Object} 正規化されたメッセージ
   */
  normalizeMessage(rawMessage) {
    throw new Error('normalizeMessage() must be implemented by subclass');
  }

  /**
   * プラットフォーム固有の制限値取得（サブクラスで実装）
   * @returns {Object} 制限値オブジェクト
   */
  getPlatformLimits() {
    throw new Error('getPlatformLimits() must be implemented by subclass');
  }

  /**
   * Claude健康状態チェック
   * @returns {Promise<boolean>} Claudeの健康状態
   */
  async checkClaudeHealth() {
    try {
      return await this.claude.checkHealth();
    } catch (error) {
      console.error('Claude health check failed:', error);
      return false;
    }
  }

  /**
   * 会話リセット
   */
  async resetConversation() {
    try {
      await this.claude.resetConversation();
      return true;
    } catch (error) {
      console.error('Conversation reset failed:', error);
      return false;
    }
  }

  /**
   * Claudeでの入力処理
   * @param {string} input - ユーザー入力
   * @param {boolean} continueConversation - 会話継続フラグ
   * @returns {Promise<string>} Claudeからの応答
   */
  async processWithClaude(input, continueConversation = true) {
    console.log(`[DEBUG] processWithClaude called with input: "${input.substring(0, 100)}..." continueConversation: ${continueConversation}`);
    try {
      console.log('[DEBUG] Calling claude.processInput...');
      const result = await this.claude.processInput(input, continueConversation);
      console.log(`[DEBUG] claude.processInput completed, result length: ${result.length}`);
      return result;
    } catch (error) {
      console.error('Claude processing failed:', error);
      throw error;
    }
  }

  /**
   * ログ出力（プラットフォーム名付き）
   * @param {string} level - ログレベル
   * @param {string} message - メッセージ
   * @param {...any} args - 追加引数
   */
  log(level, message, ...args) {
    const platformName = this.constructor.name.replace('Adapter', '');
    console[level](`[${platformName}] ${message}`, ...args);
  }

  /**
   * 共通エラーメッセージ取得
   * @param {Error} error - エラーオブジェクト
   * @returns {string} エラーメッセージ
   */
  getErrorMessage(error) {
    const errorMessages = {
      timeout: '⏱️ 処理がタイムアウトしました。もう一度お試しください。',
      network: '🌐 ネットワークエラーが発生しました。',
      claude: '🧠 Claude Code SDKでエラーが発生しました。',
      default: '❌ 申し訳ありませんが、エラーが発生しました。'
    };

    if (error.message.includes('timeout')) {
      return errorMessages.timeout;
    } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
      return errorMessages.network;
    } else if (error.message.includes('Claude') || error.message.includes('process exited')) {
      return errorMessages.claude + `\n詳細: ${error.message}`;
    }

    return errorMessages.default;
  }
}

module.exports = BaseBotAdapter;