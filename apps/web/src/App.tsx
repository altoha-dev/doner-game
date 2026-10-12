import { useEffect, useState } from 'react';
import type { GameMode } from '@doner-game/shared';
import { DonerMark } from './DonerMark';
import {
  getDisplayUser,
  getTelegramStartParam,
  getTelegramWebApp,
  initializeTelegram,
  isTelegramLaunch,
} from './telegram';

export function App() {
  const [webApp] = useState(getTelegramWebApp);
  const [startParam] = useState(getTelegramStartParam);
  const [mode, setMode] = useState<GameMode>('home');
  const inTelegram = isTelegramLaunch(webApp);
  const user = inTelegram ? getDisplayUser(webApp) : undefined;

  useEffect(() => {
    return initializeTelegram(webApp);
  }, [webApp]);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="brand-tag"><span className="brand-dot" />DONER UNIVERSE</span>
        <span className="edition">EST. 2026</span>
      </header>

      <main className="home">
        <section className="hero" aria-labelledby="game-title">
          <DonerMark />
          <h1 id="game-title">DONER <span>GAME</span></h1>
          <p className="hero-caption">Большое приключение.<br />С двойной порцией соуса.</p>
        </section>

        <section className="menu" aria-label="Главное меню">
          <div className="player-greeting">
            {inTelegram ? (
              <>
                <p className="telegram-badge"><span />Открыто в Telegram</p>
                <p className="greeting">Привет{user ? `, ${user.first_name}` : ', игрок'} <span aria-hidden="true">✌️</span></p>
                {user?.username && <p className="username">@{user.username}</p>}
              </>
            ) : (
              <p className="development-badge"><span />Development Mode</p>
            )}
          </div>

          <p className="menu-label">ВЫБЕРИ СВОЁ ПРИКЛЮЧЕНИЕ</p>

          <button
            className="mode-button mode-button--solo"
            type="button"
            aria-describedby="mode-status"
            onClick={() => setMode('solo')}
          >
            <span className="mode-icon" aria-hidden="true">🎮</span>
            <span className="mode-copy"><span className="mode-title">СЮЖЕТ</span><span className="mode-caption">Твоя собственная история</span></span>
            <span className="mode-arrow" aria-hidden="true">↗</span>
          </button>

          <button
            className="mode-button mode-button--party"
            type="button"
            aria-describedby="mode-status"
            onClick={() => setMode('party')}
          >
            <span className="mode-icon" aria-hidden="true">👥</span>
            <span className="mode-copy"><span className="mode-title">ИГРАТЬ С ДРУЗЬЯМИ</span><span className="mode-caption">Вместе веселее</span></span>
            <span className="mode-arrow" aria-hidden="true">↗</span>
          </button>

          <p id="mode-status" className="mode-status" role="status" aria-live="polite" aria-atomic="true">
            {mode === 'home' ? 'Каждое приключение начинается с донера.' : `${mode === 'solo' ? 'Сюжет' : 'Игра с друзьями'} — скоро!`}
          </p>

          {inTelegram && <p className="launch-param">Launch: {startParam}</p>}

          {import.meta.env.DEV && (
            <aside className="debug-panel" aria-label="Диагностика запуска">
              <span>Telegram: {inTelegram ? 'yes' : 'no'}</span>
              <span>User: {user ? 'yes' : 'no'}</span>
              <span>start_param: {startParam}</span>
            </aside>
          )}
        </section>
      </main>

      <footer className="footer"><span className="footer-line" /><span>v0.2 Telegram Prototype</span><span className="footer-line" /></footer>
    </div>
  );
}
