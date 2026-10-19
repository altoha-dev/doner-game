interface TelegramDisplayUser {
  first_name: string;
  username?: string;
}

interface TelegramWebApp {
  BackButton?: { show(): void; hide(): void; onClick(callback: () => void): void; offClick(callback: () => void): void };
  initData: string;
  initDataUnsafe: { user?: TelegramDisplayUser; start_param?: string };
  themeParams?: { accent_text_color?: string; button_color?: string };
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  isVerticalSwipesEnabled?: boolean;
  disableVerticalSwipes?(): void;
  enableVerticalSwipes?(): void;
  onEvent(event: 'themeChanged', callback: () => void): void;
  offEvent(event: 'themeChanged', callback: () => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | undefined {
  return typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;
}

export function suspendTelegramGameSwipes(webApp: TelegramWebApp | undefined): (() => void) | undefined {
  if (!webApp?.initData || !webApp.isVersionAtLeast('7.7') || !webApp.disableVerticalSwipes || !webApp.enableVerticalSwipes) return;
  const wasEnabled = webApp.isVerticalSwipesEnabled !== false;
  webApp.disableVerticalSwipes();
  return () => { if (wasEnabled) webApp.enableVerticalSwipes?.(); };
}

export function isTelegramLaunch(webApp: TelegramWebApp | undefined): boolean {
  // The official SDK also creates WebApp in a regular browser, without initData.
  // This check only controls the display mode; it is NOT authentication.
  return Boolean(webApp?.initData);
}

export function getTelegramStartParam(): string {
  const webApp = getTelegramWebApp();
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const hash = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  const candidates: unknown[] = [
    webApp?.initDataUnsafe?.start_param,
    new URLSearchParams(webApp?.initData ?? '').get('start_param'),
    new URLSearchParams(search).get('tgWebAppStartParam'),
    new URLSearchParams(hash).get('tgWebAppStartParam'),
  ];

  // Launch parameters are untrusted display hints, never access permissions.
  // Match the bot's simple Telegram startapp format; no routing at this stage.
  for (const value of candidates) {
    if (typeof value === 'string' && /^[a-zA-Z0-9_-]{1,512}$/.test(value)) {
      return value;
    }
  }

  return 'home';
}

export function getDisplayUser(webApp: TelegramWebApp | undefined): TelegramDisplayUser | undefined {
  // SECURITY: initDataUnsafe нельзя использовать как доказательство личности пользователя.
  // Допустимо лишь предварительное отображение. Backend проверяет подпись сырой
  // строки WebApp.initData; после входа источник identity — серверный GET /me.
  const user = webApp?.initDataUnsafe?.user;
  if (!user || typeof user.first_name !== 'string' || !user.first_name.trim()) return undefined;

  return {
    first_name: user.first_name.trim(),
    ...(typeof user.username === 'string' && user.username.trim() ? { username: user.username.trim() } : {}),
  };
}

export function initializeTelegram(webApp: TelegramWebApp | undefined): (() => void) | undefined {
  if (!webApp) return;

  webApp.ready();
  webApp.expand();

  const applyTheme = (): void => {
    // Use Telegram's accent for small interface details; keep DONER's dark canvas.
    const accent = [webApp.themeParams?.accent_text_color, webApp.themeParams?.button_color]
      .find((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color));
    document.documentElement.style.setProperty('--telegram-accent', accent ?? '#ffa64d');

    if (webApp.isVersionAtLeast('6.1')) webApp.setBackgroundColor('#101e38');
    if (webApp.isVersionAtLeast('6.9')) webApp.setHeaderColor('#101e38');
  };

  applyTheme();
  webApp.onEvent('themeChanged', applyTheme);

  return () => {
    webApp.offEvent('themeChanged', applyTheme);
    document.documentElement.style.removeProperty('--telegram-accent');
  };
}
