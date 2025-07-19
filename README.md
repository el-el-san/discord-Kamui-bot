# Discord Bot for Kamui Code

Kamui Code (Claude Code + MCP) と完全統合したマルチメディア生成対応 Discord Bot。テキストから画像・動画・音楽の生成、コード実行、ファイル操作などの高度なタスクを Discord 上で実行できます。

## 📋 主要機能

### 💬 コミュニケーション機能
- Discord メッセージの受信と処理（プレフィックス、メンション、DM対応）
- スラッシュコマンド対応（自動登録機能付き）
- 長いメッセージの自動分割配信
- 会話履歴の継続とリセット機能

### 🧠 Claude Code SDK 統合
- Claude Code SDK の全機能を Discord で利用可能
- ストリーミングレスポンス対応
- コード実行・ファイル操作・Web検索などのツール利用
- 複数の出力フォーマット対応（テキスト、JSON、ストリーミング）

### 🎨 マルチメディア生成（MCP対応）
- **画像生成**: Fal.ai Imagen4 (Fast/Ultra)、Google Imagen 3
- **動画生成**: Fal.ai Veo3 Fast、Hailuo-02 Pro、Luma Ray-2
- **音楽生成**: Google Lyria
- **音声生成**: Fal.ai ThinkSound (動画→音声)
- **3D モデル生成**: Fal.ai Hunyuan3D v2.1
- **画像変換**: Fal.ai Flux Kontext Max

### 📁 ファイル管理
- 生成されたメディアファイルの自動検出・添付
- Base64 画像データの自動デコード・保存
- Discord へのファイル自動アップロード（25MB まで）
- アップロード完了後の自動ファイル削除

## 🚀 セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` を作成：

```bash
cp .env.example .env
```

`.env` ファイルを編集して必要な値を設定：

```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_bot_client_id_here
PREFIX=!
BOT_NAME=Kamui
CLAUDE_TIMEOUT=180000
LOG_LEVEL=info
```

#### 環境変数の詳細
| 変数名 | 必須 | デフォルト値 | 説明 |
|--------|------|-------------|------|
| `DISCORD_BOT_TOKEN` | ✅ | - | Discord Bot のトークン |
| `CLIENT_ID` | 推奨 | - | Discord アプリケーション ID（スラッシュコマンド用） |
| `PREFIX` | - | `!` | コマンドプレフィックス |
| `BOT_NAME` | - | `Kamui` | Bot の表示名 |
| `CLAUDE_TIMEOUT` | - | `180000` | Claude処理のタイムアウト（ミリ秒、MCP対応で3分） |
| `LOG_LEVEL` | - | `info` | ログレベル |

### 3. Discord Bot の作成

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセス
2. 「New Application」をクリック
3. アプリケーション名を入力して作成
4. 「Bot」セクションに移動
5. 「Add Bot」をクリック
6. Bot token をコピーして `.env` ファイルに設定
7. 「OAuth2」→「URL Generator」で適切な権限を設定
8. 生成されたURLでBotをサーバーに招待

#### 必要な権限
- `Send Messages`
- `Read Message History` 
- `Use Slash Commands`
- `Attach Files`（メディアファイル送信用）

### 4. Claude Code SDK と MCP の設定

#### Claude Code SDK のインストール確認
```bash
claude --version
```

#### MCP設定ファイル
プロジェクトルートに `.mcp.json` ファイルが必要です。このファイルには以下の MCP サーバーが設定されています：

- **画像生成**: Fal.ai Imagen4 (Fast/Ultra)
- **動画生成**: Fal.ai Veo3 Fast、Hailuo-02 Pro
- **音楽生成**: Google Lyria  
- **画像変換**: Fal.ai Flux Kontext Max
- **音声生成**: Fal.ai ThinkSound
- **3D生成**: Fal.ai Hunyuan3D v2.1
- **動画編集**: Luma Ray-2
- **参照動画**: Vidu Q1

MCP サーバーの設定は自動的に読み込まれ、Claude が適切なツールを選択して実行します。

## 🎯 使用方法

### Bot の起動

```bash
# 開発時（ファイル監視）
npm run dev

# 本番時
npm start
```

### Discord での使用

#### 1. **スラッシュコマンド**（推奨）
```
/ask question: Pythonでhello worldを書いて
/ask question: 猫の画像を生成して
/reset （会話履歴をリセット）
/help （ヘルプを表示）
```

#### 2. **プレフィックス付きコマンド**: `!<メッセージ>`
```
!こんにちは
!山の風景画像を生成して
!この画像をもとに動画を作って
```

#### 3. **メンション**: `@BotName <メッセージ>`
```
@Kamui Code 美しい夕焼けの動画を作成して
@Kamui Code Pythonでソートアルゴリズムを書いて
```

#### 4. **DM（ダイレクトメッセージ）**: プレフィックス不要
```
こんにちは
音楽を生成して
プログラミングについて教えて
```

#### 5. **マルチメディア生成例**
```
# 画像生成
!美しい桜並木の写真を生成して
/ask question: cyberpunk cityscape at night

# 動画生成
!雲が流れる風景動画を作って
/ask question: create a video of ocean waves

# 音楽生成
!リラックスできるピアノ音楽を作って
/ask question: generate upbeat electronic music

# 3D モデル生成
!猫の3Dモデルを作って
/ask question: create a 3D model of a chair
```

## 🏗️ アーキテクチャ

### システム構成
```
Discord Message → Discord Bot → Claude Code SDK → MCP Servers → Response → Discord
                      ↓              ↓              ↓
                 [bot.js]    [claude.js]    [.mcp.json]
                      ↓              ↓              ↓
              Message Handling → Tool Execution → File Generation
                      ↓              ↓              ↓
              Response Formatting → Streaming → Auto File Upload
```

### ファイル構造

```
d-kcode/
├── package.json          # 依存関係とスクリプト設定
├── .env                  # 環境変数設定（要作成）
├── .mcp.json            # MCPサーバー設定（マルチメディア生成用）
├── .gitignore           # Git除外ファイル設定
├── bot.js               # メインBot実装（クラスベース）
├── commands.js          # スラッシュコマンド定義
├── config/
│   └── config.js        # 設定管理・MCP設定
├── utils/
│   └── claude.js        # Claude Code SDK統合・MCP対応
└── README.md           # このファイル
```

### コンポーネント詳細

#### `bot.js` - KamuiBot クラス
- Discord.js v14 ベースのBot実装
- メッセージ・スラッシュコマンド・DM対応
- ファイル自動検出・アップロード・削除機能
- エラーハンドリング・タイムアウト処理

#### `utils/claude.js` - ClaudeProcessor クラス  
- Claude Code SDK との完全統合
- 全MCPツールサポート（自動選択）
- ストリーミングレスポンス対応
- Base64画像自動保存機能

#### `config/config.js` - 設定管理
- 環境変数の一元管理
- MCPツール定義とマッピング
- タイムアウト・出力形式設定

#### `.mcp.json` - MCP設定
- 外部AIサービス接続設定
- 画像・動画・音楽・3D生成サーバー
- HTTP MCP サーバーエンドポイント

## ⚙️ 詳細設定

### 利用可能なMCPツール

| カテゴリ | ツール名 | 説明 | API |
|---------|----------|------|-----|
| 画像生成 | `t2i-fal-imagen4-fast` | 高速画像生成 | Fal.ai Imagen4 Fast |
| 画像生成 | `t2i-fal-imagen4-ultra` | 高品質画像生成 | Fal.ai Imagen4 Ultra |
| 音楽生成 | `t2m-google-lyria` | テキストから音楽生成 | Google Lyria |
| 動画生成 | `t2v-fal-veo3-fast` | テキストから動画生成 | Fal.ai Veo3 Fast |
| 画像→動画 | `i2v-fal-hailuo-02-pro` | 画像から動画生成 | Fal.ai Hailuo-02 Pro |
| 画像変換 | `i2i-fal-flux-kontext-max` | 画像から画像変換 | Fal.ai Flux Kontext |
| 3D生成 | `i2i3d-fal-hunyuan3d-v21` | 画像から3Dモデル | Fal.ai Hunyuan3D |
| 音声生成 | `v2a-fal-thinksound` | 動画から音声生成 | Fal.ai ThinkSound |
| 動画編集 | `v2v-fal-luma-ray2-modify` | 動画から動画編集 | Fal.ai Luma Ray-2 |
| 参照動画 | `r2v-fal-vidu-q1` | 参照から動画生成 | Fal.ai Vidu Q1 |

### Claude Code SDK 詳細設定

#### 実行モード
- **継続会話**: `claude -c` で前の会話を継続
- **新規会話**: `claude -p` で新しい会話を開始
- **ストリーミング**: `--output-format stream-json` でリアルタイム応答
- **MCP統合**: `--mcp-config .mcp.json` で外部ツール利用
- **許可ツール**: `--allowedTools` でツール制限

#### 自動処理機能
- **ツール選択**: Claude が最適なMCPツールを自動選択
- **エラー処理**: タイムアウト時の継続モード→新規モード自動切り替え
- **ファイル管理**: 生成ファイルの自動検出・アップロード・削除
- **Base64処理**: 画像データの自動デコード・保存

## 🛠️ トラブルシューティング

### よくある問題

#### 1. **Bot がメッセージに反応しない**
- ✅ Discord Bot token が正しく設定されているか確認
- ✅ Bot に適切な権限が付与されているか確認（Send Messages, Attach Files等）
- ✅ プレフィックス、メンション、またはDMで正しく送信しているか確認

#### 2. **スラッシュコマンドが表示されない**
- ✅ `CLIENT_ID` 環境変数が設定されているか確認
- ✅ Bot招待時に `applications.commands` スコープが含まれているか確認
- ⏰ グローバルコマンドの反映には最大1時間かかる場合があります

#### 3. **Claude Code SDK エラー**
- ✅ `claude --version` でインストール確認
- ✅ Claude認証が正しく設定されているか確認
- ✅ `.mcp.json` ファイルが存在し、正しいフォーマットか確認

#### 4. **MCP ツールエラー**
- ✅ インターネット接続を確認（外部APIアクセス必要）
- ✅ `CLAUDE_TIMEOUT=180000` で十分なタイムアウト時間が設定されているか
- ✅ MCP サーバーのステータスを確認

#### 5. **ファイル生成・アップロードエラー**
- ✅ Discord の25MBファイルサイズ制限以下か確認
- ✅ ファイル形式がサポートされているか確認
- ✅ ディスク容量が十分にあるか確認

### ログの確認

Bot は詳細なログを出力します：

```bash
✅ Kamui#1234 がログインしました！
🤖 Bot名: Kamui Code
🧠 Claude Code SDK: ✅ 正常
🚀 3個のスラッシュコマンドを正常に登録しました！
📨 受信: user#1234 - "美しい風景画像を生成して"
[DEBUG] Processing input: "美しい風景画像を生成して"
[DEBUG] Available MCP tools: mcp__t2i-fal-imagen4-fast,mcp__t2i-fal-imagen4-ultra,...
🔧 Using tool: mcp__t2i-fal-imagen4-fast__imagen4_fast_submit
📎 Attaching 1 generated files
✅ 削除完了: generated_image_2025-01-19T12-34-56-789Z.png
```

### デバッグモード

詳細なデバッグ情報を確認するには：

```bash
# 環境変数でログレベルを設定
LOG_LEVEL=debug npm run dev

# または直接実行時に設定
LOG_LEVEL=debug node bot.js
```

## 📦 使用技術・依存関係

### コア技術
- **Node.js** v18.0.0+ (推奨: v22.16.0+)
- **Discord.js** v14.16.3 - Discord Bot フレームワーク
- **Claude Code SDK** - Anthropic Claude との統合
- **MCP (Model Context Protocol)** - 外部ツール統合プロトコル

### 主要依存関係
```json
{
  "discord.js": "^14.16.3",  // Discord API クライアント
  "dotenv": "^16.4.7",       // 環境変数管理
  "acorn": "^8.15.0"         // JavaScript パーサー
}
```

### 外部サービス統合
- **Fal.ai APIs** - 画像・動画・音楽・3D生成
- **Google Lyria** - 音楽生成AI
- **Claude Code SDK** - AI アシスタント・ツール実行

## 🔧 開発・運用

### 開発環境
```bash
# 開発サーバー起動（ファイル監視付き）
npm run dev

# 本番サーバー起動
npm start
```

### テスト・品質管理
```bash
# テスト実行（現在未設定）
npm test

# リント実行（現在未設定）
npm run lint
```

### パフォーマンス最適化
- **非同期処理**: 全API呼び出しで Promise/async-await 使用
- **ストリーミング**: Claude レスポンスのリアルタイム表示
- **メモリ管理**: 生成ファイルの自動削除でストレージ節約
- **エラー処理**: タイムアウト・ネットワークエラーの自動リトライ
- **キャッシュ**: Discord メッセージ分割による効率的送信

## 📝 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) ファイルを参照

---

⭐ **このプロジェクトが役に立ったらスターをお願いします！** ⭐
