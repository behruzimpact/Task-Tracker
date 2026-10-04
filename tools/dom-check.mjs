/**
 * Служебная проверка: все селекторы вида $('#id') и getElementById('id'),
 * которые используются в JS, должны существовать в index.html.
 * Запуск: node tools/dom-check.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');

async function collect(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collect(full)));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = await collect(path.join(ROOT, 'src', 'js'));
const ids = new Set();
const selectors = new Set();
const jsIds = new Set();

for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/getElementById\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) ids.add(match[1]);
  for (const match of source.matchAll(/\$\(\s*['"`]#([A-Za-z0-9_-]+)['"`]/g)) ids.add(match[1]);
  for (const match of source.matchAll(/\$\$\(\s*['"`]([^'"`]+)['"`]/g)) selectors.add(match[1]);
  for (const match of source.matchAll(/\$\(\s*['"`]([.][A-Za-z0-9_-]+)['"`]\s*,\s*[A-Za-z0-9_$]+/g)) selectors.add(match[1]);
  // id, которые модуль создаёт динамически (в шаблонах модальных окон)
  for (const match of source.matchAll(/id="([A-Za-z0-9_-]+)"/g)) jsIds.add(match[1]);
}

const missingIds = [...ids].filter((id) => !html.includes(`id="${id}"`) && !jsIds.has(id));

/* ------------------ Проверка импортов и путей ------------------ */

const problems = [];

// 1. Существуют ли файлы, подключённые из index.html
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) {
  const target = path.join(ROOT, match[1].replace(/^\.\//, ''));
  try {
    await readFile(target);
  } catch {
    problems.push(`Нет файла, подключённого в index.html: ${match[1]}`);
  }
}

// 2. Совпадают ли импортируемые имена с экспортами модулей
const exportsCache = new Map();

async function moduleExports(file) {
  if (exportsCache.has(file)) return exportsCache.get(file);
  const source = await readFile(file, 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    match[1].split(',').forEach((part) => {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name.trim());
    });
  }
  exportsCache.set(file, names);
  return names;
}

for (const file of files) {
  const source = await readFile(file, 'utf8');

  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const [, specifiers, request] = match;
    if (!request.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), request);
    const available = await moduleExports(target).catch(() => new Set());
    specifiers.split(',').forEach((part) => {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (name && !available.has(name)) {
        problems.push(`${path.relative(ROOT, file)}: импорт «${name}» отсутствует в экспортах ${request}`);
      }
    });
  }

  // 3. Ссылки на id, которых нет ни в HTML, ни в JS-шаблонах
}

for (const id of missingIds) problems.push(`Селектор #${id} не найден ни в index.html, ни в JS-шаблонах`);

console.log(`Проверено JS-файлов: ${files.length}`);
console.log(`Уникальных id-селекторов: ${ids.size}`);
console.log(`Селекторов с классами (проверяются вручную): ${selectors.size}`);
console.log(problems.length ? `\nПРОБЛЕМЫ:\n- ${problems.join('\n- ')}` : '\nВсе селекторы, импорты и пути корректны ✅');

process.exitCode = problems.length ? 1 : 0;
