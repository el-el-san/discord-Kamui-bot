#!/usr/bin/env node
/**
 * Integrated Development Script for LINE Bot
 * Starts both the bot and tunnel simultaneously
 */

require('dotenv').config();
const { spawn } = require('child_process');
const TunnelManager = require('./setup-tunnel');

class DevEnvironment {
  constructor() {
    this.botProcess = null;
    this.tunnelManager = new TunnelManager();
    this.isShuttingDown = false;
  }

  /**
   * Bot Process起動
   */
  startBot() {
    console.log('🤖 Starting LINE Bot...');
    
    this.botProcess = spawn('node', ['src/bot.js'], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'development' }
    });

    this.botProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[BOT] ${output}`);
      }
    });

    this.botProcess.stderr.on('data', (data) => {
      const error = data.toString().trim();
      if (error) {
        console.error(`[BOT ERROR] ${error}`);
      }
    });

    this.botProcess.on('close', (code) => {
      if (!this.isShuttingDown) {
        console.log(`⚠️  Bot process exited with code ${code}`);
        if (code !== 0) {
          const restartDelay = parseInt(process.env.BOT_RESTART_DELAY) || 3000;
          console.log(`🔄 Restarting bot in ${restartDelay/1000} seconds...`);
          setTimeout(() => this.startBot(), restartDelay);
        }
      }
    });

    return new Promise((resolve) => {
      // Bot起動完了を待つ（ポートバインド完了まで）
      const startupDelay = parseInt(process.env.BOT_STARTUP_DELAY) || 2000;
      setTimeout(resolve, startupDelay);
    });
  }

  /**
   * 統合開発環境起動
   */
  async start() {
    console.log('🚀 Kamui LINE Bot Development Environment');
    console.log('==========================================');
    
    try {
      // 1. Bot起動
      await this.startBot();
      console.log('✅ Bot started successfully');
      
      // 2. Tunnel起動（待機後）
      console.log('🌐 Setting up tunnel...');
      const startupDelay = parseInt(process.env.BOT_STARTUP_DELAY) || 2000;
      await new Promise(resolve => setTimeout(resolve, startupDelay));
      await this.tunnelManager.start();
      
      console.log('\n🎉 Development environment ready!');
      console.log('================================');
      console.log('📱 Test your LINE Bot by sending messages');
      console.log('💡 Press Ctrl+C to stop everything');
      
    } catch (error) {
      console.error('❌ Failed to start development environment:', error.message);
      this.stop();
      process.exit(1);
    }
  }

  /**
   * 全プロセス停止
   */
  stop() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    
    console.log('\n🛑 Shutting down development environment...');
    
    // Tunnel停止
    this.tunnelManager.stop();
    
    // Bot停止
    if (this.botProcess) {
      this.botProcess.kill();
      this.botProcess = null;
    }
    
    console.log('✅ Development environment stopped');
  }
}

// メイン実行
async function main() {
  const devEnv = new DevEnvironment();

  // グレースフルシャットダウン
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  signals.forEach(signal => {
    process.on(signal, () => {
      devEnv.stop();
      process.exit(0);
    });
  });

  // 開発環境起動
  await devEnv.start();
  
  // プロセス維持
  setInterval(() => {}, 1000);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Development environment error:', error);
    process.exit(1);
  });
}