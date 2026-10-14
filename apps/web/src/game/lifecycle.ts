export interface DisposableGame { destroy: () => void }

// An import may finish after Back or React StrictMode cleanup. Never mount it then.
export function mountAsyncGame(load: () => Promise<() => DisposableGame>, onError: () => void) {
  let cancelled = false;
  let game: DisposableGame | undefined;
  void load().then(create => { if (!cancelled) game = create(); }).catch(() => { if (!cancelled) onError(); });
  return () => { cancelled = true; game?.destroy(); game = undefined; };
}
