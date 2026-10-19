import { getCharacter } from '@doner-game/shared';
import type { AuthState } from './usePlayerAuth';
import type { CharacterId } from '@doner-game/shared';
import { CharacterPortrait, PixelIcon } from './PixelArt';

export function PlayerPanel({ auth, retry, inTelegram, localCharacter }: { auth: AuthState; retry: () => void; inTelegram: boolean; localCharacter: CharacterId }) {
  const profile = auth.status === 'authenticated' ? auth.profile : null;
  const character = getCharacter(profile?.progress.selectedCharacterId ?? localCharacter);
  return <section className="player-panel pixel-panel" aria-label="Аккаунт игрока" aria-busy={auth.status === 'loading'}>
    <div className="player-identity">
      {profile?.user.photoUrl ? <img className="account-avatar" src={profile.user.photoUrl} alt="Аватар Telegram" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /> : <CharacterPortrait characterId={character?.id} />}
      <div className="player-copy">
        <p className="system-state"><span className="status-dot" />{inTelegram ? 'Telegram' : 'Локальная тренировка'}</p>
        {profile ? <>
          <p className="greeting">Привет, {profile.user.firstName}</p>
          {profile.user.username && <p className="username">@{profile.user.username}</p>}
          <p className="account-connected"><PixelIcon name="check" />Аккаунт подключён</p>
        </> : auth.status === 'loading' ? <p className="auth-loading" role="status">Подключаем аккаунт<span className="loading-dots">...</span></p>
          : auth.status === 'browser' ? <><p className="greeting">Привет, игрок</p><p className="hint">Твой снежный старт здесь.</p></> : <p className="greeting">Нет подключения</p>}
      </div>
    </div>
    {auth.status === 'error' && <div className="auth-error"><p role="alert">{auth.message}</p><button className="pixel-button button-secondary retry-button" onClick={retry}>Повторить</button></div>}
    <div className="player-hud" aria-label="Баланс и выбранный персонаж">
      <span className="hud-coin"><PixelIcon name="doner" /><span>DONER <b>×{profile?.progress.doners ?? '—'}</b></span></span>
      <span className="hud-coin hud-coin--gold"><PixelIcon name="golden" /><span>GOLDEN <b>×{profile?.progress.goldenDoners ?? '—'}</b></span></span>
      <span className="hud-character">{character?.displayName ?? 'Altoha · тренировка'}</span>
    </div>
  </section>;
}
