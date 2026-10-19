import { useEffect, useState } from 'react';
import { getCharacter } from '@doner-game/shared';
import type { CharacterId } from '@doner-game/shared';
import { getTelegramWebApp, initializeTelegram, isTelegramLaunch } from './telegram';
import { usePlayerAuth } from './usePlayerAuth';
import { PlayerPanel } from './PlayerPanel';
import { CharacterSelect } from './CharacterSelect';
import { GameScreen } from './GameScreen';
import { WinterScene } from './WinterScene';

type Screen = 'home' | 'party' | 'characters' | 'profile' | 'how' | 'settings' | 'arena';
const titles = { home: 'DONER GAME', party: 'СОБЕРИ ДРУЗЕЙ', characters: 'ПЕРСОНАЖИ', profile: 'МОЙ ПРОФИЛЬ', how: 'КАК ИГРАТЬ', settings: 'НАСТРОЙКИ', arena: 'SNOWY CHAOS' };
export function App() {
  const [webApp] = useState(getTelegramWebApp);
  const [screen, setScreen] = useState<Screen>('home');
  const [localCharacter, setLocalCharacter] = useState<CharacterId>('altoha');
  const [match, setMatch] = useState(0);
  const [lessMotion, setLessMotion] = useState(false);
  const [systemMotion, setSystemMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reducedMotion = lessMotion || systemMotion;
  const auth = usePlayerAuth(webApp?.initData);
  const profile = auth.state.status === 'authenticated' ? auth.state.profile : undefined;
  const selected = getCharacter(profile?.progress.selectedCharacterId);
  const characterId = selected && profile?.progress.unlockedCharacterIds.includes(selected.id) ? selected.id : localCharacter;
  const train = () => { setMatch(v => v + 1); setScreen('arena'); };
  useEffect(() => initializeTelegram(webApp), [webApp]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystemMotion(media.matches);
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0); document.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    const back = () => setScreen('home');
    if (!webApp?.BackButton) return;
    const button = webApp.BackButton;
    if (screen === 'home') button.hide(); else { button.show(); button.onClick(back); }
    return () => { button.offClick(back); button.hide(); };
  }, [screen, webApp]);
  return <div className={`app-shell${screen === 'arena' ? ' app-shell--game' : ''}${reducedMotion ? ' reduce-motion' : ''}`}>
    <header className="top-bar"><span><i className="brand-dot" /> DONER GAME</span><span>WINTER / 26</span></header>
    <main className={`screen screen--${screen}`}>
      {screen === 'arena' ? <GameScreen key={match} characterId={characterId} onBack={() => setScreen('home')} onNewMatch={() => setMatch(v => v + 1)} reducedMotion={reducedMotion} /> : <>
        {screen === 'home' ? <section className="hero"><div className="sign-snow" /><p className="eyebrow">СНЕГ. ДРУЗЬЯ. ХАОС.</p><h1 tabIndex={-1}>DONER <span>GAME</span></h1><p className="winter-edition">WINTER PARTY EDITION</p><WinterScene /><p className="hero-caption">Построй подвох. Добеги первым.</p></section> : <div className="screen-heading"><button className="back-button" onClick={() => setScreen('home')}>← НАЗАД</button><p className="eyebrow">WINTER PARTY EDITION</p><h1 tabIndex={-1}>{titles[screen]}</h1></div>}
        {(screen === 'home' || screen === 'profile') && <PlayerPanel auth={auth.state} retry={auth.retry} inTelegram={isTelegramLaunch(webApp)} localCharacter={localCharacter} />}
        {screen === 'home' && <nav className="menu" aria-label="Главное меню">
          <button className="pixel-button main-play" onClick={() => setScreen('party')}><span>ИГРАТЬ С ДРУЗЬЯМИ</span><small>СОБЕРИТЕ СВОЮ СНЕЖНУЮ БАНДУ →</small></button>
          <div className="room-actions"><button onClick={() => setScreen('party')}>СОЗДАТЬ КОМНАТУ</button><button onClick={() => setScreen('party')}>ВОЙТИ ПО КОДУ</button></div>
          <button className="training-button" onClick={train}><span className="training-icon">⚑</span><span><b>ТРЕНИРОВКА</b><small>Поставь блок. Испытай трассу.</small></span><span>→</span></button>
          <div className="menu-grid"><button onClick={() => setScreen('characters')}>ПЕРСОНАЖИ</button><button onClick={() => setScreen('profile')}>МОЙ ПРОФИЛЬ</button><button onClick={() => setScreen('how')}>КАК ИГРАТЬ</button><button onClick={() => setScreen('settings')}>НАСТРОЙКИ</button></div>
          <p className="menu-note">Горячий донер. Холодный расчёт.</p>
        </nav>}
        {screen === 'party' && <section className="coming-soon pixel-panel"><span className="party-symbol">2—4</span><h2>ДРУЗЬЯ УЖЕ<br />НАДЕВАЮТ ШАПКИ</h2><p>Multiplayer coming in Stage 6.1</p><p className="hint">Комнаты и приглашения ещё в разработке. Пока можно построить трассу и проверить её одному.</p><button className="pixel-button" onClick={train}>ПОПРОБОВАТЬ ТРЕНИРОВКУ</button></section>}
        {screen === 'characters' && <CharacterSelect progress={profile?.progress} localCharacter={localCharacter} pending={auth.pendingCharacter} error={auth.actionError} onSelect={id => void auth.changeCharacter('select', id)} onLocalSelect={setLocalCharacter} onPlay={train} />}
        {screen === 'profile' && <section className="info-panel pixel-panel"><h2>ТВОЯ ПАРТИЯ ВПЕРЕДИ</h2><p>Doner станут валютой ловушек и препятствий. Баланс аккаунта сохранён.</p><p className="hint">Тренировка не выдаёт награды. Магазин появится позже.</p><button className="button-secondary" onClick={() => setScreen('characters')}>ВЫБРАТЬ ПЕРСОНАЖА</button></section>}
        {screen === 'how' && <section className="info-panel pixel-panel"><h2>ПОСТРОЙ → БЕГИ → ПОВТОРИ</h2><ol><li>В BUILD выбери бесплатный блок и место на сетке. Зелёный — можно ставить.</li><li>Подтверди блок и начни RACE. Беги к клетчатому финишу, прыгай через уступы.</li><li>После RESULTS начни следующий раунд. Все прежние блоки останутся.</li></ol><p>Новый матч или выход в меню сбрасывает локальную карту.</p><p className="hint">Сейчас доступна тренировка одного игрока. В будущих комнатах друзья будут строить и бежать вместе; появятся очки и Doner за места.</p><button className="pixel-button" onClick={train}>ПОЕХАЛИ!</button></section>}
        {screen === 'settings' && <section className="info-panel pixel-panel"><h2>УЮТНЫЙ РЕЖИМ</h2><label className="setting"><input type="checkbox" checked={reducedMotion} disabled={systemMotion} onChange={e => setLessMotion(e.target.checked)} />Уменьшить анимацию</label><p className="hint">{systemMotion ? 'Включено настройкой вашего устройства.' : 'Убирает движение снега и мерцание огней.'}</p><p>Управление: стрелки / A, D и Space / W. На телефоне — кнопки под ареной.</p><p className="hint">В этом прототипе звука пока нет.</p></section>}
      </>}
    </main><footer className="footer">v0.6 Party Reboot Prototype</footer>
  </div>;
}
