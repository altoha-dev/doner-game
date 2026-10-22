import { useEffect, useRef, useState } from 'react';
import { getCharacter, roomCodeFromStartParam } from '@doner-game/shared';
import type { CharacterId } from '@doner-game/shared';
import { getTelegramStartParam, getTelegramWebApp, initializeTelegram, isTelegramLaunch } from './telegram';
import { usePlayerAuth } from './usePlayerAuth';
import { PlayerPanel } from './PlayerPanel';
import { CharacterSelect } from './CharacterSelect';
import { GameScreen } from './GameScreen';
import { WinterScene } from './WinterScene';
import { PartyScreen } from './PartyScreen';

type Screen = 'home' | 'party' | 'characters' | 'profile' | 'how' | 'settings' | 'arena';
const titles = { home: 'DONER GAME', party: 'СОБЕРИ ДРУЗЕЙ', characters: 'ПЕРСОНАЖИ', profile: 'МОЙ ПРОФИЛЬ', how: 'КАК ИГРАТЬ', settings: 'НАСТРОЙКИ', arena: 'SNOWY CHAOS' };
export function App() {
  const [webApp] = useState(getTelegramWebApp);
  const [inviteCode] = useState(() => roomCodeFromStartParam(getTelegramStartParam()) ?? '');
  const [screen, setScreen] = useState<Screen>(() => { try { return inviteCode || sessionStorage.getItem('doner-active-room') ? 'party' : 'home'; } catch { return inviteCode ? 'party' : 'home'; } });
  const [partyEntry, setPartyEntry] = useState<'create' | 'join' | 'menu'>(inviteCode ? 'join' : 'menu');
  const partyBack = useRef<(() => void) | null>(null);
  const openParty = (entry: 'create' | 'join' | 'menu') => { setPartyEntry(entry); setScreen('party'); };
  const [trainingCharacter, setTrainingCharacter] = useState<CharacterId | null>(null);
  const [match, setMatch] = useState(0);
  const [lessMotion, setLessMotion] = useState(false);
  const [systemMotion, setSystemMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reducedMotion = lessMotion || systemMotion;
  const auth = usePlayerAuth(webApp?.initData);
  const profile = auth.state.status === 'authenticated' ? auth.state.profile : undefined;
  const selected = getCharacter(profile?.progress.selectedCharacterId);
  const localCharacter = trainingCharacter ?? (selected && profile?.progress.unlockedCharacterIds.includes(selected.id) ? selected.id : 'altoha');
  const characterId = localCharacter;
  const train = () => { setMatch(v => v + 1); setScreen('arena'); };
  useEffect(() => initializeTelegram(webApp), [webApp]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystemMotion(media.matches);
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0); document.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    const back = () => { if (screen === 'party' && partyBack.current) partyBack.current(); else setScreen('home'); };
    if (!webApp?.BackButton) return;
    const button = webApp.BackButton;
    if (screen === 'home') button.hide(); else { button.show(); button.onClick(back); }
    return () => { button.offClick(back); button.hide(); };
  }, [screen, webApp]);
  return <div className={`app-shell${screen === 'arena' || screen === 'party' ? ' app-shell--game' : ''}${reducedMotion ? ' reduce-motion' : ''}`}>
    <header className="top-bar"><span><i className="brand-dot" /> DONER GAME</span><span>WINTER / 26</span></header>
    <main className={`screen screen--${screen}`}>
      {screen === 'party' ? (profile && auth.socketCredentials() ? <PartyScreen credentials={auth.socketCredentials()!} userId={profile.user.id} initialCode={inviteCode} entry={partyEntry} onExit={() => { setScreen('home'); void auth.refresh(); }} onBalance={auth.confirmedBalance} onReauthenticate={auth.retry} backRequest={partyBack} reducedMotion={reducedMotion} /> : <section className="info-panel pixel-panel"><button className="back-button" onClick={() => setScreen('home')}>← НАЗАД</button><h1>ИГРА С ДРУЗЬЯМИ</h1><PlayerPanel auth={auth.state} retry={auth.retry} inTelegram={isTelegramLaunch(webApp)} localCharacter={localCharacter} /><p>Открой DONER GAME через Telegram, чтобы войти в комнату под своим аккаунтом.</p><button className="pixel-button" onClick={train}>ЛОКАЛЬНАЯ ТРЕНИРОВКА</button></section>) : screen === 'arena' ? <GameScreen key={match} characterId={characterId} onBack={() => setScreen('home')} onNewMatch={() => setMatch(v => v + 1)} reducedMotion={reducedMotion} /> : <>
        {screen === 'home' ? <section className="hero"><div className="sign-snow" /><p className="eyebrow">СНЕГ. ДРУЗЬЯ. ХАОС.</p><h1 tabIndex={-1}>DONER <span>GAME</span></h1><p className="winter-edition">WINTER PARTY EDITION</p><WinterScene /><p className="hero-caption">Построй подвох. Добеги первым.</p></section> : <div className="screen-heading"><button className="back-button" onClick={() => setScreen('home')}>← НАЗАД</button><p className="eyebrow">WINTER PARTY EDITION</p><h1 tabIndex={-1}>{titles[screen]}</h1></div>}
        {(screen === 'home' || screen === 'profile') && <PlayerPanel auth={auth.state} retry={auth.retry} inTelegram={isTelegramLaunch(webApp)} localCharacter={localCharacter} />}
        {screen === 'home' && <nav className="menu" aria-label="Главное меню">
          <button className="pixel-button main-play" onClick={() => openParty('menu')}><span>ИГРАТЬ С ДРУЗЬЯМИ</span><small>СОБЕРИТЕ СВОЮ СНЕЖНУЮ БАНДУ →</small></button>
          <div className="room-actions"><button onClick={() => openParty('create')}>СОЗДАТЬ КОМНАТУ</button><button onClick={() => openParty('join')}>ВОЙТИ ПО КОДУ</button></div>
          <button className="training-button" onClick={train}><span className="training-icon">⚑</span><span><b>ТРЕНИРОВКА</b><small>Поставь блок. Испытай трассу.</small></span><span>→</span></button>
          <div className="menu-grid"><button onClick={() => setScreen('characters')}>ПЕРСОНАЖИ</button><button onClick={() => setScreen('profile')}>МОЙ ПРОФИЛЬ</button><button onClick={() => setScreen('how')}>КАК ИГРАТЬ</button><button onClick={() => setScreen('settings')}>НАСТРОЙКИ</button></div>
          <p className="menu-note">Горячий донер. Холодный расчёт.</p>
        </nav>}

        {screen === 'characters' && <CharacterSelect progress={profile?.progress} localCharacter={localCharacter} pending={auth.pendingCharacter} error={auth.actionError} onSelect={id => void auth.changeCharacter('select', id)} onLocalSelect={setTrainingCharacter} onPlay={train} />}
        {screen === 'profile' && <section className="info-panel pixel-panel"><h2>ТВОЯ ПАРТИЯ ВПЕРЕДИ</h2><p>Doner можно тратить на FAN, CROSSBOW и EXTRA BLOCK во время BUILD.</p><p className="hint">Тренировка бесплатна и не выдаёт награды. В матчах очки получают лидеры, а больше Doner — отстающие.</p><button className="button-secondary" onClick={() => setScreen('characters')}>ВЫБРАТЬ ПЕРСОНАЖА</button></section>}
        {screen === 'how' && <section className="info-panel pixel-panel"><h2>ПОСТРОЙ → БЕГИ → ПОВТОРИ</h2><ol><li>Создай комнату и пригласи 1–3 друзей ссылкой или кодом. Выберите героев, нажмите ГОТОВ; host начнёт матч.</li><li>В BUILD выбери бесплатный блок, FAN за2 или CROSSBOW за3 Doner. После бесплатного блока можно купить EXTRA за1 либо завершить ход. Зелёный preview — можно ставить.</li><li>Когда все готовы или время вышло, начинается общий RACE. Беги к клетчатому финишу, прыгай через уступы.</li><li>После общих RESULTS host запускает следующий раунд. Все прежние блоки остаются.</li></ol><p>До 5 раундов. BUILD — 60 секунд, RACE — 90 секунд. Пауза останавливает только твоё управление.</p><p className="hint">За места1–4 получишь3/2/1/0 очков и0/1/2/3 Doner; DNF —0. Тренировка бесплатна, без наград; её карта сбрасывается при выходе в меню.</p><button className="pixel-button" onClick={train}>ПОПРОБОВАТЬ В ТРЕНИРОВКЕ</button></section>}
        {screen === 'settings' && <section className="info-panel pixel-panel"><h2>УЮТНЫЙ РЕЖИМ</h2><label className="setting"><input type="checkbox" checked={reducedMotion} disabled={systemMotion} onChange={e => setLessMotion(e.target.checked)} />Уменьшить анимацию</label><p className="hint">{systemMotion ? 'Включено настройкой вашего устройства.' : 'Убирает движение снега и мерцание огней.'}</p><p>Управление: стрелки / A, D и Space / W. На телефоне — кнопки под ареной.</p><p className="hint">В этом прототипе звука пока нет.</p></section>}
      </>}
    </main><footer className="footer">v0.6.3 Doner Economy & Trap Shop</footer>
  </div>;
}
