/**
 * Экран авторизации: переключение вкладок, валидация, регистрация и вход.
 */
import { checkPassword, login, loginDemo, register } from '../core/auth.js';
import { $, $$, attachRipple } from '../core/utils.js';
import { toastError, toastInfo, toastOk } from './toast.js';

export function createAuthView({ onAuthenticated } = {}) {
  const screen = $('#auth-screen');
  const tabs = $('.tabs', screen);
  const alertBox = $('#auth-alert');
  const alertText = $('.alert__text', alertBox);
  const foot = $('.auth__foot', screen);

  const loginForm = $('#login-form');
  const registerForm = $('#register-form');
  const strength = $('#strength');
  const strengthLabel = $('.strength__label', strength);

  const FOOT_TEXT = {
    login: 'Нет аккаунта? <button type="button" class="link-btn" data-goto="register">Создать бесплатно</button>',
    register: 'Уже есть аккаунт? <button type="button" class="link-btn" data-goto="login">Войти</button>'
  };

  /* --------------------- Подсветка ошибок -------------------- */

  function setError(form, name, message) {
    const errorNode = form.querySelector(`[data-error-for="${name}"]`);
    if (errorNode) errorNode.textContent = message || '';
    const holder = form.querySelector(`[name="${name}"]`)?.closest('.field, .check');
    if (!holder) return;
    holder.classList.toggle('has-error', Boolean(message));
    if (message) {
      holder.classList.remove('shake');
      void holder.offsetWidth;
      holder.classList.add('shake');
    }
  }

  function clearErrors(form) {
    $$('.field__error', form).forEach((node) => {
      node.textContent = '';
    });
    $$('.has-error', form).forEach((node) => node.classList.remove('has-error'));
  }

  function showAlert(message, type = 'error') {
    if (!message) {
      alertBox.hidden = true;
      return;
    }
    alertBox.hidden = false;
    alertBox.classList.toggle('alert--ok', type === 'ok');
    $('.alert__ico', alertBox).textContent = type === 'ok' ? '🎉' : '⚠️';
    alertText.textContent = message;
  }

  function setLoading(button, loading) {
    button.classList.toggle('is-loading', loading);
    button.disabled = loading;
  }

  /* ------------------------ Вкладки ------------------------- */

  function switchTab(tab) {
    const target = tab === 'register' ? 'register' : 'login';
    tabs.dataset.active = target;
    $$('.tabs__btn', tabs).forEach((button) => {
      const active = button.dataset.tab === target;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    loginForm.classList.toggle('form--hidden', target !== 'login');
    registerForm.classList.toggle('form--hidden', target !== 'register');
    foot.innerHTML = FOOT_TEXT[target];
    showAlert('');
    clearErrors(target === 'login' ? loginForm : registerForm);
  }

  tabs.addEventListener('click', (event) => {
    const button = event.target.closest('.tabs__btn');
    if (button) switchTab(button.dataset.tab);
  });

  foot.addEventListener('click', (event) => {
    const button = event.target.closest('[data-goto]');
    if (button) switchTab(button.dataset.goto);
  });

  /* ----------------- Показ пароля и аватар ------------------ */

  $$('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const input = document.getElementById(button.dataset.togglePassword);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.classList.toggle('is-on', show);
      button.textContent = show ? '🙈' : '👁';
      input.focus();
    });
  });

  const avatarPicker = $('#avatar-picker');
  const avatarInput = $('#register-avatar');
  avatarPicker.addEventListener('click', (event) => {
    const option = event.target.closest('.avatar-opt');
    if (!option) return;
    $$('.avatar-opt', avatarPicker).forEach((node) => {
      const active = node === option;
      node.classList.toggle('is-active', active);
      node.setAttribute('aria-checked', String(active));
    });
    avatarInput.value = option.dataset.avatar;
  });

  /* -------------------- Индикатор пароля -------------------- */

  const rulesNodes = {
    length: $('[data-rule="length"]', strength),
    letter: $('[data-rule="letter"]', strength),
    digit: $('[data-rule="digit"]', strength)
  };

  $('#register-password').addEventListener('input', (event) => {
    const { rules, score, label } = checkPassword(event.target.value);
    strength.dataset.level = String(score);
    strengthLabel.textContent = event.target.value ? `Надёжность: ${label}` : 'Надёжность пароля';
    Object.entries(rulesNodes).forEach(([key, node]) => node.classList.toggle('is-ok', Boolean(rules[key])));
    if (event.target.value) setError(registerForm, 'password', '');
  });

  /* ------------------------- Вход --------------------------- */

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(loginForm);
    showAlert('');

    const submit = $('#login-submit');
    setLoading(submit, true);

    try {
      const result = await login({
        email: $('#login-email').value,
        password: $('#login-password').value,
        remember: loginForm.elements.remember.checked
      });

      if (!result.ok) {
        Object.entries(result.errors || {}).forEach(([name, message]) => setError(loginForm, name, message));
        if (result.error) showAlert(result.error);
        setLoading(submit, false);
        return;
      }

      toastOk(`С возвращением, ${result.user.name}!`, 'Приятной продуктивности');
      loginForm.reset();
      onAuthenticated?.(result.user, { mode: 'login' });
    } catch (error) {
      showAlert('Не удалось войти: ' + error.message);
      setLoading(submit, false);
    }
  });

  /* ---------------------- Регистрация ----------------------- */

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors(registerForm);
    showAlert('');

    const submit = $('#register-submit');
    setLoading(submit, true);

    try {
      const result = await register({
        name: $('#register-name').value,
        email: $('#register-email').value,
        password: $('#register-password').value,
        confirm: $('#register-confirm').value,
        avatar: avatarInput.value,
        terms: $('#register-terms').checked
      });

      if (!result.ok) {
        Object.entries(result.errors || {}).forEach(([name, message]) => setError(registerForm, name, message));
        if (result.error) showAlert(result.error);
        setLoading(submit, false);
        return;
      }

      toastOk('Аккаунт создан 🎉', `Добро пожаловать, ${result.user.name}!`);
      registerForm.reset();
      onAuthenticated?.(result.user, { mode: 'register' });
    } catch (error) {
      showAlert('Не удалось создать аккаунт: ' + error.message);
      setLoading(submit, false);
    }
  });

  /* ----------------------- Демо-режим ----------------------- */

  const demoButton = $('#demo-login');
  demoButton.addEventListener('click', async () => {
    demoButton.classList.add('is-loading');
    demoButton.disabled = true;
    try {
      const user = await loginDemo();
      toastInfo('Демо-режим включён', 'Созданы примеры задач — можно всё ломать 😉');
      onAuthenticated?.(user, { mode: 'demo' });
    } catch (error) {
      toastError('Не удалось войти', error.message);
      demoButton.classList.remove('is-loading');
      demoButton.disabled = false;
    }
  });

  $('#forgot-link').addEventListener('click', () => {
    toastInfo('Восстановление пароля', 'Это локальное демо: данные хранятся только в вашем браузере.');
  });

  /* --------------------- Приятные мелочи -------------------- */

  $$('.btn', screen).forEach(attachRipple);

  ['#login-email', '#login-password', '#register-name', '#register-email'].forEach((selector) => {
    const input = $(selector);
    input.addEventListener('input', () => setError(input.closest('form'), input.name, ''));
  });

  return {
    switchTab,
    show() {
      screen.hidden = false;
      switchTab('login');
    },
    hide() {
      screen.hidden = true;
    }
  };
}


