import { useEffect, useState } from 'react';
import type { PlayerProfileDto } from '@doner-game/shared';
import { createApiClient, getAuthErrorMessage } from './api';

type AuthState =
  | { status: 'browser' }
  | { status: 'loading' }
  | { status: 'authenticated'; profile: PlayerProfileDto }
  | { status: 'error'; message: string };

export function usePlayerAuth(initData: string | undefined) {
  const [state, setState] = useState<AuthState>({ status: initData ? 'loading' : 'browser' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!initData) {
      setState({ status: 'browser' });
      return;
    }
    const controller = new AbortController();
    let api: ReturnType<typeof createApiClient> | undefined;
    setState({ status: 'loading' });

    async function connect(): Promise<void> {
      try {
        api = createApiClient(import.meta.env.VITE_API_URL);
        await api.login(initData!, controller.signal);
        // Only the authenticated /me response becomes the UI identity source.
        const profile = await api.getMe(controller.signal);
        if (!controller.signal.aborted) setState({ status: 'authenticated', profile });
      } catch (error) {
        api?.clear();
        if (!controller.signal.aborted) setState({ status: 'error', message: getAuthErrorMessage(error) });
      }
    }
    void connect();

    return () => {
      controller.abort();
      api?.clear();
    };
  }, [initData, attempt]);

  return { state, retry: () => setAttempt(value => value + 1) };
}
