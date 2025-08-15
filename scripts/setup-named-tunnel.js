#!/usr/bin/env node

require('dotenv').config();
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 推奨トンネル名（環境変数から取得、またはデフォルト値）
const TUNNEL_NAMES = process.env.TUNNEL_NAMES 
    ? process.env.TUNNEL_NAMES.split(',').map(name => name.trim())
    : [
        'your-bot-name',
        'example-bot', 
        'my-linebot',
        'test-bot'
    ];

function log(message) {
    console.log(`[Named Tunnel Setup] ${message}`);
}

function error(message) {
    console.error(`[ERROR] ${message}`);
}

function execCommand(command, description) {
    try {
        log(`${description}...`);
        const result = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
        log(`✓ ${description} 完了`);
        return result;
    } catch (err) {
        error(`${description} 失敗: ${err.message}`);
        throw err;
    }
}

function checkCloudflaredInstalled() {
    try {
        execSync('cloudflared --version', { stdio: 'pipe' });
        log('✓ cloudflaredは既にインストールされています');
        return true;
    } catch {
        return false;
    }
}

async function installCloudflared() {
    if (checkCloudflaredInstalled()) {
        return;
    }

    log('cloudflaredをインストール中...');
    try {
        // cloudflaredをダウンロード
        const arch = process.env.CLOUDFLARED_ARCH || 'linux-amd64';
        const tempDir = process.env.TEMP_DIR || '/tmp';
        const debFile = `${tempDir}/cf.deb`;
        
        execCommand(
            `curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${arch}.deb -o ${debFile}`,
            'cloudflaredのダウンロード'
        );
        
        // パッケージをインストール
        execCommand(`sudo dpkg -i ${debFile}`, 'cloudflaredパッケージのインストール');
        
        // クリーンアップ
        execCommand(`rm -f ${debFile}`, 'ダウンロードファイルの削除');
        
    } catch (err) {
        error('cloudflaredのインストールに失敗しました。手動でインストールしてください。');
        throw err;
    }
}

async function loginToCloudflare() {
    log('Cloudflareにログインする必要があります...');
    log('ブラウザで認証画面が開きます。');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve, reject) => {
        rl.question('Enterキーを押して続行するか、Ctrl+Cでキャンセル: ', () => {
            rl.close();
            
            try {
                execCommand('cloudflared tunnel login', 'Cloudflareへのログイン');
                resolve();
            } catch (err) {
                error('ログインに失敗しました。手動で再試行してください: cloudflared tunnel login');
                reject(err);
            }
        });
    });
}

async function selectTunnelName() {
    console.log('\n推奨トンネル名:');
    TUNNEL_NAMES.forEach((name, index) => {
        console.log(`  ${index + 1}. ${name}`);
    });
    console.log(`  ${TUNNEL_NAMES.length + 1}. カスタム名を入力`);
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(`\nトンネル名を選択 (1-${TUNNEL_NAMES.length + 1}): `, (answer) => {
            rl.close();
            
            const choice = parseInt(answer);
            if (choice >= 1 && choice <= TUNNEL_NAMES.length) {
                resolve(TUNNEL_NAMES[choice - 1]);
            } else if (choice === TUNNEL_NAMES.length + 1) {
                const customRl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                customRl.question('カスタムトンネル名を入力: ', (customName) => {
                    customRl.close();
                    resolve(customName.trim());
                });
            } else {
                const defaultName = TUNNEL_NAMES[0] || 'your-bot-name';
                log(`無効な選択です。デフォルトを使用: ${defaultName}`);
                resolve(defaultName);
            }
        });
    });
}

function createTunnel(tunnelName) {
    try {
        execCommand(`cloudflared tunnel create ${tunnelName}`, `トンネル作成: ${tunnelName}`);
        return tunnelName;
    } catch (err) {
        if (err.message.includes('already exists')) {
            log(`✓ トンネル ${tunnelName} は既に存在します`);
            return tunnelName;
        }
        throw err;
    }
}

async function setupDNSRouting(tunnelName) {
    log('\nDNSルーティング設定:');
    log('Cloudflareで管理しているドメインを指定してください。');
    log('例: bot.yourdomain.com, linebot.example.com');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('\nドメインを入力 (例: bot.yourdomain.com): ', (domain) => {
            rl.close();
            
            if (!domain.trim()) {
                log('ドメインが入力されませんでした。後で手動で設定できます:');
                log(`cloudflared tunnel route dns ${tunnelName} YOUR_DOMAIN.com`);
                resolve(null);
                return;
            }

            try {
                execCommand(
                    `cloudflared tunnel route dns ${tunnelName} ${domain.trim()}`,
                    `DNS ルーティング設定: ${domain.trim()}`
                );
                resolve(domain.trim());
            } catch (err) {
                error(`DNS ルーティング設定失敗: ${err.message}`);
                log('後で手動で設定してください。');
                resolve(null);
            }
        });
    });
}

function createRunScript(tunnelName, domain) {
    const scriptLines = [
        '#!/usr/bin/env node',
        '',
        'require(\'dotenv\').config();',
        'const { spawn } = require(\'child_process\');',
        '',
        `const TUNNEL_NAME = process.env.TUNNEL_NAME || '${tunnelName}';`,
        'const PORT = process.env.LINE_WEBHOOK_PORT || 3000;'
    ];

    if (domain) {
        scriptLines.push(`const DOMAIN = process.env.TUNNEL_DOMAIN || '${domain}';`);
    }

    scriptLines.push(
        '',
        'console.log(`[Named Tunnel] Starting tunnel: ${TUNNEL_NAME}`);'
    );

    if (domain) {
        scriptLines.push('console.log(`[Named Tunnel] Domain: ${DOMAIN}`);');
    }

    scriptLines.push(
        'console.log(`[Named Tunnel] Local port: ${PORT}`);',
        '',
        'const tunnel = spawn(\'cloudflared\', [',
        '    \'tunnel\', \'run\',',
        '    \'--url\', `http://localhost:${PORT}`,',
        '    TUNNEL_NAME',
        '], {',
        '    stdio: \'inherit\'',
        '});',
        '',
        'tunnel.on(\'close\', (code) => {',
        '    console.log(`[Named Tunnel] Process exited with code ${code}`);',
        '});',
        '',
        'tunnel.on(\'error\', (err) => {',
        '    console.error(`[Named Tunnel] Error: ${err.message}`);',
        '});',
        '',
        '// Graceful shutdown handling',
        'process.on(\'SIGINT\', () => {',
        '    console.log(\'\\n[Named Tunnel] Shutting down...\');',
        '    tunnel.kill(\'SIGINT\');',
        '});',
        '',
        'process.on(\'SIGTERM\', () => {',
        '    console.log(\'\\n[Named Tunnel] Shutting down...\');',
        '    tunnel.kill(\'SIGTERM\');',
        '});'
    );

    const scriptContent = scriptLines.join('\n');
    const scriptPath = path.join(__dirname, 'run-named-tunnel.js');
    fs.writeFileSync(scriptPath, scriptContent);
    fs.chmodSync(scriptPath, '755');
    
    log(`✓ 実行スクリプト作成: ${scriptPath}`);
    return scriptPath;
}

function updatePackageJson(tunnelName, domain) {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // 新しいスクリプトを追加
        packageJson.scripts = packageJson.scripts || {};
        packageJson.scripts['tunnel:named'] = 'node scripts/run-named-tunnel.js';
        packageJson.scripts['dev:named'] = 'concurrently "npm start" "npm run tunnel:named"';
        
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        log('✓ package.jsonにnamedトンネルスクリプトを追加');
    } catch (err) {
        error(`package.json更新失敗: ${err.message}`);
    }
}

async function main() {
    try {
        log('Cloudflare Named Tunnelのセットアップを開始...');
        
        // Step 1: cloudflaredをインストール
        await installCloudflared();
        
        // Step 2: ログイン（必要な場合）
        try {
            execSync('cloudflared tunnel list', { stdio: 'pipe' });
            log('✓ 既にCloudflareにログイン済み');
        } catch {
            await loginToCloudflare();
        }
        
        // Step 3: トンネル名選択
        const tunnelName = await selectTunnelName();
        log(`選択されたトンネル名: ${tunnelName}`);
        
        // Step 4: トンネル作成
        createTunnel(tunnelName);
        
        // Step 5: DNSルーティング設定
        const domain = await setupDNSRouting(tunnelName);
        
        // Step 6: 実行スクリプト作成
        createRunScript(tunnelName, domain);
        
        // Step 7: package.json更新
        updatePackageJson(tunnelName, domain);
        
        log('\n🎉 Named Tunnelセットアップ完了！');
        log('\n次のステップ:');
        log('1. トンネル実行: npm run tunnel:named');
        log('2. ボット+トンネル同時実行: npm run dev:named');
        
        if (domain) {
            log(`3. LINE Webhook URLを設定: https://${domain}/webhook`);
        } else {
            log('3. DNSルーティング設定: cloudflared tunnel route dns <tunnel-name> <your-domain>');
            log('4. LINE Webhook URLを設定: https://<your-domain>/webhook');
        }
        
    } catch (err) {
        error(`セットアップ失敗: ${err.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}