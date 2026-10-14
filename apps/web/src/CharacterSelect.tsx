import { CHARACTERS } from '@doner-game/shared';
import type { CharacterId, PlayerProgressDto } from '@doner-game/shared';
import { getCharacterState } from './campaign';
import { CharacterPortrait, PixelIcon } from './PixelArt';
import { getPlayerLaunch } from './game/launch';

type Props = {
  progress: PlayerProgressDto | undefined;
  pending: CharacterId | null;
  error: string | null;
  notice: { characterId: CharacterId; kind: 'unlock' | 'select' } | null;
  onAction: (kind: 'unlock' | 'select', characterId: CharacterId) => Promise<void>;
  onPlay: () => void;
};
export function CharacterSelect({ progress, pending, error, notice, onAction, onPlay }: Props) {
  const launch = getPlayerLaunch(progress);
  return <section className="character-select" aria-label="Каталог персонажей">
    <p className="screen-description">Твоя история. Твой персонаж.<br /><span>Открывай в любом порядке.</span></p>
    {!progress && <p className="preview-note">Каталог доступен для просмотра. Выбор и открытие сохраняются после входа через Telegram.</p>}
    <div className="action-feedback" aria-live="polite" aria-atomic="true">
      {error ? <p className="action-error" role="alert">{error}</p> : notice && <p className="action-success"><PixelIcon name="check" />{CHARACTERS.find(character => character.id === notice.characterId)?.displayName}: {notice.kind === 'unlock' ? 'персонаж открыт!' : 'выбор сохранён'}</p>}
    </div>
    <div className="character-list">
      {[...CHARACTERS].sort((a, b) => a.order - b.order).map(character => {
        const state = getCharacterState(character, progress);
        const owned = state === 'selected' || state === 'available';
        const selected = state === 'selected';
        const busy = pending === character.id;
        const locked = !owned && !character.starter;
        const disabled = pending !== null || selected || state === 'insufficient' || state === 'preview';
        const label = busy ? 'СОХРАНЯЕМ...' : selected ? 'ВЫБРАН' : owned ? 'ВЫБРАТЬ' : state === 'preview' ? 'ВОЙДИТЕ В TELEGRAM' : state === 'insufficient' ? `НУЖЕН ${character.unlockCost} DONER` : `ОТКРЫТЬ ЗА ${character.unlockCost} DONER`;
        return <article key={character.id} data-character={character.id} className={`character-card pixel-panel ${selected ? 'is-selected' : ''} ${locked ? 'is-locked' : ''} ${notice?.kind === 'unlock' && notice.characterId === character.id ? 'just-unlocked' : ''}`} aria-label={`${character.displayName}${selected ? ', выбран' : ''}`} aria-busy={busy}>
          <div className="character-card-top"><span className="eyebrow">ПЕРСОНАЖ 0{character.order + 1}</span><span className={`character-state ${owned ? 'is-owned' : ''}`}><PixelIcon name={selected ? 'check' : locked ? 'lock' : 'person'} />{selected ? 'ВЫБРАН' : owned ? 'ДОСТУПЕН' : character.starter ? 'СТАРТОВЫЙ' : 'ЗАКРЫТ'}</span></div>
          <div className="character-card-body">
            <div className="portrait-frame"><CharacterPortrait characterId={character.id} /><span className="prototype-label">ПРОТОТИП</span></div>
            <div className="character-copy"><h2>{character.displayName}</h2><p>{character.description}</p><span className="character-price">{character.starter ? 'СТАРТОВЫЙ ПЕРСОНАЖ' : <><PixelIcon name="doner" />{character.unlockCost} DONER</>}</span></div>
          </div>
          <button className={`pixel-button ${owned ? 'button-secondary' : ''}`} disabled={disabled} onClick={() => void onAction(owned ? 'select' : 'unlock', character.id)}>{selected && <PixelIcon name="check" />}{label}</button>
        </article>;
      })}
    </div>
    <button className="pixel-button character-play" disabled={!launch || pending !== null} onClick={onPlay}><PixelIcon name="flag" />ИГРАТЬ · УРОВЕНЬ 1{launch && ` · ${launch.character.displayName}`}</button>
    <p className="catalog-note"><PixelIcon name="sparkle" />Внешность персонажей пока временная.<br />Финальные спрайты появятся позже.</p>
  </section>;
}
