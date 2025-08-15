#!/usr/bin/env node

require('dotenv').config();
const { spawn } = require('child_process');

const TUNNEL_NAME = process.env.TUNNEL_NAME || 'your-bot-name';
const PORT = process.env.LINE_WEBHOOK_PORT || 3000;
const DOMAIN = process.env.TUNNEL_DOMAIN || 'your-domain.com';

console.log(`[Named Tunnel] Starting tunnel: ${TUNNEL_NAME}`);
console.log(`[Named Tunnel] Domain: ${DOMAIN}`);
console.log(`[Named Tunnel] Local port: ${PORT}`);

const tunnel = spawn('cloudflared', [
    'tunnel', 'run',
    '--url', `http://localhost:${PORT}`,
    TUNNEL_NAME
], {
    stdio: 'inherit'
});

tunnel.on('close', (code) => {
    console.log(`[Named Tunnel] Process exited with code ${code}`);
});

tunnel.on('error', (err) => {
    console.error(`[Named Tunnel] Error: ${err.message}`);
});

// Graceful shutdown handling
process.on('SIGINT', () => {
    console.log('\n[Named Tunnel] Shutting down...');
    tunnel.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('\n[Named Tunnel] Shutting down...');
    tunnel.kill('SIGTERM');
});