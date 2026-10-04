/**
 * Всплывающие уведомления (тосты) с автозакрытием и прогресс-полосой.
 */
import { $, el, escapeHtml } from '../core/utils.js';

const ICONS = { info: '💡', ok: '✅', error: '⚠️', warn: '⏳' };
const MAX_TOASTS = 4;

function closeToast(node) {
  if (!node || node.dataset.closing === '1') return;
  node.dataset.closing = '1';
  node.classList.add('is-closing');
  setTimeout(() => node.remove(), 300);
}

/**
 * @param {{title:string,text?:string,type?:'info'|'ok'|'error'|'warn',duration?:number,actionLabel?:string,onAction?:Function}} options
 * @returns {() => void} функция принудительного закрытия
 */
export function toast({ title, text = '', type = 'info', duration = 3800, actionLabel, onAction } = {}) {
  const root = $('#toasts');
  if (!root) return () => {};

  const node = el('div', { class: `toast toast--${type}`, role: 'status' });
  node.innerHTML = `
    <span class="toast__ico" aria-hidden="true">${ICONS[type] || ICONS.info}</span>
    <div class="toast__body">
      <div class="toast__title">${escapeHtml(title)}</div>
      ${text ? `<div class="toast__text">${escapeHtml(text)}</div>` : ''}
    </div>
  `;

  if (actionLabel && typeof onAction === 'function') {
    const action = el('button', { class: 'toast__action', type: 'button' }, actionLabel);
    action.addEventListener('click', () => {
      onAction();
      closeToast(node);
    });
    node.append(action);
  }

  const close = el('button', { class: 'toast__close', type: 'button', 'aria-label': 'Закрыть' }, '✕');
  close.addEventListener('click', () => closeToast(node));
  node.append(close);

  if (duration > 0) {
    const bar = el('span', { class: 'toast__bar' });
    bar.style.animationDuration = `${duration}ms`;
    node.append(bar);
    setTimeout(() => closeToast(node), duration);
  }

  root.append(node);

  const toasts = Array.from(root.children);
  if (toasts.length > MAX_TOASTS) closeToast(toasts[0]);

  return () => closeToast(node);
}

export const toastOk = (title, text, extra = {}) => toast({ title, text, type: 'ok', ...extra });
export const toastError = (title, text, extra = {}) => toast({ title, text, type: 'error', duration: 5200, ...extra });
export const toastInfo = (title, text, extra = {}) => toast({ title, text, type: 'info', ...extra });
export const toastWarn = (title, text, extra = {}) => toast({ title, text, type: 'warn', ...extra });
