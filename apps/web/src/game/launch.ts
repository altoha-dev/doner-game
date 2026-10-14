import { getCharacter, getWorldTheme } from '@doner-game/shared';
import type { CharacterDefinition, CharacterId, PlayerProgressDto, WorldTheme } from '@doner-game/shared';
import { LEVEL_ONE } from './level.ts';
import type { LevelDefinition } from './level.ts';

export interface GameLaunch {
  readonly character: CharacterDefinition;
  readonly theme: WorldTheme;
  readonly level: LevelDefinition;
  readonly preview: boolean;
}

export function getPlayerLaunch(progress: PlayerProgressDto | undefined): GameLaunch | null {
  const character = getCharacter(progress?.selectedCharacterId);
  if (!character || !progress?.unlockedCharacterIds.includes(character.id)) return null;
  return { character, theme: getWorldTheme(character.id), level: LEVEL_ONE, preview: false };
}

// Caller supplies Vite's compile-time DEV flag AND the explicit unauthenticated browser state.
export function getPreviewLaunch(characterId: CharacterId, isDev: boolean, isBrowser: boolean): GameLaunch | null {
  const character = getCharacter(characterId);
  if (!isDev || !isBrowser || !character) return null;
  return { character, theme: getWorldTheme(character.id), level: LEVEL_ONE, preview: true };
}
