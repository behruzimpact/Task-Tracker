/**
 * Карточка задачи: используется и в списке, и на канбан-доске.
 */
import { priorityMeta, statusMeta, taskProgress } from '../core/tasks.js';
import { dueLabel, escapeHtml, formatDuration } from '../core/utils.js';

const CHECK_SVG = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <path d="M3 8.6 6.2 12 13 4.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function buildMeta(task, categories, mini) {
  const items = [];
  const due = dueLabel(task.due);
  const priority = priorityMeta(task.priority);
  const category = categories.find((item) => item.id === task.category);

  // Живые показатели: время в работе и число помодоро (обновляет ui/timer.js).
  const spent = Number(task.spentMs) || 0;
  const pomodoros = Number(task.pomodoros) || 0;
  const live = [
    `<span class="meta__item meta__item--time" data-track-time${spent >= 1000 ? '' : ' hidden'}>⏱ ${formatDuration(
      spent,
      { short: true }
    )}</span>`,
    `<span class="meta__item meta__item--pomo" data-pomo${pomodoros ? '' : ' hidden'}>🍅 ${pomodoros}</span>`
  ];

  if (due) {
    const tone = due.tone === 'danger' ? ' meta__item--danger' : due.tone === 'warn' ? ' meta__item--warn' : '';
    items.push(`<span class="meta__item${tone}">${due.icon} ${escapeHtml(due.text)}</span>`);
  }
  if (category) {
    items.push(
      `<span class="meta__item"><i class="cat-item__dot" style="color:${category.color}"></i>${escapeHtml(category.label)}</span>`
    );
  }
  if (!mini) items.push(`<span class="meta__item">${priority.emoji} ${priority.label}</span>`);
  if (!mini) items.push(`<span class="meta__item">${statusMeta(task.status).emoji} ${statusMeta(task.status).label}</span>`);
  (task.tags || []).slice(0, mini ? 2 : 4).forEach((tag) => {
    items.push(`<span class="meta__item meta__item--tag">#${escapeHtml(tag)}</span>`);
  });

  const all = [...live, ...items].filter(Boolean);
  return all.length ? `<div class="meta">${all.join('')}</div>` : '';
}

/**
 * @param {object} task
 * @param {{categories?:Array, index?:number, mini?:boolean, animate?:boolean}} options
 */
export function buildTaskCard(task, { categories = [], index = 0, mini = false, animate = true, tracking = false } = {}) {
  const card = document.createElement('article');
  card.className = [
    'task-card',
    mini ? 'task-card--mini' : '',
    task.status === 'done' ? 'is-done' : '',
    tracking ? 'is-tracking' : '',
    animate ? 'is-entering' : ''
  ]
    .filter(Boolean)
    .join(' ');

  card.dataset.id = task.id;
  card.dataset.priority = task.priority;
  card.dataset.status = task.status;
  card.draggable = true;
  card.setAttribute('role', 'listitem');
  card.style.setProperty('--i', String(Math.min(index, 12)));

  const progress = taskProgress(task);
  const subtasksLine =
    !mini && progress.total
      ? `<div class="subprogress">
           <span class="subprogress__track"><span class="subprogress__fill" style="width:${progress.percent}%"></span></span>
           <span>${progress.done}/${progress.total} шагов</span>
         </div>`
      : '';

  card.innerHTML = `
    <button type="button" class="task-check" data-action="toggle" aria-pressed="${task.status === 'done'}"
      aria-label="${task.status === 'done' ? 'Вернуть в работу' : 'Отметить выполненной'}">${CHECK_SVG}</button>
    <div class="task-card__body">
      <h4 class="task-card__title">${escapeHtml(task.title)}</h4>
      ${!mini && task.description ? `<p class="task-card__desc">${escapeHtml(task.description)}</p>` : ''}
      ${buildMeta(task, categories, mini)}
      ${subtasksLine}
    </div>
    <div class="task-card__actions">
      <button type="button" class="task-act task-act--timer${tracking ? ' is-on' : ''}" data-action="timer"
        aria-pressed="${tracking}" title="Учёт времени"
        aria-label="${tracking ? 'Поставить учёт времени на паузу' : 'Начать учёт времени'}">${tracking ? '⏸' : '▶'}</button>
      <button type="button" class="task-act" data-action="edit" aria-label="Редактировать">✏️</button>
      <button type="button" class="task-act task-act--danger" data-action="delete" aria-label="Удалить">🗑</button>
    </div>
  `;

  return card;
}

/** Помечает карточку завершённой/активной без полного перерендера списка. */
export function paintTaskCard(card, task) {
  if (!card) return;
  card.classList.toggle('is-done', task.status === 'done');
  card.dataset.status = task.status;
  const check = card.querySelector('.task-check');
  if (check) check.setAttribute('aria-pressed', String(task.status === 'done'));
  card.classList.remove('is-bump');
  void card.offsetWidth;
  card.classList.add('is-bump');
}
