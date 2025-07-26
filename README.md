# Kamui Multi-Platform Bot

Kamui Code と統合したマルチプラットフォーム対応ボット。**Discord と Slack の両方**に対応し、AI会話、マルチメディア生成（画像・動画・音楽・3D）、コード実行などのタスクを各プラットフォーム上で実行できます。

## 🚀 主要機能

### 💬 マルチプラットフォーム対応
- **Discord**: メッセージ、メンション、DM、スラッシュコマンド対応
- **Slack**: メッセージ、メンション、DM、Socket Mode対応  
- **同時実行**: 両プラットフォームで同時にボット実行可能
- 長いメッセージの自動分割配信（各プラットフォームの制限に対応）
- 会話履歴の継続とリセット機能

### 🧠 Claude Code SDK 統合
- Claude Code SDK の全機能を Discord・Slack で利用可能
- ストリーミングレスポンス対応
- コード実行・ファイル操作・Web検索などのツール利用
- 自動タイムアウト処理とエラー回復機能

### 🎨 マルチメディア生成（MCP 20サービス対応）

#### 画像生成
- **Fal.ai Imagen4 Ultra**: 高品質画像生成
- **Fal.ai Imagen4 Fast**: 高速画像生成  
- **Fal.ai Flux Schnell**: 超高速画像生成
- **Fal.ai Rundiffusion Photo Flux**: フォトリアル画像生成
- **Fal.ai Flux Kontext Max**: 画像変換・編集
- **Fal.ai Flux Kontext LoRA**: LoRA対応画像編集

#### 動画生成
- **Fal.ai Veo3 Fast**: テキストから動画生成
- **Fal.ai Hailuo-02 Pro**: 画像から動画生成
- **Fal.ai Luma Ray-2**: 動画から動画編集
- **Fal.ai Vidu Q1**: 参照動画生成

#### 音楽・音声生成
- **Google Lyria**: テキストから音楽生成
- **Fal.ai MiniMax Speech-02-Turbo**: テキストから音声生成
- **Fal.ai ThinkSound**: 動画から音声生成

#### 3D・動画処理
- **Fal.ai Hunyuan3D v2.1**: 画像から3Dモデル生成
- **Fal.ai Bria Background Removal**: 動画背景除去
- **Fal.ai Creatify Lipsync**: リアルタイムリップシンク
- **Fal.ai Pixverse Lipsync**: 高品質リップシンク

#### AI対話・その他
- **Fal.ai Flux Kontext Trainer**: LoRAモデル訓練
- **Fal.ai MiniMax Voice Design**: カスタム音声生成・設計

### 📁 ファイル管理
- 生成されたメディアファイルの自動検出・添付
- Base64 画像データの自動デコード・保存
- **Discord**: ファイル自動アップロード（25MB まで）
- **Slack**: ファイル自動アップロード（1GB まで）
- アップロード完了後の自動ファイル削除

## 🚀 セットアップ

### 1. 前提条件

```bash
# Node.js 18.0.0+ が必要
node --version

# Claude Code SDK のインストール確認
claude --version
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env.example` をコピーして `.env` を作成：

```bash
cp .env.example .env
```

`.env` ファイルを編集してプラットフォーム設定と必要なトークンを設定：

```env
# ===================================
# PLATFORM SELECTION
# ===================================
# Choose which platform(s) to run: 'discord', 'slack', or 'both'
BOT_PLATFORM=discord

# ===================================
# DISCORD CONFIGURATION
# ===================================
# Required for Discord bot functionality
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here

# Optional Discord settings
DISCORD_PREFIX=!
DISCORD_BOT_NAME=Kamui

# ===================================
# SLACK CONFIGURATION  
# ===================================
# Required for Slack bot functionality
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token-here
SLACK_APP_TOKEN=xapp-your-slack-app-token-here
SLACK_SIGNING_SECRET=your_slack_signing_secret_here

# Slack connection mode
# true = Socket Mode (recommended for development)
# false = HTTP Mode (for production deployment)
SLACK_SOCKET_MODE=true

# HTTP server port (only used when SLACK_SOCKET_MODE=false)
SLACK_PORT=3000

# Optional Slack settings
SLACK_BOT_NAME=Kamui

# ===================================
# CLAUDE CODE SDK CONFIGURATION
# ===================================
# Timeout for Claude API calls (milliseconds)
CLAUDE_TIMEOUT=180000

# Logging level
LOG_LEVEL=info

# File detection time limit (minutes)
# Set to 0 or negative value to disable time limit
FILE_DETECTION_MINUTES=30
```

#### 環境変数の詳細
| 変数名 | 必須 | デフォルト値 | 説明 |
|--------|------|-------------|------|
| **プラットフォーム選択** ||||
| `BOT_PLATFORM` | - | `discord` | 実行プラットフォーム: `discord`, `slack`, `both` |
| **Discord 設定** ||||
| `DISCORD_BOT_TOKEN` | Discord使用時 | - | Discord Bot のトークン |
| `DISCORD_CLIENT_ID` | Discord使用時 | - | Discord アプリケーション ID（スラッシュコマンド用） |
| `DISCORD_PREFIX` | - | `!` | Discord コマンドプレフィックス |
| `DISCORD_BOT_NAME` | - | `Kamui` | Discord での Bot 表示名 |
| **Slack 設定** ||||
| `SLACK_BOT_TOKEN` | Slack使用時 | - | Slack Bot のトークン（xoxb-で始まる） |
| `SLACK_APP_TOKEN` | Slack使用時 | - | Slack アプリトークン（xapp-で始まる、Socket Mode用） |
| `SLACK_SIGNING_SECRET` | Slack使用時 | - | Slack 署名シークレット |
| `SLACK_SOCKET_MODE` | - | `true` | Socket Mode の使用（true=Socket Mode、false=HTTP Mode） |
| `SLACK_PORT` | HTTP Mode時 | `3000` | HTTP server ポート（Socket Mode=false時のみ使用） |
| `SLACK_BOT_NAME` | - | `Kamui` | Slack での Bot 表示名 |
| **Claude Code SDK 設定** ||||
| `CLAUDE_TIMEOUT` | - | `180000` | Claude処理のタイムアウト（ミリ秒） |
| `LOG_LEVEL` | - | `info` | ログレベル（debug、info、warn、error） |
| `FILE_DETECTION_MINUTES` | - | `30` | ファイル検出時間制限（分、0以下で無制限） |

### 4. プラットフォームごとのセットアップ

#### Discord Bot の作成

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセス
2. 「New Application」をクリック
3. アプリケーション名を入力して作成
4. 「Bot」セクションに移動
5. 「Add Bot」をクリック
6. **Message Content Intent** を有効化（重要）
7. Bot token をコピーして `.env` ファイルの `DISCORD_BOT_TOKEN` に設定
8. 「General Information」で Application ID をコピーして `DISCORD_CLIENT_ID` に設定
9. 「OAuth2」→「URL Generator」で適切な権限を設定
10. 生成されたURLでBotをサーバーに招待

**必要な権限:**
- `Send Messages`
- `Read Message History` 
- `Use Slash Commands`
- `Attach Files`（メディアファイル送信用）

**必要なIntents:**
- `Message Content Intent`（メッセージ内容読み取り用）

#### Slack Bot の作成

1. [Slack API](https://api.slack.com/apps) にアクセス
2. 「Create New App」をクリック
3. 「From scratch」を選択してアプリを作成
4. **OAuth & Permissions** で Bot Token Scopes を設定:
   - `chat:write`
   - `files:write`
   - `commands`
   - `app_mentions:read`
   - `channels:history`
5. **Socket Mode** を有効化してApp-Level Token を作成
6. **Event Subscriptions** を有効化:
   - `message.channels`
   - `app_mention`
7. **Slash Commands** を追加:
   - `/ask` - Description: "Ask the AI assistant a question"
   - `/reset` - Description: "Reset conversation history"
   - `/help` - Description: "Show help information"
8. ワークスペースにアプリをインストール
9. **Basic Information** で Signing Secret をコピーして `SLACK_SIGNING_SECRET` に設定
10. **OAuth & Permissions** で Bot User OAuth Token（xoxb-で始まる）を `SLACK_BOT_TOKEN` に設定
11. **App-Level Tokens** で App Token（xapp-で始まる）を `SLACK_APP_TOKEN` に設定

**本番環境（HTTP Mode）の場合:**
- `SLACK_SOCKET_MODE=false` に設定
- `SLACK_PORT=3000`（または任意のポート）を設定
- **Event Subscriptions** で Request URL を設定（例: `https://your-domain.com/slack/events`）

## 🎯 使用方法

### Bot の起動

```bash
# Discord のみ
BOT_PLATFORM=discord npm start

# Slack のみ  
BOT_PLATFORM=slack npm start

# 両プラットフォーム同時実行
BOT_PLATFORM=both npm start

# 開発時（ファイル監視）
npm run dev
```

### コマンド使用方法

#### Discord での使用

**1. スラッシュコマンド**（推奨）
```
/ask question: 美しい桜の画像を生成して
/ask question: Pythonでhello worldを書いて
/ask question: この画像をもとに3Dモデルを作って
/reset （会話履歴をリセット）
/help （ヘルプを表示）
```

**2. プレフィックス付きコマンド**: `!<メッセージ>`
```
!こんにちは
!山の風景画像を生成して
!この画像をもとに動画を作って
```

**3. メンション**: `@BotName <メッセージ>`
```
@Kamui 美しい夕焼けの動画を作成して
@Kamui Pythonでソートアルゴリズムを書いて
```

**4. DM（ダイレクトメッセージ）**: プレフィックス不要
```
こんにちは
音楽を生成して
プログラミングについて教えて
```

#### Slack での使用

**1. スラッシュコマンド**（推奨）
```
/ask 美しい桜の画像を生成して
/ask Pythonでhello worldを書いて
/reset （会話履歴をリセット）
/help （ヘルプを表示）
```

**2. メンション**: `@BotName <メッセージ>`
```
@Kamui 美しい夕焼けの動画を作成して
@Kamui Pythonでソートアルゴリズムを書いて
```

**3. DM（ダイレクトメッセージ）**: プレフィックス不要
```
こんにちは
音楽を生成して
プログラミングについて教えて
```

#### マルチメディア生成例（全プラットフォーム共通）
```
# 画像生成
美しい桜並木の写真を生成して
cyberpunk cityscape at night

# 動画生成
雲が流れる風景動画を作って
create a video of ocean waves

# 音楽生成
リラックスできるピアノ音楽を作って
generate upbeat electronic music

# 3D モデル生成
猫の3Dモデルを作って
create a 3D model of a chair

# 音声生成
「こんにちは」を自然な音声で生成して

# リップシンク動画
この動画に音声を同期させて
```

## 🏗️ アーキテクチャ

### システム構成
```
Discord/Slack → BotManager → Platform Adapters → Claude Code SDK → MCP Servers
                     ↓              ↓                ↓              ↓
                Common Logic → Message Handler → Tool Execution → File Generation
                     ↓              ↓                ↓              ↓
                Error Handling → Timeout Control → Stream Response → Auto Upload
```

### ファイル構造

```
d-kcode/
├── package.json              # 依存関係とスクリプト設定
├── .env                      # 環境変数設定（要作成）
├── .env.example              # 環境変数のテンプレート
├── .mcp.json                # MCPサーバー設定（20サービス）
├── CLAUDE.md                # プロジェクト詳細ドキュメント
├── .gitignore               # Git除外ファイル設定
├── src/
│   ├── bot.js               # メインエントリーポイント
│   ├── bot-manager.js       # プラットフォーム管理・起動制御
│   ├── commands.js          # Discord スラッシュコマンド定義
│   ├── adapters/            # プラットフォーム別実装
│   │   ├── base-adapter.js  # 共通基底クラス・Claude統合
│   │   ├── discord-adapter.js  # Discord.js v14実装
│   │   └── slack-adapter.js    # Slack Bolt・Socket Mode実装
│   ├── handlers/            # 共通処理ハンドラー
│   │   ├── message-handler.js  # プラットフォーム非依存メッセージ処理
│   │   └── file-processor.js   # ファイル自動検出・管理
│   ├── config/
│   │   └── config.js        # 設定管理・環境変数統合
│   └── utils/
│       └── claude.js        # Claude Code SDK統合・MCP動的読み込み
└── README.md               # このファイル
```

### コンポーネント詳細

#### `bot-manager.js` - BotManager クラス
- マルチプラットフォーム管理の中核
- `BOT_PLATFORM` 環境変数による動的プラットフォーム選択
- グレースフルシャットダウン対応
- 統合エラーハンドリング・ヘルスチェック

#### `adapters/` - プラットフォーム別実装
- **base-adapter.js**: 共通基底クラス・Claude統合・ファイル処理
- **discord-adapter.js**: Discord.js v14、スラッシュコマンド、25MB制限対応
- **slack-adapter.js**: Slack Bolt、Socket Mode、1GB制限対応、接続エラー処理

#### `handlers/` - 共通処理ハンドラー
- **message-handler.js**: プラットフォーム非依存のメッセージ正規化・処理
- **file-processor.js**: 生成ファイル自動検出・アップロード・削除機能

#### `utils/claude.js` - ClaudeProcessor クラス  
- Claude Code SDK との完全統合
- `.mcp.json` からの全MCPツール動的読み込み（20サービス）
- タイムアウト処理改善（重複実行防止）
- ストリーミングレスポンス対応

#### `.mcp.json` - MCP設定
- 20個の外部AIサービス接続設定
- HTTP MCP サーバーエンドポイント自動管理
- Gemini、Fal.ai画像・動画・音楽・3D生成サーバー

## ⚙️ 詳細設定

### 利用可能なMCPサービス（20個）

| カテゴリ | サービス名 | 説明 | プロバイダー |
|---------|-----------|------|-------------|
| **画像生成** | `t2i-fal-imagen4-ultra` | 高品質画像生成 | Fal.ai Imagen4 Ultra |
| | `t2i-fal-imagen4-fast` | 高速画像生成 | Fal.ai Imagen4 Fast |
| | `t2i-fal-flux-schnell` | 超高速画像生成 | Fal.ai Flux Schnell |
| | `t2i-fal-rundiffusion-photo-flux` | フォトリアル画像生成 | Fal.ai Rundiffusion |
| **画像編集** | `i2i-fal-flux-kontext-max` | 画像変換・編集 | Fal.ai Flux Kontext |
| | `i2i-fal-flux-kontext-lora` | LoRA対応画像編集 | Fal.ai Flux Kontext |
| **動画生成** | `t2v-fal-veo3-fast` | テキストから動画生成 | Fal.ai Veo3 |
| | `i2v-fal-hailuo-02-pro` | 画像から動画生成 | Fal.ai Hailuo-02 |
| | `r2v-fal-vidu-q1` | 参照動画生成 | Fal.ai Vidu |
| **動画編集** | `v2v-fal-luma-ray2-modify` | 動画から動画編集 | Fal.ai Luma Ray-2 |
| | `v2v-fal-bria-background-removal` | 動画背景除去 | Fal.ai Bria |
| | `v2v-fal-creatify-lipsync` | リアルタイムリップシンク | Fal.ai Creatify |
| | `v2v-fal-pixverse-lipsync` | 高品質リップシンク | Fal.ai Pixverse |
| **音楽・音声** | `t2m-google-lyria` | テキストから音楽生成 | Google Lyria |
| | `t2s-fal-minimax-speech-02-turbo` | テキストから音声生成 | Fal.ai MiniMax |
| | `v2a-fal-thinksound` | 動画から音声生成 | Fal.ai ThinkSound |
| | `v2v-fal-minimax-voice-design` | カスタム音声生成・設計 | Fal.ai MiniMax |
| **3D・訓練** | `i2i3d-fal-hunyuan3d-v21` | 画像から3Dモデル生成 | Fal.ai Hunyuan3D |
| | `train-fal-flux-kontext-trainer` | LoRAモデル訓練 | Fal.ai Flux Trainer |


## 🛠️ トラブルシューティング

### よくある問題

#### 1. **Bot がメッセージに反応しない**
- ✅ Discord/Slack Bot token が正しく設定されているか確認
- ✅ Bot に適切な権限が付与されているか確認
- ✅ プレフィックス、メンション、またはDMで正しく送信しているか確認

#### 2. **スラッシュコマンドが表示されない**
- ✅ `DISCORD_CLIENT_ID` または Slack のコマンド設定を確認
- ✅ Bot招待時に適切なスコープが含まれているか確認
- ⏰ グローバルコマンドの反映には最大1時間かかる場合があります

#### 3. **Claude Code SDK エラー**
- ✅ `claude --version` でインストール確認
- ✅ Claude認証が正しく設定されているか確認
- ✅ `.mcp.json` ファイルが存在し、正しいフォーマットか確認

#### 4. **MCP ツールエラー**
- ✅ インターネット接続を確認（外部APIアクセス必要）
- ✅ `CLAUDE_TIMEOUT=180000` で十分なタイムアウト時間が設定されているか
- ✅ MCP サーバーのステータスを確認

#### 5. **Slack Socket Mode接続エラー**
- ✅ `SLACK_APP_TOKEN` と `SLACK_SOCKET_MODE=true` の設定確認
- ✅ Slack アプリでSocket Modeが有効化されているか確認
- ✅ 適切なEvent Subscriptionsが設定されているか確認

#### 6. **タイムアウトエラーが複数回表示される**
- ✅ 最新バージョンではプロセス重複終了が修正されています
- ✅ `git pull` で最新の修正を取得してください

### ログの確認

Bot は詳細なログを出力します：

```bash
🔧 Configuration Summary:
  Platform: discord
  Discord: ✅ Enabled
  Slack: ❌ Disabled

🚀 Bot Manager initializing for platform: discord
✅ Discord adapter initialized
✅ Bot Manager initialized with 1 adapter(s)
✅ Discord bot started successfully
[DEBUG] All MCP tools from .mcp.json: mcp__gemini,mcp__t2m-google-lyria...
[DEBUG] Setting timeout to 180000ms for allowedTools...
🎉 Kamui Bot が正常に開始されました！
```

### デバッグモード

詳細なデバッグ情報を確認するには：

```bash
# 環境変数でログレベルを設定
LOG_LEVEL=debug npm run dev

# または直接実行時に設定
LOG_LEVEL=debug BOT_PLATFORM=both npm start
```

## 📦 使用技術・依存関係

### コア技術
- **Node.js** v18.0.0+ (推奨: v22.16.0+)
- **Discord.js** v14.16.3 - Discord Bot フレームワーク
- **Slack Bolt** v3.22.0 - Slack Bot フレームワーク
- **Claude Code SDK** - Anthropic Claude との統合
- **MCP (Model Context Protocol)** - 外部ツール統合プロトコル

### 主要依存関係
```json
{
  "discord.js": "^14.16.3",    // Discord API クライアント
  "@slack/bolt": "^3.22.0",    // Slack Bot フレームワーク  
  "dotenv": "^16.4.7",         // 環境変数管理
  "acorn": "^8.15.0"           // JavaScript パーサー
}
```

### 外部サービス統合
- **Fal.ai APIs** - 画像・動画・音楽・3D生成（19サービス）
- **Google Gemini** - AI対話・画像解析
- **Google Lyria** - 音楽生成AI
- **Claude Code SDK** - AI アシスタント・ツール実行

## 🔧 開発・運用

### 開発環境
```bash
# 開発サーバー起動（ファイル監視付き）
npm run dev

# 本番サーバー起動
npm start

# プラットフォーム指定起動
BOT_PLATFORM=discord npm start
BOT_PLATFORM=slack npm start  
BOT_PLATFORM=both npm start
```

### パフォーマンス最適化
- **非同期処理**: 全API呼び出しで Promise/async-await 使用
- **ストリーミング**: Claude レスポンスのリアルタイム表示
- **メモリ管理**: 生成ファイルの自動削除でストレージ節約
- **エラー処理**: タイムアウト・ネットワークエラーの自動リトライ
- **キャッシュ**: Discord メッセージ分割による効率的送信
- **プロセス管理**: 重複実行防止とクリーンアップ

### セキュリティ
- **環境変数管理**: `.env` ファイルでの機密情報保護
- **ファイル自動削除**: 生成ファイルの自動クリーンアップ
- **エラー情報制限**: ユーザー向け情報の最小化


## 📝 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルを参照

---

⭐ **このプロジェクトが役に立ったらスターをお願いします！** ⭐
