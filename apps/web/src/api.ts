import type { ApiErrorDto, AuthResponseDto, PlayerProfileDto } from '@doner-game/shared';

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super('API request failed');
    this.code = code;
    this.status = status;
  }
}

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'INVALID_TELEGRAM_AUTH') {
      return 'Не удалось подтвердить аккаунт Telegram. Закройте Mini App и откройте его снова через бота.';
    }
    if (error.code === 'INVALID_ACCESS_TOKEN') return 'Сессия истекла. Нажмите «Повторить», чтобы подключиться снова.';
    if (error.status === 429) return 'Слишком много попыток входа. Подождите минуту и повторите.';
  }
  return 'Не удалось подключиться к серверу.';
}

export function createApiClient(apiUrl: string | undefined) {
  let baseUrl: string;
  try {
    if (!apiUrl?.trim()) throw new Error();
    const url = new URL(apiUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    baseUrl = url.href.replace(/\/+$/, '');
  } catch {
    throw new ApiClientError('API_NOT_CONFIGURED');
  }

  // Session exists only in this closure. Never use localStorage, sessionStorage or cookies.
  let accessToken: string | null = null;

  async function request<T>(path: string, options: RequestInit, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const cancel = (): void => { controller.abort(); };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const timeout = setTimeout(cancel, 12000);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as ApiErrorDto | null;
        const code = typeof payload?.error?.code === 'string' ? payload.error.code : 'API_ERROR';
        throw new ApiClientError(code, response.status);
      }
      return await response.json() as T;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
    }
  }

  return {
    async login(initData: string, signal?: AbortSignal): Promise<void> {
      accessToken = null;
      const result = await request<AuthResponseDto>('/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }), // Original WebApp.initData, not initDataUnsafe.
      }, signal);
      if (typeof result.accessToken !== 'string' || !result.accessToken) throw new ApiClientError('INVALID_RESPONSE');
      if (!signal?.aborted) accessToken = result.accessToken;
    },
    async getMe(signal?: AbortSignal): Promise<PlayerProfileDto> {
      if (!accessToken) throw new ApiClientError('INVALID_ACCESS_TOKEN', 401);
      try {
        return await request<PlayerProfileDto>('/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }, signal);
      } catch (error) {
        accessToken = null;
        throw error;
      }
    },
    clear(): void { accessToken = null; },
  };
}
