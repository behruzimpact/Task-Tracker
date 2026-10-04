/**
 * Автотесты авторизации и данных пользователя.
 * Подменяем window.localStorage/sessionStorage, чтобы прогонять реальный
 * сценарий регистрации и входа в Node.js.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

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

const auth = await import('../src/js/core/auth.js');
const repo = await import('../src/js/core/repository.js');

/* --------------------------- Валидация ---------------------- */

test('валидация email, имени и пароля', () => {
  assert.equal(auth.validateEmail('user@example.com'), null);
  assert.ok(auth.validateEmail('user@'));
  assert.ok(auth.validateEmail(''));
  assert.equal(auth.validateName('Иван'), null);
  assert.ok(auth.validateName('И'));
  assert.equal(auth.validatePassword('secret123'), null);
  assert.ok(auth.validatePassword('short'));
  assert.ok(auth.validatePassword('12345678')); // нет букв
  assert.ok(auth.validatePassword('abcdefgh')); // нет цифр
});

test('индикатор надёжности пароля выдаёт уровень и правила', () => {
  const weak = auth.checkPassword('12345678');
  assert.equal(weak.valid, false);
  assert.equal(weak.rules.length, true);
  assert.equal(weak.rules.letter, false);

  const strong = auth.checkPassword('StrongPass123');
  assert.equal(strong.valid, true);
  assert.equal(strong.rules.mixedCase, true);
  assert.ok(strong.score >= 3);
});

/* ------------------------ Регистрация ----------------------- */

test('регистрация: ошибки валидации возвращаются по полям', async () => {
  const result = await auth.register({ name: 'И', email: 'bad', password: '123', confirm: '321', terms: false });

  assert.equal(result.ok, false);
  assert.ok(result.errors.name);
  assert.ok(result.errors.email);
  assert.ok(result.errors.password);
  assert.ok(result.errors.terms);
  assert.equal(result.errors.confirm, undefined); // confirm не проверяется, пока пароль невалиден
});

test('регистрация: создаёт пользователя и сессию, пароль хранится только хешем', async () => {
  const result = await auth.register({
    name: 'Иван Петров',
    email: 'Ivan@Example.com',
    password: 'Secret123',
    confirm: 'Secret123',
    avatar: '🐼',
    terms: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.user.email, 'ivan@example.com');
  assert.equal(result.user.avatar, '🐼');
  assert.equal(result.user.passwordHash, undefined);
  assert.equal(result.user.salt, undefined);

  const session = auth.currentUser();
  assert.equal(session.id, result.user.id);
  assert.equal(session.name, 'Иван Петров');

  const raw = JSON.parse(window.localStorage.getItem('taskflow.v1:users'));
  assert.equal(raw[0].passwordHash.startsWith('pbkdf2:'), true);
  assert.ok(raw[0].salt.length >= 32);
  assert.equal(raw[0].passwordHash.includes('Secret123'), false);
});

test('регистрация: повторный email отклоняется', async () => {
  const result = await auth.register({
    name: 'Двойник',
    email: 'ivan@example.com',
    password: 'Secret123',
    confirm: 'Secret123',
    terms: true
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.email, /уже зарегистрирован/);
});

/* --------------------------- Вход --------------------------- */

test('вход: неверный пароль и неизвестный email', async () => {
  const wrongPassword = await auth.login({ email: 'ivan@example.com', password: 'WrongPass1' });
  assert.equal(wrongPassword.ok, false);
  assert.match(wrongPassword.error, /Неверный пароль/);

  const unknown = await auth.login({ email: 'nobody@example.com', password: 'Secret123' });
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /не найден/);
});

test('вход и выход: сессия сохраняется и очищается', async () => {
  const result = await auth.login({ email: 'ivan@example.com', password: 'Secret123', remember: true });
  assert.equal(result.ok, true);
  assert.ok(auth.currentUser());

  auth.logout();
  assert.equal(auth.currentUser(), null);
  assert.equal(window.localStorage.getItem('taskflow.v1:session'), null);
});

test('verifyPassword совместим с форматом PBKDF2/SHA-256 из хранилища', async () => {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync('demo1234', Buffer.from(salt, 'hex'), 120000, 32, 'sha256').toString('hex');
  const user = { salt, passwordHash: `pbkdf2:${hash}` };

  assert.equal(await auth.verifyPassword('demo1234', user), true);
  assert.equal(await auth.verifyPassword('demo4321', user), false);
});

/* --------------------------- Данные ------------------------- */

test('демо-режим: пользователь создаётся и получает стартовые задачи', async () => {
  const user = await auth.loginDemo();
  assert.equal(user.email, 'demo@taskflow.local');

  const db = repo.loadData(user.id);
  assert.equal(db.tasks.length, 3);
  assert.equal(db.categories.length, 5);
  assert.equal(db.tasks[0].order, 0);
});

test('операции над задачами: добавление, изменение, статус, удаление', () => {
  let db = repo.emptyDb();
  const size = db.tasks.length;

  db = repo.addTask(db, { title: 'Новая задача', priority: 'high', category: 'work' });
  assert.equal(db.tasks.length, size + 1);
  assert.equal(db.tasks[0].title, 'Новая задача');

  const id = db.tasks[0].id;
  db = repo.updateTask(db, id, { title: 'Изменённая', tags: ['важное'] });
  assert.equal(db.tasks[0].title, 'Изменённая');
  assert.deepEqual(db.tasks[0].tags, ['важное']);

  db = repo.setStatus(db, id, 'done');
  assert.equal(db.tasks[0].status, 'done');
  assert.ok(db.tasks[0].completedAt);

  db = repo.toggleDone(db, id);
  assert.equal(db.tasks[0].status, 'todo');
  assert.equal(db.tasks[0].completedAt, null);

  db = repo.removeTask(db, id);
  assert.equal(db.tasks.length, size);
});

test('операции над категориями: дубли запрещены, удаление сбрасывает категорию у задач', () => {
  let db = repo.emptyDb();
  const initial = db.categories.length;

  db = repo.addCategory(db, { label: 'Проекты' });
  assert.equal(db.categories.length, initial + 1);

  const before = db.categories.length;
  db = repo.addCategory(db, { label: 'проекты' });
  assert.equal(db.categories.length, before);

  db = repo.addTask(db, { title: 'С категорией', category: 'work' });
  db = repo.removeCategory(db, 'work');
  assert.equal(db.categories.some((item) => item.id === 'work'), false);
  assert.equal(db.tasks.find((task) => task.title === 'С категорией').category, null);
});

test('clearCompleted удаляет только выполненные задачи', () => {
  let db = repo.emptyDb();
  const first = db.tasks[0].id;
  db = repo.setStatus(db, first, 'done');

  const doneCount = db.tasks.filter((task) => task.status === 'done').length;
  db = repo.clearCompleted(db);

  assert.equal(db.tasks.filter((task) => task.status === 'done').length, 0);
  assert.equal(db.tasks.length, 3 - doneCount);
});

test('saveData и loadData сохраняют состояние пользователя', () => {
  const db = repo.emptyDb();
  repo.saveData('user_test', db);
  const restored = repo.loadData('user_test');
  assert.equal(restored.tasks.length, db.tasks.length);
  assert.equal(restored.categories.length, db.categories.length);
});

