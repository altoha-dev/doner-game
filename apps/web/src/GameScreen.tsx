import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getCharacter, PARTY_RULES, placementError, snapToGrid } from '@doner-game/shared';
import type { CharacterId, Point } from '@doner-game/shared';
import { CharacterPortrait } from './PixelArt';
import type { GameRuntime } from './game/createGame';
import { GameInput, KEY_ACTIONS } from './game/input';
import type { GameAction } from './game/input';
import { mountAsyncGame } from './game/lifecycle';
import { getTelegramWebApp, suspendTelegramGameSwipes } from './telegram';
import { SNOWY_CHAOS } from './game/level';
import { createLocalSession } from './game/localSession';
import './game.css';

export function GameScreen({ characterId, onBack, onNewMatch, reducedMotion }: { characterId: CharacterId; onBack(): void; onNewMatch(): void; reducedMotion: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<GameRuntime | null>(null);
  const [session] = useState(() => createLocalSession(SNOWY_CHAOS));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [input] = useState(() => new GameInput());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState<Point | null>(null);
  const [camera, setCamera] = useState(192);
  const [notice, setNotice] = useState('');
  const build = state.phase === 'BUILD', race = state.phase === 'RACE';
  const placedThisRound = state.placements.some(p => p.round === state.round);
  const error = preview ? placementError(SNOWY_CHAOS, state.placements, preview) : null;
  useEffect(() => suspendTelegramGameSwipes(getTelegramWebApp()), []);
  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    setStatus('loading'); setPaused(false);
    const dispose = mountAsyncGame(async () => {
      const { createGame } = await import('./game/createGame');
      return () => {
        const game = createGame({ host: parent, arena: SNOWY_CHAOS, characterId, snapshot: session.getSnapshot(), input, reducedMotion,
          onReady: () => setStatus('ready'), onGoal: elapsedMs => session.dispatch({ type: 'FINISH_LOCAL', elapsedMs }) });
        runtime.current = game; return game;
      };
    }, () => setStatus('error'));
    return () => { dispose(); runtime.current = null; input.clear(); };
  }, [characterId, session, input, attempt, reducedMotion]);
  useEffect(() => { runtime.current?.applySnapshot(state); input.clear(); setPaused(false); setPreview(null); setNotice(''); }, [state, input]);
  useEffect(() => { runtime.current?.setBuildView(camera, preview, !error); }, [camera, preview, error, status, state.phase]);
  useEffect(() => { input.clear(); runtime.current?.setPaused(paused); }, [paused, status, input]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (!race || status !== 'ready') return;
      if (event.code === 'Escape' || event.code === 'KeyP') { if (!event.repeat) setPaused(v => !v); return; }
      const action = KEY_ACTIONS[event.code];
      if (!action || (event.code === 'Space' && event.target instanceof HTMLButtonElement)) return;
      event.preventDefault(); if (!paused && !event.repeat) input.press(`key:${event.code}`, action);
    };
    const up = (event: KeyboardEvent) => input.release(`key:${event.code}`);
    const suspend = () => { input.clear(); if (race) setPaused(true); };
    const visibility = () => { if (document.hidden) suspend(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', suspend); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', suspend); document.removeEventListener('visibilitychange', visibility); input.clear(); };
  }, [input, paused, status, race]);
  const control = (action: GameAction, label: string, symbol: string) => <button className={`game-control game-control--${action}`} aria-label={label} disabled={paused || status !== 'ready'}
    onPointerDown={event => { if (event.pointerType === 'mouse' && event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); input.press(`pointer:${event.pointerId}`, action); }}
    onPointerUp={event => input.release(`pointer:${event.pointerId}`)} onPointerCancel={event => input.release(`pointer:${event.pointerId}`)} onLostPointerCapture={event => input.release(`pointer:${event.pointerId}`)}
    onKeyDown={event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); if (!event.repeat) input.press(`button:${action}:${event.code}`, action); } }}
    onKeyUp={event => input.release(`button:${action}:${event.code}`)} onBlur={() => { input.release(`button:${action}:Space`); input.release(`button:${action}:Enter`); }} onContextMenu={event => event.preventDefault()}><b>{symbol}</b><small>{label}</small></button>;
  function nudge(dx: number, dy: number) {
    if (!preview) return;
    const point = { x: Math.max(0, Math.min(1120, preview.x + dx)), y: Math.max(160, Math.min(272, preview.y + dy)) };
    setPreview(point); setCamera(Math.max(80, Math.min(1072, point.x + 16)));
  }
  const finish = state.results.at(-1);
  return <section className="game-screen" aria-label="Локальная арена">
    <div className="game-toolbar"><button className="back-button" onClick={onBack}>← МЕНЮ</button><span>SNOWY CHAOS</span><button className="game-pause" disabled={!race || status !== 'ready'} onClick={() => setPaused(v => !v)}>{paused ? 'ДАЛЬШЕ' : 'ПАУЗА'}</button></div>
    <div className="phase-hud"><div><span className="eyebrow">ЛОКАЛЬНАЯ ТРЕНИРОВКА</span><h1>{state.phase === 'MATCH_FINISHED' ? 'ГОТОВО!' : state.phase} <small>/ {String(state.round).padStart(2, '0')}</small></h1></div><div className="arena-character"><CharacterPortrait characterId={characterId} /><span>{getCharacter(characterId)?.displayName}</span></div></div>
    <div className="round-strip"><span>БЛОКИ <b data-testid="block-count">{state.placements.length}/{PARTY_RULES.maxPlacements}</b></span><span>ОБЩАЯ КАРТА · 01</span></div>
    <div className="game-viewport">
      <div ref={host} className="phaser-host" role="img" aria-label="Зимняя арена. В BUILD коснитесь карты для размещения блока." onPointerDown={event => {
        if (!build || !preview || placedThisRound || status !== 'ready' || !runtime.current) return;
        const point = runtime.current.screenToWorld(event.clientX, event.clientY);
        setPreview(snapToGrid({ x: point.x - 16, y: point.y - 8 }, SNOWY_CHAOS.grid));
      }} />
      {status === 'loading' && <div className="game-overlay" role="status"><b>ГОТОВИМ СНЕГ…</b></div>}
      {status === 'error' && <div className="game-overlay" role="alert"><p>Не удалось загрузить арену.</p><button onClick={() => setAttempt(v => v + 1)}>ПОВТОРИТЬ</button></div>}
      {paused && race && <div className="game-overlay"><b>ПАУЗА</b><button className="pixel-button" onClick={() => setPaused(false)}>ПРОДОЛЖИТЬ</button></div>}
      {(state.phase === 'RESULTS' || state.phase === 'MATCH_FINISHED') && <div className="game-overlay results" role="status"><span className="eyebrow">ЛОКАЛЬНЫЙ РЕЗУЛЬТАТ</span><h2>{state.phase === 'RESULTS' ? 'ФИНИШ!' : 'ОТЛИЧНАЯ ТРЕНИРОВКА'}</h2><b>{((finish?.elapsedMs ?? 0) / 1000).toFixed(1)} сек</b><p>Doner не начисляются.<br />Блоки останутся в следующем раунде.</p></div>}
    </div>
    {build && <div className="build-ui">
      <label className="map-scroll">ОБЗОР КАРТЫ <span>СТАРТ → ФИНИШ</span><input aria-label="Обзор карты" type="range" min={80} max={1072} step={16} value={camera} onChange={e => setCamera(Number(e.target.value))} /></label>
      {!placedThisRound && !preview && <button className="block-picker pixel-button button-secondary" disabled={status !== 'ready'} onClick={() => { setPreview({ x: 176, y: 240 }); setCamera(192); }}><span className="block-swatch" />ПЛАТФОРМА <small>1 БЕСПЛАТНО</small></button>}
      {preview && !placedThisRound && <>
        <div className="placement-status" data-valid={!error} role="status">{error ? `× ${error}` : '✓ Можно поставить'}<small>{preview.x}, {preview.y}</small></div>
        <div className="build-nudges" aria-label="Сместить блок"><button aria-label="Блок влево" onClick={() => nudge(-16, 0)}>←</button><button aria-label="Блок вверх" onClick={() => nudge(0, -16)}>↑</button><button aria-label="Блок вниз" onClick={() => nudge(0, 16)}>↓</button><button aria-label="Блок вправо" onClick={() => nudge(16, 0)}>→</button><button onClick={() => setPreview(null)}>ОТМЕНА</button></div>
        <button className="pixel-button" disabled={Boolean(error) || status !== 'ready'} onClick={() => { const result = session.dispatch({ type: 'PLACE', position: preview }); if (!result.ok) setNotice(result.reason ?? 'Ошибка'); }}>ПОСТАВИТЬ БЛОК</button>
      </>}
      {placedThisRound && <button className="pixel-button" onClick={() => session.dispatch({ type: 'START_RACE' })}>НАЧАТЬ ЗАБЕГ →</button>}
      <p className="game-hint">{placedThisRound ? 'Блок готов. Пора проверить трассу!' : preview ? 'Коснись карты или используй стрелки. Красный — нельзя.' : 'Добавь одну платформу. Старые блоки остаются.'}</p>
      {notice && <p role="alert">{notice}</p>}
    </div>}
    {race && <><div className="game-controls"><div>{control('left', 'Влево', '◀')}{control('right', 'Вправо', '▶')}</div>{control('jump', 'Прыжок', '↑')}</div><p className="game-hint">Доберись до клетчатого финиша!</p><p className="game-keyboard-hint">A / D · W / Space · P — пауза</p></>}
    {state.phase === 'RESULTS' && <div className="result-actions"><button className="pixel-button" onClick={() => { session.dispatch({ type: 'NEXT_ROUND' }); setCamera(192); }}>{state.round === PARTY_RULES.localRoundLimit ? 'ЗАВЕРШИТЬ МАТЧ' : 'СЛЕДУЮЩИЙ РАУНД →'}</button><button className="text-button" onClick={onNewMatch}>НОВЫЙ МАТЧ · СБРОСИТЬ КАРТУ</button></div>}
    {state.phase === 'MATCH_FINISHED' && <div className="result-actions"><button className="pixel-button" onClick={onNewMatch}>НОВЫЙ МАТЧ</button><p className="game-hint">Пройдено {state.results.length} раундов. Новая карта будет пустой.</p></div>}
    <p className="game-footnote">Один игрок · без наград · карта живёт до выхода в меню.</p>
  </section>;
}
