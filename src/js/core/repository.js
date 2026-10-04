/**
 * Данные пользователя: задачи и категории.
 * Операции над «базой» — чистые функции (удобно тестировать), а загрузка
 * и сохранение в localStorage вынесены отдельно.
 */
import { KEYS, store } from './storage.js';
import { applyStatus, createTask, reorder } from './tasks.js';
import { toDateKey, uid } from './utils.js';

export const CATEGORY_COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f97316', '#8b5cf6'];

export const DEFAULT_CATEGORIES = [
  { id: 'work', label: 'Работа', emoji: '🚀', color: '#6366f1' },
  { id: 'personal', label: 'Личное', emoji: '🌿', color: '#10b981' },
  { id: 'study', label: 'Учёба', emoji: '📚', color: '#f59e0b' },
  { id: 'health', label: 'Здоровье', emoji: '💪', color: '#ec4899' },
  { id: 'ideas', label: 'Идеи', emoji: '💡', color: '#06b6d4' }
];

function defaultCategories() {
  return DEFAULT_CATEGORIES.map((category) => ({ ...category }));
}

/** Стартовый набор задач: показывает возможности приложения. */
export function welcomeTasks(now = new Date()) {
  const shift = (days) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    return toDateKey(date);
  };

  const inputs = [
    {
      title: 'Освоиться в TaskFlow ✨',
      description: 'Отметьте подзадачи ниже, чтобы увидеть прогресс на карточке.',
      priority: 'high',
      category: 'work',
      due: shift(0),
      tags: ['старт'],
      subtasks: [
        { title: 'Создать свою задачу кнопкой «Новая задача»' },
        { title: 'Перетащить задачу на канбан-доске', done: false },
        { title: 'Посмотреть статистику недели', done: true }
      ]
    },
    {
      title: 'Спланировать неделю 🗓️',
      description: 'Разложите дела по приоритетам и категориям.',
      priority: 'medium',
      category: 'personal',
      due: shift(2),
      tags: ['планирование'],
      subtasks: []
    },
    {
      title: 'Программа тренировок 💪',
      description: 'Три занятия в неделю — и результат не заставит себя ждать.',
      priority: 'low',
      category: 'health',
      due: shift(5),
      tags: ['здоровье', 'спорт'],
      subtasks: []
    }
  ];

  return inputs.map((input, index) => createTask({ ...input, order: index * 10 }, now));
}

export function emptyDb() {
  return { tasks: welcomeTasks(), categories: defaultCategories(), version: 1, seeded: true };
}

export function loadData(userId) {
  const stored = store.get(KEYS.data(userId), null);
  if (!stored || typeof stored !== 'object') {
    const fresh = emptyDb();
    store.set(KEYS.data(userId), fresh);
    return fresh;
  }
  return {
    tasks: Array.isArray(stored.tasks) ? stored.tasks : [],
    categories: Array.isArray(stored.categories) && stored.categories.length ? stored.categories : defaultCategories(),
    version: stored.version || 1,
    seeded: Boolean(stored.seeded)
  };
}

export function saveData(userId, db) {
  store.set(KEYS.data(userId), db);
  return db;
}

/* --------------------------- Задачи -------------------------- */

export function addTask(db, input) {
  const task = createTask(input);
  const minOrder = db.tasks.reduce((min, t) => Math.min(min, t.order ?? 0), Number.POSITIVE_INFINITY);
  task.order = Number.isFinite(minOrder) ? minOrder - 10 : 0;
  return { ...db, tasks: [task, ...db.tasks] };
}

export function updateTask(db, id, patch) {
  return {
    ...db,
    tasks: db.tasks.map((task) => (task.id === id ? createTask({ ...task, ...patch }, new Date()) : task))
  };
}

export function removeTask(db, id) {
  return { ...db, tasks: db.tasks.filter((task) => task.id !== id) };
}

export function setStatus(db, id, status) {
  return {
    ...db,
    tasks: db.tasks.map((task) => (task.id === id ? applyStatus(task, status) : task))
  };
}

export function toggleDone(db, id) {
  const task = db.tasks.find((t) => t.id === id);
  if (!task) return db;
  return setStatus(db, id, task.status === 'done' ? 'todo' : 'done');
}

export function reorderTask(db, movedId, beforeId = null) {
  return { ...db, tasks: reorder(db.tasks, movedId, beforeId) };
}

export function clearCompleted(db) {
  return { ...db, tasks: db.tasks.filter((task) => task.status !== 'done') };
}

/* ------------------------- Категории ------------------------- */

export function addCategory(db, { label, color } = {}) {
  const name = String(label || '').trim();
  if (!name) return db;
  if (db.categories.some((c) => c.label.toLowerCase() === name.toLowerCase())) return db;

  const palette = CATEGORY_COLORS;
  const category = {
    id: uid('cat'),
    label: name.slice(0, 20),
    emoji: '🏷️',
    color: color || palette[db.categories.length % palette.length]
  };
  return { ...db, categories: [...db.categories, category] };
}

export function removeCategory(db, id) {
  return {
    ...db,
    categories: db.categories.filter((c) => c.id !== id),
    tasks: db.tasks.map((task) => (task.category === id ? { ...task, category: null } : task))
  };
}

export function findCategory(db, id) {
  return db.categories.find((c) => c.id === id) || null;
}
