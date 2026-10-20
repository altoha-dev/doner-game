import { buildMiniAppLink } from '@doner-game/shared';
import { getBotUsername } from './config.js';

export function getMiniAppDeepLink(startParam = 'home'): string {
  if (!/^[a-zA-Z0-9_-]{1,512}$/.test(startParam)) {
    throw new Error('startParam должен содержать 1–512 символов: A–Z, a–z, 0–9, _ или -.');
  }

  return buildMiniAppLink(getBotUsername(), startParam);
}
