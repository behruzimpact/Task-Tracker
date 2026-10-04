/**
 * Логика помодоро-таймера и учёта времени по задачам.
 *
 * Модуль максимально «чистый»: все операции — функции над состоянием,
 * которые принимают текущее время параметром, поэтому логику легко тестировать
 * (tests/timer.test.mjs). Загрузка/сохранение — тонкая обёртка над storage.js.
 */
import { KEYS, store } from './storage.js';
import { toDateKey } from './utils.js';

export const MODES = {
  work: { id: 'work', label: 'Фокус', emoji: '🎯', color: '#6366f1' },
  short: { id: 'short', label: 'Короткий перерыв', emoji: '☕', color: '#10b981' },
  long: { id: 'long', label: 'Длинный перерыв', emoji: '🌴', color: '#06b6d4' }
};

export const MODE_IDS = ['work', 'short', 'long'];

/** Настройки по умолчанию (минуты). */
export const DEFAULT_SETTINGS = {
  work: 25,
  short: 5,
  long: 15,
  rounds: 4,
  autoStart: true,
  sound: true
};

/** Границы значений, чтобы пользователь не «сломал» таймер из UI. */
export const LIMITS = {
  work: [1, 180],
  short: [1, 60],
  long: [1, 90],
  rounds: [1, 12]
};

const MINUTE = 60 * 1000;
const STALE_MS = 6 * 60 * 60 * 1000; // сессия, «повисшая» дольше 6 часов, не засчитывается

/** Приводит любое представление времени к числу (мс). */
export function toMs(now = Date.now()) {
  if (now instanceof Date) return now.getTime();
  const value = Number(now);
  return Number.isFinite(value) ? value : Date.now();
}

function intInRange(value, [min, max], fallback) {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}

/** Нормализует настройки таймера (в том числе из повреждённого хранилища). */
export function normalizeSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    work: intInRange(source.work, LIMITS.work, DEFAULT_SETTINGS.work),
    short: intInRange(source.short, LIMITS.short, DEFAULT_SETTINGS.short),
    long: intInRange(source.long, LIMITS.long, DEFAULT_SETTINGS.long),
    rounds: intInRange(source.rounds, LIMITS.rounds, DEFAULT_SETTINGS.rounds),
    autoStart: source.autoStart === undefined ? DEFAULT_SETTINGS.autoStart : Boolean(source.autoStart),
    sound: source.sound === undefined ? DEFAULT_SETTINGS.sound : Boolean(source.sound)
  };
}

/** Длительность интервала в мс. */
export function durationMs(mode, settings = DEFAULT_SETTINGS) {
  const key = MODES[mode] ? mode : 'work';
  const minutes = Number(settings?.[key]);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_SETTINGS[key]) * MINUTE;
}

/** Создаёт/восстанавливает состояние таймера. */
export function createTimerState(raw = {}, now = Date.now()) {
  const at = toMs(now);
  const source = raw && typeof raw === 'object' ? raw : {};
  const settings = normalizeSettings(source.settings);
  const mode = MODES[source.mode] ? source.mode : 'work';
  const track = source.track && typeof source.track === 'object' ? source.track : {};

  const state = {
    settings,
    mode,
    round: intInRange(source.round, [0, settings.rounds], 0),
    running: Boolean(source.running),
    endsAt: null,
    remaining: durationMs(mode, settings),
    focusTaskId: source.focusTaskId || null,
    todayKey: typeof source.todayKey === 'string' ? source.todayKey : toDateKey(new Date(at)),
    todayCount: intInRange(source.todayCount, [0, 999], 0),
    totalCount: intInRange(source.totalCount, [0, 99999], 0),
    track: {
      taskId: typeof track.taskId === 'string' ? track.taskId : null,
      startedAt: Number.isFinite(Number(track.startedAt)) ? Number(track.startedAt) : null
    }
  };

  if (Number.isFinite(Number(source.remaining))) {
    state.remaining = Math.min(Math.max(0, Math.round(Number(source.remaining))), durationMs(mode, settings));
  }

  if (state.running) {
    const storedEnds = Number(source.endsAt);
    state.endsAt = Number.isFinite(storedEnds) && storedEnds > 0 ? storedEnds : at + state.remaining;
    state.remaining = Math.max(0, state.endsAt - at);
    if (state.remaining === 0) {
      state.running = false;
      state.endsAt = null;
      state.remaining = 0;
    }
  }

  return state;
}

/** Остаток текущего интервала в мс. */
export function remainingMs(state, now = Date.now()) {
  if (!state?.running) return Math.max(0, Number(state?.remaining) || 0);
  return Math.max(0, (Number(state.endsAt) || 0) - toMs(now));
}

/** Прогресс интервала: 0 — только начали, 1 — закончился. */
export function progress(state, now = Date.now()) {
  const total = durationMs(state.mode, state.settings);
  if (!total) return 0;
  return Math.min(1, Math.max(0, 1 - remainingMs(state, now) / total));
}

/** Запускает интервал. */
export function start(state, now = Date.now()) {
  const at = toMs(now);
  const left = remainingMs(state, at);
  const safe = left > 0 ? left : durationMs(state.mode, state.settings);
  return { ...state, running: true, remaining: safe, endsAt: at + safe };
}

/** Ставит интервал на паузу. */
export function pause(state, now = Date.now()) {
  const at = toMs(now);
  return { ...state, running: false, remaining: remainingMs(state, at), endsAt: null };
}

/** Сбрасывает интервал к полной длительности. */
export function reset(state) {
  return { ...state, running: false, endsAt: null, remaining: durationMs(state.mode, state.settings) };
}

/** Переключает режим (фокус / перерыв) вручную. */
export function setMode(state, mode) {
  if (!MODES[mode]) return state;
  return { ...state, mode, running: false, endsAt: null, remaining: durationMs(mode, state.settings) };
}

/** Меняет настройку: минуты интервалов/цикл (числа) или переключатели. */
export function setSetting(state, key, value) {
  if (Object.prototype.hasOwnProperty.call(LIMITS, key)) {
    const settings = normalizeSettings({ ...state.settings, [key]: value });
    const next = { ...state, settings };
    if (key === state.mode && !state.running) next.remaining = durationMs(state.mode, settings);
    if (key === 'rounds') next.round = Math.min(state.round, settings.rounds);
    return next;
  }
  if (key === 'autoStart' || key === 'sound') {
    return { ...state, settings: { ...state.settings, [key]: Boolean(value) } };
  }
  return state;
}

/** Сбрасывает счётчик «сегодня», если сменились сутки. */
export function rollover(state, now = Date.now()) {
  const key = toDateKey(new Date(toMs(now)));
  if (state.todayKey === key) return state;
  return { ...state, todayKey: key, todayCount: 0 };
}

/**
 * Завершает текущий интервал и переходит к следующему:
 * фокус → перерыв (каждый `rounds`-й — длинный), перерыв → фокус.
 * @returns {{state:object, finished:{mode:string, wasWork:boolean, nextMode:string, count:number}|null}}
 */
export function advance(state, now = Date.now(), { autoStart } = {}) {
  const at = toMs(now);
  const current = rollover(state, at);
  const settings = current.settings;
  const wasWork = current.mode === 'work';
  const round = wasWork ? current.round + 1 : 0;
  const nextMode = wasWork ? (round % settings.rounds === 0 ? 'long' : 'short') : 'work';

  let next = {
    ...current,
    mode: nextMode,
    round,
    running: false,
    endsAt: null,
    remaining: durationMs(nextMode, settings),
    todayCount: wasWork ? current.todayCount + 1 : current.todayCount,
    totalCount: wasWork ? current.totalCount + 1 : current.totalCount
  };

  const auto = autoStart === undefined ? settings.autoStart : Boolean(autoStart);
  if (auto) next = start(next, at);

  return {
    state: next,
    finished: { mode: current.mode, wasWork, nextMode, todayCount: next.todayCount }
  };
}

/**
 * Догоняет реальное время после перезагрузки или сна компьютера:
 * завершает интервал, если он истёк, пока приложение было закрыто.
 * «Зависшие» дольше 6 часов интервалы просто сбрасываются без начисления.
 */
export function reconcile(state, now = Date.now()) {
  const at = toMs(now);
  const current = rollover(state, at);
  if (!current.running) return { state: current, finished: null };

  if (remainingMs(current, at) > 0) return { state: current, finished: null };

  const expiredFor = Math.max(0, at - (Number(current.endsAt) || at));
  const base = { ...current, running: false, endsAt: null, remaining: 0 };
  if (expiredFor > STALE_MS) return { state: reset(base), finished: null };

  return advance(base, at);
}

/* ---------------------- Учёт времени задачи -------------------- */

/** Начинает учёт времени для задачи. */
export function startTrack(state, taskId, now = Date.now()) {
  if (!taskId) return state;
  if (state.track.taskId === taskId && state.track.startedAt) return state;
  return { ...state, track: { taskId, startedAt: toMs(now) } };
}

/**
 * Останавливает учёт времени.
 * @returns {{state:object, taskId:string|null, delta:number}} delta — «новые» мс,
 * которые нужно прибавить к задаче.
 */
export function stopTrack(state, now = Date.now()) {
  const at = toMs(now);
  const { taskId, startedAt } = state.track;
  const delta = startedAt ? Math.max(0, at - startedAt) : 0;
  return { state: { ...state, track: { taskId: null, startedAt: null } }, taskId, delta };
}

/**
 * Ставит учёт времени на паузу, сохраняя выбранную задачу.
 * Повторный вызов startTrack после этого продолжит отсчёт.
 * @returns {{state:object, taskId:string|null, delta:number}}
 */
export function pauseTrack(state, now = Date.now()) {
  const { state: base, taskId, delta } = stopTrack(state, now);
  if (!taskId) return { state: base, taskId: null, delta: 0 };
  return { state: { ...base, track: { taskId, startedAt: null } }, taskId, delta };
}

/** Сколько всего времени набежало по задаче: сохранённое + текущая сессия. */
export function trackedMs(state, baseMs = 0, now = Date.now()) {
  const extra = state?.track?.startedAt ? Math.max(0, toMs(now) - state.track.startedAt) : 0;
  return Math.max(0, Number(baseMs) || 0) + extra;
}

/* -------------------------- Хранилище ------------------------- */

/** Загружает состояние таймера пользователя (с нормализацией). */
export function loadTimer(userId, now = Date.now()) {
  const raw = userId ? store.get(KEYS.timer(userId), null) : null;
  return createTimerState(raw && typeof raw === 'object' ? raw : {}, now);
}

/** Сохраняет состояние таймера пользователя. */
export function saveTimer(userId, state) {
  if (userId) store.set(KEYS.timer(userId), state);
  return state;
}
