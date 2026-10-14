export type GameMode = 'home' | 'solo' | 'party';
export { CHARACTERS, STARTER_CHARACTER, getCharacter } from './characters.js';
export type { CharacterId, CharacterDefinition } from './characters.js';
export { WORLD_THEMES, getWorldTheme } from './worldThemes.js';
export type { WorldTheme } from './worldThemes.js';

export interface PlayerDto {
  id: string;
  telegramId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  languageCode: string | null;
}

export interface PlayerProgressDto {
  doners: number;
  goldenDoners: number;
  campaignStage: number;
  unlockedCharacterIds: string[];
  selectedCharacterId: string | null;
}

export interface UnlockCharacterResponseDto {
  progress: PlayerProgressDto;
  result: 'unlocked' | 'already_unlocked';
}

export interface PlayerProfileDto {
  user: PlayerDto;
  progress: PlayerProgressDto;
}

export interface AuthResponseDto extends PlayerProfileDto {
  accessToken: string;
  expiresIn: number;
}

export interface ApiErrorDto {
  error: { code: string; message: string };
}
