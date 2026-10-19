import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  getDisplayUser,
  getTelegramStartParam,
  getTelegramWebApp,
  initializeTelegram,
  isTelegramLaunch,
  suspendTelegramGameSwipes,
} from '../src/telegram.ts';

type WebApp = NonNullable<ReturnType<typeof getTelegramWebApp>>;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

afterEach(() => {
  for (const [name, descriptor] of [['window', originalWindow], ['document', originalDocument]] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

function makeWebApp(overrides: Partial<WebApp> = {}): WebApp {
  return {
    initData: '',
    initDataUnsafe: {},
    ready() {},
    expand() {},
    isVersionAtLeast: () => false,
    setHeaderColor() {},
    setBackgroundColor() {},
    onEvent() {},
    offEvent() {},
    ...overrides,
  };
}

function setWindow(webApp?: WebApp, search = '', hash = ''): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { search, hash }, Telegram: { WebApp: webApp } },
  });
}

test('game disables Telegram swipes only on supported clients and restores the prior state', () => {
  const calls: string[] = [];
  const webApp = makeWebApp({ initData: 'test', isVersionAtLeast: version => version === '7.7', isVerticalSwipesEnabled: true,
    disableVerticalSwipes: () => { calls.push('disable'); }, enableVerticalSwipes: () => { calls.push('enable'); } });
  suspendTelegramGameSwipes(webApp)?.();
  assert.deepEqual(calls, ['disable', 'enable']);
  calls.length = 0;
  suspendTelegramGameSwipes({ ...webApp, isVerticalSwipesEnabled: false })?.();
  assert.deepEqual(calls, ['disable']);
  calls.length = 0;
  suspendTelegramGameSwipes({ ...webApp, isVersionAtLeast: () => false })?.();
  suspendTelegramGameSwipes({ ...webApp, initData: '' })?.();
  suspendTelegramGameSwipes(undefined)?.();
  assert.deepEqual(calls, []);
});

test('без window и Telegram API функции безопасны', () => {
  assert.equal(getTelegramWebApp(), undefined);
  assert.equal(getTelegramStartParam(), 'home');
  assert.equal(getDisplayUser(undefined), undefined);
  assert.equal(initializeTelegram(undefined), undefined);
  setWindow();
  assert.equal(getTelegramStartParam(), 'home');
  assert.equal(isTelegramLaunch(getTelegramWebApp()), false);
});

test('наличие SDK в браузере не означает запуск из Telegram', () => {
  setWindow(makeWebApp());
  assert.ok(getTelegramWebApp());
  assert.equal(isTelegramLaunch(getTelegramWebApp()), false);
  setWindow(makeWebApp({ initData: 'auth_date=1&hash=display-fixture' }));
  assert.equal(isTelegramLaunch(getTelegramWebApp()), true);
});

for (const value of ['home', 'solo', 'party', 'lobby_test123']) {
  test(`start_param из WebApp: ${value}`, () => {
    setWindow(makeWebApp({ initDataUnsafe: { start_param: value } }));
    assert.equal(getTelegramStartParam(), value);
  });
}

test('start_param из сырой строки initData без проверки личности', () => {
  setWindow(makeWebApp({ initData: 'start_param=party&hash=display-fixture' }));
  assert.equal(getTelegramStartParam(), 'party');
});

test('launch params читаются из query и hash даже без SDK', () => {
  setWindow(undefined, '?tgWebAppStartParam=solo');
  assert.equal(getTelegramStartParam(), 'solo');
  setWindow(undefined, '', '#tgWebAppStartParam=lobby_test123&tgWebAppVersion=8.0');
  assert.equal(getTelegramStartParam(), 'lobby_test123');
});

test('приоритет: WebApp, initData, query, hash', () => {
  setWindow(makeWebApp({
    initDataUnsafe: { start_param: 'solo' },
    initData: 'start_param=party',
  }), '?tgWebAppStartParam=home', '#tgWebAppStartParam=lobby_test123');
  assert.equal(getTelegramStartParam(), 'solo');
  setWindow(makeWebApp({ initData: 'start_param=party' }), '?tgWebAppStartParam=home');
  assert.equal(getTelegramStartParam(), 'party');
  setWindow(undefined, '?tgWebAppStartParam=solo', '#tgWebAppStartParam=party');
  assert.equal(getTelegramStartParam(), 'solo');
});

test('некорректные значения заменяются на home и не вызывают исключений', () => {
  for (const value of ['', 'party&admin=true', '<script>', 'a'.repeat(513), 'сюжет', '%ZZ']) {
    setWindow(makeWebApp({ initDataUnsafe: { start_param: value } }));
    assert.equal(getTelegramStartParam(), 'home');
    setWindow(undefined, `?tgWebAppStartParam=${encodeURIComponent(value)}`);
    assert.equal(getTelegramStartParam(), 'home');
  }
  setWindow(undefined, '?tgWebAppStartParam=%E0%A4%A');
  assert.equal(getTelegramStartParam(), 'home');
  setWindow(undefined, '?startapp=party'); // Telegram passes tgWebAppStartParam to the frontend.
  assert.equal(getTelegramStartParam(), 'home');
});

test('допустимая граница длины и fallback после неверного параметра', () => {
  setWindow(makeWebApp({ initDataUnsafe: { start_param: 'a'.repeat(512) } }));
  assert.equal(getTelegramStartParam().length, 512);
  setWindow(makeWebApp({ initDataUnsafe: { start_param: '<invalid>' } }), '?tgWebAppStartParam=party');
  assert.equal(getTelegramStartParam(), 'party');
});

test('display user не содержит пустые first_name или username', () => {
  assert.deepEqual(getDisplayUser(makeWebApp({
    initDataUnsafe: { user: { first_name: ' Altoha ', username: ' altoha ' } },
  })), { first_name: 'Altoha', username: 'altoha' });
  assert.deepEqual(getDisplayUser(makeWebApp({
    initDataUnsafe: { user: { first_name: 'Altoha', username: '  ' } },
  })), { first_name: 'Altoha' });
  assert.equal(getDisplayUser(makeWebApp({ initDataUnsafe: { user: { first_name: ' ' } } })), undefined);
  assert.equal(getDisplayUser(makeWebApp()), undefined);
});

test('ready/expand вызываются и для доступного SDK вне Telegram; themeChanged снимается при cleanup', () => {
  const calls: string[] = [];
  const styles = new Map<string, string>();
  const handlers = new Set<() => void>();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { documentElement: { style: {
      setProperty(name: string, value: string) { styles.set(name, value); },
      removeProperty(name: string) { styles.delete(name); },
    } } },
  });
  const webApp = makeWebApp({
    ready: () => { calls.push('ready'); },
    expand: () => { calls.push('expand'); },
    isVersionAtLeast: () => true,
    setHeaderColor: (color) => { calls.push(`header:${color}`); },
    setBackgroundColor: (color) => { calls.push(`background:${color}`); },
    themeParams: { accent_text_color: '#2481CC' },
    onEvent: (event, callback) => { assert.equal(event, 'themeChanged'); handlers.add(callback); },
    offEvent: (event, callback) => { assert.equal(event, 'themeChanged'); handlers.delete(callback); },
  });
  const cleanup = initializeTelegram(webApp);
  assert.deepEqual(calls, ['ready', 'expand', 'background:#101e38', 'header:#101e38']);
  assert.equal(styles.get('--telegram-accent'), '#2481CC');
  webApp.themeParams = { button_color: '#55aaff' };
  handlers.forEach(callback => callback());
  assert.equal(styles.get('--telegram-accent'), '#55aaff');
  webApp.themeParams = { accent_text_color: 'url(invalid)' };
  handlers.forEach(callback => callback());
  assert.equal(styles.get('--telegram-accent'), '#ffa64d');
  cleanup?.();
  assert.equal(handlers.size, 0);
  assert.equal(styles.size, 0);
});
