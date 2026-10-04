/**
 * Модель задачи и чистая логика: фильтрация, сортировка, статистика.
 * Модуль не зависит от DOM — покрыт автотестами (tests/core.test.mjs).
 */
import { diffDays, toDateKey, uid } from './utils.js';

export const PRIORITIES = [
  { id: 'urgent', label: 'Срочный', emoji: '🔥', weight: 4, color: '#ef4444' },
  { id: 'high', label: 'Высокий', emoji: '⬆️', weight: 3, color: '#f97316' },
  { id: 'medium', label: 'Средний', emoji: '➡️', weight: 2, color: '#6366f1' },
  { id: 'low', label: 'Низкий', emoji: '⬇️', weight: 1, color: '#94a3b8' }
];

export const STATUSES = [
  { id: 'todo', label: 'К выполнению', emoji: '📝', color: '#6366f1' },
  { id: 'progress', label: 'В работе', emoji: '⚡', color: '#f59e0b' },
  { id: 'done', label: 'Готово', emoji: '✅', color: '#10b981' }
];

export const SORT_OPTIONS = ['smart', 'due', 'priority', 'created', 'title', 'manual'];

export const PRIORITY_BY_ID = new Map(PRIORITIES.map((p) => [p.id, p]));
export const STATUS_BY_ID = new Map(STATUSES.map((s) => [s.id, s]));

export function priorityMeta(id) {
  return PRIORITY_BY_ID.get(id) || PRIORITY_BY_ID.get('medium');
}

export function statusMeta(id) {
  return STATUS_BY_ID.get(id) || STATUS_BY_ID.get('todo');
}

/** Нормализует входные данные в полноценную задачу. */
export function createTask(input = {}, now = new Date()) {
  const cleanTags = Array.isArray(input.tags)
    ? [...new Set(input.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 8)
    : [];

  const subtasks = Array.isArray(input.subtasks)
    ? input.subtasks
        .map((sub) => ({
          id: sub.id || uid('sub'),
          title: String(sub.title || '').trim(),
          done: Boolean(sub.done)
        }))
        .filter((sub) => sub.title)
    : [];

  return {
    id: input.id || uid('task'),
    title: String(input.title || '').trim(),
    description: String(input.description || '').trim(),
    status: STATUS_BY_ID.has(input.status) ? input.status : 'todo',
    priority: PRIORITY_BY_ID.has(input.priority) ? input.priority : 'medium',
    category: input.category || null,
    tags: cleanTags,
    due: input.due || null,
    subtasks,
    createdAt: input.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
    completedAt: input.completedAt || null,
    order: Number.isFinite(input.order) ? input.order : Date.now(),
    spentMs: Number.isFinite(Number(input.spentMs)) ? Math.max(0, Math.round(Number(input.spentMs))) : 0,
    pomodoros: Number.isFinite(Number(input.pomodoros)) ? Math.max(0, Math.round(Number(input.pomodoros))) : 0
  };
}

/** Суммарно учтённое время по задачам (мс). */
export function totalSpentMs(tasks = []) {
  return tasks.reduce((sum, task) => sum + (Number(task?.spentMs) || 0), 0);
}

/** Суммарное количество отмеченных помодоро по задачам. */
export function totalPomodoros(tasks = []) {
  return tasks.reduce((sum, task) => sum + (Number(task?.pomodoros) || 0), 0);
}

export function isOverdue(task, now = new Date()) {
  if (!task?.due || task.status === 'done') return false;
  return diffDays(now, task.due) < 0;
}

export function isDueToday(task, now = new Date()) {
  return Boolean(task?.due) && task.due === toDateKey(now);
}

export function isUpcoming(task, now = new Date()) {
  if (!task?.due || task.status === 'done') return false;
  return diffDays(now, task.due) > 0;
}

export function taskProgress(task) {
  const subtasks = task?.subtasks || [];
  const total = subtasks.length;
  const done = subtasks.filter((s) => s.done).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

export function matchesQuery(task, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const haystack = [task.title, task.description, ...(task.tags || []), ...(task.subtasks || []).map((s) => s.title)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

/* ------------------------- Фильтрация ------------------------ */

/**
 * @param {Array} tasks
 * @param {{nav?:string,status?:string,priority?:string,category?:string,query?:string,hideDone?:boolean}} filters
 */
export function filterTasks(tasks, filters = {}, now = new Date()) {
  const { nav = 'all', status = 'all', priority = 'all', category = 'all', query = '', hideDone = false } = filters;

  return tasks.filter((task) => {
    if (hideDone && task.status === 'done' && nav !== 'done') return false;
    if (status !== 'all' && task.status !== status) return false;
    if (priority !== 'all' && task.priority !== priority) return false;
    if (category !== 'all' && task.category !== category) return false;
    if (!matchesQuery(task, query)) return false;

    switch (nav) {
      case 'today':
        return isDueToday(task, now);
      case 'upcoming':
        return isUpcoming(task, now);
      case 'overdue':
        return isOverdue(task, now);
      case 'done':
        return task.status === 'done';
      default:
        return true;
    }
  });
}

export function sortTasks(tasks, sortBy = 'smart', now = new Date()) {
  const list = [...tasks];
  const byWeight = (task) => priorityMeta(task.priority).weight;
  const dueValue = (task) => (task.due ? new Date(task.due).getTime() : Number.POSITIVE_INFINITY);

  switch (sortBy) {
    case 'due':
      return list.sort((a, b) => dueValue(a) - dueValue(b) || byWeight(b) - byWeight(a));
    case 'priority':
      return list.sort((a, b) => byWeight(b) - byWeight(a) || dueValue(a) - dueValue(b));
    case 'created':
      return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    case 'manual':
      return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    case 'smart':
    default:
      return list.sort((a, b) => {
        const doneDiff = Number(a.status === 'done') - Number(b.status === 'done');
        if (doneDiff !== 0) return doneDiff;
        const overdueDiff = Number(isOverdue(b, now)) - Number(isOverdue(a, now));
        if (overdueDiff !== 0) return overdueDiff;
        const weightDiff = byWeight(b) - byWeight(a);
        if (weightDiff !== 0) return weightDiff;
        const dueDiff = dueValue(a) - dueValue(b);
        if (dueDiff !== 0 && Number.isFinite(dueDiff)) return dueDiff;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  }
}

/* ------------------------- Статистика ------------------------ */

export function computeStats(tasks, now = new Date()) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const progress = tasks.filter((t) => t.status === 'progress').length;
  const todo = tasks.filter((t) => t.status === 'todo').length;
  const overdue = tasks.filter((t) => isOverdue(t, now)).length;
  const todayDone = tasks.filter((t) => t.completedAt && toDateKey(new Date(t.completedAt)) === toDateKey(now)).length;

  return {
    total,
    todo,
    progress,
    done,
    overdue,
    todayDone,
    percent: total ? Math.round((done / total) * 100) : 0
  };
}

/** Количество выполненных задач по дням за последние `days` дней (включительно). */
export function completionSeries(tasks, days = 7, now = new Date()) {
  const formatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
  const buckets = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    buckets.push({ key: toDateKey(date), label: formatter.format(date).replace('.', ''), value: 0, isToday: i === 0 });
  }

  const index = new Map(buckets.map((bucket, i) => [bucket.key, i]));
  tasks.forEach((task) => {
    if (!task.completedAt) return;
    const key = toDateKey(new Date(task.completedAt));
    const i = index.get(key);
    if (i !== undefined) buckets[i].value += 1;
  });

  return buckets;
}

export function priorityBreakdown(tasks) {
  const total = tasks.length || 1;
  return PRIORITIES.map((priority) => {
    const count = tasks.filter((t) => t.priority === priority.id).length;
    return { ...priority, count, percent: Math.round((count / total) * 100) };
  });
}

export function countByNav(tasks, now = new Date()) {
  return {
    all: tasks.length,
    today: tasks.filter((t) => isDueToday(t, now)).length,
    upcoming: tasks.filter((t) => isUpcoming(t, now)).length,
    overdue: tasks.filter((t) => isOverdue(t, now)).length,
    done: tasks.filter((t) => t.status === 'done').length
  };
}

export function categoryCounts(tasks) {
  const map = new Map();
  tasks.forEach((task) => {
    if (!task.category) return;
    map.set(task.category, (map.get(task.category) || 0) + 1);
  });
  return map;
}

export function groupByStatus(tasks) {
  return STATUSES.map((status) => ({
    ...status,
    tasks: tasks.filter((task) => task.status === status.id)
  }));
}

export function uniqueTags(tasks) {
  const set = new Set();
  tasks.forEach((task) => (task.tags || []).forEach((tag) => set.add(tag)));
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

/* ------------------------- Перемещение ----------------------- */

/** Меняет статус задачи, проставляя время завершения. */
export function applyStatus(task, status, now = new Date()) {
  const next = { ...task, status, updatedAt: now.toISOString() };
  next.completedAt = status === 'done' ? task.completedAt || now.toISOString() : null;
  return next;
}

/**
 * Переставляет задачу в массиве: перед `beforeId` (или в конец).
 * Возвращает новый массив с пересчитанными `order`.
 */
export function reorder(tasks, movedId, beforeId = null) {
  const list = [...tasks];
  const from = list.findIndex((t) => t.id === movedId);
  if (from === -1) return tasks;
  const [moved] = list.splice(from, 1);
  const to = beforeId ? list.findIndex((t) => t.id === beforeId) : -1;
  if (to === -1) list.push(moved);
  else list.splice(to, 0, moved);

  const now = new Date().toISOString();
  return list.map((task, index) => ({
    ...task,
    order: index * 10,
    updatedAt: task.id === movedId ? now : task.updatedAt
  }));
}

