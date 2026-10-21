import type { CharacterId } from '@doner-game/shared';

const icons = {
  back: 'M7 3h3v3H7v1h7v3H7v1h3v3H7v-2H5v-2H3V7h2V5h2z',
  arrow: 'M6 3h3v2h2v2h2v3h-2v2H9v2H6v-3h3V6H6z',
  lock: 'M5 1h6v2h2v4h1v8H2V7h1V3h2zm1 3v3h4V4zm1 6v3h2v-3z',
  check: 'M1 7h3v3h3V7h3V4h3V1h3v6h-3v3h-3v3H7v3H4v-3H1z',
  flag: 'M3 1h2v1h9v7H5v6H3zm3 3v3h3V4z',
  party: 'M3 2h4v4H3zm6 1h4v4H9zM1 8h8v7H1zm9 1h5v6h-5z',
  sparkle: 'M7 0h2v5h2v2h5v2h-5v2H9v5H7v-5H5V9H0V7h5V5h2z',
  doner: 'M3 1h9v2h2v3h-2v4h-2v3H8v3H6v-3H4V9H2V5H1V3h2zm1 3v2h7V4z',
  golden: 'M5 1h6v2h3v3h1v5h-2v3h-3v1H5v-2H2v-3H1V5h2V3h2zm1 4v6h4V5z',
  person: 'M5 1h6v6H5zM3 9h10v6H3z',
};

export function PixelIcon({ name, className = '' }: { name: keyof typeof icons; className?: string }) {
  return <svg className={`pixel-icon ${className}`} viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges"><path fill="currentColor" fillRule="evenodd" d={icons[name]} /></svg>;
}

// Original code-native prototype portraits. Replace the implementation here with
// a local PNG/WebP <img> later; cards and profile panels keep the same contract.
const portraitColors: Record<CharacterId, { coat: string; light: string; hair: string }> = {
  altoha: { coat: '#d97a36', light: '#ffc16e', hair: '#473c31' },
  aigerim: { coat: '#ab92e8', light: '#f4c8e0', hair: '#41372f' },
  temik: { coat: '#67c8ba', light: '#ecbb6c', hair: '#393c36' },
  ayazhan: { coat: '#7962b5', light: '#99e6f3', hair: '#343b49' },
};
export function CharacterPortrait({ characterId, className = '' }: { characterId?: CharacterId | undefined; className?: string }) {
  const colors = characterId ? portraitColors[characterId] : { coat: '#505c52', light: '#899485', hair: '#343b34' };
  return <svg className={`character-portrait ${className}`} viewBox="0 0 32 32" role="img" aria-label={characterId ? `Портрет ${characterId} — прототип` : 'Пиксельный аватар'} shapeRendering="crispEdges">
    <path fill="#172b43" d="M0 0h32v32H0z" />
    <path fill="#36536c" d="M0 0h2v2H0zm30 0h2v2h-2zM0 30h2v2H0zm30 0h2v2h-2zM4 6h2v2H4zm22 14h2v2h-2zM4 23h2v2H4z" />
    <path fill="#121812" d="M7 31v-6h4v-4H9V10h2V6h12v4h2v11h-3v4h4v6z" />
    <path fill={colors.coat} d="M5 32v-6h3v-3h5v-3h7v3h5v3h3v6z" />
    <path fill={colors.light} d="M8 25h5v2H8zm12 0h4v2h-4zM14 25h4v7h-4z" />
    <path fill="#b77751" d="M13 19h7v5h-7zM9 12h15v6H9z" />
    <path fill="#e3b281" d="M11 8h11v12h-2v2h-7v-2h-2z" />
    <path fill={colors.hair} d={characterId === 'aigerim' ? 'M9 8h2V5h10v2h3v16h-3V10h-5v2h-5v11H9z' : characterId === 'temik' ? 'M9 7h3V5h9v2h3v5H9z' : 'M9 8h2V5h10v2h3v5h-3v-2h-5v2h-5v3H9z'} />
    <path fill="#252c25" d="M12 14h2v2h-2zm7 0h2v2h-2zM15 19h4v1h-4z" />
    <path fill="#f3d2a6" d="M15 13h2v5h-2z" />
    <path fill="#1a201a" d="M7 29h2v3H7zm18 0h2v3h-2z" />
    {characterId === 'ayazhan' && <><path fill={colors.coat} d="M9 5h14v5H9zM12 3h8v2h-8z" /><path fill={colors.light} d="M9 8h14v2H9zM14 1h4v3h-4z" /></>}
  </svg>;
}
