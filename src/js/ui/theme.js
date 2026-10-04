/**
 * Тема оформления: тёмная/светлая, сохраняется в localStorage.
 */
import { KEYS, store } from '../core/storage.js';
import { $ } from '../core/utils.js';

const LABELS = { dark: 'Тёмная', light: 'Светлая' };
const ICONS = { dark: '🌙', light: '☀️' };

export function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set(KEYS.theme, next);

  const label = $('#theme-label');
  if (label) label.textContent = LABELS[next];

  const toggle = $('#theme-toggle');
  if (toggle) {
    toggle.textContent = ICONS[next];
    toggle.title = next === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему';
  }
  return next;
}

export function initTheme() {
  const saved = store.get(KEYS.theme, null);
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  return applyTheme(saved || (prefersLight ? 'light' : 'dark'));
}

export function toggleTheme() {
  return applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}
