// HTTP-Server (statische Dateien) + WebSocket-Spielserver
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Lobby } from './rooms.js';
import { TICK_RATE } from '../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const MOUNTS = [
  ['/shared/', path.join(ROOT, 'shared')],
  ['/vendor/three/', path.join(ROOT, 'node_modules', 'three', 'build')],
  ['/', path.join(ROOT, 'public')],
];

function resolve(urlPath) {
  for (const [prefix, dir] of MOUNTS) {
    if (!urlPath.startsWith(prefix)) continue;
    let rel = decodeURIComponent(urlPath.slice(prefix.length)) || 'index.html';
    const file = path.normalize(path.join(dir, rel));
    if (!file.startsWith(dir + path.sep) && file !== dir) return null;
    return file;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url, 'http://x').pathname;
  if (urlPath === '/health') { res.writeHead(200); res.end('ok'); return; }
  const file = resolve(urlPath);
  if (!file) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Nicht gefunden'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
});

const lobby = new Lobby();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws) => lobby.connect(ws));

// Fester Simulationstakt
const DT = 1 / TICK_RATE;
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += (now - last) / 1000;
  last = now;
  if (acc > 0.25) acc = 0.25;
  while (acc >= DT) { lobby.step(DT); acc -= DT; }
}, 1000 / TICK_RATE / 2);

server.listen(PORT, () => {
  console.log(`\n🏀  Streetball 1v1 läuft!`);
  console.log(`   Lokal:     http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`   Im WLAN:   http://${n.address}:${PORT}`);
    }
  }
  console.log('');
});
