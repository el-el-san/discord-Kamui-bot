#!/usr/bin/env node
/**
 * Tunnel Setup Script for LINE Bot Development
 * Cloudflare Tunnel or LocalTunnel wrapper with automatic webhook URL update
 */

require('dotenv').config();
const https = require('https');
const { spawn } = require('child_process');

class TunnelManager {
  constructor() {
    this.tunnelProcess = null;
    this.currentUrl = null;
  }

  /**
   * LINE Bot Webhook URL自動更新
   */
  async updateLineWebhook(url) {
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      console.log('⚠️  LINE_CHANNEL_ACCESS_TOKEN not found. Skipping webhook update.');
      return;
    }

    const webhookUrl = `${url}/webhook`;
    const options = {
      hostname: process.env.LINE_API_HOST || 'api.line.me',
      port: 443,
      path: '/v2/bot/channel/webhook/endpoint',
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('✅ LINE Webhook URL updated successfully');
            console.log(`📡 Webhook URL: ${webhookUrl}`);
            resolve();
          } else {
            console.error(`❌ Failed to update webhook URL: ${res.statusCode}`);
            console.error(`Response: ${data}`);
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('❌ Error updating webhook URL:', error.message);
        reject(error);
      });
      
      req.write(JSON.stringify({ endpoint: webhookUrl }));
      req.end();
    });
  }

  /**
   * Cloudflare Tunnel起動
   */
  startCloudflare() {
    console.log('🚀 Starting Cloudflare Tunnel...');
    console.log('💡 Using trycloudflare.com (free subdomain)');
    
    return new Promise((resolve, reject) => {
      this.tunnelProcess = spawn('cloudflared', [
        'tunnel',
        '--url',
        `http://localhost:${process.env.LINE_WEBHOOK_PORT || 3000}`
      ]);

      this.tunnelProcess.stdout.on('data', (data) => {
        const output = data.toString();
        
        // URLを抽出
        const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (urlMatch && !this.currentUrl) {
          this.currentUrl = urlMatch[0];
          this.displayTunnelUrl();
          
          // LINE Webhook URL自動更新
          this.updateLineWebhook(this.currentUrl)
            .then(() => resolve(this.currentUrl))
            .catch(err => {
              console.warn('⚠️  Tunnel started but webhook update failed:', err.message);
              resolve(this.currentUrl);
            });
        }
      });

      this.tunnelProcess.stderr.on('data', (data) => {
        const error = data.toString();
        
        // stderrからもURLを抽出（Cloudflareはstderrに出力することがある）
        const urlMatch = error.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (urlMatch && !this.currentUrl) {
          this.currentUrl = urlMatch[0];
          this.displayTunnelUrl();
          
          // LINE Webhook URL自動更新
          this.updateLineWebhook(this.currentUrl)
            .then(() => resolve(this.currentUrl))
            .catch(err => {
              console.warn('⚠️  Tunnel started but webhook update failed:', err.message);
              resolve(this.currentUrl);
            });
        } else if (error.includes('command not found') || error.includes('not recognized')) {
          console.error('❌ cloudflared not found. Please install:');
          console.error('   Windows: winget install --id Cloudflare.cloudflared');
          console.error('   macOS: brew install cloudflared');
          console.error('   Linux: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/');
          reject(new Error('cloudflared not installed'));
        }
        // 他のエラーメッセージは表示しない（ノイズ削減）
      });

      this.tunnelProcess.on('close', (code) => {
        console.log(`🛑 Cloudflare Tunnel exited with code ${code}`);
        this.currentUrl = null;
      });

      // タイムアウト処理
      const timeout = parseInt(process.env.TUNNEL_STARTUP_TIMEOUT) || 30000;
      setTimeout(() => {
        if (!this.currentUrl) {
          reject(new Error('Tunnel startup timeout'));
        }
      }, timeout);
    });
  }

  /**
   * LocalTunnel起動（fallback）
   */
  startLocalTunnel() {
    console.log('🚀 Starting LocalTunnel (fallback)...');
    
    return new Promise((resolve, reject) => {
      const subdomain = process.env.LOCALTUNNEL_SUBDOMAIN || process.env.LINE_BOT_NAME?.toLowerCase() || 'kamui-linebot';
      
      this.tunnelProcess = spawn('npx', [
        'localtunnel',
        '--port', process.env.LINE_WEBHOOK_PORT || '3000',
        '--subdomain', subdomain
      ]);

      this.tunnelProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(output);
        
        const urlMatch = output.match(/https:\/\/[a-zA-Z0-9-]+\.loca\.lt/);
        if (urlMatch && !this.currentUrl) {
          this.currentUrl = urlMatch[0];
          this.displayTunnelUrl();
          
          this.updateLineWebhook(this.currentUrl)
            .then(() => resolve(this.currentUrl))
            .catch(err => {
              console.warn('⚠️  Tunnel started but webhook update failed:', err.message);
              resolve(this.currentUrl);
            });
        }
      });

      this.tunnelProcess.stderr.on('data', (data) => {
        console.error('LocalTunnel Error:', data.toString());
      });

      this.tunnelProcess.on('close', (code) => {
        console.log(`🛑 LocalTunnel exited with code ${code}`);
        this.currentUrl = null;
      });
    });
  }

  /**
   * Tunnel停止
   */
  stop() {
    if (this.tunnelProcess) {
      console.log('🛑 Stopping tunnel...');
      this.tunnelProcess.kill();
      this.tunnelProcess = null;
      this.currentUrl = null;
    }
  }

  /**
   * Tunnel URL表示
   */
  displayTunnelUrl() {
    const webhookUrl = `${this.currentUrl}/webhook`;
    
    console.log('\n' + '='.repeat(80));
    console.log('🎯 TUNNEL URL READY!');
    console.log('='.repeat(80));
    console.log(`🌐 Public URL: ${this.currentUrl}`);
    console.log(`📡 Webhook URL: ${webhookUrl}`);
    console.log('='.repeat(80));
    console.log('\n📋 LINE Developers Console Setup:');
    console.log(`1. Go to: ${process.env.LINE_DEVELOPERS_URL || 'https://developers.line.biz/'}`);
    console.log('2. Select your bot channel');
    console.log('3. Go to "Messaging API" tab');
    console.log(`4. Set Webhook URL: ${webhookUrl}`);
    console.log('5. Enable "Use webhook"');
    console.log('6. Click "Verify" to test connection');
    console.log('\n💡 COPY THIS URL: ' + webhookUrl);
    console.log('⏰ This URL will change when tunnel restarts');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * 自動選択でTunnel開始
   */
  async start() {
    try {
      // まずCloudflare Tunnelを試行
      await this.startCloudflare();
    } catch (error) {
      console.log('⚠️  Cloudflare Tunnel failed, trying LocalTunnel...');
      try {
        await this.startLocalTunnel();
      } catch (ltError) {
        console.error('❌ All tunnel options failed');
        console.error('Cloudflare error:', error.message);
        console.error('LocalTunnel error:', ltError.message);
        process.exit(1);
      }
    }
  }
}

// メイン実行
async function main() {
  const tunnelManager = new TunnelManager();

  // グレースフルシャットダウン
  process.on('SIGINT', () => {
    console.log('\n📡 Shutting down tunnel...');
    tunnelManager.stop();
    process.exit(0);
  });

  console.log('🔧 Kamui LINE Bot Tunnel Setup');
  console.log('================================');
  
  try {
    await tunnelManager.start();
    console.log('\n✅ Tunnel setup completed!');
    console.log('🎯 Your LINE Bot is now accessible from the internet');
    console.log('💡 Press Ctrl+C to stop the tunnel');
    
    // プロセス維持
    setInterval(() => {}, 1000);
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = TunnelManager;