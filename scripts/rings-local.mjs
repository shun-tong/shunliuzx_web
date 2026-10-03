import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { LocalDatabase } from './rings-local-db.mjs';
import { onRequestGet, onRequestPost } from '../functions/api/rings.js';

globalThis.crypto ??= webcrypto;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const database = new LocalDatabase(path.join(os.tmpdir(), 'shunliuzx-rings-dev-rooms.json'));
const port = Number(process.env.RINGS_PORT || 8788);
const server = http.createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/api/rings') {
      let raw = ''; for await (const chunk of incoming) { raw += chunk; if (raw.length > 200000) { outgoing.writeHead(413); outgoing.end(); return; } }
      const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(incoming.method === 'POST' ? { body: raw } : {}) });
      const handler = incoming.method === 'GET' ? onRequestGet : incoming.method === 'POST' ? onRequestPost : null;
      if (!handler) { outgoing.writeHead(405); outgoing.end(); return; }
      const response = await handler({ request, env: { SITE_DB: database } });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(await response.text()); return;
    }
    if (url.pathname === '/') { outgoing.writeHead(302, { location: '/rings/' }); outgoing.end(); return; }
    const allowed = { '/rings/': 'index.html', '/rings/index.html': 'index.html', '/rings/game.js': 'game.js', '/rings/game.css': 'game.css', '/rings/favicon.svg': 'favicon.svg', '/rings/sample-pack.json': 'sample-pack.json' };
    const filename = allowed[url.pathname];
    if (!filename) { outgoing.writeHead(404); outgoing.end('Not found'); return; }
    const content = await fs.readFile(path.join(root, 'rings', filename));
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
    outgoing.writeHead(200, { 'content-type': types[path.extname(filename)], 'cache-control': 'no-store' }); outgoing.end(content);
  } catch (error) { console.error(error.message); outgoing.writeHead(500); outgoing.end('Local preview error'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/rings/`));
