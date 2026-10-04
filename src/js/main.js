/**
 * Точка входа: восстановление сессии, переключение экранов, инициализация.
 */
import { currentUser } from './core/auth.js';
import { createAppView } from './ui/appView.js';
import { createAuthView } from './ui/authView.js';
import { initTheme } from './ui/theme.js';
import { initControls } from './ui/controls.js';

window.__TASKFLOW_BOOTED__ = true;

const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const bootFallback = document.getElementById('boot-fallback');

/** Плавный переход между экранами авторизации и приложения. */
function transition(from, to) {
  return new Promise((resolve) => {
    if (!from || from.hidden) {
      to.hidden = false;
      to.classList.add('screen--in');
      resolve();
      return;
    }

    from.classList.add('screen--out');
    setTimeout(() => {
      from.hidden = true;
      from.classList.remove('screen--out', 'screen--in');

      to.hidden = false;
      to.classList.remove('screen--out');
      void to.offsetWidth;
      to.classList.add('screen--in');
      resolve();
    }, 260);
  });
}

const appView = createAppView({
  onSessionEnd: () => showAuthScreen()
});

const authView = createAuthView({
  onAuthenticated: (user) => enterApp(user)
});

async function enterApp(user) {
  await transition(authScreen, appScreen);
  appView.mount(user);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function showAuthScreen() {
  authView.show();
  await transition(appScreen, authScreen);
}

/* --------------------------- Запуск -------------------------- */

function boot() {
  if (bootFallback) bootFallback.hidden = true;
  initTheme();
  initControls();

  const session = currentUser();

  if (session) {
    authScreen.hidden = true;
    appScreen.hidden = false;
    appView.mount(session);
  } else {
    appScreen.hidden = true;
    authScreen.hidden = false;
    authView.show();
  }

  document.body.classList.add('app-ready');
}

try {
  boot();
} catch (error) {
  window.__TASKFLOW_BOOTED__ = false;
  if (bootFallback) bootFallback.hidden = false;
  console.error('TaskFlow: ошибка запуска', error);
}
