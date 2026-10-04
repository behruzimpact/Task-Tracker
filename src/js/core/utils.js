/**
 * Утилиты общего назначения: DOM, даты, форматирование, анимации чисел.
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Уникальный идентификатор записи. */
export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Экранирование пользовательского текста перед вставкой в HTML. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function debounce(fn, ms = 220) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Создание элемента с атрибутами и детьми. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (value !== null && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child == null) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

/* --------------------------- Даты ---------------------------- */

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Локальная дата в формате YYYY-MM-DD (без сдвига часового пояса). */
export function toDateKey(date = new Date()) {
  const d = new Date(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseDateKey(key) {
  if (!key) return null;
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Разница в целых днях между двумя датами (b - a). */
export function diffDays(a, b) {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(b) - startOfDay(a)) / MS);
}

export function formatDateRu(key, withYear = false) {
  const date = typeof key === 'string' ? parseDateKey(key) : key;
  if (!date) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {})
  }).format(date);
}

export function formatDateTimeRu(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

/**
 * Человекочитаемая длительность: «1 ч 25 мин», «12 мин», «45 с».
 * @param {number} ms миллисекунды
 * @param {{short?:boolean}} options short — компактная форма («1ч 25м»)
 */
export function formatDuration(ms, { short = false } = {}) {
  const totalSeconds = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    if (short) return minutes ? `${hours}ч ${minutes}м` : `${hours}ч`;
    return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  }
  if (totalSeconds >= 60) return short ? `${minutes}м` : `${minutes} мин`;
  return short ? `${seconds}с` : `${seconds} с`;
}

/** Длительность в формате таймера: «25:00» или «1:02:33». */
export function formatClock(ms) {
  const totalSeconds = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

export function timeGreeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

/** Человекочитаемый дедлайн + тон подсветки. */
export function dueLabel(dueKey, now = new Date()) {
  if (!dueKey) return null;
  const due = parseDateKey(dueKey);
  if (!due) return null;
  const delta = diffDays(now, due);

  if (delta < -1) {
    const n = Math.abs(delta);
    return { text: `Просрочено на ${n} ${plural(n, 'день', 'дня', 'дней')}`, tone: 'danger', icon: '🔥' };
  }
  if (delta === -1) return { text: 'Просрочено: вчера', tone: 'danger', icon: '🔥' };
  if (delta === 0) return { text: 'Сегодня', tone: 'warn', icon: '📅' };
  if (delta === 1) return { text: 'Завтра', tone: 'warn', icon: '⏭️' };
  if (delta <= 7) return { text: `Через ${delta} ${plural(delta, 'день', 'дня', 'дней')}`, tone: 'info', icon: '⏳' };
  return { text: formatDateRu(dueKey), tone: 'info', icon: '📅' };
}

export function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

/* ------------------------ Прочее ----------------------------- */

/**
 * Плавный счётчик для чисел в интерфейсе.
 * Прежнее значение хранится в отдельном атрибуте `data-anim-value`, чтобы не
 * затырать `data-value`, который используется как ключ элемента.
 */
export function animateNumber(node, to, { duration = 750, format = (v) => Math.round(v) } = {}) {
  if (!node) return;

  // Пришли undefined/NaN — считаем нулём, а не показываем «NaN».
  const target = Number.isFinite(Number(to)) ? Number(to) : 0;

  const cached = Number(node.dataset.animValue);
  const from = Number.isFinite(cached) ? cached : Number(node.textContent) || 0;

  node.dataset.animValue = String(target);

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce || from === target) {
    node.textContent = format(target);
    return;
  }

  const start = performance.now();
  const tick = (now) => {
    const p = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = format(from + (target - from) * eased);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Эффект волны на кнопке. */
export function attachRipple(button) {
  button.addEventListener('pointerdown', (event) => {
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.15;
    const ripple = document.createElement('span');
    ripple.className = 'btn__ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    button.append(ripple);
    setTimeout(() => ripple.remove(), 620);
  });
}

