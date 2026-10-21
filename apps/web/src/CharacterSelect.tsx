import { CHARACTERS } from '@doner-game/shared';
import type { CharacterId, PlayerProgressDto } from '@doner-game/shared';
import { CharacterPortrait } from './PixelArt';

export function CharacterSelect({ progress, localCharacter, pending, error, onSelect, onLocalSelect, onPlay }: {
  progress?: PlayerProgressDto | undefined; localCharacter: CharacterId; pending: CharacterId | null; error: string | null;
  onSelect(id: CharacterId): void; onLocalSelect(id: CharacterId): void; onPlay(): void;
}) {
  return <section className="character-select" aria-label="Персонажи">
    <p className="screen-description">Четыре персонажа. Одна снежная трасса.<br /><span>Внешность временная. Способности появятся позже.</span></p>
    {!progress && <p className="hint">Выбор для локальной тренировки. Аккаунт подключается через Telegram.</p>}
    {error && <p className="action-error" role="alert">{error}</p>}
    <div className="character-list">{CHARACTERS.map(character => {
      const selected = localCharacter === character.id;
      return <article key={character.id} className={`character-card pixel-panel${selected ? ' is-selected' : ''}`} data-character={character.id}>
        <CharacterPortrait characterId={character.id} /><div><h2>{character.displayName}</h2><p>{selected ? 'Твой участник' : 'Готов к снежной вечеринке'}</p></div>
        <button className="button-secondary" disabled={selected || pending !== null} onClick={() => { onLocalSelect(character.id); if (progress?.unlockedCharacterIds.includes(character.id)) onSelect(character.id); }}>{pending === character.id ? '…' : selected ? '✓ ВЫБРАН' : 'ВЫБРАТЬ'}</button>
      </article>;
    })}</div>
    <p className="hint">Все четверо доступны в тренировке и комнатах бесплатно. В комнате можно выбрать персонажа заново.</p>
    <button className="pixel-button" onClick={onPlay} disabled={pending !== null}>НА ТРЕНИРОВКУ →</button>
  </section>;
}
