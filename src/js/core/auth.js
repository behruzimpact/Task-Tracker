/**
 * Регистрация, вход и профиль.
 *
 * Пароль НЕ хранится в открытом виде: используется PBKDF2 (Web Crypto API)
 * с индивидуальной солью для каждого пользователя. Если криптографический
 * API недоступен (напр. страница открыта не по http/https), применяется
 * упрощённый локальный фолбэк — приложение всё равно остаётся рабочим,
 * но такой режим годится только для локального демо.
 */
import { KEYS, sessionStore, store } from './storage.js';
import { uid } from './utils.js';

const ITERATIONS = 120000;
const KEY_LENGTH = 256;
const HASH = 'SHA-256';

export const AVATARS = ['🦊', '🐼', '🐙', '🦉', '🐳', '🦄', '🐝', '🐧'];

/* ------------------------- Валидация ------------------------- */

export function validateName(name) {
  const value = String(name || '').trim();
  if (!value) return 'Укажите имя';
  if (value.length < 2) return 'Имя слишком короткое';
  if (value.length > 32) return 'Максимум 32 символа';
  return null;
}

export function validateEmail(email) {
  const value = String(email || '').trim();
  if (!value) return 'Укажите email';
  if (!/^[^\s@]+@[^\s@]+\.[a-zа-я]{2,}$/i.test(value)) return 'Некорректный email';
  return null;
}

export function validatePassword(password) {
  const value = String(password || '');
  if (!value) return 'Придумайте пароль';
  if (value.length < 8) return 'Минимум 8 символов';
  if (!/[a-zа-яё]/i.test(value)) return 'Добавьте хотя бы одну букву';
  if (!/\d/.test(value)) return 'Добавьте хотя бы одну цифру';
  return null;
}

/** Детальный разбор пароля для индикатора надёжности. */
export function checkPassword(password = '') {
  const value = String(password);
  const rules = {
    length: value.length >= 8,
    letter: /[a-zа-яё]/i.test(value),
    digit: /\d/.test(value),
    long: value.length >= 12,
    symbol: /[^\w\s]/.test(value),
    mixedCase: /[a-zа-яё]/.test(value) && /[A-ZА-ЯЁ]/.test(value)
  };

  let score = 0;
  if (rules.length) score += 1;
  if (rules.letter && rules.digit) score += 1;
  if (rules.long || rules.symbol) score += 1;
  if (rules.mixedCase && value.length >= 10) score += 1;

  const labels = ['Слишком слабый', 'Слабый', 'Средний', 'Хороший', 'Надёжный'];
  return { rules, score, label: labels[score], valid: !validatePassword(value) };
}

/* -------------------- Хеширование пароля --------------------- */

const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function randomSalt(bytes = 16) {
  const buffer = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(buffer);
  else for (let i = 0; i < bytes; i += 1) buffer[i] = Math.floor(Math.random() * 256);
  return bytesToHex(buffer);
}

async function hashPassword(password, saltHex) {
  const salt = hexToBytes(saltHex);
  if (globalThis.crypto?.subtle) {
    const key = await globalThis.crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await globalThis.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: HASH },
      key,
      KEY_LENGTH
    );
    return `pbkdf2:${bytesToHex(new Uint8Array(bits))}`;
  }
  return `local:${fallbackHash(`${saltHex}:${password}`)}`;
}

/** Простейший фолбэк без Web Crypto — только для небезопасного окружения. */
function fallbackHash(input) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 16777619) >>> 0;
    h2 = Math.imul(h2 + code, 2246822519) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

export async function verifyPassword(password, user) {
  if (!user?.salt || !user?.passwordHash) return false;
  const computed = await hashPassword(password, user.salt);
  return computed === user.passwordHash;
}

/* ---------------------- Пользователи ------------------------- */

function loadUsers() {
  const users = store.get(KEYS.users, []);
  return Array.isArray(users) ? users : [];
}

function saveUsers(users) {
  return store.set(KEYS.users, users);
}

export function listUsers() {
  return loadUsers().map(publicUser);
}

/** Публичное представление: без соли и хеша пароля. */
export function publicUser(user) {
  if (!user) return null;
  const { salt, passwordHash, ...rest } = user;
  return rest;
}

export function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return loadUsers().find((u) => u.email === normalized) || null;
}

/* ------------------------- Сессия ---------------------------- */

function startSession(user, remember) {
  const payload = { userId: user.id, at: Date.now() };
  if (remember) {
    store.set(KEYS.session, payload);
    sessionStore.remove(KEYS.sessionTemp);
  } else {
    sessionStore.set(KEYS.sessionTemp, payload);
    store.remove(KEYS.session);
  }
}

function endSession() {
  store.remove(KEYS.session);
  sessionStore.remove(KEYS.sessionTemp);
}

export function currentUser() {
  const session = sessionStore.get(KEYS.sessionTemp) || store.get(KEYS.session);
  if (!session?.userId) return null;
  const user = loadUsers().find((u) => u.id === session.userId);
  if (!user) {
    endSession();
    return null;
  }
  return publicUser(user);
}

export function logout() {
  endSession();
}

export function updateProfile(patch = {}) {
  const current = currentUser();
  if (!current) return null;
  const users = loadUsers().map((u) => (u.id === current.id ? { ...u, ...patch, id: u.id, email: u.email } : u));
  saveUsers(users);
  return publicUser(users.find((u) => u.id === current.id));
}

/* ------------------- Регистрация / вход ---------------------- */

export async function register({ name, email, password, confirm, avatar, terms } = {}) {
  const errors = {};

  const nameError = validateName(name);
  if (nameError) errors.name = nameError;

  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;

  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;

  if (!errors.password && password !== confirm) errors.confirm = 'Пароли не совпадают';
  if (!terms) errors.terms = 'Нужно принять условия';

  if (Object.keys(errors).length) return { ok: false, errors };

  const normalized = String(email).trim().toLowerCase();
  const users = loadUsers();
  if (users.some((u) => u.email === normalized)) {
    return { ok: false, errors: { email: 'Этот email уже зарегистрирован' } };
  }

  const salt = randomSalt();
  const user = {
    id: uid('user'),
    name: String(name).trim(),
    email: normalized,
    avatar: AVATARS.includes(avatar) ? avatar : AVATARS[0],
    salt,
    passwordHash: await hashPassword(password, salt),
    createdAt: new Date().toISOString()
  };

  saveUsers([...users, user]);
  startSession(user, true);
  return { ok: true, user: publicUser(user) };
}

export async function login({ email, password, remember = true } = {}) {
  const errors = {};

  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  if (!password) errors.password = 'Введите пароль';

  if (Object.keys(errors).length) return { ok: false, errors };

  const user = findUserByEmail(email);
  if (!user) return { ok: false, error: 'Пользователь с таким email не найден' };

  const valid = await verifyPassword(password, user);
  if (!valid) return { ok: false, error: 'Неверный пароль' };

  startSession(user, remember);
  return { ok: true, user: publicUser(user) };
}

const DEMO_EMAIL = 'demo@taskflow.local';

/** Быстрый вход для демонстрации: создаёт (или переиспользует) демо-аккаунт. */
export async function loginDemo() {
  let users = loadUsers();
  let user = users.find((u) => u.email === DEMO_EMAIL);

  if (!user) {
    const salt = randomSalt();
    user = {
      id: uid('user'),
      name: 'Демо-пользователь',
      email: DEMO_EMAIL,
      avatar: '🦄',
      salt,
      passwordHash: await hashPassword('demo1234', salt),
      createdAt: new Date().toISOString(),
      demo: true
    };
    users = [...users, user];
    saveUsers(users);
  }

  startSession(user, true);
  return publicUser(user);
}

