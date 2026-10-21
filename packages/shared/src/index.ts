export type GameMode = 'home' | 'training' | 'party';
export { CHARACTERS, STARTER_CHARACTER, getCharacter } from './characters.js';
export type { CharacterId, CharacterDefinition } from './characters.js';
export * from './party.js';
export { SNOWY_CHAOS } from './arena.js';

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

export * from './online.js';
export * from './physics.js';
