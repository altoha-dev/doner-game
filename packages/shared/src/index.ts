export type GameMode = 'home' | 'solo' | 'party';

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
