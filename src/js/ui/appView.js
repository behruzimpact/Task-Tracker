/**
 * Главный контроллер приложения: состояние, отрисовка и обработка событий.
 */
import { logout, updateProfile, AVATARS } from '../core/auth.js';
import {
  addCategory,
  addTask,
  clearCompleted,
  loadData,
  removeCategory,
  removeTask,
  reorderTask,
  saveData,
  setStatus,
  toggleDone,
  updateTask
} from '../core/repository.js';
import {
  categoryCounts,
  completionSeries,
  computeStats,
  countByNav,
  filterTasks,
  priorityBreakdown,
  sortTasks,
  totalPomodoros,
  totalSpentMs
} from '../core/tasks.js';
import {
  $,
  $$,
  attachRipple,
  debounce,
  downloadJson,
  el,
  escapeHtml,
  formatDateTimeRu,
  plural,
  timeGreeting,
  toDateKey
} from '../core/utils.js';
import { renderBoard } from './board.js';
import { burstConfetti, celebrate } from './confetti.js';
import { buildTaskCard, paintTaskCard } from './taskCard.js';
import { openModal, confirmDialog } from './modal.js';
import { renderPriorityBars, renderRing, renderSideProgress, renderStats, renderTimeSummary, renderWeekChart } from './stats.js';
import { toast, toastError, toastInfo, toastOk, toastWarn } from './toast.js';
import { toggleTheme } from './theme.js';
import { openTaskModal } from './taskModal.js';
import { createTimer } from './timer.js';

const NAV_TITLES = {
  all: 'Все задачи',
  today: 'Задачи на сегодня',
  upcoming: 'Предстоящие задачи',
  overdue: 'Просроченные задачи',
  done: 'Выполненные задачи'
};

const EMPTY_STATES = {
  default: { emoji: '🗒️', title: 'Пока пусто', text: 'Создайте первую задачу — и она появится здесь.' },
  search: { emoji: '🔍', title: 'Ничего не найдено', text: 'Попробуйте изменить запрос или сбросить фильтры.' },
  today: { emoji: '🎯', title: 'На сегодня всё чисто', text: 'Задач с дедлайном на сегодня нет. Отличная работа!' },
  upcoming: { emoji: '🗓️', title: 'Нет предстоящих задач', text: 'Планы на будущее появятся здесь.' },
  overdue: { emoji: '🎉', title: 'Просрочек нет', text: 'Все дедлайны под контролем.' },
  done: { emoji: '📦', title: 'Ещё ничего не выполнено', text: 'Отмечайте задачи галочкой — они попадут сюда.' }
};

export function createAppView({ onSessionEnd } = {}) {
  const state = {
    user: null,
    db: { tasks: [], categories: [] },
    filters: { nav: 'all', status: 'all', priority: 'all', category: 'all', query: '', hideDone: false, sort: 'smart' },
    view: 'list',
    lastStats: null,
    dragId: null
  };

  const els = {
    screen: $('#app-screen'),
    list: $('#task-list'),
    board: $('#board'),
    empty: $('#empty-state'),
    contentTitle: $('#content-title'),
    contentHint: $('#content-hint'),
    search: $('#search-input'),
    searchClear: $('#search-clear'),
    categoryList: $('#category-list'),
    categorySelect: $('#filter-category'),
    sidebar: $('#sidebar'),
    userchip: $('#userchip'),
    menu: $('#userchip-menu')
  };

  /**
   * Помодоро-таймер и учёт времени по задачам.
   * Таймер сам рисует свою панель и карточки, а данные о времени отдаёт сюда.
   */
  const timer = createTimer({
    getTasks: () => state.db.tasks,
    onTaskTime: (taskId, spentMs) => {
      state.db = updateTask(state.db, taskId, { spentMs });
      persist();
    },
    onPomodoro: (taskId) => {
      const task = findTask(taskId);
      if (!task) return;
      state.db = updateTask(state.db, taskId, { pomodoros: (Number(task.pomodoros) || 0) + 1 });
      persist();
    },
    onTaskStarted: (taskId) => {
      const task = findTask(taskId);
      if (!task || task.status !== 'todo') return;
      // Взяли задачу в работу — сразу переводим её в статус «В работе».
      state.db = setStatus(state.db, taskId, 'progress');
      persist();
      renderAll({ animate: false });
    },
    onChanged: () => {
      renderPanels();
      renderHero();
    }
  });

  let backdrop = null;
  let unsubscribeBackdrop = null;

  /* ----------------------- Утилиты -------------------------- */

  const persist = () => saveData(state.user.id, state.db);

  const findTask = (id) => state.db.tasks.find((task) => task.id === id) || null;

  function visibleTasks() {
    const filtered = filterTasks(state.db.tasks, state.filters);
    return sortTasks(filtered, state.filters.sort);
  }

  function pulse(element) {
    if (!element) return;
    element.classList.remove('is-bump');
    void element.offsetWidth;
    element.classList.add('is-bump');
  }

  /* ------------------------- Монтаж ------------------------- */

  function mount(user) {
    state.user = user;
    state.db = loadData(user.id);
    state.lastStats = null;
    if (!els.screen) return;

    els.screen.hidden = false;
    els.screen.classList.remove('screen--out');
    els.screen.classList.add('screen--in');

    timer.mount(user.id);
    renderAll({ animate: true });
  }

  function unmount() {
    timer.unmount();
    if (els.screen) els.screen.hidden = true;
    closeSidebar();
    closeMenu();
    state.user = null;
    state.db = { tasks: [], categories: [] };
  }

  function renderAll({ animate = false } = {}) {
    renderProfile();
    renderNavCounts();
    renderCategories();
    renderHero();
    renderPanels();
    renderFilterCategories();
    renderContent({ animate });
  }

  /* -------------------- Профиль и шапка --------------------- */

  function renderProfile() {
    const user = state.user;
    if (!user) return;

    ['#side-avatar', '#userchip-avatar', '#menu-avatar'].forEach((selector) => {
      const node = $(selector);
      if (node) node.textContent = user.avatar;
    });

    $('#side-name').textContent = user.name;
    $('#userchip-name').textContent = user.name.split(/\s+/)[0];
    $('#side-email').textContent = user.email;
    $('#menu-name').textContent = user.name;
    $('#menu-email').textContent = user.email;
  }

  function renderNavCounts() {
    const counts = countByNav(state.db.tasks);
    Object.entries(counts).forEach(([key, value]) => {
      const node = $(`#count-${key}`);
      if (!node) return;
      if (node.textContent !== String(value)) {
        node.textContent = value;
        pulse(node);
      }
    });

    $$('.side-nav__item[data-nav]').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.nav === state.filters.nav);
    });
  }

  function renderCategories() {
    const counts = categoryCounts(state.db.tasks);
    els.categoryList.innerHTML = '';

    if (!state.db.categories.length) {
      els.categoryList.innerHTML = '<p class="subtasks__empty" style="padding-left:12px">Добавьте свою категорию</p>';
      return;
    }

    state.db.categories.forEach((category) => {
      const item = el('button', {
        class: `cat-item${state.filters.category === category.id ? ' is-active' : ''}`,
        type: 'button',
        dataset: { category: category.id }
      });
      item.innerHTML = `
        <i class="cat-item__dot" style="color:${category.color}"></i>
        <span class="cat-item__name">${category.emoji} ${escapeHtml(category.label)}</span>
        <b class="badge">${counts.get(category.id) || 0}</b>
        <span class="cat-item__del" role="button" tabindex="0" aria-label="Удалить категорию" data-cat-del="${category.id}">✕</span>
      `;
      els.categoryList.append(item);
    });
  }

  function renderHero() {
    const stats = computeStats(state.db.tasks);
    const user = state.user;
    const firstName = user ? user.name.split(/\s+/)[0] : '';

    $('#greeting').textContent = `${timeGreeting()}, ${firstName}! 👋`;

    const dateLabel = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    $('#today-label').textContent = `${dateLabel.charAt(0).toUpperCase()}${dateLabel.slice(1)} · ${stats.total} ${plural(
      stats.total,
      'задача',
      'задачи',
      'задач'
    )} всего`;

    $('#hero-streak').textContent = `🔥 ${stats.todayDone} сегодня`;
    $('#hero-focus').textContent = `⚡ ${stats.progress} в работе`;
  }

  function renderPanels() {
    const tasks = state.db.tasks;
    const stats = computeStats(tasks);
    const spentMs = totalSpentMs(tasks);

    renderStats({ ...stats, spentMs }, state.lastStats);
    renderRing(stats.percent);
    renderWeekChart(completionSeries(tasks, 7));
    renderPriorityBars(priorityBreakdown(tasks));
    renderSideProgress(stats.percent);
    renderTimeSummary({ spentMs, pomodoros: totalPomodoros(tasks) });

    state.lastStats = { ...stats, spentMs };
  }

  function renderFilterCategories() {
    if (!els.categorySelect) return;
    const current = state.filters.category;
    const options = ['<option value="all">Все категории</option>'].concat(
      state.db.categories.map((category) => `<option value="${category.id}">${category.emoji} ${escapeHtml(category.label)}</option>`)
    );
    els.categorySelect.innerHTML = options.join('');

    const exists = state.db.categories.some((category) => category.id === current);
    els.categorySelect.value = exists ? current : 'all';
    if (!exists) state.filters.category = 'all';
  }

  /* ------------------------- Контент ------------------------ */

  function emptyStateFor(filters) {
    if (filters.query) return EMPTY_STATES.search;
    if (filters.nav !== 'all') return EMPTY_STATES[filters.nav] || EMPTY_STATES.default;
    if (filters.category !== 'all' || filters.status !== 'all' || filters.priority !== 'all') return EMPTY_STATES.search;
    return EMPTY_STATES.default;
  }

  function renderContent({ animate = false } = {}) {
    const tasks = visibleTasks();
    const isEmpty = tasks.length === 0;
    const done = tasks.filter((task) => task.status === 'done').length;

    els.contentTitle.textContent = NAV_TITLES[state.filters.nav] || NAV_TITLES.all;
    els.contentHint.textContent = isEmpty
      ? 'Пока нечего показывать'
      : `${tasks.length} ${plural(tasks.length, 'задача', 'задачи', 'задач')} · ${done} выполнено`;

    els.empty.hidden = !isEmpty;
    els.list.hidden = isEmpty || state.view !== 'list';
    els.board.hidden = isEmpty || state.view !== 'board';

    if (isEmpty) {
      const config = emptyStateFor(state.filters);
      $('#empty-emoji').textContent = config.emoji;
      $('#empty-title').textContent = config.title;
      $('#empty-text').textContent = config.text;
      timer.syncCards();
      return;
    }

    if (state.view === 'board') {
      renderBoard(els.board, tasks, { categories: state.db.categories, animate });
    } else {
      renderList(tasks, animate);
    }

    timer.syncCards();
  }

  function renderList(tasks, animate) {
    const fragment = document.createDocumentFragment();
    tasks.forEach((task, index) => {
      fragment.append(
        buildTaskCard(task, { categories: state.db.categories, index, animate, tracking: timer.isTracked(task.id) })
      );
    });
    els.list.replaceChildren(fragment);
  }

  /* ------------------- Действия с задачами ------------------ */

  function openTaskEditor(task = null) {
    openTaskModal({
      task,
      categories: state.db.categories,
      onSubmit: (payload) => {
        if (task) {
          state.db = updateTask(state.db, task.id, payload);
          toastOk('Задача обновлена', payload.title);
        } else {
          state.db = addTask(state.db, payload);
          toastOk('Задача создана', payload.title);
          if (payload.status === 'done') burstConfetti(window.innerWidth / 2, 160, { count: 46, power: 9 });
        }
        persist();
        renderAll({ animate: !task });
      },
      onDelete: (id) => removeTaskWithUndo(id)
    });
  }

  function toggleTask(task, event) {
    const wasDone = task.status === 'done';
    const card = event?.target?.closest('.task-card');

    state.db = wasDone ? setStatus(state.db, task.id, 'todo') : toggleDone(state.db, task.id);
    persist();

    const updated = findTask(task.id);
    paintTaskCard(card, updated);

    if (!wasDone) {
      const rect = card?.getBoundingClientRect();
      burstConfetti(
        rect ? rect.left + 30 : window.innerWidth / 2,
        rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
        { count: 30, power: 9 }
      );

      const stats = computeStats(state.db.tasks);
      if (stats.total > 0 && stats.done === stats.total) {
        setTimeout(() => {
          celebrate();
          toastOk('Все задачи выполнены! 🏆', 'Идеальный день — так держать!');
        }, 320);
      }
    }

    renderNavCounts();
    renderCategories();
    renderPanels();
    renderHero();
    setTimeout(() => renderContent({ animate: false }), 420);
  }

  function removeTaskWithUndo(id) {
    const task = findTask(id);
    if (!task) return;
    timer.forgetTask(id);
    const snapshot = state.db;
    const card = $(`.task-card[data-id="${id}"]`);
    card?.classList.add('is-removing');

    setTimeout(() => {
      state.db = removeTask(state.db, id);
      persist();
      renderAll({ animate: false });
    }, card ? 250 : 0);

    toast({
      title: 'Задача удалена',
      text: task.title,
      type: 'warn',
      duration: 6500,
      actionLabel: 'Вернуть',
      onAction: () => {
        state.db = snapshot;
        persist();
        renderAll({ animate: true });
        toastOk('Задача восстановлена', task.title);
      }
    });
  }

  /* ------------------- Перетаскивание (DnD) ----------------- */

  function wireDragAndDrop() {
    [els.list, els.board].forEach((container) => {
      if (!container) return;

      container.addEventListener('dragstart', (event) => {
        const card = event.target.closest('.task-card');
        if (!card) return;
        state.dragId = card.dataset.id;
        card.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        try {
          event.dataTransfer.setData('text/plain', card.dataset.id);
        } catch {
          /* некоторые браузеры запрещают setData вне user gesture */
        }
      });

      container.addEventListener('dragend', (event) => {
        event.target.closest('.task-card')?.classList.remove('is-dragging');
        $$('.task-card.is-over', container).forEach((node) => node.classList.remove('is-over'));
        $$('.board-col.is-over').forEach((node) => node.classList.remove('is-over'));
        state.dragId = null;
      });

      container.addEventListener('dragover', (event) => {
        if (!state.dragId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';

        const card = event.target.closest('.task-card');
        const column = event.target.closest('.board-col');

        if (container === els.board) {
          $$('.board-col', container).forEach((node) => node.classList.toggle('is-over', node === column));
        }
        if (card && card.dataset.id !== state.dragId) {
          $$('.task-card.is-over', container).forEach((node) => node.classList.toggle('is-over', node === card));
        }
      });

      container.addEventListener('drop', (event) => {
        const id = state.dragId;
        if (!id) return;
        event.preventDefault();
        handleDrop(id, {
          container,
          column: event.target.closest('.board-col'),
          targetCard: event.target.closest('.task-card')
        });
      });
    });
  }

  function handleDrop(id, { container, column, targetCard }) {
    const task = findTask(id);
    if (!task) return;

    if (container === els.board && column) {
      const status = column.dataset.status;
      if (status !== task.status) {
        state.db = setStatus(state.db, id, status);
        if (status === 'done') {
          const rect = column.getBoundingClientRect();
          burstConfetti(rect.left + rect.width / 2, rect.top + 60, { count: 34, power: 10 });
        }
      }
      if (targetCard && targetCard.dataset.id !== id) {
        state.db = reorderTask(state.db, id, targetCard.dataset.id);
      }
      toastInfo('Статус обновлён', `«${task.title}» → ${status === 'done' ? 'Готово' : status === 'progress' ? 'В работе' : 'К выполнению'}`);
    } else if (targetCard && targetCard.dataset.id !== id) {
      state.db = reorderTask(state.db, id, targetCard.dataset.id);
      if (state.filters.sort !== 'manual') {
        state.filters.sort = 'manual';
        const select = $('#filter-sort');
        if (select) select.value = 'manual';
        toastInfo('Порядок изменён', 'Включена сортировка «Вручную» — расставляйте задачи как удобно.');
      }
    }

    persist();
    renderAll({ animate: false });
  }

  /* ------------------------- Профиль ------------------------ */

  function openProfileModal() {
    const user = state.user;
    let avatar = user.avatar;

    const content = document.createElement('div');
    content.innerHTML = `
      <div class="field">
        <input type="text" id="profile-name" placeholder=" " value="${escapeHtml(user.name)}" maxlength="32" />
        <span class="field__label">Имя</span>
        <span class="field__error" data-error-for="profile-name"></span>
      </div>
      <div class="field field--avatar">
        <span class="field__label field__label--static">Аватар</span>
        <div class="avatar-picker" id="profile-avatars">
          ${AVATARS.map(
            (item) => `<button type="button" class="avatar-opt${item === avatar ? ' is-active' : ''}" data-avatar="${item}">${item}</button>`
          ).join('')}
        </div>
      </div>
      <div class="alert alert--ok" style="margin:0">
        <span class="alert__ico">📊</span>
        <span class="alert__text">Задач: ${state.db.tasks.length} · в аккаунте с ${formatDateTimeRu(user.createdAt)}</span>
      </div>
    `;

    const { close, bodyEl } = openModal({
      title: 'Профиль',
      icon: user.avatar,
      body: content,
      footer: [
        { label: 'Отмена', variant: 'btn--ghost', onClick: ({ close: cancel }) => cancel() },
        { label: 'Сохранить', variant: 'btn--primary', onClick: () => save() }
      ]
    });

    $('#profile-avatars', bodyEl).addEventListener('click', (event) => {
      const option = event.target.closest('.avatar-opt');
      if (!option) return;
      $$('.avatar-opt', bodyEl).forEach((node) => node.classList.toggle('is-active', node === option));
      avatar = option.dataset.avatar;
    });

    function save() {
      const name = $('#profile-name', bodyEl).value.trim();
      if (name.length < 2) {
        toastError('Слишком короткое имя', 'Введите минимум 2 символа');
        return;
      }
      const updated = updateProfile({ name, avatar });
      if (updated) state.user = updated;
      renderProfile();
      toastOk('Профиль обновлён', name);
      close();
    }
  }

  /* ------------------- Меню и сайдбар ----------------------- */

  function ensureBackdrop() {
    if (!backdrop) {
      backdrop = el('div', { class: 'sidebar-backdrop' });
      backdrop.addEventListener('click', () => {
        closeSidebar();
        closeMenu();
      });
      document.body.append(backdrop);
    }
    return backdrop;
  }

  function openSidebar() {
    els.sidebar.classList.add('is-open');
    ensureBackdrop().classList.add('is-on');
  }

  function closeSidebar() {
    els.sidebar?.classList.remove('is-open');
    backdrop?.classList.remove('is-on');
  }

  function openMenu() {
    els.menu.hidden = false;
    els.userchip.classList.add('is-open');
    $('#userchip-btn').setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    if (!els.menu) return;
    els.menu.hidden = true;
    els.userchip.classList.remove('is-open');
    $('#userchip-btn').setAttribute('aria-expanded', 'false');
  }

  function toggleMenu() {
    if (els.menu.hidden) openMenu();
    else closeMenu();
  }

  /* ----------------------- Прочее --------------------------- */

  function exportData() {
    downloadJson(`taskflow-${toDateKey()}.json`, {
      exportedAt: new Date().toISOString(),
      user: state.user,
      tasks: state.db.tasks,
      categories: state.db.categories
    });
    toastOk('Экспорт готов', 'Файл JSON сохранён в загрузки');
  }

  async function clearDoneTasks() {
    const done = state.db.tasks.filter((task) => task.status === 'done');
    if (!done.length) {
      toastInfo('Нечего удалять', 'Выполненных задач нет');
      return;
    }
    const ok = await confirmDialog({
      title: 'Удалить выполненные?',
      text: `Будет удалено задач: ${done.length}. Действие необратимо.`,
      confirmLabel: 'Удалить',
      icon: '🧹'
    });
    if (!ok) return;

    state.db = clearCompleted(state.db);
    persist();
    renderAll({ animate: false });
    toastOk('Список очищен', `Удалено задач: ${done.length}`);
  }

  async function removeCategoryWithConfirm(id) {
    const category = state.db.categories.find((item) => item.id === id);
    if (!category) return;

    const ok = await confirmDialog({
      title: 'Удалить категорию?',
      text: `Категория «${category.label}» будет удалена, задачи останутся без категории.`,
      confirmLabel: 'Удалить',
      icon: '🏷️'
    });
    if (!ok) return;

    state.db = removeCategory(state.db, id);
    persist();
    renderAll({ animate: false });
    toastOk('Категория удалена', category.label);
  }

  function setView(view) {
    state.view = view === 'board' ? 'board' : 'list';
    const seg = $('#view-switch');
    seg.dataset.active = state.view;
    $$('.seg__btn', seg).forEach((button) => {
      const active = button.dataset.view === state.view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    renderContent({ animate: true });
  }

  function resetFilters() {
    state.filters = {
      nav: 'all',
      status: 'all',
      priority: 'all',
      category: 'all',
      query: '',
      hideDone: false,
      sort: 'smart'
    };

    els.search.value = '';
    els.searchClear.hidden = true;
    $('#filter-priority').value = 'all';
    $('#filter-sort').value = 'smart';
    $('#filter-hide-done').checked = false;
    $$('#status-chips .chip').forEach((chip) => chip.classList.toggle('is-active', chip.dataset.status === 'all'));

    renderAll({ animate: true });
    toastInfo('Фильтры сброшены');
  }

  async function doLogout() {
    const ok = await confirmDialog({
      title: 'Выйти из аккаунта?',
      text: 'Данные останутся в браузере — вы сможете войти снова.',
      confirmLabel: 'Выйти',
      icon: '🚪'
    });
    if (!ok) return;

    logout();
    closeMenu();
    closeSidebar();
    unmount();
    onSessionEnd?.();
  }

  /* ----------------------- События -------------------------- */

  function wireEvents() {
    [els.list, els.board].forEach((container) => {
      container.addEventListener('click', (event) => {
        const card = event.target.closest('.task-card');
        if (!card) return;
        const task = findTask(card.dataset.id);
        if (!task) return;

        const action = event.target.closest('[data-action]');
        if (action) {
          event.stopPropagation();
          const type = action.dataset.action;
          if (type === 'toggle') toggleTask(task, event);
          else if (type === 'timer') timer.toggleTask(task.id);
          else if (type === 'edit') openTaskEditor(task);
          else if (type === 'delete') removeTaskWithUndo(task.id);
          return;
        }

        if (event.target.closest('.task-card__body')) openTaskEditor(task);
      });
    });

    wireDragAndDrop();

    /* Добавление задачи */
    ['#add-task-btn', '#empty-add'].forEach((selector) => {
      const node = $(selector);
      if (node) node.addEventListener('click', () => openTaskEditor());
    });

    /* Поиск */
    const onSearch = debounce((value) => {
      state.filters.query = value;
      renderContent({ animate: true });
    }, 180);

    els.search.addEventListener('input', (event) => {
      const { value } = event.target;
      els.searchClear.hidden = !value;
      onSearch(value);
    });

    els.searchClear.addEventListener('click', () => {
      els.search.value = '';
      els.searchClear.hidden = true;
      state.filters.query = '';
      renderContent({ animate: true });
      els.search.focus();
    });

    /* Фильтры */
    $('#status-chips').addEventListener('click', (event) => {
      const chip = event.target.closest('[data-status]');
      if (!chip) return;
      state.filters.status = chip.dataset.status;
      $$('#status-chips .chip').forEach((node) => node.classList.toggle('is-active', node === chip));
      renderContent({ animate: true });
    });

    $('#filter-priority').addEventListener('change', (event) => {
      state.filters.priority = event.target.value;
      renderContent({ animate: true });
    });

    els.categorySelect.addEventListener('change', (event) => {
      state.filters.category = event.target.value;
      renderCategories();
      renderContent({ animate: true });
    });

    $('#filter-sort').addEventListener('change', (event) => {
      state.filters.sort = event.target.value;
      renderContent({ animate: true });
    });

    $('#filter-hide-done').addEventListener('change', (event) => {
      state.filters.hideDone = event.target.checked;
      renderContent({ animate: true });
    });

    $('#filters-reset').addEventListener('click', resetFilters);

    /* Навигация */
    $$('.side-nav__item[data-nav]').forEach((item) => {
      item.addEventListener('click', () => {
        state.filters.nav = item.dataset.nav;
        if (window.innerWidth <= 1140) closeSidebar();
        renderAll({ animate: true });
      });
    });

    /* Категории */
    els.categoryList.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-cat-del]');
      if (remove) {
        event.stopPropagation();
        removeCategoryWithConfirm(remove.dataset.catDel);
        return;
      }
      const item = event.target.closest('[data-category]');
      if (!item) return;
      const { category } = item.dataset;
      state.filters.category = state.filters.category === category ? 'all' : category;
      els.categorySelect.value = state.filters.category;
      renderCategories();
      renderContent({ animate: true });
    });

    $('#category-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = $('#category-name');
      const value = input.value.trim();
      if (!value) return;

      const before = state.db.categories.length;
      state.db = addCategory(state.db, { label: value });
      if (state.db.categories.length === before) {
        toastWarn('Такая категория уже есть', value);
        return;
      }
      input.value = '';
      persist();
      renderAll({ animate: false });
      toastOk('Категория добавлена', value);
    });

    /* Вид: список / доска */
    $('#view-switch').addEventListener('click', (event) => {
      const button = event.target.closest('.seg__btn');
      if (button) setView(button.dataset.view);
    });

    /* Тема */
    ['#theme-toggle', '#side-theme'].forEach((selector) => {
      const node = $(selector);
      if (!node) return;
      node.addEventListener('click', () => {
        const theme = toggleTheme();
        toastInfo(theme === 'dark' ? 'Тёмная тема включена 🌙' : 'Светлая тема включена ☀️');
      });
    });

    /* Меню пользователя */
    $('#userchip-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      toggleMenu();
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('#userchip')) closeMenu();
    });
    $('#menu-profile').addEventListener('click', () => {
      closeMenu();
      openProfileModal();
    });
    $('#menu-export').addEventListener('click', () => {
      closeMenu();
      exportData();
    });
    $('#menu-clear-done').addEventListener('click', () => {
      closeMenu();
      clearDoneTasks();
    });
    $('#menu-logout').addEventListener('click', () => {
      closeMenu();
      doLogout();
    });

    /* Сайдбар */
    $('#sidebar-toggle').addEventListener('click', () => {
      if (els.sidebar.classList.contains('is-open')) closeSidebar();
      else openSidebar();
    });
    $('#side-logout').addEventListener('click', doLogout);
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1140) closeSidebar();
    });

    /* Мелкие эффекты */
    ['#add-task-btn', '#empty-add', '#filters-reset'].forEach((selector) => {
      const node = $(selector);
      if (node) attachRipple(node);
    });

    wireKeyboard();
    wireSpotlight();
  }

  /* ------------------- Горячие клавиши ---------------------- */

  function wireKeyboard() {
    document.addEventListener('keydown', (event) => {
      const active = document.activeElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(active?.tagName || '') || active?.isContentEditable;
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        els.search.focus();
        els.search.select();
        return;
      }

      if (els.screen.hidden || typing) return;

      if (event.key === 'Escape') {
        closeMenu();
        closeSidebar();
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        els.search.focus();
        return;
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        openTaskEditor();
        return;
      }
      if (event.key.toLowerCase() === 'b') {
        setView(state.view === 'list' ? 'board' : 'list');
        return;
      }
      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        timer.togglePanel();
      }
    });
  }

  /* -------------------- Курсор-подсветка -------------------- */

  function wireSpotlight() {
    const spot = $('#spotlight');
    if (!spot || window.matchMedia?.('(hover: none)').matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;

    window.addEventListener(
      'pointermove',
      (event) => {
        x = event.clientX;
        y = event.clientY;
        document.body.classList.add('has-pointer');
        if (frame) return;
        frame = requestAnimationFrame(() => {
          spot.style.setProperty('--mx', `${x}px`);
          spot.style.setProperty('--my', `${y}px`);
          frame = 0;
        });
      },
      { passive: true }
    );
  }

  wireEvents();

  return {
    mount,
    unmount,
    setView,
    openTaskEditor,
    refresh: () => renderAll({ animate: false })
  };
}







