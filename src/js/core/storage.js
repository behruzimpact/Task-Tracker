/**
 * Слой хранения. Обёртка над localStorage с безопасным фолбэком в память
 * (например, когда браузер блокирует хранилище в приватном режиме).
 */

const NS = 'taskflow.v1';
const memory = new Map();
let persistent = null;

function detectPersistence() {
  if (persistent !== null) return persistent;
  try {
    const probe = `${NS}:__probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    persistent = true;
  } catch {
    persistent = false;
  }
  return persistent;
}

const keyOf = (key) => `${NS}:${key}`;

export const store = {
  isPersistent: detectPersistence,

  get(key, fallback = null) {
    const full = keyOf(key);
    try {
      const raw = detectPersistence() ? window.localStorage.getItem(full) : memory.get(full);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    const full = keyOf(key);
    const raw = JSON.stringify(value);
    try {
      if (detectPersistence()) window.localStorage.setItem(full, raw);
      else memory.set(full, raw);
    } catch {
      memory.set(full, raw);
    }
    return value;
  },

  remove(key) {
    const full = keyOf(key);
    try {
      if (detectPersistence()) window.localStorage.removeItem(full);
    } catch {
      /* игнорируем */
    }
    memory.delete(full);
  },

  /** Удаляет только данные приложения, не трогая остальной домен. */
  clearNamespace() {
    const prefix = `${NS}:`;
    try {
      if (detectPersistence()) {
        Object.keys(window.localStorage)
          .filter((k) => k.startsWith(prefix))
          .forEach((k) => window.localStorage.removeItem(k));
      }
    } catch {
      /* игнорируем */
    }
    memory.clear();
  }
};

/** Сессия «до закрытия вкладки» (когда не выбран «Запомнить меня»). */
export const sessionStore = {
  get(key, fallback = null) {
    try {
      const raw = window.sessionStorage.getItem(keyOf(key));
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.sessionStorage.setItem(keyOf(key), JSON.stringify(value));
    } catch {
      /* игнорируем */
    }
    return value;
  },
  remove(key) {
    try {
      window.sessionStorage.removeItem(keyOf(key));
    } catch {
      /* игнорируем */
    }
  }
};

/** Ключи приложения в одном месте, чтобы ничего не разойтись. */
export const KEYS = {
  users: 'users',
  session: 'session',
  sessionTemp: 'session:tmp',
  theme: 'theme',
  data: (userId) => `data:${userId}`,
  timer: (userId) => `timer:${userId}`
};
