import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DONER_RULES, buildOffer, matchLeaders, buildPlayerStatus, getCharacter, getTrap, TRAPS, ONLINE_RULES, PARTY_RULES, placementError, PLAYER_COLORS, snapToGrid } from '@doner-game/shared';
import type { ArenaSession, BuildPreview, CharacterId, OnlineRoom, Point, TrapId, Orientation } from '@doner-game/shared';
import { CharacterPortrait, TrapIcon } from './PixelArt';
import type { GameRuntime } from './game/createGame';
import { GameInput, KEY_ACTIONS } from './game/input';
import type { GameAction } from './game/input';
import { mountAsyncGame } from './game/lifecycle';
import { getTelegramWebApp, suspendTelegramGameSwipes } from './telegram';
import { SNOWY_CHAOS } from './game/level';
import { createLocalSession } from './game/localSession';
import type { RoomConnection } from './multiplayer/connection';
import './game.css';

export interface OnlineGame { room: OnlineRoom; connection: RoomConnection; connected: boolean; pending: boolean; previews: readonly BuildPreview[] }
export function GameScreen({ characterId, onBack, onNewMatch, reducedMotion, externalSession, online }: { characterId: CharacterId; onBack(): void; onNewMatch(): void; reducedMotion: boolean; externalSession?: ArenaSession; online?: OnlineGame }) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<GameRuntime | null>(null);
  const [localSession] = useState(() => createLocalSession(SNOWY_CHAOS));
  const session = externalSession ?? localSession;
  const network = online?.connection.bridge;
  const offline = Boolean(online && !online.connected);
  const waiting = Boolean(online?.pending);
  const limit = online ? ONLINE_RULES.maxPlacements : PARTY_RULES.maxPlacements;
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [input] = useState(() => new GameInput());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState<Point | null>(null);
  const [trapId, setTrapId] = useState<TrapId>('basic-platform');
  const [orientation, setOrientation] = useState<Orientation>('none');
  const selectedTrap = getTrap(trapId)!;
  const directionName = { none: '—', up: 'ВВЕРХ', left: 'ВЛЕВО', right: 'ВПРАВО' };
  const [camera, setCamera] = useState(192);
  const [notice, setNotice] = useState('');
  const build = state.phase === 'BUILD', race = state.phase === 'RACE';
  const me = online?.room.players.find(p => p.playerId === network?.localId);
  const ownFinished = Boolean(online?.room.finishes.some(f => f.playerId === network?.localId && f.round === state.round));
  const placedThisRound = online ? Boolean(me?.buildDone) : state.placements.some(p => p.round === state.round);
  const hostPlayer = !online || online.room.hostId === network?.localId;
  const ownPlacements = state.placements.filter(p => p.round === state.round && p.ownerId === network?.localId);
  const balance = online?.room.balances?.[network?.localId ?? ''];
  const offer = online ? buildOffer(online.room, network!.localId, trapId) : { slot: 1, cost: 0 };
  const settlement = online?.room.rounds?.find(r => r.round === state.round);
  const settled = !online || settlement?.status === 'SETTLED' || settlement?.status === 'LEGACY';
  const leaders = online ? matchLeaders(online.room) : [];
  const purchaseError = online && (!offer || balance === undefined || balance < offer.cost) ? !offer ? 'Нет доступного размещения' : 'Не хватает Doner' : null;
  const error = purchaseError ?? (preview ? placementError(SNOWY_CHAOS, state.placements, preview, limit, trapId, orientation) : null);
  useEffect(() => suspendTelegramGameSwipes(getTelegramWebApp()), []);
  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    setStatus('loading'); setPaused(false);
    const dispose = mountAsyncGame(async () => {
      const { createGame } = await import('./game/createGame');
      return () => {
        const game = createGame({ host: parent, arena: SNOWY_CHAOS, characterId, snapshot: session.getSnapshot(), input, reducedMotion, ...(network ? { network } : {}),
          onReady: () => setStatus('ready'), onGoal: elapsedMs => { if (!network) session.dispatch({ type: 'FINISH_LOCAL', elapsedMs }); } });
        runtime.current = game; return game;
      };
    }, () => setStatus('error'));
    return () => { dispose(); runtime.current = null; input.clear(); };
  }, [characterId, session, input, attempt, reducedMotion, network]);
  useEffect(() => { runtime.current?.applySnapshot(state); }, [state]);
  useEffect(() => { input.clear(); setPaused(false); setPreview(null); setNotice(''); }, [state.phase, state.round, input]);
  useEffect(() => { setPreview(null); }, [online ? ownPlacements.length : state.placements.length]);
  useEffect(() => { if (offline) setPreview(null); }, [offline]);
  useEffect(() => { network?.setPreview(build && !placedThisRound && !offline ? preview : null, trapId, orientation); }, [network, build, placedThisRound, offline, preview, trapId, orientation]);
  useEffect(() => () => network?.setPreview(null), [network]);
  useEffect(() => { runtime.current?.setBuildView(camera, preview, !error, trapId, orientation); }, [camera, preview, error, status, state.phase, trapId, orientation]);
  useEffect(() => { input.clear(); runtime.current?.setPaused(paused || offline || ownFinished); }, [paused, offline, ownFinished, status, input]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (!race || offline || ownFinished || status !== 'ready') return;
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
  }, [input, paused, status, race, offline, ownFinished]);
  const control = (action: GameAction, label: string, symbol: string) => <button className={`game-control game-control--${action}`} aria-label={label} disabled={paused || offline || ownFinished || status !== 'ready'}
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
  return <section className="game-screen" aria-label={online ? "Общая арена" : "Локальная арена"}>
    <div className="game-toolbar"><button className="back-button" onClick={onBack}>← МЕНЮ</button><span>SNOWY CHAOS</span><button className="game-pause" disabled={!race || status !== 'ready'} onClick={() => setPaused(v => !v)}>{paused ? 'ДАЛЬШЕ' : 'ПАУЗА'}</button></div>
    <div className="phase-hud"><div><span className="eyebrow">{online ? `КОМНАТА ${online.room.code}` : "ЛОКАЛЬНАЯ ТРЕНИРОВКА"}</span><h1>{state.phase === 'MATCH_FINISHED' ? 'ГОТОВО!' : state.phase} <small>/ {String(state.round).padStart(2, '0')}</small></h1></div><div className="arena-character"><CharacterPortrait characterId={characterId} /><span>{getCharacter(characterId)?.displayName}</span></div></div>
    <div className="round-strip"><span>ОБЪЕКТЫ <b data-testid="block-count">{state.placements.length}/{limit}</b></span><span>ОБЩАЯ КАРТА · 01</span></div>
    {online && <p className="shop-balance" data-testid="doner-balance">МОЙ БАЛАНС: {balance ?? '…'} DONER</p>}
    <div className="game-viewport">
      <div ref={host} className="phaser-host" role="img" aria-label="Зимняя арена. В BUILD коснитесь карты для размещения блока." onPointerDown={event => {
        if (!build || !preview || placedThisRound || offline || waiting || status !== 'ready' || !runtime.current) return;
        const point = runtime.current.screenToWorld(event.clientX, event.clientY);
        setPreview(snapToGrid({ x: point.x - 16, y: point.y - 8 }, SNOWY_CHAOS.grid));
      }} />
      {status === 'loading' && <div className="game-overlay" role="status"><b>ГОТОВИМ СНЕГ…</b></div>}
      {status === 'error' && <div className="game-overlay" role="alert"><p>Не удалось загрузить арену.</p><button onClick={() => setAttempt(v => v + 1)}>ПОВТОРИТЬ</button></div>}
      {paused && race && <div className="game-overlay"><b>{online ? "ВЫ ОТДЫХАЕТЕ · МАТЧ ПРОДОЛЖАЕТСЯ" : "ПАУЗА"}</b><button className="pixel-button" onClick={() => setPaused(false)}>ПРОДОЛЖИТЬ</button></div>}
      {(state.phase === 'RESULTS' || state.phase === 'MATCH_FINISHED') && <div className="game-overlay results" role="status"><span className="eyebrow">{online ? "ОБЩИЙ РЕЗУЛЬТАТ" : "ЛОКАЛЬНЫЙ РЕЗУЛЬТАТ"}</span><h2>{state.phase === 'RESULTS' ? 'ФИНИШ!' : online ? 'МАТЧ ЗАВЕРШЁН' : 'ОТЛИЧНАЯ ТРЕНИРОВКА'}</h2>{!online && <b>{((finish?.elapsedMs ?? 0) / 1000).toFixed(1)} сек</b>}<p>{online ? settled ? 'Награды подтверждены сервером.' : 'Сохраняем награды…' : 'TRAINING MODE — NO REWARDS'}<br />{state.phase === 'MATCH_FINISHED' ? 'Новая игра начнётся с пустой карты.' : state.round === (online ? ONLINE_RULES.maxRounds : PARTY_RULES.localRoundLimit) ? 'Это последний раунд матча.' : 'Объекты останутся в следующем раунде.'}</p></div>}
    </div>
    {build && <div className="build-ui">
      {online && <div className="build-party-status" aria-label={`Строительство — раунд ${state.round}`}><b>СТРОИТЕЛЬСТВО · РАУНД {state.round}</b><ul>{online.room.players.filter(p => !p.left).map(p => <li key={p.playerId}><span style={{ color: PLAYER_COLORS[p.seat] }}>{p.displayName}</span><strong>{buildPlayerStatus(online.room, p, online.previews)}</strong></li>)}</ul></div>}
      <label className="map-scroll">ОБЗОР КАРТЫ <span>СТАРТ → ФИНИШ</span><input aria-label="Обзор карты" type="range" min={80} max={1072} step={16} value={camera} onChange={e => setCamera(Number(e.target.value))} /></label>
      <p className="test-loadout"><b>{online ? 'DONER SHOP' : 'TRAINING MODE — NO REWARDS'}</b> · {online ? `МОЙ БАЛАНС: ${balance ?? '…'} DONER` : 'Все ловушки бесплатно. Настоящий баланс не меняется.'}</p>
      {!placedThisRound && <div className="trap-picker" aria-label="Выбор объекта">{TRAPS.map(trap => {
        const option = online ? buildOffer(online.room, network!.localId, trap.id) : { slot: 1, cost: 0 };
        const price = option?.cost ?? (online ? trap.donerPrice : 0);
        const unavailable = !option || (online && (balance === undefined || balance < option.cost));
        const label = option?.slot === 2 ? 'EXTRA BLOCK' : trap.id === 'basic-platform' ? 'ПЛАТФОРМА' : trap.id === 'arcade-crossbow' ? 'CROSSBOW' : 'FAN';
        return <button key={trap.id} className="block-picker button-secondary" aria-label={`${label} ${price ? `${price} DONER` : trap.id === 'basic-platform' ? '1 БЕСПЛАТНО' : 'БЕСПЛАТНО'}`} aria-pressed={Boolean(preview && trapId === trap.id)} disabled={unavailable || offline || waiting || status !== 'ready'} onClick={() => { setTrapId(trap.id); setOrientation(trap.orientations[0]!); setPreview({ x: 176, y: 240 }); setCamera(192); }}>
          <TrapIcon id={trap.id} />{label}<small>{option ? option.cost ? `${option.cost} DONER` : 'БЕСПЛАТНО' : 'НЕТ СЛОТА'}</small><small>{unavailable && option ? 'НЕ ХВАТАЕТ DONER' : trap.category === 'platform' ? 'Твёрдая опора' : trap.category === 'air' ? 'Воздушный поток' : 'Снежный болт'}</small>
        </button>;
      })}</div>}
      {online && !placedThisRound && <p className="game-hint">{ownPlacements.length ? 'Бесплатный блок готов. Можно купить EXTRA BLOCK или завершить ход.' : `Бесплатный BLOCK или платная ловушка. EXTRA BLOCK — ${DONER_RULES.extraBlock} Doner после бесплатного. Оплата только после установки.`}</p>}

      {preview && !placedThisRound && <>
        <p className="trap-description">{selectedTrap.description}</p>
        {selectedTrap.orientations.length > 1 && <button className="trap-rotate" aria-label="Повернуть ловушку" onClick={() => setOrientation(selectedTrap.orientations[(selectedTrap.orientations.indexOf(orientation) + 1) % selectedTrap.orientations.length]!)}>↻ НАПРАВЛЕНИЕ: {directionName[orientation]}</button>}
        <div className="placement-status" data-valid={!error} role="status">{error ? `× ${error}` : '✓ Можно поставить'}<small>{preview.x}, {preview.y}</small></div>
        <div className="build-nudges" aria-label="Сместить блок"><button aria-label="Блок влево" onClick={() => nudge(-16, 0)}>←</button><button aria-label="Блок вверх" onClick={() => nudge(0, -16)}>↑</button><button aria-label="Блок вниз" onClick={() => nudge(0, 16)}>↓</button><button aria-label="Блок вправо" onClick={() => nudge(16, 0)}>→</button><button onClick={() => setPreview(null)}>ОТМЕНА</button></div>
        <button className="pixel-button" disabled={Boolean(error) || offline || waiting || status !== 'ready'} onClick={() => { const result = session.dispatch({ type: 'PLACE', position: preview, trapId, orientation }); if (!result.ok) setNotice(result.reason ?? 'Ошибка'); }}>{trapId === 'basic-platform' ? 'ПОСТАВИТЬ БЛОК' : `ПОСТАВИТЬ ${selectedTrap.id === 'fan' ? 'FAN' : 'CROSSBOW'}`}</button>
      </>}
      {placedThisRound && !online && <button className="pixel-button" onClick={() => session.dispatch({ type: 'START_RACE' })}>НАЧАТЬ ЗАБЕГ →</button>}
      {online && !placedThisRound && <button className="text-button" disabled={offline || waiting} onClick={() => void online.connection.request({ type: 'SKIP', round: state.round })}>{ownPlacements.length ? 'ЗАВЕРШИТЬ СТРОИТЕЛЬСТВО' : 'ПРОПУСТИТЬ РАЗМЕЩЕНИЕ'}</button>}
      {online && placedThisRound && <p className="game-hint">Ход готов. Ждём друзей: {online.room.players.filter(p => !p.left && p.buildDone).length}/{online.room.players.filter(p => !p.left).length}</p>}
      <p className="game-hint">{placedThisRound ? online ? 'Твой ход завершён. Ждём остальных.' : 'Объект готов. Пора проверить трассу!' : preview ? 'Коснись карты или используй стрелки. Красный — нельзя.' : 'Добавь один объект. Ранее поставленные остаются.'}</p>
      {notice && <p role="alert">{notice}</p>}
    </div>}
    {race && <><div className="game-controls"><div>{control('left', 'Влево', '◀')}{control('right', 'Вправо', '▶')}</div>{control('jump', 'Прыжок', '↑')}</div><p className="game-hint">{ownFinished ? "Ваш забег завершён. Ждём остальных…" : "Доберись до клетчатого финиша!"}</p><p className="game-keyboard-hint">A / D · W / Space · P — пауза</p></>}
    {!online && state.phase === 'RESULTS' && <div className="result-actions"><button className="pixel-button" onClick={() => { session.dispatch({ type: 'NEXT_ROUND' }); setCamera(192); }}>{state.round === PARTY_RULES.localRoundLimit ? 'ЗАВЕРШИТЬ МАТЧ' : 'СЛЕДУЮЩИЙ РАУНД →'}</button><button className="text-button" onClick={onNewMatch}>НОВЫЙ МАТЧ · СБРОСИТЬ КАРТУ</button></div>}
    {!online && state.phase === 'MATCH_FINISHED' && <div className="result-actions"><button className="pixel-button" onClick={onNewMatch}>НОВЫЙ МАТЧ</button><p className="game-hint">Пройдено {state.results.length} раундов. Новая карта будет пустой.</p></div>}
    {online && (state.phase === 'RESULTS' || state.phase === 'MATCH_FINISHED') && <div className="result-actions">
      {!settled && <p role="status">Сохраняем награды… Сервер повторит попытку автоматически.</p>}
      <ol className="finish-list">{online.room.finishes.filter(f => f.round === state.round).sort((a, b) => (a.position ?? 99) - (b.position ?? 99)).map(f => <li key={f.playerId}><b>{f.position ?? '—'}. {online.room.players.find(p => p.playerId === f.playerId)?.displayName}</b><span>{f.status === 'FINISHED' ? `${((f.durationMs ?? 0) / 1000).toFixed(2)} сек` : f.status === 'ABORTED' ? 'ПРЕРВАН' : 'DNF'}</span><span>{settled ? `+${f.points ?? 0} POINTS · +${f.doners ?? 0} DONER` : 'НАГРАДА ОЖИДАЕТ ПОДТВЕРЖДЕНИЯ'}</span></li>)}</ol>
      {state.phase === 'RESULTS' && (hostPlayer ? <button className="pixel-button" disabled={offline || waiting || !settled} onClick={() => session.dispatch({ type: 'NEXT_ROUND' })}>{state.round >= ONLINE_RULES.maxRounds ? 'ЗАВЕРШИТЬ МАТЧ' : 'СЛЕДУЮЩИЙ РАУНД →'}</button> : <p className="game-hint">Следующий раунд запускает host.</p>)}
      {state.phase === 'MATCH_FINISHED' && <button className="pixel-button" onClick={onBack}>В МЕНЮ</button>}
    </div>}
    {online && <div className="match-scoreboard pixel-panel" aria-label="Очки матча"><b>ОЧКИ МАТЧА · {state.round}/{ONLINE_RULES.maxRounds}</b>{[...online.room.players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.seat - b.seat).map(p => <div key={p.playerId}><span>{p.displayName}</span><strong>{p.score ?? 0}</strong></div>)}{state.phase === 'MATCH_FINISHED' && <p>{leaders.length ? `${leaders.length > 1 ? 'ОБЩАЯ ПОБЕДА' : 'ПОБЕДИТЕЛЬ'}: ${online.room.players.filter(p => leaders.includes(p.playerId)).map(p => p.displayName).join(', ')}` : 'Нет победителя: никто не заработал очки.'}</p>}</div>}
    <p className="game-footnote">{online ? 'Победители получают очки · отстающие больше Doner.' : 'Один игрок · без наград · карта живёт до выхода в меню.'}</p>
  </section>;
}
