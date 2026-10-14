import { useEffect, useRef, useState } from 'react';
import type { CharacterId } from '@doner-game/shared';
import { DonerMark } from './DonerMark';
import { getTelegramStartParam, getTelegramWebApp, initializeTelegram, isTelegramLaunch } from './telegram';
import { usePlayerAuth } from './usePlayerAuth';
import { PlayerPanel } from './PlayerPanel';
import { PixelIcon } from './PixelArt';
import { CampaignScreen } from './CampaignScreen';
import { CharacterSelect } from './CharacterSelect';
import { getBackScreen } from './campaign';
import type { GameOrigin, Screen } from './campaign';
import { GameScreen } from './GameScreen';
import { getPlayerLaunch, getPreviewLaunch } from './game/launch';
import type { GameLaunch } from './game/launch';

export function App() {
  const [webApp] = useState(getTelegramWebApp);
  const [startParam] = useState(getTelegramStartParam);
  const [screen, setScreen] = useState<Screen>('home');
  const [partyOpen, setPartyOpen] = useState(false);
  const [gameLaunch, setGameLaunch] = useState<GameLaunch | null>(null);
  const [gameOrigin, setGameOrigin] = useState<GameOrigin>('campaign');
  const title = useRef<HTMLHeadingElement>(null);
  const inTelegram = isTelegramLaunch(webApp);
  useEffect(() => initializeTelegram(webApp), [webApp]);
  const auth = usePlayerAuth(webApp?.initData);
  const profile = auth.state.status === 'authenticated' ? auth.state.profile : undefined;
  const back = () => setScreen(getBackScreen(screen, gameOrigin));
  const play = () => {
    const launch = getPlayerLaunch(profile?.progress);
    if (!launch || auth.pendingCharacter !== null) return;
    setGameLaunch(launch); setGameOrigin(screen === 'characters' ? 'characters' : 'campaign'); setScreen('game');
  };
  const preview = (id: CharacterId) => {
    const launch = getPreviewLaunch(id, import.meta.env.DEV, auth.state.status === 'browser');
    if (!launch) return;
    setGameLaunch(launch); setGameOrigin('campaign'); setScreen('game');
  };
  const gameAllowed = gameLaunch && (gameLaunch.preview
    ? import.meta.env.DEV && auth.state.status === 'browser'
    : profile?.progress.selectedCharacterId === gameLaunch.character.id && profile.progress.unlockedCharacterIds.includes(gameLaunch.character.id));

  useEffect(() => {
    if (screen === 'game' && !gameAllowed) setScreen(gameOrigin);
  }, [screen, gameAllowed, gameOrigin]);

  useEffect(() => {
    window.scrollTo(0, 0);
    title.current?.focus({ preventScroll: true });
    if (!webApp?.BackButton) return;
    const button = webApp.BackButton;
    const goBack = () => setScreen(getBackScreen(screen, gameOrigin));
    if (screen === 'home') button.hide();
    else { button.show(); button.onClick(goBack); }
    return () => { button.offClick(goBack); button.hide(); };
  }, [screen, webApp, gameOrigin]);

  return <div className={`app-shell${screen === 'game' ? ' app-shell--game' : ''}`}>
    <header className="top-bar"><span className="brand-tag"><span className="brand-dot" />DONER UNIVERSE</span><span className="edition">EST. 2026</span></header>
    <main className={`screen screen--${screen}`} key={screen}>
      {screen === 'game' ? gameLaunch && gameAllowed && <GameScreen launch={gameLaunch} onBack={back} /> : <>
      {screen === 'home' ? <section className="hero" aria-labelledby="game-title">
        <DonerMark />
        <h1 id="game-title" ref={title} tabIndex={-1}>DONER <span>GAME</span></h1>
        <p className="hero-caption">Большое приключение.<br />С двойной порцией соуса.</p>
      </section> : <div className="screen-heading"><button className="back-button" onClick={back}><PixelIcon name="back" />НАЗАД</button><p className="eyebrow">SOLO CAMPAIGN / {screen === 'campaign' ? '01' : '02'}</p><h1 ref={title} tabIndex={-1}>{screen === 'campaign' ? 'СЮЖЕТ' : <>ВЫБОР<br />ПЕРСОНАЖА</>}</h1></div>}

      <PlayerPanel auth={auth.state} retry={auth.retry} inTelegram={inTelegram} />

      {screen === 'home' ? <section className="menu" aria-label="Главное меню">
        <div className="section-label"><span className="eyebrow">ВЫБЕРИ ПРИКЛЮЧЕНИЕ</span><span aria-hidden="true">01 — 02</span></div>
        <button className="menu-button menu-button--story" onClick={() => setScreen('campaign')}><span className="menu-icon"><PixelIcon name="flag" /></span><span className="menu-copy"><span className="menu-title">СЮЖЕТ</span><span className="menu-caption">Твоя собственная история</span></span><PixelIcon name="arrow" /></button>
        <button className="menu-button menu-button--party" onClick={() => setPartyOpen(value => !value)} aria-expanded={partyOpen} aria-controls="party-preview"><span className="menu-icon"><PixelIcon name="party" /></span><span className="menu-copy"><span className="menu-title">ИГРАТЬ С ДРУЗЬЯМИ</span><span className="menu-caption">Вместе веселее · скоро</span></span><PixelIcon name="arrow" /></button>
        {partyOpen && <aside className="party-preview pixel-panel" id="party-preview"><span className="eyebrow">PARTY MODE</span><h2>СКОРО</h2><p>Здесь можно будет играть вместе.</p><button className="text-button" onClick={() => setPartyOpen(false)}>ПОНЯТНО</button></aside>}
        <p className="menu-note"><PixelIcon name="sparkle" />Каждое приключение начинается с донера.</p>
      </section> : screen === 'campaign' ? <CampaignScreen profile={profile} onCharacters={() => setScreen('characters')} onPlay={play} onPreview={import.meta.env.DEV && auth.state.status === 'browser' ? preview : undefined} /> : <CharacterSelect progress={profile?.progress} pending={auth.pendingCharacter} error={auth.actionError} notice={auth.notice} onAction={auth.changeCharacter} onPlay={play} />}

      {inTelegram && <p className="launch-param">Launch: {startParam}</p>}
      {import.meta.env.DEV && <aside className="debug-panel" aria-label="Диагностика запуска"><span>Telegram: {inTelegram ? 'yes' : 'no'}</span><span>User: {profile ? 'yes' : 'no'}</span><span>Account: {auth.state.status}</span><span>start_param: {startParam}</span></aside>}
      </>}
    </main>
    <footer className="footer"><span />v0.5 Playable Prototype<span /></footer>
  </div>;
}
