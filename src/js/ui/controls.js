/**
 * Кастомные элементы управления (дизайн-система TaskFlow):
 *   • cselect — стилизованный выпадающий список вместо нативного <select>;
 *   • cdate   — красивый календарь вместо браузерного input[type="date"].
 *
 * Нативные элементы остаются в DOM как источник значения, поэтому вся логика
 * приложения (чтение/запись .value и событие change) работает без изменений.
 * Значения, заданные программно (.value = ...), автоматически отражаются в UI.
 */
import { el, escapeHtml, parseDateKey, toDateKey } from '../core/utils.js';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const EMOJI_RE = /^\s*(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\u20E3)*)\s+/u;

/** Делит строку вида «🔥 Срочный» на иконку и текст. */
function splitEmoji(text) {
  const value = String(text ?? '');
  const match = value.match(EMOJI_RE);
  if (match) return { icon: match[1], label: value.slice(match[0].length) };
  return { icon: '', label: value };
}

/** Превращает <label class="select"> в нейтральный контейнер, чтобы клики
 *  по кастомному триггеру не дублировались поведением label. */
function unwrapLabel(node) {
  if (!node || node.tagName !== 'LABEL') return node;
  const box = document.createElement('div');
  box.className = node.className;
  while (node.firstChild) box.append(node.firstChild);
  node.replaceWith(box);
  return box;
}

/* ------------------- Позиционируемый поповер ------------------ */

let activePopover = null;

/**
 * Показывает панель над якорем через фиксированное позиционирование (портал в body),
 * поэтому меню не обрезается прокруткой модальных окон.
 * @returns {{close:Function}} управление открытой панелью
 */
export function attachPopover(anchor, panel, { onClose } = {}) {
  activePopover?.close('switch');

  // Панель переиспользуется между открытиями, поэтому снимаем класс закрытия,
  // иначе после повторного открытия сработала бы анимация исчезновения.
  panel.classList.remove('is-closing');
  panel.classList.add('popover');
  document.body.append(panel);

  function place() {
    const rect = anchor.getBoundingClientRect();
    const want = panel.dataset.width ? Number(panel.dataset.width) : rect.width;
    // На узких экранах фиксированная ширина панели не должна превышать вьюпорт.
    const width = Math.min(want, window.innerWidth - 24);
    panel.style.width = `${Math.max(160, width)}px`;
    const maxLeft = window.innerWidth - panel.offsetWidth - 12;
    panel.style.left = `${Math.max(12, Math.min(rect.left, maxLeft))}px`;
    const height = panel.offsetHeight;
    const below = rect.bottom + 8;
    const flip = below + height > window.innerHeight - 12 && rect.top - height - 8 > 8;
    panel.style.top = `${flip ? rect.top - height - 8 : below}px`;
    panel.classList.toggle('popover--up', flip);
  }

  place();
  requestAnimationFrame(place);

  const onDocDown = (event) => {
    if (!panel.contains(event.target) && !anchor.contains(event.target)) close('outside');
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close('escape');
    }
  };
  const onReposition = (event) => {
    if (event?.target instanceof Node && panel.contains(event.target)) return;
    close('reposition');
  };

  let done = false;
  function close(reason = 'dismiss') {
    if (done) return;
    done = true;
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onReposition);
    window.removeEventListener('scroll', onReposition, true);
    if (activePopover?.close === close) activePopover = null;
    panel.classList.add('is-closing');
    onClose?.(reason);
    setTimeout(() => panel.remove(), 170);
  }

  document.addEventListener('mousedown', onDocDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onReposition);
  window.addEventListener('scroll', onReposition, true);

  activePopover = { close };
  return activePopover;
}

/* --------------------- Кастомный select ----------------------- */

const CHEVRON = '<svg viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" fill="none"><path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function enhanceSelect(select) {
  if (select.dataset.cselect === 'on') return;
  select.dataset.cselect = 'on';

  const wrapper = unwrapLabel(select.closest('.select') || select.parentElement);
  wrapper?.classList.add('is-enhanced');
  select.classList.add('cselect-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const labelText = wrapper?.querySelector('.select__label')?.textContent?.trim() || '';

  const trigger = el('button', {
    type: 'button',
    class: 'cselect',
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
    'aria-label': labelText || 'Выбор'
  });
  trigger.innerHTML = `<span class="cselect__lead"><span class="cselect__ico" aria-hidden="true"></span><span class="cselect__text"></span></span><span class="cselect__caret" aria-hidden="true">${CHEVRON}</span>`;

  const panel = el('div', { class: 'cselect__menu', role: 'listbox' });
  if (labelText) panel.setAttribute('aria-label', labelText);
  if (select.id.includes('priority')) panel.classList.add('cselect__menu--priority');
  if (select.id.includes('sort')) panel.classList.add('cselect__menu--sort');

  select.after(trigger);

  const icoEl = trigger.querySelector('.cselect__ico');
  const textEl = trigger.querySelector('.cselect__text');
  let optionNodes = [];
  let pop = null;

  // Перехватываем запись value, чтобы программные изменения (resetFilters и т.п.) отражались в UI.
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return nativeValue.get.call(this); },
    set(value) { nativeValue.set.call(this, value); onExternalChange(); }
  });

  function currentOption() {
    return select.selectedIndex >= 0 ? select.options[select.selectedIndex] : select.options[0] || null;
  }

  function syncTrigger() {
    const option = currentOption();
    const { icon, label } = splitEmoji(option ? option.textContent : '');
    icoEl.textContent = icon || '•';
    trigger.classList.toggle('is-empty', !option || option.value === '');
    textEl.textContent = label || (option ? option.value : '—');
    trigger.dataset.value = select.value;
  }

  function syncActive() {
    optionNodes.forEach((node) => {
      const active = node.dataset.value === select.value;
      node.classList.toggle('is-active', active);
      node.setAttribute('aria-selected', String(active));
    });
    syncTrigger();
  }

  function buildOptions() {
    panel.textContent = '';
    optionNodes = Array.from(select.options).map((option) => {
      const { icon, label } = splitEmoji(option.textContent);
      const node = el('div', { class: 'cselect__opt', role: 'option', tabindex: '-1', 'data-value': option.value });
      node.innerHTML = `<span class="cselect__opt-ico" aria-hidden="true">${icon ? escapeHtml(icon) : '•'}</span><span class="cselect__opt-text">${escapeHtml(label)}</span><span class="cselect__opt-check" aria-hidden="true">${CHECK}</span>`;
      return node;
    });
    panel.append(...optionNodes);
    syncActive();
  }

  function onExternalChange() {
    if (optionNodes.length !== select.options.length) buildOptions();
    else syncActive();
  }

  function openMenu() {
    if (pop) return;
    buildOptions();
    trigger.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    pop = attachPopover(trigger, panel, {
      onClose: (reason) => {
        pop = null;
        trigger.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (reason === 'escape' || reason === 'switch') trigger.focus({ preventScroll: true });
      }
    });
    const active = panel.querySelector('.cselect__opt.is-active') || optionNodes[0];
    active?.focus?.({ preventScroll: true });
  }

  function choose(value) {
    const changed = select.value !== value;
    nativeValue.set.call(select, value);
    syncActive();
    pop?.close('select');
    trigger.focus({ preventScroll: true });
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (pop) pop.close('select');
    else openMenu();
  });

  trigger.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Spacebar'].includes(event.key)) {
      event.preventDefault();
      openMenu();
    }
  });

  panel.addEventListener('click', (event) => {
    const option = event.target.closest('.cselect__opt');
    if (option) choose(option.dataset.value);
  });

  panel.addEventListener('keydown', (event) => {
    const index = optionNodes.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') { event.preventDefault(); optionNodes[Math.min(index + 1, optionNodes.length - 1)]?.focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); optionNodes[Math.max(index - 1, 0)]?.focus(); }
    else if (event.key === 'Home') { event.preventDefault(); optionNodes[0]?.focus(); }
    else if (event.key === 'End') { event.preventDefault(); optionNodes[optionNodes.length - 1]?.focus(); }
    else if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      const option = document.activeElement?.closest?.('.cselect__opt');
      if (option) choose(option.dataset.value);
    } else if (event.key === 'Tab') {
      pop?.close('tab');
    }
  });

  // Пересобираем список при динамическом изменении <option> (например, категории).
  new MutationObserver(() => buildOptions()).observe(select, { childList: true, subtree: true });

  buildOptions();
}

/* --------------------- Кастомный календарь -------------------- */

function monthStart(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function enhanceDateInput(input) {
  if (input.dataset.cdate === 'on') return;
  input.dataset.cdate = 'on';

  const field = input.closest('.field') || input.parentElement;
  field?.classList.add('is-cdate');
  input.classList.add('cdate-native');
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');

  const trigger = el('button', {
    type: 'button',
    class: 'cdate',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
    'aria-label': 'Выбрать дедлайн'
  });
  trigger.innerHTML = `<span class="cdate__ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.9"/><path d="M3 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg></span><span class="cdate__text"></span><span class="cdate__caret" aria-hidden="true">${CHEVRON}</span>`;

  const panel = el('div', { class: 'cal', role: 'dialog', 'aria-label': 'Календарь' });
  panel.dataset.width = '300';

  input.after(trigger);

  const textEl = trigger.querySelector('.cdate__text');
  let pop = null;
  let cursor = monthStart(input.value ? parseDateKey(input.value) || new Date() : new Date());

  // Программные изменения (быстрые даты «Сегодня/Завтра/…») обновляют подпись триггера.
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(input, 'value', {
    configurable: true,
    get() { return nativeValue.get.call(this); },
    set(value) {
      nativeValue.set.call(this, value);
      syncLabel();
      cursor = monthStart(parseDateKey(value) || new Date());
    }
  });

  function syncLabel() {
    const date = parseDateKey(input.value);
    trigger.classList.toggle('is-empty', !date);
    textEl.textContent = date
      ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
      : 'Выбрать дату';
  }

  function renderCalendar() {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);
    const selectedKey = input.value;
    const todayKey = toDateKey(new Date());

    panel.innerHTML = `
      <div class="cal__head">
        <button type="button" class="cal__nav" data-step="-12" aria-label="Предыдущий год">«</button>
        <button type="button" class="cal__nav" data-step="-1" aria-label="Предыдущий месяц">‹</button>
        <span class="cal__title">${MONTHS[month]} ${year}</span>
        <button type="button" class="cal__nav" data-step="1" aria-label="Следующий месяц">›</button>
        <button type="button" class="cal__nav" data-step="12" aria-label="Следующий год">»</button>
      </div>
      <div class="cal__week">${WEEKDAYS.map((day) => `<span>${day}</span>`).join('')}</div>
      <div class="cal__grid"></div>
      <div class="cal__foot">
        <button type="button" class="chip cal__action" data-action="today">Сегодня</button>
        <button type="button" class="chip cal__action" data-action="clear">Очистить</button>
      </div>`;

    const grid = panel.querySelector('.cal__grid');
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const key = toDateKey(date);
      const weekday = (date.getDay() + 6) % 7;
      const classes = ['cal__day'];
      if (date.getMonth() !== month) classes.push('is-outside');
      if (weekday >= 5) classes.push('is-weekend');
      if (key === todayKey) classes.push('is-today');
      if (key === selectedKey) classes.push('is-selected');
      const cell = el('button', { type: 'button', class: classes.join(' '), 'data-key': key, tabindex: '-1' }, String(date.getDate()));
      grid.append(cell);
    }
  }

  function openCalendar() {
    if (pop) return;
    cursor = monthStart(parseDateKey(input.value) || new Date());
    renderCalendar();
    trigger.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    pop = attachPopover(trigger, panel, {
      onClose: (reason) => {
        pop = null;
        trigger.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (reason === 'escape') trigger.focus({ preventScroll: true });
      }
    });
  }

  function pick(key) {
    nativeValue.set.call(input, key);
    syncLabel();
    pop?.close('date');
    trigger.focus({ preventScroll: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (pop) pop.close('date');
    else openCalendar();
  });

  panel.addEventListener('click', (event) => {
    const nav = event.target.closest('.cal__nav');
    if (nav) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + Number(nav.dataset.step), 1);
      renderCalendar();
      return;
    }

    const action = event.target.closest('.cal__action');
    if (action) {
      pick(action.dataset.action === 'today' ? toDateKey(new Date()) : '');
      return;
    }

    const day = event.target.closest('.cal__day');
    if (day) pick(day.dataset.key);
  });

  syncLabel();
}

/* -------------------------- Запуск ---------------------------- */

let started = false;

/** Инициализирует кастомные контролы, в том числе созданные динамически (модальные окна). */
export function initControls() {
  if (started) return;
  started = true;

  document.querySelectorAll('select').forEach(enhanceSelect);
  document.querySelectorAll('input[type="date"]').forEach(enhanceDateInput);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('select')) enhanceSelect(node);
        if (node.matches('input[type="date"]')) enhanceDateInput(node);
        node.querySelectorAll('select').forEach(enhanceSelect);
        node.querySelectorAll('input[type="date"]').forEach(enhanceDateInput);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}




