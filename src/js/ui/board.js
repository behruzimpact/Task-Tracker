/**
 * Отрисовка канбан-доски: три колонки по статусам.
 */
import { STATUSES } from '../core/tasks.js';
import { $, el } from '../core/utils.js';
import { buildTaskCard } from './taskCard.js';

export function renderBoard(container, tasks, { categories = [], animate = true } = {}) {
  container.innerHTML = '';

  STATUSES.forEach((status, index) => {
    const column = el('section', {
      class: 'board-col',
      style: `--col-color:${status.color}; --i:${index}`,
      dataset: { status: status.id }
    });

    const items = tasks.filter((task) => task.status === status.id);

    column.innerHTML = `
      <div class="board-col__head">
        <span class="board-col__dot" aria-hidden="true"></span>
        <span class="board-col__title">${status.label}</span>
        <span class="board-col__count">${items.length}</span>
      </div>
      <div class="board-col__body" data-dropzone="${status.id}"></div>
    `;

    const body = $('.board-col__body', column);
    if (!items.length) {
      body.innerHTML = '<div class="board-col__empty">Перетащите задачу сюда</div>';
    } else {
      items.forEach((task, i) => {
        body.append(buildTaskCard(task, { categories, index: i, mini: true, animate }));
      });
    }

    container.append(column);
  });
}
