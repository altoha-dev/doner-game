import type { CharacterId } from './characters.js';

export interface WorldTheme {
  readonly themeId: 'altoha-city' | 'aigerim-imperial' | 'temik-bazaar';
  readonly characterId: CharacterId;
  readonly displayName: string;
  readonly backgroundStyle: 'city' | 'imperial' | 'bazaar';
  readonly platformStyle: 'metal' | 'stone' | 'sandstone';
  readonly decorStyle: 'signs' | 'banners' | 'awnings';
  readonly palette: {
    readonly sky: string; readonly distant: string; readonly middle: string;
    readonly surface: string; readonly edge: string; readonly shadow: string;
    readonly accent: string; readonly secondary: string; readonly light: string;
  };
  readonly player: {
    readonly skin: string; readonly hair: string; readonly outfit: string;
    readonly trim: string; readonly trousers: string;
  };
}

export const WORLD_THEMES = {
  altoha: {
    themeId: 'altoha-city', characterId: 'altoha', displayName: 'НОЧНОЙ ГОРОД',
    backgroundStyle: 'city', platformStyle: 'metal', decorStyle: 'signs',
    palette: { sky: '#111c32', distant: '#1c2d49', middle: '#29445b', surface: '#374657', edge: '#6c8494', shadow: '#131c28', accent: '#ffa64d', secondary: '#68d5d4', light: '#dddcb9' },
    player: { skin: '#e6b38a', hair: '#25222a', outfit: '#ed9148', trim: '#68d5d4', trousers: '#273949' },
  },
  aigerim: {
    themeId: 'aigerim-imperial', characterId: 'aigerim', displayName: 'ИМПЕРСКИЙ ДВОР',
    backgroundStyle: 'imperial', platformStyle: 'stone', decorStyle: 'banners',
    palette: { sky: '#251c38', distant: '#3b2a50', middle: '#57405f', surface: '#67556f', edge: '#a692a8', shadow: '#2c2338', accent: '#e6c579', secondary: '#923f61', light: '#edddbb' },
    player: { skin: '#edbd99', hair: '#322535', outfit: '#985eba', trim: '#e6c579', trousers: '#492b59' },
  },
  temik: {
    themeId: 'temik-bazaar', characterId: 'temik', displayName: 'ПЕСЧАНЫЙ БАЗАР',
    backgroundStyle: 'bazaar', platformStyle: 'sandstone', decorStyle: 'awnings',
    palette: { sky: '#d5ad7c', distant: '#ae795a', middle: '#805344', surface: '#ac7853', edge: '#e2bb86', shadow: '#573c34', accent: '#c56951', secondary: '#548d80', light: '#ffe2af' },
    player: { skin: '#d69b72', hair: '#47332b', outfit: '#d4b478', trim: '#bf5747', trousers: '#416b61' },
  },
} as const satisfies Record<CharacterId, WorldTheme>;

export function getWorldTheme(characterId: CharacterId): WorldTheme {
  return WORLD_THEMES[characterId];
}
