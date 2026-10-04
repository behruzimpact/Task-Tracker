/**
 * Лёгкое конфетти на canvas — запускается при выполнении задачи.
 * Никаких зависимостей, после анимации canvas удаляется.
 */

const PALETTE = ['#6366f1', '#a855f7', '#ec4899', '#10b981', '#f59e0b', '#06b6d4'];
let canvas = null;

function ensureCanvas() {
  if (canvas && canvas.isConnected) return canvas;
  canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  document.body.append(canvas);
  return canvas;
}

function resize(canvasEl) {
  const dpr = window.devicePixelRatio || 1;
  canvasEl.width = window.innerWidth * dpr;
  canvasEl.height = window.innerHeight * dpr;
  canvasEl.style.width = '100%';
  canvasEl.style.height = '100%';
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * @param {number} x координата вспышки (клиентская)
 * @param {number} y координата вспышки
 * @param {{count?:number, spread?:number, power?:number}} options
 */
export function burstConfetti(x = window.innerWidth / 2, y = window.innerHeight / 3, options = {}) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const { count = 70, spread = Math.PI / 3, power = 11 } = options;

  const canvasEl = ensureCanvas();
  const ctx = resize(canvasEl);
  if (!ctx) {
    canvasEl.remove();
    canvas = null;
    return;
  }

  const particles = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
    const speed = power * (0.55 + Math.random() * 0.85);
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 7,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      life: 1
    };
  });

  let frame = 0;
  const gravity = 0.36;
  const drag = 0.986;

  const render = () => {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = 0;

    particles.forEach((p) => {
      p.vy += gravity;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      p.life -= 0.0085;

      if (p.life <= 0 || p.y > window.innerHeight + 40) return;
      alive += 1;

      ctx.save();
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });

    frame += 1;
    if (alive > 0 && frame < 320) requestAnimationFrame(render);
    else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      canvasEl.remove();
      canvas = null;
    }
  };

  requestAnimationFrame(render);
}

/** Конфетти от центра экрана — используется для крупных достижений. */
export function celebrate() {
  burstConfetti(window.innerWidth / 2, window.innerHeight * 0.32, { count: 130, spread: Math.PI * 1.2, power: 14 });
}
