import type { CharacterDefinition, PlayerProgressDto } from '@doner-game/shared';

export type Screen = 'home' | 'campaign' | 'characters';
export const CAMPAIGN_LEVELS = [1, 2, 3] as const;
export function getLevelState(level: number, campaignStage: number): 'completed' | 'available' | 'locked' {
  if (level <= campaignStage) return 'completed';
  return level === campaignStage + 1 ? 'available' : 'locked';
}
export function getCharacterState(character: CharacterDefinition, progress: PlayerProgressDto | undefined) {
  if (!progress) return 'preview';
  if (progress.unlockedCharacterIds.includes(character.id)) return progress.selectedCharacterId === character.id ? 'selected' : 'available';
  return progress.doners >= character.unlockCost ? 'purchasable' : 'insufficient';
}
