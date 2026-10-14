import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { CharacterPortrait, PixelIcon } from './PixelArt';
import type { GameLaunch } from './game/launch';
import type { GameRuntime } from './game/createGame';
import { GameInput, KEY_ACTIONS } from './game/input';
import type { GameAction } from './game/input';
import { mountAsyncGame } from './game/lifecycle';
import { getTelegramWebApp, suspendTelegramGameSwipes } from './telegram';
import './game.css';

export function GameScreen({ launch, onBack }: { launch: GameLaunch; onBack: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<GameRuntime | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [input] = useState(() => new GameInput());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [paused, setPaused] = useState(false);
  const [reachedGoal, setReachedGoal] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => suspendTelegramGameSwipes(getTelegramWebApp()), []);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    title.current?.focus({ preventScroll: true });
    setStatus('loading'); setReachedGoal(false); setPaused(false);
    const dispose = mountAsyncGame(async () => {
      const { createGame } = await import('./game/createGame');
      return () => {
        const game = createGame({ host: parent, launch, input,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          onReady: () => setStatus('ready'), onGoal: () => setReachedGoal(true) });
        runtime.current = game;
        return game;
      };
    }, () => setStatus('error'));
    return () => { dispose(); runtime.current = null; input.clear(); };
  }, [launch, input, attempt]);

  useEffect(() => { input.clear(); runtime.current?.setPaused(paused); }, [paused, status, input]);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.code === 'Escape' || event.code === 'KeyP') {
        if (!event.repeat && status === 'ready') setPaused(value => !value);
        return;
      }
      const action = KEY_ACTIONS[event.code];
      if (!action || (event.code === 'Space' && target instanceof HTMLButtonElement)) return;
      event.preventDefault();
      if (!paused && status === 'ready' && !event.repeat) input.press(`key:${event.code}`, action);
    };
    const onUp = (event: KeyboardEvent) => input.release(`key:${event.code}`);
    const suspend = () => { input.clear(); setPaused(true); };
    const onVisibility = () => { if (document.hidden) suspend(); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', suspend);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', suspend); document.removeEventListener('visibilitychange', onVisibility);
      input.clear();
    };
  }, [input, paused, status]);

  const control = (action: GameAction, label: string, symbol: string) => <button
    className={`game-control game-control--${action}`} aria-label={label} disabled={paused || status !== 'ready'}
    onPointerDown={event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      input.press(`pointer:${event.pointerId}`, action);
    }}
    onPointerUp={event => input.release(`pointer:${event.pointerId}`)}
    onPointerCancel={event => input.release(`pointer:${event.pointerId}`)}
    onLostPointerCapture={event => input.release(`pointer:${event.pointerId}`)}
    onKeyDown={event => {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault(); input.press(`button:${action}:${event.code}`, action);
      }
    }}
    onKeyUp={event => input.release(`button:${action}:${event.code}`)}
    onBlur={() => { input.release(`button:${action}:Space`); input.release(`button:${action}:Enter`); }}
    onContextMenu={event => event.preventDefault()}
  ><span aria-hidden="true">{symbol}</span><small>{label}</small></button>;

  return <section className="game-screen" aria-label="Игровой прототип" data-theme={launch.theme.themeId}
    style={{ '--world-accent': launch.theme.palette.accent } as CSSProperties}>
    <div className="game-toolbar">
      <button className="back-button" onClick={onBack}><PixelIcon name="back" />НАЗАД</button>
      <h1 ref={title} tabIndex={-1}>{launch.level.name}</h1>
      <button className="game-pause" disabled={status !== 'ready'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'ПРОДОЛЖИТЬ' : 'ПАУЗА'}</button>
    </div>
    <div className="game-loadout"><CharacterPortrait characterId={launch.character.id} /><div><b>{launch.character.displayName}</b><span>{launch.theme.displayName}</span></div><span className="game-prototype">{launch.preview ? 'LOCAL PREVIEW' : 'ПРОТОТИП'}</span></div>
    <div className="game-viewport">
      <div ref={host} className="phaser-host" role="img" aria-label={`Платформенный уровень: ${launch.theme.displayName}. Управление — кнопками под игрой или клавиатурой.`} />
      {status === 'loading' && <div className="game-overlay" role="status"><b>ГОТОВИМ МИР…</b></div>}
      {status === 'error' && <div className="game-overlay" role="alert"><b>Мир не загрузился</b><p>Проверьте соединение и попробуйте снова.</p><button className="pixel-button" onClick={() => setAttempt(value => value + 1)}>ПОВТОРИТЬ</button></div>}
      {paused && status === 'ready' && <div className="game-overlay"><b>ПАУЗА</b><button className="pixel-button" onClick={() => setPaused(false)}>ВЕРНУТЬСЯ В ИГРУ</button></div>}
    </div>
    <div className="game-controls" aria-label="Управление персонажем"><div>{control('left', 'Влево', '◀')}{control('right', 'Вправо', '▶')}</div>{control('jump', 'Прыжок', '↑')}</div>
    <p className="game-hint" role="status">{reachedGoal ? 'Ты у флага! Можно исследовать дальше или вернуться.' : 'Дойди до флага. Перепрыгивай уступы.'}</p>
    <p className="game-keyboard-hint">A / D или ← → · прыжок: Space / W / ↑ · пауза: P</p>
    <p className="game-footnote">{launch.preview ? 'Локальный просмотр мира без аккаунта. ' : ''}Награды и прохождение пока не сохраняются.</p>
  </section>;
}
