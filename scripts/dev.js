// Servidor local que imita a Vercel: arquivos de public/ primeiro, o resto vai para api/index.js.
// Uso: DATABASE_URL=... npm run dev  (SENHA_PAINEL=... se quiser pedir senha)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/index.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.env.PORT || 3000);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

async function serveStatic(req, res, pathname) {
  let file;
  try {
    file = path.join(root, decodeURIComponent(pathname));
  } catch {
    return false;
  }
  if (!file.startsWith(root)) return false;
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  } catch {
    return false;
  }
}

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://local');
    if ((req.method === 'GET' || req.method === 'HEAD') && (await serveStatic(req, res, pathname))) return;
    return handler(req, res);
  })
  .listen(port, () => console.log(`Fidel URLs rodando em http://localhost:${port}`));
