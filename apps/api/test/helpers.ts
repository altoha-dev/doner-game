import { createHmac } from 'node:crypto';
import type { PlayerProfileDto } from '@doner-game/shared';
import type { ApiConfig } from '../src/config.ts';
import type { PlayerStore } from '../src/players.ts';

// Synthetic fixtures only; never load a developer's .env in tests.
export const config: ApiConfig = {
  nodeEnv: 'test', port: 3001,
  databaseUrl: 'postgresql://test@localhost/doner_unit_test',
  botToken: 'unit-test-bot-token',
  jwtSecret: 'unit-test-jwt-secret-not-real-'.repeat(2),
  corsOrigins: ['http://localhost:5173', 'https://web.example.com'],
  telegramMaxAgeSeconds: 86400, trustProxyHops: 0,
};

export function signInitData(fields: Record<string, string> = {}, token = config.botToken): string {
  const data = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 4503599627370495, first_name: 'Altoha', username: 'altoha' }),
    ...fields,
  };
  const check = Object.keys(data).sort().map(key => `${key}=${data[key as keyof typeof data]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  return new URLSearchParams({ ...data, hash: createHmac('sha256', secret).update(check).digest('hex') }).toString();
}

export const profile: PlayerProfileDto = {
  user: {
    id: 'b64a723a-4598-40c4-9503-68821a265ebc', telegramId: '4503599627370495',
    firstName: 'Altoha', username: 'altoha', lastName: null, photoUrl: null, languageCode: null,
  },
  progress: { doners: 0, goldenDoners: 0, campaignStage: 0, unlockedCharacterIds: ['altoha'], selectedCharacterId: 'altoha' },
};

export function memoryPlayers(): PlayerStore {
  return {
    async login(identity) {
      return { ...profile, user: { id: profile.user.id, ...identity, telegramId: identity.telegramId.toString() } };
    },
    async unlockCharacter() { throw new Error('Unexpected mock unlock'); },
    async selectCharacter() { throw new Error('Unexpected mock selection'); },
    async findById(id) { return id === profile.user.id ? profile : null; },
  };
}
