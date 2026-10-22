import { useCallback, useEffect, useRef, useState } from 'react';
import type { CharacterId, PlayerProfileDto } from '@doner-game/shared';
import { ApiClientError, createApiClient, getAuthErrorMessage, getCharacterErrorMessage } from './api';

export type AuthState =
  | { status: 'browser' }
  | { status: 'loading' }
  | { status: 'authenticated'; profile: PlayerProfileDto }
  | { status: 'error'; message: string };

export function usePlayerAuth(initData: string | undefined) {
  const [state, setState] = useState<AuthState>({ status: initData ? 'loading' : 'browser' });
  const [attempt, setAttempt] = useState(0);
  const session = useRef<{ api: ReturnType<typeof createApiClient>; controller: AbortController } | null>(null);
  const actionLock = useRef(false);
  const [pendingCharacter, setPendingCharacter] = useState<CharacterId | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ characterId: CharacterId; kind: 'unlock' | 'select' } | null>(null);

  useEffect(() => {
    if (!initData) {
      setState({ status: 'browser' });
      return;
    }
    const controller = new AbortController();
    let api: ReturnType<typeof createApiClient> | undefined;
    setState({ status: 'loading' });
    setActionError(null);
    setPendingCharacter(null);
    setNotice(null);
    actionLock.current = false;

    async function connect(): Promise<void> {
      try {
        api = createApiClient(import.meta.env.VITE_API_URL);
        await api.login(initData!, controller.signal);
        // Only the authenticated /me response becomes the UI identity source.
        const profile = await api.getMe(controller.signal);
        if (!controller.signal.aborted) {
          session.current = { api, controller };
          setState({ status: 'authenticated', profile });
        }
      } catch (error) {
        api?.clear();
        if (!controller.signal.aborted) setState({ status: 'error', message: getAuthErrorMessage(error) });
      }
    }
    void connect();

    return () => {
      controller.abort();
      api?.clear();
      session.current = null;
    };
  }, [initData, attempt]);

  async function changeCharacter(kind: 'unlock' | 'select', characterId: CharacterId): Promise<void> {
    const current = session.current;
    if (!current || actionLock.current) return;
    actionLock.current = true;
    setPendingCharacter(characterId);
    setActionError(null);
    setNotice(null);
    const update = (profile: PlayerProfileDto) => {
      if (!current.controller.signal.aborted) setState({ status: 'authenticated', profile });
    };
    try {
      const result = kind === 'unlock'
        ? await current.api.unlockCharacter(characterId, current.controller.signal)
        : await current.api.selectCharacter(characterId, current.controller.signal);
      if (!current.controller.signal.aborted) {
        // No optimistic debit or ownership: only the committed server response.
        setState(previous => previous.status === 'authenticated' ? { ...previous, profile: { ...previous.profile, progress: result.progress } } : previous);
        setNotice({ characterId, kind });
      }
    } catch (error) {
      if (current.controller.signal.aborted) return;
      if (error instanceof ApiClientError && error.status === 401) {
        current.api.clear();
        session.current = null;
        setState({ status: 'error', message: getAuthErrorMessage(error) });
      } else {
        setActionError(getCharacterErrorMessage(error));
        // Reconcile an uncertain response or stale balance from another window.
        try { update(await current.api.getMe(current.controller.signal)); }
        catch (refreshError) {
          if (!current.controller.signal.aborted && refreshError instanceof ApiClientError && refreshError.status === 401) {
            session.current = null;
            setState({ status: 'error', message: getAuthErrorMessage(refreshError) });
          }
        }
      }
    } finally {
      if (!current.controller.signal.aborted) {
        actionLock.current = false;
        setPendingCharacter(null);
      }
    }
  }

  const confirmedBalance = useCallback((doners: number) => {
    setState(previous => previous.status === 'authenticated' && previous.profile.progress.doners !== doners ? { ...previous, profile: { ...previous.profile, progress: { ...previous.profile.progress, doners } } } : previous);
  }, []);
  const refresh = useCallback(async () => {
    const current = session.current; if (!current) return;
    try { const profile = await current.api.getMe(current.controller.signal); if (!current.controller.signal.aborted) setState({ status: 'authenticated', profile }); } catch { /* Retry through existing account UI on the next auth/refresh. */ }
  }, []);
  const socketCredentials = useCallback(() => session.current?.api.socketCredentials() ?? null, []);
  return { state, confirmedBalance, refresh, socketCredentials, retry: () => setAttempt(value => value + 1), changeCharacter, pendingCharacter, actionError, notice };
}
