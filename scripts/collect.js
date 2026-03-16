#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

async function main() {
  console.log('[Collect] Starting manual collection...');
  
  const http = require('http');
  
  const req = http.request({
    hostname: 'localhost',
    port: process.env.PORT || 3000,
    path: '/api/collect-all',
    method: 'POST',
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        console.log(`[Collect] Done: ${result.totalSuccess} items collected, ${result.errors?.length ?? 0} errors`);
        if (result.errors?.length) console.log('Errors:', result.errors);
      } catch {
        console.log('[Collect] Response:', data);
      }
    });
  });
  
  req.on('error', (err) => {
    const isConnRefused = err && typeof err === 'object' && 'code' in err && err.code === 'ECONNREFUSED';
    if (isConnRefused) {
      console.log('[Collect] ⚠️  Server not running. Start the app first with: npm run dev');
      console.log('[Collect] Then run: npm run collect');
    } else {
      console.error('[Collect] Error:', err.message);
    }
  });
  
  req.end();
}

main();
