import { useEffect, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { CHARACTERS } from '@doner-game/shared';
import { CharacterPortrait } from './PixelArt';
import { GameScreen } from './GameScreen';
import { createRoomConnection } from './multiplayer/connection';
import { getTelegramWebApp } from './telegram';
import './party.css';

export function PartyScreen({ credentials, userId, initialCode, entry, onExit, onReauthenticate, backRequest, reducedMotion }: {
  credentials: { url: string; token: string }; userId: string; initialCode: string; entry: 'create' | 'join' | 'menu';
  onExit(): void; onReauthenticate(): void; backRequest: RefObject<(() => void) | null>; reducedMotion: boolean;
}) {
  const [connection, setConnection] = useState<ReturnType<typeof createRoomConnection> | null>(null);
  useEffect(() => {
    const next = createRoomConnection(credentials.url, credentials.token, userId); setConnection(next); next.connect();
    return () => { next.destroy(); };
  }, [credentials.url, credentials.token, userId]);
  return connection ? <ConnectedParty connection={connection} userId={userId} initialCode={initialCode} entry={entry} onExit={onExit} onReauthenticate={onReauthenticate} backRequest={backRequest} reducedMotion={reducedMotion} /> : <p role="status">ПОДКЛЮЧЕНИЕ…</p>;
}
function ConnectedParty({ connection, userId, initialCode, entry, onExit, onReauthenticate, backRequest, reducedMotion }: Omit<Parameters<typeof PartyScreen>[0], 'credentials'> & { connection: ReturnType<typeof createRoomConnection> }) {
  const view = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const [mode, setMode] = useState(entry);
  const [capacity, setCapacity] = useState(4);
  const [code, setCode] = useState(initialCode);
  const [exitPrompt, setExitPrompt] = useState(false);
  const [copied, setCopied] = useState('');
  const [now, setNow] = useState(Date.now());
  const room = view.room, me = room?.players.find(p => p.playerId === userId);
  const busy = view.pending || view.status !== 'connected';
  const requestExit = () => { if (room && room.match.phase !== 'MATCH_FINISHED') setExitPrompt(true); else onExit(); };
  useEffect(() => { backRequest.current = requestExit; return () => { backRequest.current = null; }; });
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied('Скопировано'); }
    catch { setCopied('Скопируйте текст из поля ниже'); }
  }
  async function invite() {
    if (!room?.inviteLink) return;
    const telegram = getTelegramWebApp();
    const share = `https://t.me/share/url?url=${encodeURIComponent(room.inviteLink)}&text=${encodeURIComponent('Пойдём в DONER GAME!')}`;
    if (telegram?.initData && telegram.openTelegramLink) { telegram.openTelegramLink(share); return; }
    if (navigator.share) { try { await navigator.share({ title: 'DONER GAME', url: room.inviteLink }); } catch { setCopied('Приглашение не отправлено. Можно скопировать ссылку.'); } }
    else await copy(room.inviteLink);
  }
  const startReason = !room ? '' : room.players.filter(p => !p.left).length < 2 ? 'Нужен хотя бы один друг.' : room.players.some(p => !p.left && (!p.ready || !p.connected)) ? 'Все участники должны подключиться и нажать «ГОТОВ».' : '';
  return <section className="party-screen" aria-label="Комната друзей">
    {(view.status !== 'connected' || view.error) && <div className="connection-banner" role="status"><b>{view.status === 'reconnecting' ? 'ПЕРЕПОДКЛЮЧЕНИЕ…' : view.status === 'connecting' ? 'ПОДКЛЮЧЕНИЕ…' : 'СВЯЗЬ С КОМНАТОЙ'}</b><p>{view.error ?? 'Ждём сервер. Управление временно остановлено.'}</p><button onClick={() => view.authExpired ? onReauthenticate() : connection.retry()}>{view.authExpired ? 'ПОДКЛЮЧИТЬ АККАУНТ' : 'ПОВТОРИТЬ'}</button></div>}
    {exitPrompt && <div className="leave-prompt pixel-panel" role="alertdialog" aria-label="Выход из комнаты"><p>{view.status === 'connected' ? 'Выйти из комнаты? Забег продолжится у друзей.' : 'Связи нет. Можно закрыть экран и вернуться в комнату позже.'}</p><div><button onClick={() => setExitPrompt(false)}>ОСТАТЬСЯ</button><button onClick={async () => { if (view.status !== 'connected') { onExit(); return; } const reply = await connection.request({ type: 'LEAVE' }); if (reply.ok) onExit(); }} disabled={view.pending}>{view.status === 'connected' ? 'ВЫЙТИ ИЗ КОМНАТЫ' : 'ЗАКРЫТЬ ЭКРАН'}</button></div></div>}
    {room?.recoveryMessage && <p className="recovery-note" role="status">{room.recoveryMessage}</p>}
    {room && room.match.phase !== 'LOBBY' && me ? <>
      <p className="online-deadline">{room.deadline ? `ДО КОНЦА ФАЗЫ: ${Math.max(0, Math.ceil((room.deadline - now) / 1000))} СЕК` : 'ОБЩИЙ МАТЧ'} · {room.players.filter(p => p.connected && !p.left).length}/{room.players.filter(p => !p.left).length} НА СВЯЗИ</p>
      <GameScreen characterId={me.characterId} externalSession={connection.arenaSession} online={{ room, connection, connected: view.status === 'connected', pending: view.pending, previews: view.previews }} reducedMotion={reducedMotion} onBack={requestExit} onNewMatch={requestExit} />
    </> : <>
      <div className="screen-heading"><button className="back-button" onClick={requestExit}>← НАЗАД</button><p className="eyebrow">DONER GAME · WINTER PARTY</p><h1 tabIndex={-1}>{room ? 'СНЕЖНАЯ БАНДА' : 'СОБЕРИ ДРУЗЕЙ'}</h1></div>
      {!room ? <div className="room-entry pixel-panel">
        <div className="room-tabs"><button aria-pressed={mode === 'create'} onClick={() => setMode('create')}>СОЗДАТЬ</button><button aria-pressed={mode === 'join'} onClick={() => setMode('join')}>ВОЙТИ ПО КОДУ</button></div>
        {mode === 'create' ? <><label className="room-field">СКОЛЬКО МЕСТ?<select aria-label="Количество мест" value={capacity} onChange={e => setCapacity(Number(e.target.value))}>{[2, 3, 4].map(n => <option key={n} value={n}>{n} ИГРОКА</option>)}</select></label><button className="pixel-button" disabled={busy} onClick={() => void connection.request({ type: 'CREATE', capacity })}>СОЗДАТЬ КОМНАТУ · {capacity}</button></> : <><p className="hint">{initialCode ? 'Вас пригласили. Подтвердите вход в комнату.' : 'Попроси друга прислать шестизначный код.'}</p><label className="room-field">КОД КОМНАТЫ<input aria-label="Код комнаты" autoCapitalize="characters" autoComplete="off" maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} placeholder="X7K2M9" /></label><button className="pixel-button" disabled={busy || !/^[A-Z2-9]{6}$/.test(code)} onClick={() => void connection.request({ type: 'JOIN', code })}>ПРИСОЕДИНИТЬСЯ</button></>}
        <p className="hint">2–4 друга · общая карта · без списаний Doner</p>
      </div> : <>
        <div className="room-code pixel-panel"><span className="eyebrow">КОМНАТА</span><strong data-testid="room-code">{room.code}</strong><span>{room.players.filter(p => !p.left).length}/{room.capacity} ИГРОКА</span></div>
        <div className="invite-actions"><button onClick={() => void copy(room.code)}>КОПИРОВАТЬ КОД</button><button disabled={!room.inviteLink} onClick={() => room.inviteLink && void copy(room.inviteLink)}>КОПИРОВАТЬ ССЫЛКУ</button><button className="button-secondary" disabled={!room.inviteLink} onClick={() => void invite()}>ПРИГЛАСИТЬ ДРУГА ↗</button></div>
        {!room.inviteLink && <p className="hint">Приглашение ссылкой пока недоступно. Передайте другу код комнаты.</p>}
        {copied && <div className="copy-result" role="status"><p>{copied}</p><input aria-label="Текст приглашения" readOnly value={room.inviteLink ?? room.code} onFocus={e => e.target.select()} /></div>}
        <ul className="lobby-players">{room.players.filter(p => !p.left).map(p => <li className={`lobby-player pixel-panel${p.ready ? ' is-ready' : ''}`} key={p.playerId}>
          <CharacterPortrait characterId={p.characterId} /><div className="lobby-player-copy"><h2>{p.displayName} {p.playerId === room.hostId && <small>HOST</small>}</h2><p>{CHARACTERS.find(c => c.id === p.characterId)?.displayName} · {p.connected ? 'НА СВЯЗИ' : 'НЕТ СВЯЗИ'}</p><b>{p.ready ? '✓ ГОТОВ' : 'ЖДЁМ ГОТОВНОСТЬ'}</b></div>{p.photoUrl && <img className="lobby-avatar" src={p.photoUrl} alt={`Аватар ${p.displayName}`} referrerPolicy="no-referrer" />}
        </li>)}</ul>
        <fieldset className="room-characters"><legend>ТВОЙ ПЕРСОНАЖ · ВСЕ БЕСПЛАТНО</legend>{CHARACTERS.map(c => <button key={c.id} aria-label={c.displayName} aria-pressed={me?.characterId === c.id} disabled={busy} onClick={() => void connection.request({ type: 'CHARACTER', characterId: c.id })}><CharacterPortrait characterId={c.id} />{c.displayName}</button>)}</fieldset>
        <button className="pixel-button ready-button" disabled={busy} onClick={() => void connection.request({ type: 'READY', ready: !me?.ready })}>{me?.ready ? 'СНЯТЬ ГОТОВНОСТЬ' : 'ГОТОВ'}</button>
        {room.hostId === userId ? <><button className="pixel-button button-secondary" disabled={busy || Boolean(startReason)} onClick={() => void connection.request({ type: 'START' })}>НАЧАТЬ МАТЧ →</button><p className="game-hint">{startReason || 'Все готовы. Можно начинать!'}</p></> : <p className="game-hint">Матч запустит host, когда все будут готовы.</p>}
      </>}
    </>}
  </section>;
}
