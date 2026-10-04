/**
 * UI помодоро-таймера и учёта времени по задачам.
 *
 * Контроллер держит состояние из core/timer.js, рисует панель в поповере
 * (та же система, что у кастомных селектов) и «раскрашивает» карточки задач.
 * Данные о времени пишутся в задачи через колбэки — модуль не знает про appView.
 */
import {
  MODES,
  MODE_IDS,
  advance,
  durationMs,
  loadTimer,
  pause,
  pauseTrack,
  progress,
  reconcile,
  remainingMs,
  reset,
  saveTimer,
  setMode,
  setSetting,
  start,
  startTrack,
  stopTrack,
  trackedMs
} from '../core/timer.js';
import { totalSpentMs } from '../core/tasks.js';
import { $, $$, el, escapeHtml, formatClock, formatDuration } from '../core/utils.js';
import { attachPopover } from './controls.js';
import { burstConfetti } from './confetti.js';
import { toast, toastInfo } from './toast.js';

const RING_RADIUS = 52;
const RING_C = 2 * Math.PI * RING_RADIUS;
const MAX_FOCUS_TASKS = 6;

/**
 * @param {{
 *   getTasks?:() => Array,
 *   onTaskTime?:(taskId:string, spentMs:number) => void,
 *   onPomodoro?:(taskId:string) => void,
 *   onTaskStarted?:(taskId:string) => void,
 *   onChanged?:() => void
 * }} hooks
 */
export function createTimer({
  getTasks = () => [],
  onTaskTime = () => {},
  onPomodoro = () => {},
  onTaskStarted = () => {},
  onChanged = () => {}
} = {}) {
  let state = loadTimer(null);
  let userId = null;
  let interval = null;
  let panel = null;
  let pop = null;
  let settingsOpen = false;
  let mounted = false;
  let baseTitle = typeof document !== 'undefined' ? document.title : 'TaskFlow';

  /* Ссылки на элементы панели (появляются после buildPanel). */
  let clockEl = null;
  let subEl = null;
  let ringEl = null;
  let startBtn = null;
  let todayEl = null;
  let totalEl = null;
  let trackedEl = null;
  let taskListEl = null;
  let settingsEl = null;
  let focusEl = null;

  const findTask = (id) => (id ? getTasks().find((task) => task.id === id) || null : null);
  const spentOf = (id) => {
    const task = findTask(id);
    return task ? Number(task.spentMs) || 0 : 0;
  };
  const save = () => {
    if (mounted || userId) saveTimer(userId, state);
  };

  /* --------------------- Звук завершения -------------------- */

  let audioCtx = null;

  function beep(kind) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const notes = kind === 'work' ? [880, 1174.66] : [659.25, 523.25];
      notes.forEach((frequency, index) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const at = audioCtx.currentTime + index * 0.17;
        osc.type = 'sine';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.16, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(at);
        osc.stop(at + 0.34);
      });
    } catch {
      /* звук — не критичная часть */
    }
  }

  /* --------------------------- Тик -------------------------- */

  function onTick() {
    const result = reconcile(state, Date.now());
    if (result.state !== state) {
      state = result.state;
      save();
      if (result.finished) finish(result.finished);
      syncPanel();
    }
    paintLive();
    paintCards();
    onChangedIfNeeded();
  }

  /** Статистика (суммарное время) перерисовывается только когда данные меняются. */
  let lastStatsStamp = -1;
  function onChangedIfNeeded() {
    const stamp = getTasks().reduce((sum, task) => sum + (Number(task.spentMs) || 0), 0);
    if (stamp !== lastStatsStamp) {
      lastStatsStamp = stamp;
      onChanged();
    }
  }

  function finish(info) {
    const sound = state.settings.sound;
    if (info.wasWork) {
      if (sound) beep('work');
      const rect = topButton()?.getBoundingClientRect();
      burstConfetti(
        rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        rect ? rect.bottom + 8 : 120,
        { count: 54, power: 10 }
      );
      if (state.focusTaskId) onPomodoro(state.focusTaskId);
      const task = findTask(state.focusTaskId);
      toast({
        title: 'Фокус-сессия завершена! 🍅',
        text: task ? `«${task.title}» — впереди перерыв` : `Помодоро сегодня: ${info.todayCount}`,
        type: 'ok',
        duration: 6000
      });
    } else {
      if (sound) beep('break');
      toast({
        title: 'Перерыв закончился ☕',
        text: 'Возвращаемся к работе — жмите «Старт»',
        type: 'info',
        duration: 5000
      });
    }
    if (state.focusTaskId) onChanged();
  }

  /* ----------------------- Живые надписи -------------------- */

  function topButton() {
    return typeof document === 'undefined' ? null : $('#timer-btn');
  }

  /** Цифры, кольцо, кнопка в шапке и заголовок вкладки. */
  function paintLive() {
    const at = Date.now();
    const left = remainingMs(state, at);
    const clock = formatClock(left);
    const full = durationMs(state.mode, state.settings);
    const idle = !state.running && left >= full;
    const mode = MODES[state.mode];

    const button = topButton();
    if (button) {
      const time = $('#timer-btn-time', button);
      if (time) {
        time.textContent = clock;
        time.hidden = idle;
      }
      button.classList.toggle('is-running', state.running);
      button.dataset.mode = state.mode;
      button.setAttribute(
        'aria-label',
        idle ? 'Помодоро-таймер' : `${mode.label}, осталось ${clock}`
      );
      button.style.setProperty('--p', String(progress(state, at).toFixed(4)));
    }

    if (clockEl) clockEl.textContent = clock;
    if (subEl) subEl.textContent = subLabel();
    if (ringEl) ringEl.style.strokeDashoffset = String(RING_C * (1 - progress(state, at)));
    if (startBtn) {
      startBtn.textContent = state.running ? '⏸ Пауза' : left >= full ? '▶ Старт' : '▶ Продолжить';
      startBtn.classList.toggle('is-paused', state.running);
    }
    if (todayEl) todayEl.textContent = String(state.todayCount);
    if (totalEl) totalEl.textContent = String(state.totalCount);
    if (trackedEl) trackedEl.textContent = `⏱ ${formatDuration(liveTotalMs(), { short: true })}`;

    if (state.running) document.title = `${clock} · ${mode.emoji} ${mode.label} — TaskFlow`;
    else if (document.title !== baseTitle) document.title = baseTitle;
  }

  function subLabel() {
    const settings = state.settings;
    if (state.mode === 'work') {
      const index = Math.min(state.round + 1, settings.rounds);
      return `Фокус · сессия ${index} из ${settings.rounds}`;
    }
    return state.mode === 'long' ? 'Длинный перерыв' : 'Короткий перерыв';
  }

  /** Суммарное учтённое время по всем задачам, включая идущую сессию. */
  function liveTotalMs() {
    return totalSpentMs(getTasks()) + (state.track.startedAt ? Math.max(0, Date.now() - state.track.startedAt) : 0);
  }

  /* -------------------- Отрисовка карточек ------------------ */

  function paintCardTime(card) {
    const task = findTask(card.dataset.id);
    if (!task) return;
    const chip = card.querySelector('[data-track-time]');
    const tracking = state.track.taskId === task.id && Boolean(state.track.startedAt);
    const selected = state.track.taskId === task.id;
    const ms = trackedMs(state, task.spentMs, Date.now());

    if (chip) {
      const visible = ms >= 1000;
      chip.hidden = !visible;
      chip.classList.toggle('is-live', tracking);
      chip.textContent = tracking ? `⏱ ${formatClock(ms)}` : `⏱ ${formatDuration(ms, { short: true })}`;
    }

    const pomo = card.querySelector('[data-pomo]');
    if (pomo) {
      const count = Number(task.pomodoros) || 0;
      pomo.hidden = count === 0;
      pomo.textContent = `🍅 ${count}`;
    }

    card.classList.toggle('is-tracking', tracking);
    if (selected && !tracking) card.classList.add('is-tracking-paused');
    else card.classList.remove('is-tracking-paused');
  }

  function paintCard(card) {
    const tracking = state.track.taskId === card.dataset.id && Boolean(state.track.startedAt);
    const selected = state.track.taskId === card.dataset.id;
    const button = card.querySelector('[data-action="timer"]');
    if (button) {
      button.textContent = tracking ? '⏸' : selected ? '▶' : '▶';
      button.classList.toggle('is-on', tracking);
      button.classList.toggle('is-paused', selected && !tracking);
      button.setAttribute('aria-pressed', String(tracking));
      button.setAttribute(
        'aria-label',
        tracking ? 'Поставить учёт времени на паузу' : selected ? 'Продолжить учёт времени' : 'Начать учёт времени'
      );
    }
    paintCardTime(card);
  }

  /** Раскрашивает все карточки в DOM (после перерисовки списка или доски). */
  function syncCards() {
    if (typeof document === 'undefined') return;
    $$('.task-card').forEach(paintCard);
  }

  function paintCards() {
    if (typeof document === 'undefined') return;
    $$('.task-card').forEach(paintCardTime);
    const hero = $('#hero-time');
    if (hero) hero.textContent = `⏱ ${formatDuration(liveTotalMs(), { short: true })}`;
  }

  function paintAll() {
    paintLive();
    paintCards();
    syncPanel();
    onChangedIfNeeded();
  }

  /* -------------------------- Панель ------------------------ */

  function settingRow(key, label, step) {
    return `
      <div class="timer-field">
        <span class="timer-field__label">${label}</span>
        <span class="timer-field__step">
          <button type="button" class="timer-step" data-setting="${key}" data-step="-${step}"
            aria-label="${label}: меньше">−</button>
          <b id="set-${key}">25</b>
          <button type="button" class="timer-step" data-setting="${key}" data-step="${step}"
            aria-label="${label}: больше">+</button>
        </span>
      </div>`;
  }

  function buildPanel() {
    const node = el('div', { class: 'timer-pop', role: 'dialog', 'aria-label': 'Помодоро-таймер' });
    node.dataset.width = '338';

    node.innerHTML = `
      <div class="timer-pop__head">
        <div class="timer-pop__modes" role="tablist" aria-label="Режим таймера">
          ${MODE_IDS.map(
            (id) => `<button type="button" class="timer-mode" role="tab" data-mode="${id}" aria-selected="false">
              <span aria-hidden="true">${MODES[id].emoji}</span>${id === 'work' ? 'Фокус' : id === 'short' ? 'Перерыв' : 'Длинный'}
            </button>`
          ).join('')}
        </div>
        <button type="button" class="icon-btn icon-btn--sm timer-pop__gear" data-panel="settings"
          aria-label="Настройки таймера" aria-expanded="false" title="Настройки">⚙</button>
      </div>

      <div class="timer-pop__dial" data-mode="work">
        <svg class="timer-ring" viewBox="0 0 120 120" aria-hidden="true">
          <defs>
            <linearGradient id="timerGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#6366f1" />
              <stop offset="55%" stop-color="#a855f7" />
              <stop offset="100%" stop-color="#ec4899" />
            </linearGradient>
          </defs>
          <circle class="timer-ring__track" cx="60" cy="60" r="${RING_RADIUS}" />
          <circle class="timer-ring__value" cx="60" cy="60" r="${RING_RADIUS}" />
        </svg>
        <div class="timer-ring__center">
          <strong id="timer-clock">25:00</strong>
          <small id="timer-sub">Фокус · сессия 1 из 4</small>
        </div>
      </div>

      <div class="timer-pop__controls">
        <button type="button" class="timer-mini" data-timer="reset" title="Сбросить интервал" aria-label="Сбросить интервал">↺</button>
        <button type="button" class="btn btn--primary timer-pop__start" data-timer="toggle">▶ Старт</button>
        <button type="button" class="timer-mini" data-timer="skip" title="Пропустить интервал" aria-label="Пропустить интервал">⏭</button>
      </div>

      <div class="timer-pop__stats">
        <span class="timer-stat">🍅 Сегодня <b id="timer-today">0</b></span>
        <span class="timer-stat">Σ <b id="timer-total">0</b></span>
        <span class="timer-stat timer-stat--time" id="timer-tracked">⏱ 0 мин</span>
      </div>

      <div class="timer-pop__block">
        <p class="timer-pop__label">Фокус на задаче</p>
        <div class="timer-pop__tasks" id="timer-tasklist" role="list"></div>
      </div>

      <div class="timer-pop__settings" id="timer-settings" hidden>
        ${settingRow('work', 'Фокус, мин', 5)}
        ${settingRow('short', 'Перерыв, мин', 5)}
        ${settingRow('long', 'Длинный, мин', 5)}
        ${settingRow('rounds', 'Сессий до длинного', 1)}
        <label class="check check--sm timer-toggle">
          <input type="checkbox" id="timer-autostart" />
          <span class="check__box"></span>
          <span class="check__label">Автостарт интервалов</span>
        </label>
        <label class="check check--sm timer-toggle">
          <input type="checkbox" id="timer-sound" />
          <span class="check__box"></span>
          <span class="check__label">Звук по завершении</span>
        </label>
      </div>

      <p class="timer-pop__hint">▶ на карточке задачи — учёт времени · T — эта панель</p>
    `;

    clockEl = $('#timer-clock', node);
    subEl = $('#timer-sub', node);
    ringEl = $('.timer-ring__value', node);
    startBtn = $('[data-timer="toggle"]', node);
    todayEl = $('#timer-today', node);
    totalEl = $('#timer-total', node);
    trackedEl = $('#timer-tracked', node);
    taskListEl = $('#timer-tasklist', node);
    settingsEl = $('#timer-settings', node);
    focusEl = $('.timer-pop__dial', node);

    node.addEventListener('click', onPanelClick);
    node.addEventListener('change', onPanelChange);
    return node;
  }

  /** Полная синхронизация панели со состоянием (открытие, смена режима и т.п.). */
  function syncPanel() {
    if (!panel) return;

    $$('[data-mode]', panel).forEach((tab) => {
      const active = tab.dataset.mode === state.mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    if (focusEl) {
      focusEl.dataset.mode = state.mode;
      focusEl.style.setProperty('--dial-accent', MODES[state.mode].color);
    }

    if (settingsEl) settingsEl.hidden = !settingsOpen;
    const gear = $('[data-panel="settings"]', panel);
    if (gear) gear.setAttribute('aria-expanded', String(settingsOpen));

    ['work', 'short', 'long', 'rounds'].forEach((key) => {
      const node = $(`#set-${key}`, panel);
      if (node) node.textContent = String(state.settings[key]);
    });

    const auto = $('#timer-autostart', panel);
    if (auto) auto.checked = state.settings.autoStart;
    const sound = $('#timer-sound', panel);
    if (sound) sound.checked = state.settings.sound;

    renderTaskList();
    paintLive();
  }

  function renderTaskList() {
    if (!taskListEl) return;

    const tasks = getTasks()
      .filter((task) => task.status !== 'done')
      .sort(
        (a, b) =>
          (Number(b.pomodoros) || 0) - (Number(a.pomodoros) || 0) ||
          (Number(a.order) || 0) - (Number(b.order) || 0)
      )
      .slice(0, MAX_FOCUS_TASKS);

    const rows = tasks
      .map((task) => {
        const active = state.focusTaskId === task.id;
        const spent = Number(task.spentMs) || 0;
        return `
          <button type="button" class="timer-task${active ? ' is-active' : ''}" data-task="${task.id}"
            role="listitem" aria-pressed="${active}">
            <span class="timer-task__name">${escapeHtml(task.title)}</span>
            ${spent >= 1000 ? `<span class="timer-task__time">${formatDuration(spent, { short: true })}</span>` : ''}
          </button>`;
      })
      .join('');

    taskListEl.innerHTML = `
      <button type="button" class="timer-task${state.focusTaskId ? '' : ' is-active'}" data-task=""
        role="listitem" aria-pressed="${!state.focusTaskId}">
        <span class="timer-task__name">Без привязки к задаче</span>
      </button>
      ${rows || '<p class="timer-pop__empty">Активных задач нет</p>'}
    `;
  }

  function afterStateChange() {
    save();
    paintAll();
  }

  function toggleRun() {
    if (state.running) {
      state = pause(state, Date.now());
      afterStateChange();
      return;
    }
    state = start(state, Date.now());
    afterStateChange();
    toastInfo(state.mode === 'work' ? 'Помодоро запущен 🍅' : 'Перерыв пошёл ☕', subLabel());
  }

  function skipInterval() {
    const next = advance(state, Date.now(), { autoStart: false });
    state = next.state;
    afterStateChange();
    toastInfo('Интервал пропущен', state.mode === 'work' ? 'Возвращаемся к работе' : 'Впереди перерыв');
  }

  function onPanelClick(event) {
    const action = event.target.closest('[data-timer]');
    if (action) {
      const type = action.dataset.timer;
      if (type === 'toggle') toggleRun();
      else if (type === 'reset') {
        state = reset(state);
        afterStateChange();
      } else if (type === 'skip') skipInterval();
      return;
    }

    const mode = event.target.closest('[data-mode]');
    if (mode) {
      state = setMode(state, mode.dataset.mode);
      afterStateChange();
      return;
    }

    const step = event.target.closest('[data-setting]');
    if (step) {
      const key = step.dataset.setting;
      state = setSetting(state, key, Number(state.settings[key]) + Number(step.dataset.step));
      afterStateChange();
      return;
    }

    const task = event.target.closest('[data-task]');
    if (task) {
      state = { ...state, focusTaskId: task.dataset.task || null };
      save();
      syncPanel();
      return;
    }

    if (event.target.closest('[data-panel="settings"]')) {
      settingsOpen = !settingsOpen;
      syncPanel();
    }
  }

  function onPanelChange(event) {
    const input = event.target;
    if (input.id === 'timer-autostart') {
      state = setSetting(state, 'autoStart', input.checked);
      save();
    } else if (input.id === 'timer-sound') {
      state = setSetting(state, 'sound', input.checked);
      save();
    }
  }

  /* ---------------------- Учёт времени ---------------------- */

  let autoPaused = false;

  /** Фиксирует накопленные секунды задачи и ставит учёт на паузу. */
  function flush() {
    if (!state.track.taskId) {
      save();
      return;
    }
    const { state: next, taskId, delta } = pauseTrack(state);
    state = next;
    if (taskId && delta >= 1000) onTaskTime(taskId, spentOf(taskId) + delta);
    save();
  }

  function toggleTask(taskId) {
    const task = findTask(taskId);
    if (!task) return;
    autoPaused = false;

    if (state.track.taskId === taskId) {
      if (state.track.startedAt) {
        const paused = pauseTrack(state);
        state = paused.state;
        if (paused.delta >= 1000) onTaskTime(taskId, spentOf(taskId) + paused.delta);
        save();
        paintAll();
        toastInfo('Учёт времени на паузе', task.title);
      } else {
        state = startTrack(state, taskId);
        save();
        paintAll();
      }
      return;
    }

    // Учёт идёт по другой задаче — сначала закрываем её.
    if (state.track.taskId) {
      const prevId = state.track.taskId;
      const paused = pauseTrack(state);
      state = { ...paused.state, track: { taskId: null, startedAt: null } };
      if (paused.delta >= 1000) onTaskTime(prevId, spentOf(prevId) + paused.delta);
    }

    state = startTrack(state, taskId);
    save();
    paintAll();
    if (task.status === 'todo') onTaskStarted(taskId);
    toast({ title: 'Учёт времени запущен', text: task.title, type: 'info', duration: 2600 });
  }

  /** Забывает задачу (например, её удалили), не начисляя время. */
  function forgetTask(taskId) {
    if (state.track.taskId !== taskId) return;
    state = { ...state, track: { taskId: null, startedAt: null } };
    save();
    paintAll();
  }

  const isTracked = (taskId) => state.track.taskId === taskId && Boolean(state.track.startedAt);

  /* -------------------------- Панель ------------------------ */

  function openPanel() {
    const anchor = topButton();
    if (!anchor) return;
    if (pop) return;
    if (!panel) panel = buildPanel();

    syncPanel();
    anchor.classList.add('is-open');
    anchor.setAttribute('aria-expanded', 'true');
    pop = attachPopover(anchor, panel, {
      onClose: (reason) => {
        pop = null;
        anchor.classList.remove('is-open');
        anchor.setAttribute('aria-expanded', 'false');
        if (reason === 'escape' || reason === 'switch') anchor.focus({ preventScroll: true });
      }
    });
  }

  function closePanel(reason = 'dismiss') {
    pop?.close(reason);
  }

  function togglePanel() {
    if (pop) closePanel();
    else openPanel();
  }

  /* --------------------- Жизненный цикл --------------------- */

  function onVisibilityChange() {
    if (document.hidden) {
      if (state.track.taskId && state.track.startedAt) {
        autoPaused = true;
        flush();
        paintAll();
      }
      save();
      return;
    }
    onTick();
    if (autoPaused && state.track.taskId) {
      autoPaused = false;
      state = startTrack(state, state.track.taskId);
      save();
      paintAll();
    }
  }

  function onPageHide() {
    flush();
  }

  function stopInterval() {
    if (interval) clearInterval(interval);
    interval = null;
  }

  function mount(id) {
    userId = id || null;
    stopInterval();
    state = loadTimer(userId);

    const restored = reconcile(state, Date.now());
    state = restored.state;
    if (restored.finished?.wasWork) {
      if (state.focusTaskId) onPomodoro(state.focusTaskId);
      toast({
        title: 'Помодоро завершён 🍅',
        text: 'Интервал истёк, пока приложение было закрыто',
        type: 'info',
        duration: 5200
      });
    }

    if (state.track.taskId) {
      if (!findTask(state.track.taskId)) {
        state = { ...state, track: { taskId: null, startedAt: null } };
      } else if (state.track.startedAt) {
        // приложение было закрыто — отсчёт начинается заново
        state = startTrack(state, state.track.taskId);
      }
    }

    autoPaused = false;
    mounted = true;
    lastStatsStamp = totalSpentMs(getTasks());
    save();

    interval = setInterval(onTick, 1000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    paintAll();
    return api;
  }

  function unmount() {
    flush();
    stopInterval();
    closePanel('unmount');
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    mounted = false;
    if (typeof document !== 'undefined' && document.title !== baseTitle) document.title = baseTitle;
  }

  function stats() {
    return {
      mode: state.mode,
      running: state.running,
      remaining: remainingMs(state, Date.now()),
      todayCount: state.todayCount,
      totalCount: state.totalCount,
      focusTaskId: state.focusTaskId,
      trackedTaskId: state.track.taskId
    };
  }

  const api = {
    mount,
    unmount,
    toggleTask,
    forgetTask,
    syncCards,
    paintAll,
    isTracked,
    openPanel,
    closePanel,
    togglePanel,
    stats
  };

  return api;
}
