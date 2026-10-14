import { CHARACTERS, getCharacter } from '@doner-game/shared';
import type { CharacterId, PlayerProfileDto } from '@doner-game/shared';
import { CAMPAIGN_LEVELS, getLevelState } from './campaign';
import { CharacterPortrait, PixelIcon } from './PixelArt';
import { getPlayerLaunch } from './game/launch';

export function CampaignScreen({ profile, onCharacters, onPlay, onPreview }: { profile: PlayerProfileDto | undefined; onCharacters: () => void; onPlay: () => void; onPreview: ((id: CharacterId) => void) | undefined }) {
  const progress = profile?.progress;
  const selected = getCharacter(progress?.selectedCharacterId);
  const available = CHARACTERS.filter(character => progress?.unlockedCharacterIds.includes(character.id));
  const launch = getPlayerLaunch(progress);
  return <div className="campaign-content">
    {!profile && <p className="preview-note">Предпросмотр сюжета. Откройте Mini App в Telegram, чтобы сохранить свой выбор.</p>}
    <section className="chapter-panel pixel-panel" aria-labelledby="chapter-title">
      <div className="chapter-heading"><div><p className="eyebrow">СЮЖЕТНЫЙ РЕЖИМ</p><h2 id="chapter-title">ГЛАВА <span>01</span></h2></div><span className="chapter-progress">ПРОГРЕСС <b>{progress?.campaignStage ?? 0}</b></span></div>
      <ol className="level-map" aria-label="Карта главы">
        {CAMPAIGN_LEVELS.map(level => {
          const state = getLevelState(level, progress?.campaignStage ?? 0);
          return <li className={`level-node level-node--${state}`} key={level}>
            <span className="node-emblem"><PixelIcon name={state === 'locked' ? 'lock' : state === 'completed' ? 'check' : 'flag'} /></span>
            <div className="node-copy"><span className="node-number">0{level}</span><h3>УРОВЕНЬ {level}</h3><p>{level !== 1 ? 'СКОРО' : state === 'completed' ? 'ПРОЙДЕН · ПОВТОРИТЬ' : 'ИГРОВОЙ ПРОТОТИП'}</p></div>
            {state === 'available' && <span className="node-marker" aria-hidden="true">◀</span>}
          </li>;
        })}
      </ol>
      <div className="level-coming"><span className="eyebrow">ПЕРВЫЙ МИР · БЕЗ НАГРАД</span><button className="pixel-button" disabled={!launch} onClick={onPlay}><PixelIcon name="flag" />ИГРАТЬ · УРОВЕНЬ 1</button>{!launch && <p className="hint">{profile ? 'Выбери открытого персонажа для запуска.' : 'Для игры своим персонажем войдите через Telegram.'}</p>}</div>
    </section>
    {onPreview && <aside className="local-preview pixel-panel"><span className="eyebrow">LOCAL DEVELOPMENT PREVIEW</span><p>Посмотри три мира без аккаунта. Этот режим доступен только в локальной dev-сборке.</p><div className="local-preview-buttons">{CHARACTERS.map(character => <button key={character.id} className="pixel-button button-secondary" onClick={() => onPreview(character.id)}>{character.displayName}</button>)}</div></aside>}
    <section className="loadout-panel pixel-panel" aria-labelledby="loadout-title">
      <div className="loadout-heading"><div><p className="eyebrow">ТВОЙ ПЕРСОНАЖ</p><h2 id="loadout-title">{selected?.displayName ?? 'Выбери героя'}</h2></div><CharacterPortrait characterId={selected?.id} /></div>
      <p className="hint">Доступны: {available.length ? available.map(character => character.displayName).join(', ') : 'войдите через Telegram'}</p>
      <button className="pixel-button button-secondary" onClick={onCharacters}><PixelIcon name="person" />ВЫБРАТЬ ПЕРСОНАЖА<PixelIcon name="arrow" /></button>
    </section>
  </div>;
}
