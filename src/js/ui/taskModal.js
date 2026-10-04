/**
 * Модальное окно создания и редактирования задачи:
 * приоритет, статус, категория, дедлайн, теги и подзадачи.
 */
import { PRIORITIES, STATUSES, createTask } from '../core/tasks.js';
import { $, $$, el, escapeHtml, toDateKey, uid } from '../core/utils.js';
import { confirmDialog, openModal } from './modal.js';

const QUICK_DATES = [
  { label: 'Сегодня', offset: 0 },
  { label: 'Завтра', offset: 1 },
  { label: 'Через неделю', offset: 7 }
];

export function openTaskModal({ task = null, categories = [], onSubmit, onDelete } = {}) {
  const isEdit = Boolean(task);
  const draft = {
    priority: task?.priority || 'medium',
    status: task?.status || 'todo',
    tags: [...(task?.tags || [])],
    subtasks: (task?.subtasks || []).map((sub) => ({ ...sub }))
  };

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="field">
      <input type="text" name="title" id="task-title" placeholder=" " maxlength="140"
        value="${escapeHtml(task?.title || '')}" autocomplete="off" />
      <span class="field__label">Название задачи</span>
      <span class="field__error" data-error-for="title"></span>
    </div>

    <div class="field">
      <textarea name="description" id="task-description" placeholder=" " rows="3"
        maxlength="600">${escapeHtml(task?.description || '')}</textarea>
      <span class="field__label">Описание (необязательно)</span>
    </div>

    <div class="modal__grid">
      <label class="select">
        <span class="select__label">Категория</span>
        <select id="task-category">
          <option value="">Без категории</option>
          ${categories
            .map(
              (category) =>
                `<option value="${category.id}"${task?.category === category.id ? ' selected' : ''}>${category.emoji} ${escapeHtml(
                  category.label
                )}</option>`
            )
            .join('')}
        </select>
      </label>

      <div class="field field--date">
        <span class="field__label field__label--static">Дедлайн</span>
        <input type="date" id="task-due" value="${task?.due || ''}" />
      </div>
    </div>

    <div class="row" id="quick-dates" style="flex-wrap: wrap; gap: 8px;">
      ${QUICK_DATES.map((item) => `<button type="button" class="chip" data-offset="${item.offset}">${item.label}</button>`).join('')}
      <button type="button" class="chip" data-offset="clear">Без даты</button>
    </div>

    <div class="modal__section">
      <span class="field__label field__label--static">Приоритет</span>
      <div class="pick" data-pick="priority">
        ${PRIORITIES.map(
          (priority) =>
            `<button type="button" class="pick__opt${draft.priority === priority.id ? ' is-active' : ''}"
              data-pick="${priority.id}" data-value="${priority.id}"><span class="pick__ico" aria-hidden="true">${priority.emoji}</span><span class="pick__text">${priority.label}</span><span class="pick__check" aria-hidden="true">✓</span></button>`
        ).join('')}
      </div>
    </div>

    <div class="modal__section">
      <span class="field__label field__label--static">Статус</span>
      <div class="pick" data-pick="status">
        ${STATUSES.map(
          (status) =>
            `<button type="button" class="pick__opt${draft.status === status.id ? ' is-active' : ''}"
              data-pick="${status.id}" data-value="${status.id}"><span class="pick__ico" aria-hidden="true">${status.emoji}</span><span class="pick__text">${status.label}</span><span class="pick__check" aria-hidden="true">✓</span></button>`
        ).join('')}
      </div>
    </div>

    <div class="modal__section">
      <span class="field__label field__label--static">Теги</span>
      <div class="tags-input" id="task-tags">
        <input type="text" id="task-tag-input" placeholder="Введите тег и нажмите Enter" maxlength="20" />
      </div>
    </div>

    <div class="modal__section">
      <span class="field__label field__label--static">Подзадачи</span>
      <div class="subtasks" id="task-subtasks"></div>
      <div class="subtasks__add">
        <input type="text" id="task-subtask-input" placeholder="Новая подзадача…" maxlength="120" />
        <button type="button" class="btn btn--ghost btn--sm" id="task-subtask-add">＋ Добавить</button>
      </div>
    </div>
  `;

  const footer = [
    ...(isEdit
      ? [
          {
            label: '🗑 Удалить',
            variant: 'btn--ghost',
            onClick: async () => {
              const ok = await confirmDialog({
                title: 'Удалить задачу?',
                text: `«${task.title}» будет удалена безвозвратно.`,
                confirmLabel: 'Удалить',
                icon: '🗑'
              });
              if (ok) {
                onDelete?.(task.id);
                close();
              }
            }
          }
        ]
      : []),
    { label: 'Отмена', variant: 'btn--ghost', onClick: ({ close }) => close() },
    { label: isEdit ? 'Сохранить' : 'Создать задачу', variant: 'btn--primary', onClick: () => save() }
  ];

  const { close, bodyEl } = openModal({
    title: isEdit ? 'Редактировать задачу' : 'Новая задача',
    icon: isEdit ? '✏️' : '✨',
    body: content,
    footer,
    wide: true
  });

  /* --------------------- Вспомогательные -------------------- */

  const titleInput = $('#task-title', bodyEl);
  const tagInput = $('#task-tag-input', bodyEl);
  const tagsBox = $('#task-tags', bodyEl);
  const subtasksBox = $('#task-subtasks', bodyEl);
  const dueInput = $('#task-due', bodyEl);

  function setTitleError(message) {
    const field = titleInput.closest('.field');
    $('.field__error', field).textContent = message || '';
    field.classList.toggle('has-error', Boolean(message));
    field.classList.remove('shake');
    if (message) {
      void field.offsetWidth;
      field.classList.add('shake');
    }
  }

  /* --------------------------- Теги ------------------------- */

  function renderTags() {
    $$('.tag-chip', tagsBox).forEach((node) => node.remove());
    draft.tags.forEach((tag) => {
      const chip = el('span', { class: 'tag-chip' }, `#${tag}`);
      const remove = el('button', { type: 'button', 'aria-label': `Удалить тег ${tag}` }, '✕');
      remove.addEventListener('click', () => {
        draft.tags = draft.tags.filter((item) => item !== tag);
        renderTags();
      });
      chip.append(remove);
      tagsBox.insertBefore(chip, tagInput);
    });
  }

  function addTag(raw) {
    const value = String(raw || '').trim().replace(/^#+/, '').slice(0, 20);
    if (!value || draft.tags.length >= 8) return;
    if (!draft.tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) draft.tags.push(value);
    tagInput.value = '';
    renderTags();
  }

  tagInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag(tagInput.value);
    } else if (event.key === 'Backspace' && !tagInput.value && draft.tags.length) {
      draft.tags.pop();
      renderTags();
    }
  });
  tagInput.addEventListener('blur', () => addTag(tagInput.value));

  /* ------------------------- Подзадачи ---------------------- */

  function renderSubtasks() {
    subtasksBox.innerHTML = '';
    if (!draft.subtasks.length) {
      subtasksBox.append(el('p', { class: 'subtasks__empty' }, 'Пока нет подзадач — добавьте шаги, чтобы видеть прогресс.'));
      return;
    }

    draft.subtasks.forEach((subtask, index) => {
      const row = el('div', { class: `subtask${subtask.done ? ' is-done' : ''}` });
      row.innerHTML = `
        <label class="check check--sm">
          <input type="checkbox" ${subtask.done ? 'checked' : ''} aria-label="Подзадача выполнена" />
          <span class="check__box"></span>
        </label>
        <span class="subtask__text">${escapeHtml(subtask.title)}</span>
        <button type="button" class="subtask__del" aria-label="Удалить подзадачу">✕</button>
      `;
      $('input', row).addEventListener('change', (event) => {
        subtask.done = event.target.checked;
        renderSubtasks();
      });
      $('.subtask__del', row).addEventListener('click', () => {
        draft.subtasks.splice(index, 1);
        renderSubtasks();
      });
      subtasksBox.append(row);
    });
  }

  const subtaskInput = $('#task-subtask-input', bodyEl);
  function addSubtask() {
    const value = subtaskInput.value.trim();
    if (!value) return;
    draft.subtasks.push({ id: uid('sub'), title: value.slice(0, 120), done: false });
    subtaskInput.value = '';
    renderSubtasks();
    subtaskInput.focus();
  }
  $('#task-subtask-add', bodyEl).addEventListener('click', addSubtask);
  subtaskInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addSubtask();
    }
  });

  /* -------------------- Приоритет и статус ------------------ */

  $$('.pick', bodyEl).forEach((group) => {
    group.addEventListener('click', (event) => {
      const option = event.target.closest('.pick__opt');
      if (!option) return;
      $$('.pick__opt', group).forEach((node) => node.classList.toggle('is-active', node === option));
      draft[group.dataset.pick] = option.dataset.value;
    });
  });

  /* --------------------- Быстрые даты ----------------------- */

  function syncQuickDates() {
    const value = dueInput.value;
    $$('#quick-dates .chip', bodyEl).forEach((chip) => {
      if (chip.dataset.offset === 'clear') {
        chip.classList.toggle('is-active', !value);
        return;
      }
      const date = new Date();
      date.setDate(date.getDate() + Number(chip.dataset.offset));
      chip.classList.toggle('is-active', value === toDateKey(date));
    });
  }

  dueInput.addEventListener('change', syncQuickDates);

  $('#quick-dates', bodyEl).addEventListener('click', (event) => {
    const button = event.target.closest('[data-offset]');
    if (!button) return;
    if (button.dataset.offset === 'clear') {
      dueInput.value = '';
    } else {
      const date = new Date();
      date.setDate(date.getDate() + Number(button.dataset.offset));
      dueInput.value = toDateKey(date);
    }
    syncQuickDates();
  });

  /* ------------------------ Сохранение ---------------------- */

  function save() {
    const title = titleInput.value.trim();
    if (title.length < 2) {
      setTitleError('Введите хотя бы 2 символа');
      titleInput.focus();
      return;
    }

    const status = draft.status;
    const becameDone = status === 'done' && task?.status !== 'done';
    const payload = createTask({
      ...(task || {}),
      id: task?.id,
      title,
      description: $('#task-description', bodyEl).value,
      priority: draft.priority,
      status,
      category: $('#task-category', bodyEl).value || null,
      due: $('#task-due', bodyEl).value || null,
      tags: draft.tags,
      subtasks: draft.subtasks,
      createdAt: task?.createdAt,
      completedAt: status === 'done' ? (becameDone ? new Date().toISOString() : task?.completedAt || new Date().toISOString()) : null
    });

    onSubmit?.(payload);
    close();
  }

  titleInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      save();
    }
  });
  titleInput.addEventListener('input', () => setTitleError(''));

  renderTags();
  renderSubtasks();
  syncQuickDates();

  return { close, bodyEl };
}

