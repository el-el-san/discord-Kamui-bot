const { spawn, execFile, exec } = require('child_process');
const config = require('../config/config');
const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Claude Code SDK統合ユーティリティ
 */
class ClaudeProcessor {
  constructor() {
    this.timeout = config.claude.timeout;
    this.commandPath = config.claude.commandPath;
    this.outputFormat = config.claude.outputFormat;
    this.verbose = config.claude.verbose;
    this.shouldStartFresh = false; // リセット後の新規会話フラグ
  }

  /**
   * 利用可能なすべてのMCPツールのリストを取得（.mcp.jsonから動的に読み込み）
   * @returns {string} - カンマ区切りのMCPツール名
   */
  getAllMCPTools() {
    try {
      const fs = require('fs');
      const path = require('path');
      const mcpConfigPath = path.join(process.cwd(), '.mcp.json');
      
      if (fs.existsSync(mcpConfigPath)) {
        const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
        const allTools = Object.keys(mcpConfig.mcpServers || {}).map(key => `mcp__${key}`);
        
        const toolsString = allTools.join(',');
        console.log(`[DEBUG] All MCP tools from .mcp.json: ${toolsString}`);
        return toolsString;
      } else {
        console.log('[DEBUG] .mcp.json not found, using fallback tools');
        // フォールバック用の基本ツール
        const fallbackTools = [
          'mcp__t2i-fal-imagen4-fast',
          'mcp__t2v-fal-veo3-fast', 
          'mcp__t2m-google-lyria',
          'mcp__i2v-fal-hailuo-02-pro',
          'mcp__i2i-fal-flux-kontext-max',
          'mcp__r2v-fal-vidu-q1'
        ];
        return fallbackTools.join(',');
      }
    } catch (error) {
      console.error('[DEBUG] Error reading .mcp.json:', error.message);
      // エラー時のフォールバック
      const fallbackTools = [
        'mcp__t2i-fal-imagen4-fast',
        'mcp__t2v-fal-veo3-fast', 
        'mcp__t2m-google-lyria',
        'mcp__i2v-fal-hailuo-02-pro',
        'mcp__i2i-fal-flux-kontext-max',
        'mcp__r2v-fal-vidu-q1'
      ];
      return fallbackTools.join(',');
    }
  }


  /**
   * Claude Code SDKにプロンプトを送信し、応答を取得 (spawn版)
   * @param {string} input - ユーザーからの入力
   * @returns {Promise<string>} - Claudeからの応答
   */


  async processInput(input, continueConversation = true) {
    // リセット後の初回は新規会話として開始
    if (this.shouldStartFresh) {
      continueConversation = false;
      this.shouldStartFresh = false;
      console.log('[DEBUG] Starting fresh conversation after reset');
    }
    
    // 統一実行メソッドを使用
    console.log(`[DEBUG] Processing input: "${input}"`);
    return this.executeClaudeUnified(input, continueConversation);
  }

  /**
   * 統一Claude実行メソッド（段階的権限回避戦略付き）
   * @param {string} input - ユーザーからの入力
   * @param {boolean} continueConversation - 会話を継続するかどうか
   * @param {Function} onStream - ストリーミングコールバック（オプション）
   * @returns {Promise<string>} - Claudeからの応答
   */
  async executeClaudeUnified(input, continueConversation = true, onStream = null) {
    // HTTPリクエストの事前処理（curl代替）
    let processedInput;
    try {
      processedInput = await this.preprocessHttpRequests(input);
    } catch (error) {
      console.error('[HTTP_PROXY] Preprocessing failed:', error.message);
      processedInput = input; // 失敗した場合は元の入力を使用
    }
    
    // 段階的権限パターン（優先度順）
    const permissionPatterns = [
      //`${this.getAllMCPTools()},Bash`,          // 完全なBash権限許可
      //`${this.getAllMCPTools()},Bash(*)`,       // 全コマンド許可
      `${this.getAllMCPTools()},Bash(curl:*),Bash(open:*)`//,  // curlのみ許可
      //this.getAllMCPTools()                     // MCPツールのみ（Bash権限なし）
    ];

    for (let attemptIndex = 0; attemptIndex < permissionPatterns.length; attemptIndex++) {
      const currentPattern = permissionPatterns[attemptIndex];
      console.log(`[ATTEMPT ${attemptIndex + 1}/${permissionPatterns.length}] Trying permission pattern: ${currentPattern}`);
      
      try {
        const result = await this._executeSingleAttempt(
          processedInput, 
          continueConversation, 
          currentPattern, 
          onStream,
          attemptIndex
        );
        
        // 成功した場合は結果を返す
        console.log(`[SUCCESS] Permission pattern ${attemptIndex + 1} worked`);
        return result;
      } catch (error) {
        const userError = this._generateUserFriendlyError(error, {
          attemptIndex,
          totalAttempts: permissionPatterns.length
        });
        console.log(`[FAILED] Permission pattern ${attemptIndex + 1} failed: ${userError}`);
        
        // 最後の試行の場合、または権限エラー以外の場合はエラーを投げる
        if (attemptIndex === permissionPatterns.length - 1) {
          // 最終的なエラーメッセージをユーザーフレンドリーに
          const finalError = new Error(`全ての権限パターンが失敗しました。${userError}`);
          finalError.originalError = error;
          throw finalError;
        }
        
        if (!this._isPermissionError(error)) {
          // 権限エラー以外の場合は続行しない
          throw error;
        }
        
        // 次のパターンを試す
        console.log(`[RETRY] Trying next permission pattern (${attemptIndex + 2}/${permissionPatterns.length})...`);
      }
    }
  }

  /**
   * 単一のClaude実行試行
   * @private
   */
  async _executeSingleAttempt(input, continueConversation, allowedTools, onStream, attemptIndex) {
    return new Promise((resolve, reject) => {
      if (!input || typeof input !== 'string') {
        reject(new Error('Invalid input: must be a non-empty string'));
        return;
      }

      // null bytes and other problematic characters を除去
      const sanitizedInput = input.replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      
      if (!sanitizedInput.trim()) {
        reject(new Error('Input became empty after sanitization'));
        return;
      }

      // spawn()引数配列方式で構築（シェルエスケープ安全）
      const args = [];
      
      // --print option for non-interactive mode
      args.push('--print');
      
      // continue conversation option
      if (continueConversation) {
        args.push('-c');
      }
      
      // output format and other options
      args.push('--output-format', 'stream-json');
      args.push('--verbose');
      args.push('--mcp-config', '.mcp.json');
      
      // allowedTools parameter - need to use = format to avoid confusion with positional args
      args.push(`--allowedTools=${allowedTools}`);
      
      // prompt as the final positional argument
      args.push(sanitizedInput);

      const modeDescription = continueConversation ? 'continue mode' : 'new conversation mode';
      console.log(`Executing Claude (${modeDescription}): claude ${args.join(' ')}`);
      console.log(`[DEBUG] User input: "${input.substring(0, 100)}${input.length > 100 ? '...' : ''}"`);

      const env = {
        ...process.env,
        CI: 'true',
        NON_INTERACTIVE: '1',
        FORCE_COLOR: '0'
      };

      const childProcess = spawn('claude', args, {
        env: env,
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let streamBuffer = '';
      
      childProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // ストリーミング処理
        if (onStream) {
          streamBuffer += chunk;
          const lines = streamBuffer.split('\n');
          streamBuffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim() && !line.includes('\x00') && line.length < (parseInt(process.env.MAX_LINE_LENGTH) || 50000)) {
              if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
                try {
                  const json = JSON.parse(line);
                  this.handleStreamChunk(json, onStream);
                } catch (parseError) {
                  // JSONパースエラーは無視
                }
              }
            }
          }
        }
      });
      
      childProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
      });
      
      childProcess.on('close', (code, signal) => {
        if (processKilled) return; // 重複処理を防止
        processKilled = true;
        
        console.log(`[DEBUG] Claude process closed: code=${code}, signal=${signal}`);
        console.log(`[DEBUG] stdout length: ${stdout.length}, stderr length: ${stderr.length}`);
        
        if (code !== 0) {
          console.error(`Claude process failed with code: ${code}, signal: ${signal}`);
          console.error(`[DEBUG] stderr content: ${stderr}`);
          
          // タイムアウトの場合は部分的な結果を試す
          if (code === 143 || signal === 'SIGTERM') {
            console.log('[TIMEOUT] Process terminated, trying to extract partial response...');
            if (stdout && stdout.trim()) {
              console.log(`[TIMEOUT] stdout preview: ${stdout.substring(0, 200)}...`);
              const partialResponse = this.extractStreamResponse(stdout);
              if (partialResponse && partialResponse !== 'Claude returned an empty response.') {
                console.log('[TIMEOUT] Partial response successfully extracted');
                const timeoutMessage = `\n\n⏱️ [処理が時間を超過しましたが、部分的な結果を取得できました]\n\n画像生成が進行中の場合、しばらく待ってから再度お試しください。`;
                resolve(partialResponse + timeoutMessage);
                return;
              }
              // 空の結果でも、進行中メッセージを表示
              const progressMessage = `⏳ 画像生成処理が進行中です。\n\nMCPサービスが応答に時間がかかっています。しばらく待ってから再度リクエストしてください。`;
              resolve(progressMessage);
              return;
            }
            console.log('[TIMEOUT] No usable partial response found');
          }
          
          // エラー情報を含むエラーオブジェクトを作成
          const error = new Error(`Claude execution failed: ${stderr || `code ${code}`}`);
          error.code = code;
          error.signal = signal;
          error.stderr = stderr;
          reject(error);
          return;
        }

        console.log('Claude execution completed successfully');
        console.log(`[DEBUG] Processing stdout with ${stdout.split('\n').length} lines`);
        const response = this.extractStreamResponse(stdout);
        console.log(`[DEBUG] Extracted response length: ${response.length}`);
        console.log(`[DEBUG] Response preview: ${response.substring(0, 100)}...`);
        resolve(response);
      });

      // stdinを閉じる
      if (childProcess.stdin) {
        childProcess.stdin.end();
      }
      
      // タイムアウト処理 (MCP操作用に延長)
      const mcpTimeout = allowedTools.includes('mcp__') ? (parseInt(process.env.MCP_TOOL_TIMEOUT) || 180000) : (parseInt(process.env.DEFAULT_TOOL_TIMEOUT) || 60000); // MCPツール使用時とデフォルトタイムアウト
      console.log(`[DEBUG] Setting timeout to ${mcpTimeout}ms for allowedTools: ${allowedTools.substring(0, 50)}...`);
      
      let processKilled = false;
      const timeoutId = setTimeout(() => {
        if (!childProcess.killed && !processKilled) {
          processKilled = true;
          console.log('Killing Claude process due to timeout');
          childProcess.kill('SIGTERM');
        }
      }, mcpTimeout);
      
      // プロセス終了時にタイムアウトをクリア
      childProcess.on('exit', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  /**
   * 権限エラーかどうかを判定
   * @private
   */
  _isPermissionError(error) {
    const errorMessage = error.message.toLowerCase();
    const stderrMessage = error.stderr ? error.stderr.toLowerCase() : '';
    
    const permissionKeywords = [
      'permission', 'not allowed', 'denied', 'unauthorized',
      'forbidden', 'access denied', 'not permitted',
      'command not allowed', 'tool not allowed'
    ];
    
    return permissionKeywords.some(keyword => 
      errorMessage.includes(keyword) || stderrMessage.includes(keyword)
    );
  }

  /**
   * Claudeエラーの種類を分類
   * @private
   */
  _categorizeError(error) {
    const errorMessage = error.message.toLowerCase();
    const stderrMessage = error.stderr ? error.stderr.toLowerCase() : '';
    
    if (this._isPermissionError(error)) {
      return 'permission';
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('sigterm')) {
      return 'timeout';
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return 'network';
    }
    
    if (errorMessage.includes('mcp') || errorMessage.includes('server')) {
      return 'mcp';
    }
    
    return 'unknown';
  }

  /**
   * ユーザー向けのエラーメッセージを生成
   * @private
   */
  _generateUserFriendlyError(error, context = {}) {
    const errorType = this._categorizeError(error);
    const { attemptIndex = 0, totalAttempts = 1 } = context;
    
    switch (errorType) {
      case 'permission':
        return `権限エラー: ClaudeのBashツール権限が不足しています。HTTPリクエストはボットが代行実行します。`;
      
      case 'timeout':
        return `タイムアウト: 処理が時間を超過しました。もう一度試してください。`;
      
      case 'network':
        return `ネットワークエラー: Claudeサーバーへの接続が失敗しました。`;
      
      case 'mcp':
        return `MCPサービスエラー: 外部サービスに問題があります。しばらく待ってから再試行してください。`;
      
      default:
        if (attemptIndex > 0) {
          return `処理中にエラーが発生しました (${attemptIndex + 1}/${totalAttempts}回目)。別の方法で試しています...`;
        }
        return `処理中にエラーが発生しました: ${error.message}`;
    }
  }

  /**
   * Node.jsネHTTPリクエスト代行実行（curlの代替）
   * @param {string} url - リクエストURL
   * @param {Object} options - HTTPオプション
   * @returns {Promise<Object>} - HTTPレスポンス
   */
  async executeHttpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const requestOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: options.method || 'GET',
          headers: {
            'User-Agent': 'Kamui-Bot/1.0',
            ...options.headers
          },
          timeout: options.timeout || (parseInt(process.env.DEFAULT_TOOL_TIMEOUT) || 30000)
        };
        
        console.log(`[HTTP] Executing ${requestOptions.method} ${url}`);
        
        const req = client.request(requestOptions, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            const response = {
              statusCode: res.statusCode,
              statusMessage: res.statusMessage,
              headers: res.headers,
              body: data,
              url: url
            };
            
            console.log(`[HTTP] Response: ${res.statusCode} ${res.statusMessage}`);
            resolve(response);
          });
        });
        
        req.on('error', (error) => {
          console.error(`[HTTP] Request error: ${error.message}`);
          reject(new Error(`HTTP request failed: ${error.message}`));
        });
        
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('HTTP request timeout'));
        });
        
        // POSTデータがある場合は送信
        if (options.body) {
          req.write(options.body);
        }
        
        req.end();
      } catch (error) {
        reject(new Error(`Invalid URL or request: ${error.message}`));
      }
    });
  }

  /**
   * ClaudeのHTTPリクエストを検出して代行実行
   * @param {string} input - ユーザー入力
   * @returns {string} - 処理された入力
   */
  async preprocessHttpRequests(input) {
    // HTTPリクエストパターンを検出
    const httpPatterns = [
      // curlコマンドパターン
      /curl\s+(?:-[a-zA-Z]*\s+)*["']?(https?:\/\/[^\s"']+)["']?/gi,
      // URLのみのパターン
      /\b(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi
    ];
    
    let processedInput = input;
    const httpRequests = [];
    
    for (const pattern of httpPatterns) {
      let match;
      while ((match = pattern.exec(input)) !== null) {
        const url = match[1] || match[0].replace(/^curl\s+(?:-[a-zA-Z]*\s+)*["']?/, '').replace(/["']?$/, '');
        
        if (url.startsWith('http') && !httpRequests.some(req => req.url === url)) {
          httpRequests.push({ url, originalMatch: match[0] });
        }
      }
    }
    
    // 検出されたHTTPリクエストを実行
    for (const httpReq of httpRequests) {
      try {
        console.log(`[HTTP_PROXY] Detected HTTP request: ${httpReq.url}`);
        const response = await this.executeHttpRequest(httpReq.url);
        
        // レスポンスをテキストに変換 (null bytes 除去)
        const sanitizedBody = response.body.replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        const responseText = `

[HTTP Response from ${httpReq.url}]
Status: ${response.statusCode} ${response.statusMessage}
Content-Type: ${response.headers['content-type'] || 'unknown'}
Content-Length: ${sanitizedBody.length} bytes

Response Body:
${sanitizedBody.length > (parseInt(process.env.MAX_BODY_LOG_LENGTH) || 2000) ? sanitizedBody.substring(0, parseInt(process.env.MAX_BODY_LOG_LENGTH) || 2000) + '\n... (truncated)' : sanitizedBody}
[End of HTTP Response]

`;
        
        // 元のリクエストをレスポンスで置き換え
        processedInput = processedInput.replace(httpReq.originalMatch, responseText);
        
      } catch (error) {
        console.error(`[HTTP_PROXY] Failed to fetch ${httpReq.url}: ${error.message}`);
        
        // エラー情報を追加
        const errorText = `\n\n[HTTP Request Error for ${httpReq.url}]\nError: ${error.message}\n[End of Error]\n\n`;
        processedInput = processedInput.replace(httpReq.originalMatch, errorText);
      }
    }
    
    if (httpRequests.length > 0) {
      console.log(`[HTTP_PROXY] Processed ${httpRequests.length} HTTP requests`);
      // ClaudeにHTTP代行を通知
      processedInput = `[Note: HTTP requests have been executed by the bot and their responses are included below]

${processedInput}`;
    }
    
    // null bytes and control characters を除去
    processedInput = processedInput.replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    return processedInput;
  }


  /**
   * ストリーミング対応のClaude処理
   * @param {string} input - ユーザーからの入力
   * @param {boolean} continueConversation - 会話を継続するかどうか
   * @param {Function} onStream - ストリーミングコールバック関数
   * @returns {Promise<string>} - Claudeからの応答
   */
  async processInputStreaming(input, continueConversation = true, onStream = null) {
    // リセット後の初回は新規会話として開始
    if (this.shouldStartFresh) {
      continueConversation = false;
      this.shouldStartFresh = false;
      console.log('[DEBUG] Starting fresh conversation after reset');
    }
    
    // 統一実行メソッドをストリーミング付きで使用
    return this.executeClaudeUnified(input, continueConversation, onStream);
  }

  /**
   * ストリーミングチャンクを処理
   * @param {Object} json - JSONチャンク
   * @param {Function} onStream - ストリーミングコールバック
   */
  handleStreamChunk(json, onStream) {
    try {
      if (json.type === 'assistant' && json.message && json.message.content) {
        // assistantメッセージからテキストを抽出
        const content = json.message.content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'text' && item.text) {
              onStream(item.text, 'text');
            } else if (item.type === 'tool_use') {
              onStream(`🔧 Using tool: ${item.name}`, 'tool_use');
            }
          }
        }
      } else if (json.type === 'user' && json.message && json.message.content) {
        // ツール結果を処理
        const content = json.message.content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (item.type === 'tool_result' && item.content) {
              const toolContent = Array.isArray(item.content) ? item.content : [item.content];
              for (const toolItem of toolContent) {
                if (toolItem.type === 'text' && toolItem.text) {
                  onStream(toolItem.text, 'tool_result');
                }
              }
            }
          }
        }
      } else if (json.type === 'result' && json.result) {
        onStream(json.result, 'final_result');
      }
    } catch (error) {
      console.error('Error handling stream chunk:', error);
    }
  }

  /**
   * base64画像データをファイルに保存
   * @param {string} base64Data - base64エンコードされた画像データ
   * @param {string} format - 画像フォーマット (png, jpg等)
   * @returns {string} - 保存されたファイルパス
   */
  saveBase64Image(base64Data, format = 'png') {
    const fs = require('fs');
    const path = require('path');
    
    try {
      // データURLプレフィックスを除去
      const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
      
      // タイムスタンプを使用した一意のファイル名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `generated_image_${timestamp}.${format}`;
      const filepath = path.join(process.cwd(), filename);
      
      // base64データをバイナリに変換して保存
      const buffer = Buffer.from(cleanBase64, 'base64');
      fs.writeFileSync(filepath, buffer);
      
      console.log(`[DEBUG] Saved base64 image to: ${filename}`);
      return filename;
    } catch (error) {
      console.error('Error saving base64 image:', error);
      return null;
    }
  }

  /**
   * ストリーミングレスポンスから最終結果を抽出
   * @param {string} output - 生のレスポンス
   * @returns {string} - 抽出されたメッセージ
   */
  extractStreamResponse(output) {
    console.log(`[DEBUG] extractStreamResponse called with ${output.length} chars`);
    try {
      const lines = output.trim().split('\n');
      console.log(`[DEBUG] Split into ${lines.length} lines`);
      let finalResult = null;
      let lastAssistantText = null;
      let imageUrls = [];
      let videoUrls = [];
      let audioUrls = [];
      let fileDownloadInfo = null;
      let savedFiles = [];
      let processedLines = 0;

      for (const line of lines) {
        processedLines++;
        
        // バイナリデータや非JSONデータをスキップ
        if (!line.trim() || line.includes('\x00') || line.length > (parseInt(process.env.MAX_LINE_LENGTH) || 50000)) {
          continue;
        }
        
        // JSONとして解析可能かチェック
        if (!line.trim().startsWith('{') || !line.trim().endsWith('}')) {
          if (processedLines <= 5) {
            console.log(`[DEBUG] Skipping non-JSON line ${processedLines}: ${line.substring(0, 100)}...`);
          }
          continue;
        }
        
        try {
          const json = JSON.parse(line);
          if (processedLines <= 5) {
            console.log(`[DEBUG] Parsed JSON line ${processedLines}: type=${json.type}`);
          }
          
          if (json.type === 'result' && json.result) {
            finalResult = json.result;
          } else if (json.type === 'assistant' && json.message && json.message.content) {
            const content = json.message.content;
            if (Array.isArray(content)) {
              const textContent = content.find(c => c.type === 'text');
              if (textContent && textContent.text) {
                lastAssistantText = textContent.text;
              }
            }
          } else if (json.type === 'user' && json.message && json.message.content) {
            // ツール結果からメディアURLを抽出
            const content = json.message.content;
            if (Array.isArray(content)) {
              for (const item of content) {
                if (item.type === 'tool_result' && item.content) {
                  const toolContent = Array.isArray(item.content) ? item.content : [item.content];
                  for (const toolItem of toolContent) {
                    if (toolItem.type === 'text' && toolItem.text) {
                      const text = toolItem.text;
                      console.log(`[DEBUG] Tool result text: ${text.substring(0, 200)}...`);
                      
                      // base64画像データを検出・保存
                      const base64ImageRegex = /data:image\/([a-z]+);base64,([A-Za-z0-9+/=]+)/gi;
                      let base64Match;
                      while ((base64Match = base64ImageRegex.exec(text)) !== null) {
                        const format = base64Match[1];
                        const base64Data = base64Match[0];
                        const savedFile = this.saveBase64Image(base64Data, format);
                        if (savedFile) {
                          savedFiles.push(savedFile);
                          console.log(`[DEBUG] Detected and saved base64 image: ${savedFile}`);
                        }
                      }
                      
                      // 長いbase64データを検出（data:プレフィックスなし）
                      const longBase64Regex = /[A-Za-z0-9+/]{500,}={0,2}/g;
                      const longBase64Matches = text.match(longBase64Regex);
                      if (longBase64Matches) {
                        for (const base64Data of longBase64Matches) {
                          // 画像データかチェック（先頭がjpeg/pngのマジックナンバーか）
                          try {
                            const buffer = Buffer.from(base64Data, 'base64');
                            const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
                            const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
                            
                            if (isPNG || isJPEG) {
                              const format = isPNG ? 'png' : 'jpg';
                              const savedFile = this.saveBase64Image(base64Data, format);
                              if (savedFile) {
                                savedFiles.push(savedFile);
                                console.log(`[DEBUG] Detected and saved raw base64 image: ${savedFile}`);
                              }
                            }
                          } catch (error) {
                            // base64デコードエラーは無視
                          }
                        }
                      }
                      
                      
                      // ローカルファイル名情報を抽出
                      const filenameMatch = text.match(/([a-zA-Z0-9_-]+\.(png|jpg|jpeg|wav|mp4|mp3|obj|mov|avi|mkv|webm))/);
                      if (filenameMatch) {
                        fileDownloadInfo = filenameMatch[1];
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (parseError) {
          continue;
        }
      }

      let response = finalResult || lastAssistantText || 'Claude returned an empty response.';
      console.log(`[DEBUG] Final result: ${finalResult ? 'found' : 'null'}`);
      console.log(`[DEBUG] Last assistant text: ${lastAssistantText ? 'found' : 'null'}`);
      console.log(`[DEBUG] Processed ${processedLines} total lines`);
      
      // 保存されたファイルをレスポンスに追加
      if (savedFiles.length > 0) {
        response += '\n\n📎 Generated files: \n';
        
        // 保存されたbase64ファイルを追加
        savedFiles.forEach(filename => {
          response += `${filename}\n`;
        });
        
        if (fileDownloadInfo) {
          response += `\n💾 Local file: ${fileDownloadInfo}`;
        }
        
        console.log(`[DEBUG] Added ${savedFiles.length} saved files to response`);
      }
      
      console.log(`[DEBUG] Final response: ${response.substring(0, 200)}...`);
      return response;
    } catch (error) {
      console.error('Error extracting stream response:', error);
      return 'Error processing Claude response.';
    }
  }

  /**
   * Claude Code SDKのレスポンスから実際のメッセージを抽出
   * @param {string} output - 生のレスポンス
   * @returns {string} - 抽出されたメッセージ
   */
  extractResponse(output) {
    try {
      // text フォーマットの場合はそのまま返す
      if (this.outputFormat === 'text') {
        return output.trim() || 'Claude returned an empty response.';
      }

      // JSON フォーマットの場合の処理
      const lines = output.trim().split('\n');
      let lastResult = null;

      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.type === 'result' && json.result) {
            lastResult = json.result;
          } else if (json.type === 'assistant' && json.message && json.message.content) {
            // assistantメッセージからテキストを抽出
            const content = json.message.content;
            if (Array.isArray(content)) {
              const textContent = content.find(c => c.type === 'text');
              if (textContent) {
                lastResult = textContent.text;
              }
            }
          }
        } catch (parseError) {
          // JSONパースエラーは無視して次の行へ
          continue;
        }
      }

      return lastResult || 'Claude returned an empty response.';
    } catch (error) {
      console.error('Error extracting response:', error);
      return 'Error processing Claude response.';
    }
  }

  /**
   * 会話履歴をリセット（新しい会話を開始）
   * @returns {Promise<string>} - リセット結果
   */
  async resetConversation() {
    try {
      // Claude CLIにはリセット機能がないため、
      // 新しい会話フラグを設定して次回の会話を新規開始とする
      this.shouldStartFresh = true;
      console.log('Conversation reset requested - next interaction will start fresh');
      return '会話履歴がリセットされました';
    } catch (error) {
      console.error('Reset error:', error);
      return '会話履歴がリセットされました';
    }
  }

  /**
   * Claude Code SDKの健康状態をチェック
   * @returns {Promise<boolean>} - 利用可能かどうか
   */
  async checkHealth() {
    try {
      console.log('[HEALTH] Starting Claude health check...');
      
      // 簡単なヘルスチェックを実行
      const testInput = 'Hello, respond with just "OK"';
      const response = await this.executeClaudeUnified(testInput, false);
      
      if (response && response.trim()) {
        console.log('[HEALTH] Claude is responsive');
        return true;
      } else {
        console.log('[HEALTH] Claude returned empty response');
        return false;
      }
    } catch (error) {
      console.error('[HEALTH] Claude health check failed:', error.message);
      // ヘルスチェック失敗でも続行を許可（非ブロッキング）
      return false;
    }
  }
}

module.exports = ClaudeProcessor;
