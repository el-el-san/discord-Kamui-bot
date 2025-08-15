#!/usr/bin/env node
/**
 * Tunnel URL Monitor Script
 * Monitors and displays current tunnel URL for easy webhook setup
 */

require('dotenv').config();
const { spawn } = require('child_process');

class TunnelMonitor {
  constructor() {
    this.currentUrl = null;
  }

  startMonitoring() {
    console.log('🔍 Starting Cloudflare Tunnel URL Monitor...');
    console.log('💡 This will show the current tunnel URL for webhook setup');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const port = process.env.LINE_WEBHOOK_PORT || '3000';
    const tunnelProcess = spawn('cloudflared', [
      'tunnel',
      '--url',
      `http://localhost:${port}`
    ]);

    tunnelProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      // URL抽出
      const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (urlMatch && urlMatch[0] !== this.currentUrl) {
        this.currentUrl = urlMatch[0];
        this.displayUrl();
      }
    });

    tunnelProcess.stderr.on('data', (data) => {
      const error = data.toString();
      
      // URL抽出（stderrにも出力される場合がある）
      const urlMatch = error.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (urlMatch && urlMatch[0] !== this.currentUrl) {
        this.currentUrl = urlMatch[0];
        this.displayUrl();
      }
    });

    tunnelProcess.on('close', (code) => {
      console.log(`\n🛑 Tunnel exited with code ${code}`);
      this.currentUrl = null;
    });

    // 終了処理
    process.on('SIGINT', () => {
      console.log('\n📡 Stopping tunnel monitor...');
      tunnelProcess.kill();
      process.exit(0);
    });
  }

  displayUrl() {
    const webhookUrl = `${this.currentUrl}/webhook`;
    
    console.log('\n🎯 NEW TUNNEL URL DETECTED!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 Tunnel URL: ${this.currentUrl}`);
    console.log(`📡 Webhook URL: ${webhookUrl}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📋 LINE Developers Console Setup:');
    console.log(`1. Go to: ${process.env.LINE_DEVELOPERS_URL || 'https://developers.line.biz/'}`);
    console.log('2. Select your bot channel');
    console.log('3. Go to "Messaging API" tab');
    console.log(`4. Set Webhook URL: ${webhookUrl}`);
    console.log('5. Enable "Use webhook"');
    console.log('\n💡 Copy the webhook URL above to LINE Developers Console');
    console.log('⏰ URL will change on next tunnel restart');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

// メイン実行
const monitor = new TunnelMonitor();
monitor.startMonitoring();