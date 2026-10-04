/**
 * Автотесты помодоро-таймера и учёта времени по задачам.
 * Подменяем window.localStorage, чтобы проверить сохранение состояния.
 * Запуск: npm test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

function createStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
    clear: () => map.clear()
  };
}

globalThis.window = {
  localStorage: createStorage(),
  sessionStorage: createStorage()
};

const { formatClock, formatDuration } = await import('../src/js/core/utils.js');
const { createTask, totalPomodoros, totalSpentMs } = await import('../src/js/core/tasks.js');
const timer = await import('../src/js/core/timer.js');

const T0 = new Date(2026, 8, 27, 12, 0, 0).getTime(); // 27 сентября 2026, локальное время
const SET = { work: 25, short: 5, long: 15, rounds: 4, autoStart: false, sound: true };

/* ----------------------- Форматирование ---------------------- */

test('форматирование длительности и таймера', () => {
  assert.equal(formatClock(25 * 60000), '25:00');
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(3723000), '1:02:03');
  assert.equal(formatClock(-5000), '00:00');

  assert.equal(formatDuration(0), '0 с');
  assert.equal(formatDuration(45000), '45 с');
  assert.equal(formatDuration(90 * 1000), '1 мин');
  assert.equal(formatDuration(25 * 60000), '25 мин');
  assert.equal(formatDuration(85 * 60000), '1 ч 25 мин');
  assert.equal(formatDuration(120 * 60000), '2 ч');
  assert.equal(formatDuration(85 * 60000, { short: true }), '1ч 25м');
});

test('createTask хранит учтённое время и помодоро', () => {
  const task = createTask({ title: 'Писать код', spentMs: 61000.4, pomodoros: 3.6 }, new Date(T0));
  assert.equal(task.spentMs, 61000);
  assert.equal(task.pomodoros, 4);

  const empty = createTask({ title: 'Пусто', spentMs: -5, pomodoros: 'abc' }, new Date(T0));
  assert.equal(empty.spentMs, 0);
  assert.equal(empty.pomodoros, 0);

  assert.equal(totalSpentMs([task, empty]), 61000);
  assert.equal(totalPomodoros([task, empty]), 4);
});

/* ------------------------- Состояние ------------------------- */

test('createTimerState: значения по умолчанию и нормализация мусора', () => {
  const fresh = timer.createTimerState({}, T0);
  assert.equal(fresh.mode, 'work');
  assert.equal(fresh.running, false);
  assert.equal(fresh.remaining, 25 * 60000);
  assert.equal(fresh.round, 0);
  assert.equal(fresh.todayCount, 0);
  assert.equal(fresh.totalCount, 0);
  assert.equal(fresh.track.taskId, null);
  assert.equal(fresh.todayKey, '2026-09-27');
  assert.equal(timer.durationMs('long', timer.DEFAULT_SETTINGS), 15 * 60000);

  const broken = timer.createTimerState(
    { mode: 'нет-такого', settings: { work: 'x', rounds: 99 }, todayCount: -3, track: { taskId: 5 } },
    T0
  );
  assert.equal(broken.mode, 'work');
  assert.equal(broken.settings.work, 25);
  assert.equal(broken.settings.rounds, 12);
  assert.equal(broken.todayCount, 0);
  assert.equal(broken.track.taskId, null);
});

test('start/pause/reset управляют остатком и прогрессом', () => {
  let state = timer.createTimerState({ settings: SET }, T0);
  state = timer.start(state, T0);
  assert.equal(state.running, true);
  assert.equal(state.endsAt, T0 + 25 * 60000);

  assert.equal(timer.remainingMs(state, T0 + 10 * 60000), 15 * 60000);
  assert.equal(timer.progress(state, T0 + 10 * 60000), 0.4);
  assert.equal(timer.progress(state, T0 + 99 * 60000), 1);

  state = timer.pause(state, T0 + 10 * 60000);
  assert.equal(state.running, false);
  assert.equal(state.remaining, 15 * 60000);
  assert.equal(state.endsAt, null);
  assert.equal(timer.remainingMs(state, T0 + 20 * 60000), 15 * 60000);

  state = timer.reset(state, T0);
  assert.equal(state.remaining, 25 * 60000);
  assert.equal(state.mode, 'work');
});

test('setMode и setSetting меняют режим, минуты и ограничения', () => {
  let state = timer.createTimerState({ settings: SET }, T0);
  state = timer.start(state, T0);
  state = timer.setMode(state, 'short');
  assert.equal(state.mode, 'short');
  assert.equal(state.running, false);
  assert.equal(state.remaining, 5 * 60000);

  state = timer.setSetting(state, 'short', 10);
  assert.equal(state.settings.short, 10);
  assert.equal(state.remaining, 10 * 60000);

  state = timer.setSetting(state, 'short', 999);
  assert.equal(state.settings.short, 60, 'значение ограничено сверху');

  state = timer.setSetting(state, 'short', 'abc');
  assert.equal(state.settings.short, 5, 'нечисловое значение откатывается к значению по умолчанию');

  state = timer.setSetting(state, 'sound', 0);
  assert.equal(state.settings.sound, false);
  assert.equal(timer.setSetting(state, 'unknown', 5), state);
});

/* --------------------- Смена интервалов ---------------------- */

test('advance: фокус → короткий перерыв, каждый 4-й → длинный, перерыв → фокус', () => {
  const first = timer.advance(timer.createTimerState({ settings: SET }, T0), T0);
  assert.equal(first.finished.wasWork, true);
  assert.equal(first.finished.mode, 'work');
  assert.equal(first.state.mode, 'short');
  assert.equal(first.state.todayCount, 1);
  assert.equal(first.state.totalCount, 1);
  assert.equal(first.state.round, 1);
  assert.equal(first.state.running, false, 'autoStart выключен — следующий интервал ждёт кнопки');

  const back = timer.advance(first.state, T0).state;
  assert.equal(back.mode, 'work');
  assert.equal(back.round, 0);
  assert.equal(back.todayCount, 1, 'перерыв не увеличивает счётчик помодоро');

  const long = timer.advance(timer.createTimerState({ settings: SET, round: 3 }, T0), T0).state;
  assert.equal(long.mode, 'long', 'четвёртая фокус-сессия завершает цикл');
  assert.equal(long.round, 4);
});

test('advance с autoStart сразу запускает следующий интервал', () => {
  const settings = { ...SET, autoStart: true };
  const next = timer.advance(timer.createTimerState({ settings }, T0), T0).state;
  assert.equal(next.running, true);
  assert.equal(next.mode, 'short');
  assert.equal(next.endsAt, T0 + 5 * 60000);
});

test('rollover сбрасывает счётчик «сегодня» при смене суток', () => {
  const state = timer.createTimerState({ todayKey: '2000-01-01', todayCount: 7, totalCount: 9 }, T0);
  const fresh = timer.rollover(state, T0);
  assert.equal(fresh.todayCount, 0);
  assert.equal(fresh.totalCount, 9);
  assert.equal(fresh.todayKey, '2026-09-27');
  assert.equal(timer.rollover(fresh, T0), fresh, 'в те же сутки состояние не меняется');
});

test('reconcile завершает истёкший интервал и сбрасывает «зависший»', () => {
  const base = timer.createTimerState({ settings: SET }, T0);
  const running = { ...base, running: true, endsAt: T0 + 60000, remaining: 60000 };

  assert.equal(timer.reconcile(running, T0 + 30000).finished, null, 'интервал ещё идёт');

  const done = timer.reconcile(running, T0 + 61000);
  assert.equal(done.finished.wasWork, true);
  assert.equal(done.state.mode, 'short');
  assert.equal(done.state.todayCount, 1);

  const stale = { ...running, endsAt: T0 - 8 * 3600 * 1000 };
  const skipped = timer.reconcile(stale, T0);
  assert.equal(skipped.finished, null, 'слишком старая сессия не засчитывается');
  assert.equal(skipped.state.mode, 'work');
  assert.equal(skipped.state.running, false);
  assert.equal(skipped.state.remaining, 25 * 60000);
});

/* ---------------------- Учёт времени ------------------------- */

test('учёт времени по задаче: старт, стоп и накопление', () => {
  let state = timer.createTimerState({ settings: SET }, T0);
  assert.equal(timer.trackedMs(state, 0, T0), 0);

  state = timer.startTrack(state, 'task_1', T0);
  assert.equal(state.track.taskId, 'task_1');
  assert.equal(timer.trackedMs(state, 5000, T0 + 30000), 35000);

  const stopped = timer.stopTrack(state, T0 + 30000);
  assert.equal(stopped.taskId, 'task_1');
  assert.equal(stopped.delta, 30000);
  assert.equal(stopped.state.track.taskId, null);
  assert.equal(stopped.state.track.startedAt, null);
  assert.equal(timer.trackedMs(stopped.state, 5000, T0 + 90000), 5000, 'после остановки время не растёт');

  const again = timer.startTrack(state, 'task_1', T0 + 10000);
  assert.equal(again.track.startedAt, T0, 'повторный старт той же задачи не сбрасывает отсчёт');
  assert.equal(timer.startTrack(state, '', T0), state);
});

test('pauseTrack останавливает отсчёт, но не теряет выбранную задачу', () => {
  const running = timer.startTrack(timer.createTimerState({ settings: SET }, T0), 'task_2', T0);
  const paused = timer.pauseTrack(running, T0 + 60000);

  assert.equal(paused.taskId, 'task_2');
  assert.equal(paused.delta, 60000);
  assert.equal(paused.state.track.taskId, 'task_2');
  assert.equal(paused.state.track.startedAt, null);
  assert.equal(timer.trackedMs(paused.state, 0, T0 + 200000), 0, 'после паузы ничего не капает');

  const resumed = timer.startTrack(paused.state, 'task_2', T0 + 200000);
  assert.equal(resumed.track.startedAt, T0 + 200000);
  assert.equal(timer.trackedMs(resumed, 60000, T0 + 260000), 120000);

  const empty = timer.pauseTrack(timer.createTimerState({ settings: SET }, T0), T0);
  assert.equal(empty.taskId, null);
  assert.equal(empty.delta, 0);
});

/* ------------------------- Хранилище ------------------------- */

test('saveTimer/loadTimer сохраняют состояние пользователя', () => {
  const state = timer.start(timer.createTimerState({ settings: { ...SET, work: 30 }, todayCount: 2 }, T0), T0);
  timer.saveTimer('user_timer', state);

  const restored = timer.loadTimer('user_timer', T0 + 60000);
  assert.equal(restored.settings.work, 30);
  assert.equal(restored.todayCount, 2);
  assert.equal(restored.running, true);
  assert.equal(timer.remainingMs(restored, T0 + 60000), 30 * 60000 - 60000);

  const missing = timer.loadTimer('user_without_timer', T0);
  assert.equal(missing.mode, 'work');
  assert.equal(missing.running, false);

  assert.equal(timer.loadTimer(null, T0).running, false, 'без пользователя состояние не читается');
});
