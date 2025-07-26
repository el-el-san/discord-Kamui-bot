require('dotenv').config();

module.exports = {
  // プラットフォーム選択
  platform: process.env.BOT_PLATFORM || 'discord', // 'discord' or 'slack' or 'both'
  
  discord: {
    token: process.env.DISCORD_BOT_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    prefix: process.env.DISCORD_PREFIX || '!',
    botName: process.env.DISCORD_BOT_NAME || 'Kamui',
    limits: {
      messageLength: 2000,
      fileSize: 25 * 1024 * 1024, // 25MB
      fileCount: 10
    }
  },
  
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: process.env.SLACK_SOCKET_MODE === 'true',
    port: parseInt(process.env.SLACK_PORT) || 3000,
    botName: process.env.SLACK_BOT_NAME || 'Kamui',
    limits: {
      messageLength: 4000,
      fileSize: 1024 * 1024 * 1024, // 1GB
      fileCount: 20
    }
  },
  claude: {
    timeout: parseInt(process.env.CLAUDE_TIMEOUT) || 180000, // MCP処理用に3分に延長
    commandPath: 'claude',
    outputFormat: 'text',
    verbose: false,
    // 全MCPツールの定義
    mcpTools: {
      // テキスト → 画像（Fal.aiを優先）
      't2i-fal-imagen4-fast': { category: 'image', description: 'Fal.ai Imagen4 Fast (Speed Optimized)' },
      't2i-fal-imagen4-ultra': { category: 'image', description: 'Fal.ai Imagen4 Ultra (High Quality)' },
      't2i-google-imagen3': { category: 'image', description: 'Google Imagen 3 Text-to-Image' },
      
      // テキスト → 音楽
      't2m-google-lyria': { category: 'music', description: 'Google Lyria Text-to-Music' },
      
      // テキスト → 動画
      't2v-fal-veo3-fast': { category: 'video', description: 'Fal.ai Veo3 Fast Text-to-Video' },
      
      // 画像 → 動画
      'i2v-fal-hailuo-02-pro': { category: 'video', description: 'Fal.ai Hailuo-02 Pro Image-to-Video' },
      
      // 画像 → 画像
      'i2i-fal-flux-kontext-max': { category: 'image', description: 'Fal.ai Flux Kontext Max Image-to-Image' },
      
      // 画像 → 3D
      'i2i3d-fal-hunyuan3d-v21': { category: '3d', description: 'Fal.ai Hunyuan3D v2.1 Image-to-3D' },
      
      // 動画 → 音声
      'v2a-fal-thinksound': { category: 'audio', description: 'Fal.ai ThinkSound Video-to-Audio' },
      
      // 動画 → 動画
      'v2v-fal-luma-ray2-modify': { category: 'video', description: 'Fal.ai Luma Ray-2 Video-to-Video' },
      
      // 参照 → 動画
      'r2v-fal-vidu-q1': { category: 'video', description: 'Fal.ai Vidu Q1 Reference-to-Video' }
    },
    // デフォルトツール設定
    defaultTools: {
      image: 't2i-fal-imagen4-fast',
      music: 't2m-google-lyria',
      video: 't2v-fal-veo3-fast',
      audio: 'v2a-fal-thinksound',
      '3d': 'i2i3d-fal-hunyuan3d-v21'
    }
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};