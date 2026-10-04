/**
 * Отрисовка статистики: карточки, прогресс-кольцо, график недели, приоритеты.
 */
import { $, $$, animateNumber, formatDuration } from '../core/utils.js';

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const TRENDS = {
  total: (stats) => ({ text: `${stats.todo + stats.progress} в работе`, tone: '' }),
  progress: (stats) => ({ text: stats.progress ? 'идёт сейчас' : 'нет активных', tone: stats.progress ? '' : 'is-up' }),
  done: (stats) => ({ text: `${stats.percent}% от всех`, tone: stats.percent >= 50 ? 'is-up' : '' }),
  overdue: (stats) => ({ text: stats.overdue ? 'нужно разобрать' : 'всё под контролем', tone: stats.overdue ? 'is-down' : 'is-up' })
};

export function renderStats(stats, previous = null) {
  const values = { total: stats.total, progress: stats.progress, done: stats.done, overdue: stats.overdue };

  Object.entries(values).forEach(([key, value]) => {
    animateNumber($(`[data-value="${key}"]`), value);

    const card = $(`.stat-card[data-stat="${key}"]`);
    if (card && previous && previous[key] !== value) {
      card.classList.remove('is-bump');
      void card.offsetWidth;
      card.classList.add('is-bump');
    }

    const trend = $(`[data-trend="${key}"]`);
    if (trend) {
      const { text, tone } = TRENDS[key](stats);
      trend.textContent = text;
      trend.className = `stat-card__trend ${tone}`.trim();
    }
  });

  // Учтённое время по задачам — показываем в человекочитаемом виде «1ч 25м».
  const spentNode = $('[data-value="time"]');
  if (spentNode) {
    const spent = Number(stats.spentMs) || 0;
    animateNumber(spentNode, spent, { format: (value) => formatDuration(value, { short: true }) });

    const card = $('.stat-card[data-stat="time"]');
    if (card && previous && previous.spentMs !== undefined && previous.spentMs !== spent) {
      card.classList.remove('is-bump');
      void card.offsetWidth;
      card.classList.add('is-bump');
    }

    const trend = $('#trend-time');
    if (trend) {
      trend.textContent = spent >= 60000 ? 'задачам' : 'пока пусто';
      trend.className = `stat-card__trend${spent >= 60000 ? ' is-up' : ''}`.trim();
    }
  }
}

/** Сводка под диаграммой приоритетов: помодоро и суммарное время. */
export function renderTimeSummary({ spentMs = 0, pomodoros = 0 } = {}) {
  const box = $('#time-summary');
  if (!box) return;
  box.innerHTML = `🍅 <b>${pomodoros}</b> помодоро · ⏱ <b>${formatDuration(spentMs, { short: true })}</b> учтено`;
}

export function renderRing(percent) {
  const circle = $('#ring-value');
  if (circle) circle.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - percent / 100));
  animateNumber($('#ring-percent'), percent, { format: (value) => `${Math.round(value)}%` });
}

export function renderWeekChart(series) {
  const chart = $('#week-chart');
  if (!chart) return;
  const max = Math.max(1, ...series.map((item) => item.value));

  chart.innerHTML = series
    .map((item, index) => {
      const height = Math.max(6, Math.round((item.value / max) * 100));
      return `
        <div class="chart__col" title="${item.value} задач(и)">
          <span class="chart__meta"><b>${item.value}</b></span>
          <div class="chart__bar${item.value ? '' : ' chart__bar--empty'}"
               style="--h:${height}%; animation-delay:${index * 70}ms"></div>
          <span class="chart__meta${item.isToday ? ' chart__meta--today' : ''}">${item.label}</span>
        </div>
      `;
    })
    .join('');
}

export function renderPriorityBars(items) {
  const box = $('#priority-bars');
  if (!box) return;

  box.innerHTML = items
    .map(
      (item) => `
        <div class="bar-row">
          <span>${item.emoji} ${item.label}</span>
          <span class="bar-row__track">
            <span class="bar-row__fill" style="background:${item.color}" data-width="${item.percent}"></span>
          </span>
          <span class="bar-row__val">${item.count}</span>
        </div>
      `
    )
    .join('');

  requestAnimationFrame(() => {
    $$('.bar-row__fill', box).forEach((fill) => {
      fill.style.width = `${fill.dataset.width}%`;
    });
  });
}

export function renderSideProgress(percent) {
  const bar = $('#side-progress-bar');
  if (bar) bar.style.width = `${percent}%`;
  const text = $('#side-progress-text');
  if (text) text.textContent = `${percent}% выполнено`;
}
