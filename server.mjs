/**
 * Минимальный статический сервер без внешних зависимостей.
 * Нужен потому, что ES-модули (import) не работают по протоколу file://.
 *
 * Запуск:  npm start          → http://localhost:4173
 *          node server.mjs 5000
 */
import http from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8'
};

function safeJoin(base, target) {
  const targetPath = path.join(base, target);
  return targetPath.startsWith(base) ? targetPath : null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    let filePath = safeJoin(ROOT, pathname);

    // SPA-fallback: неизвестный путь без расширения → index.html
    if (filePath && !path.extname(filePath)) {
      filePath = path.join(ROOT, 'index.html');
    }

    if (!filePath) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let stat = null;
    try {
      stat = await fs.stat(filePath);
    } catch {
      stat = null;
    }

    if (!stat || !stat.isFile()) {
      filePath = path.join(ROOT, 'index.html');
      stat = await fs.stat(filePath);
    }

    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });
    createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Server error: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n  TaskFlow запущен → http://localhost:${PORT}\n`);
});
