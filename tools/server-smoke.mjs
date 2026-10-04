/**
 * Smoke-тест статического сервера: поднимает server.mjs на свободном порту,
 * запрашивает index.html, JS и CSS, затем останавливает сервер.
 * Запуск: npm run smoke
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4196;

const child = spawn(process.execPath, ['server.mjs', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

let log = '';
child.stdout.on('data', (chunk) => {
  log += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  log += chunk.toString();
});

const checks = [
  ['/', 'text/html'],
  ['/src/js/main.js', 'text/javascript'],
  ['/src/styles/components.css', 'text/css']
];

let failed = false;

try {
  await new Promise((resolve) => setTimeout(resolve, 900));

  for (const [url, expectedType] of checks) {
    const response = await fetch(`http://127.0.0.1:${PORT}${url}`);
    const body = await response.text();
    const type = response.headers.get('content-type') || '';
    const ok = response.status === 200 && body.length > 0 && type.includes(expectedType);
    if (!ok) failed = true;
    console.log(`${ok ? '✓' : '✗'} GET ${url} → ${response.status} ${type} (${body.length} байт)`);
  }
} catch (error) {
  failed = true;
  console.log(`✗ Ошибка запроса: ${error.message}`);
} finally {
  child.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 500);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

if (!failed) console.log('\nСервер отвечает корректно ✅');
else if (log) console.log(`\nЛог сервера:\n${log}`);

process.exitCode = failed ? 1 : 0;
