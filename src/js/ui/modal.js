/**
 * Модальные окна: базовый openModal + confirmDialog.
 * Анимации открытия/закрытия задаются классами из components.css.
 */
import { $, el, escapeHtml } from '../core/utils.js';

let openCount = 0;

function lockScroll(lock) {
  if (lock) {
    openCount += 1;
    document.body.style.overflow = 'hidden';
  } else {
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) document.body.style.overflow = '';
  }
}

/**
 * @param {{title?:string,icon?:string,body?:string|Node,footer?:Array|Node,wide?:boolean,onClose?:Function}} options
 * @returns {{close:Function, bodyEl:HTMLElement, modal:HTMLElement}}
 */
export function openModal({ title = '', icon = '', body = '', footer = [], wide = false, onClose = null } = {}) {
  const root = $('#modal-root');
  const backdrop = el('div', { class: 'modal-backdrop' });
  const modal = el('div', {
    class: `modal${wide ? ' modal--wide' : ''}`,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title || 'Диалог'
  });

  /* Шапка */
  const head = el('div', { class: 'modal__head' });
  if (icon) head.append(el('span', { class: 'modal__ico avatar', 'aria-hidden': 'true' }, icon));
  head.append(el('h3', { class: 'modal__title' }, title));
  const closeBtn = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Закрыть' }, '✕');
  head.append(closeBtn);

  /* Тело */
  const bodyEl = el('div', { class: 'modal__body' });
  if (body instanceof Node) bodyEl.append(body);
  else if (typeof body === 'string') bodyEl.innerHTML = body;

  modal.append(head, bodyEl);

  /* Подвал */
  if (footer instanceof Node) {
    modal.append(footer);
  } else if (Array.isArray(footer) && footer.length) {
    const footEl = el('div', { class: 'modal__foot' });
    footer.forEach((item) => {
      if (item instanceof Node) {
        footEl.append(item);
        return;
      }
      const button = el(
        'button',
        { class: `btn ${item.variant || 'btn--ghost'}`, type: item.submit ? 'submit' : 'button' },
        item.label
      );
      if (typeof item.onClick === 'function') button.addEventListener('click', () => item.onClick({ close }));
      footEl.append(button);
    });
    modal.append(footEl);
  }

  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown);
    backdrop.classList.add('is-closing');
    modal.classList.add('is-closing');
    lockScroll(false);
    setTimeout(() => {
      backdrop.remove();
      if (typeof onClose === 'function') onClose();
    }, 220);
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', onKeydown);

  backdrop.append(modal);
  root.append(backdrop);
  lockScroll(true);

  requestAnimationFrame(() => {
    const focusable = modal.querySelector('input, textarea, select, button:not(.icon-btn)');
    focusable?.focus();
  });

  return { close, bodyEl, modal, backdrop };
}

/** Диалог подтверждения. Возвращает Promise<boolean>. */
export function confirmDialog({
  title = 'Подтвердите действие',
  text = '',
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  icon = '❓',
  danger = true
} = {}) {
  return new Promise((resolve) => {
    let result = false;
    const { close } = openModal({
      title,
      icon,
      body: `<p class="muted">${escapeHtml(text)}</p>`,
      footer: [
        { label: cancelLabel, variant: 'btn--ghost', onClick: ({ close: c }) => c() },
        {
          label: confirmLabel,
          variant: danger ? 'btn--danger' : 'btn--primary',
          onClick: ({ close: c }) => {
            result = true;
            c();
          }
        }
      ],
      onClose: () => resolve(result)
    });
    // На случай программного закрытия по Escape — вернём false.
    void close;
  });
}
