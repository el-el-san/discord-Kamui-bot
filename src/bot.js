#!/usr/bin/env node

const BotManager = require('./bot-manager');

/**
 * Kamui Multi-Platform Bot
 * Discord & Slack対応のClaude Code SDK統合ボット
 */
async function main() {
  const botManager = new BotManager();

  try {
    // 設定情報を表示
    const configSummary = botManager.getConfigSummary();
    console.log('🔧 Configuration Summary:');
    console.log(`  Platform: ${configSummary.platform}`);
    console.log(`  Discord: ${configSummary.discord.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`  Slack: ${configSummary.slack.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`  LINE: ${configSummary.line.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    
    if (configSummary.slack.enabled) {
      console.log(`  Slack Socket Mode: ${configSummary.slack.socketMode ? '✅ Yes' : '❌ No'}`);
    }
    if (configSummary.line.enabled) {
      console.log(`  LINE Webhook Port: ${configSummary.line.webhookPort}`);
    }
    console.log('');

    // グレースフルシャットダウンのセットアップ
    botManager.setupGracefulShutdown();

    // ボットマネージャー初期化
    await botManager.initialize();

    // 全アダプターを開始
    const startedCount = await botManager.startAll();
    
    console.log('');
    console.log('🎉 Kamui Bot が正常に開始されました！');
    console.log(`📊 Status: ${startedCount} adapter(s) running`);
    
    // 状況表示
    const status = botManager.getStatus();
    console.log('📋 Active Adapters:');
    Object.entries(status.adapters).forEach(([platform, info]) => {
      const icon = info.connected ? '🟢' : '🔴';
      console.log(`  ${icon} ${platform}: ${info.connected ? 'Connected' : 'Disconnected'}`);
    });
    
    console.log('');
    console.log('💡 Tip: Botを停止するには Ctrl+C を押してください');
    console.log('🔗 Claude Code SDK の全機能が利用可能です');

    // メインプロセスを維持（イベントループを維持）
    // nohupで実行時にstdinが利用できないため、setIntervalで代替
    setInterval(() => {}, 1000);

  } catch (error) {
    console.error('❌ Failed to start Kamui Bot:', error);
    console.error('\n💡 Troubleshooting:');
    console.error('  1. Check your environment variables in .env file');
    console.error('  2. Ensure required tokens are properly set');
    console.error('  3. Verify network connectivity');
    console.error('  4. Check Claude Code SDK installation');
    
    try {
      await botManager.stopAll();
    } catch (stopError) {
      console.error('Error during cleanup:', stopError);
    }
    
    process.exit(1);
  }
}

// 未処理の例外とPromise拒否のハンドリング
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// メイン関数を実行
if (require.main === module) {
  main();
}

module.exports = { main };