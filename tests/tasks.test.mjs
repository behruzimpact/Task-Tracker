/**
 * Автотесты чистой логики: даты/утилиты, модель задач, статистика.
 * Запуск: npm test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { animateNumber, diffDays, dueLabel, escapeHtml, formatDateRu, parseDateKey, plural, toDateKey } from '../src/js/core/utils.js';
import {
  applyStatus,
  completionSeries,
  computeStats,
  countByNav,
  createTask,
  filterTasks,
  priorityBreakdown,
  reorder,
  sortTasks,
  taskProgress
} from '../src/js/core/tasks.js';

const NOW = new Date(2026, 8, 27, 12, 0, 0); // 27 сентября 2026, локальное время

function makeTask(overrides = {}) {
  return createTask({ title: 'Задача', ...overrides }, NOW);
}

test('даты: toDateKey и parseDateKey работают без сдвига часового пояса', () => {
  assert.equal(toDateKey(new Date(2026, 0, 5)), '2026-01-05');
  const parsed = parseDateKey('2026-01-05');
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 0);
  assert.equal(parsed.getDate(), 5);
  assert.equal(parseDateKey(''), null);
});

test('даты: diffDays считает целые дни между датами', () => {
  assert.equal(diffDays(new Date(2026, 8, 27), new Date(2026, 8, 27)), 0);
  assert.equal(diffDays(new Date(2026, 8, 27), new Date(2026, 8, 30)), 3);
  assert.equal(diffDays(new Date(2026, 8, 27), new Date(2026, 8, 25)), -2);
});

test('dueLabel возвращает понятные подписи и тон', () => {
  assert.equal(dueLabel('2026-09-27', NOW).text, 'Сегодня');
  assert.equal(dueLabel('2026-09-27', NOW).tone, 'warn');
  assert.equal(dueLabel('2026-09-28', NOW).text, 'Завтра');
  assert.equal(dueLabel('2026-09-26', NOW).tone, 'danger');
  assert.equal(dueLabel('2026-09-24', NOW).text, 'Просрочено на 3 дня');
  assert.equal(dueLabel(null, NOW), null);
});

test('plural подбирает правильную форму слова', () => {
  assert.equal(plural(1, 'задача', 'задачи', 'задач'), 'задача');
  assert.equal(plural(3, 'задача', 'задачи', 'задач'), 'задачи');
  assert.equal(plural(11, 'задача', 'задачи', 'задач'), 'задач');
  assert.equal(plural(22, 'задача', 'задачи', 'задач'), 'задачи');
});

test('formatDateRu и escapeHtml корректны', () => {
  assert.match(formatDateRu('2026-09-27'), /27 сентября/);
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});

test('createTask нормализует входные данные', () => {
  const task = createTask(
    {
      title: '  Сделать отчёт  ',
      priority: 'нечто',
      status: 'unknown',
      tags: ['#a', 'a', 'b', '', 'c'],
      subtasks: [{ title: ' шаг ' }, { title: '' }]
    },
    NOW
  );

  assert.equal(task.title, 'Сделать отчёт');
  assert.equal(task.priority, 'medium');
  assert.equal(task.status, 'todo');
  assert.deepEqual(task.tags, ['#a', 'a', 'b', 'c']);
  assert.equal(task.subtasks.length, 1);
  assert.equal(task.subtasks[0].title, 'шаг');
  assert.equal(task.completedAt, null);
  assert.ok(task.id.startsWith('task_'));
});

test('taskProgress считает выполненные подзадачи', () => {
  const task = makeTask({ subtasks: [{ title: 'a', done: true }, { title: 'b' }] });
  assert.deepEqual(taskProgress(task), { done: 1, total: 2, percent: 50 });
  assert.deepEqual(taskProgress(makeTask()), { done: 0, total: 0, percent: 0 });
});

test('filterTasks: навигация по датам и статусам', () => {
  const tasks = [
    makeTask({ title: 'Сегодня', due: '2026-09-27' }),
    makeTask({ title: 'Завтра', due: '2026-09-28' }),
    makeTask({ title: 'Просрочена', due: '2026-09-20' }),
    makeTask({ title: 'Готово', status: 'done', completedAt: NOW.toISOString() })
  ];

  assert.equal(filterTasks(tasks, { nav: 'all' }, NOW).length, 4);
  assert.deepEqual(filterTasks(tasks, { nav: 'today' }, NOW).map((t) => t.title), ['Сегодня']);
  assert.deepEqual(filterTasks(tasks, { nav: 'upcoming' }, NOW).map((t) => t.title), ['Завтра']);
  assert.deepEqual(filterTasks(tasks, { nav: 'overdue' }, NOW).map((t) => t.title), ['Просрочена']);
  assert.deepEqual(filterTasks(tasks, { nav: 'done' }, NOW).map((t) => t.title), ['Готово']);
});

test('filterTasks: комбинация фильтров, поиск и скрытие выполненных', () => {
  const tasks = [
    makeTask({ title: 'Купить хлеб', category: 'personal', priority: 'low', tags: ['дом'] }),
    makeTask({ title: 'Отчёт для клиента', category: 'work', priority: 'high' }),
    makeTask({ title: 'Созвон', category: 'work', priority: 'high', status: 'done', completedAt: NOW.toISOString() })
  ];

  assert.equal(filterTasks(tasks, { priority: 'high' }, NOW).length, 2);
  assert.equal(filterTasks(tasks, { category: 'work' }, NOW).length, 2);
  assert.equal(filterTasks(tasks, { status: 'done' }, NOW).length, 1);
  assert.equal(filterTasks(tasks, { query: 'хлеб' }, NOW).length, 1);
  assert.equal(filterTasks(tasks, { query: 'дом' }, NOW).length, 1);
  assert.equal(filterTasks(tasks, { hideDone: true }, NOW).length, 2);
});

test('sortTasks: приоритет, дедлайн и алфавит', () => {
  const low = makeTask({ title: 'Б', priority: 'low', due: '2026-09-27' });
  const high = makeTask({ title: 'А', priority: 'high', due: '2026-09-30' });
  const urgent = makeTask({ title: 'В', priority: 'urgent', due: '2026-10-05' });

  assert.deepEqual(sortTasks([low, high, urgent], 'priority', NOW).map((t) => t.title), ['В', 'А', 'Б']);
  assert.deepEqual(sortTasks([high, urgent, low], 'due', NOW).map((t) => t.title), ['Б', 'А', 'В']);
  assert.deepEqual(sortTasks([low, high, urgent], 'title', NOW).map((t) => t.title), ['А', 'Б', 'В']);
});

test('sortTasks: умная сортировка выводит просроченные наверх, выполненные — вниз', () => {
  const done = makeTask({ title: 'Готово', status: 'done', completedAt: NOW.toISOString() });
  const overdue = makeTask({ title: 'Просрочено', due: '2026-09-01', priority: 'low' });
  const normal = makeTask({ title: 'Обычная', due: '2026-09-28', priority: 'medium' });

  const sorted = sortTasks([done, normal, overdue], 'smart', NOW).map((task) => task.title);
  assert.equal(sorted[0], 'Просрочено');
  assert.equal(sorted[sorted.length - 1], 'Готово');
});

test('computeStats и countByNav считают показатели', () => {
  const tasks = [
    makeTask({ title: 'A', status: 'todo' }),
    makeTask({ title: 'B', status: 'progress' }),
    makeTask({ title: 'C', status: 'done', completedAt: NOW.toISOString() }),
    makeTask({ title: 'D', due: '2026-09-10' })
  ];

  const stats = computeStats(tasks, NOW);
  assert.equal(stats.total, 4);
  assert.equal(stats.todo, 2);
  assert.equal(stats.progress, 1);
  assert.equal(stats.done, 1);
  assert.equal(stats.overdue, 1);
  assert.equal(stats.todayDone, 1);
  assert.equal(stats.percent, 25);

  const counts = countByNav(tasks, NOW);
  assert.equal(counts.all, 4);
  assert.equal(counts.done, 1);
  assert.equal(counts.overdue, 1);
});

test('completionSeries строит 7 дней и раскладывает завершённые задачи', () => {
  const tasks = [
    makeTask({ title: 'Сегодня', status: 'done', completedAt: NOW.toISOString() }),
    makeTask({ title: 'Три дня назад', status: 'done', completedAt: new Date(2026, 8, 24, 10, 0, 0).toISOString() })
  ];

  const series = completionSeries(tasks, 7, NOW);
  assert.equal(series.length, 7);
  assert.equal(series[6].value, 1);
  assert.equal(series[6].isToday, true);
  assert.equal(series[3].value, 1);
  assert.equal(
    series.reduce((sum, item) => sum + item.value, 0),
    2
  );
});

test('priorityBreakdown считает долю каждого приоритета', () => {
  const tasks = [makeTask({ priority: 'high' }), makeTask({ priority: 'high' }), makeTask({ priority: 'low' })];
  const breakdown = priorityBreakdown(tasks);
  const high = breakdown.find((item) => item.id === 'high');
  assert.equal(high.count, 2);
  assert.equal(high.percent, 67);
});

test('applyStatus проставляет и сбрасывает completedAt', () => {
  const task = makeTask({ title: 'Тест' });
  const done = applyStatus(task, 'done', NOW);
  assert.equal(done.status, 'done');
  assert.equal(done.completedAt, NOW.toISOString());

  const back = applyStatus(done, 'todo', NOW);
  assert.equal(back.completedAt, null);
});

test('reorder переставляет задачу и пересчитывает порядок', () => {
  const a = makeTask({ title: 'A', order: 0 });
  const b = makeTask({ title: 'B', order: 10 });
  const c = makeTask({ title: 'C', order: 20 });

  const moved = reorder([a, b, c], c.id, a.id);
  assert.deepEqual(moved.map((task) => task.title), ['C', 'A', 'B']);
  assert.deepEqual(moved.map((task) => task.order), [0, 10, 20]);

  const toEnd = reorder([a, b, c], a.id, null);
  assert.deepEqual(toEnd.map((task) => task.title), ['B', 'C', 'A']);
});

test('animateNumber: пишет число, не затирает data-value и не показывает NaN', () => {
  globalThis.window = { matchMedia: () => ({ matches: true }) };

  // В разметке data-value — это ключ элемента («total»), а не число.
  const node = { dataset: { value: 'total' }, textContent: '0' };

  animateNumber(node, 5);
  assert.equal(String(node.textContent), '5');
  assert.equal(node.dataset.value, 'total', 'ключ элемента не должен перезаписываться');
  assert.equal(node.dataset.animValue, '5');

  animateNumber(node, 7);
  assert.equal(String(node.textContent), '7');
  assert.equal(node.dataset.value, 'total');

  // undefined и NaN трактуются как 0 — «NaN» в интерфейсе появиться не может.
  animateNumber(node, undefined);
  assert.equal(String(node.textContent), '0');
  animateNumber(node, Number.NaN);
  assert.equal(String(node.textContent), '0');

  const ring = { dataset: {}, textContent: '0%' };
  animateNumber(ring, 42, { format: (value) => `${Math.round(value)}%` });
  assert.equal(ring.textContent, '42%');

  delete globalThis.window;
});


