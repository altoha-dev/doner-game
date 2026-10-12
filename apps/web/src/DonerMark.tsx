export function DonerMark() {
  return (
    <div className="doner-art" aria-hidden="true">
      <span className="art-spark art-spark--one">+</span>
      <span className="art-spark art-spark--two">+</span>
      <svg viewBox="0 0 120 140" className="doner-mark" fill="none">
        <path d="M30 38 42 22h39l16 16-3 25-13 17-8 41H46L35 78 23 59Z" fill="#272b23" />
        <path d="M29 41 43 27h32l16 13-5 27H34Z" fill="#f8c979" />
        <path d="m33 40 12-7h27l13 9-4 8H36Z" fill="#c37b39" />
        <path d="m29 48 13-7 13 6 12-8 20 9-2 14H32Z" fill="#88a85a" />
        <path d="m32 56 12-5 10 6 14-7 17 6-4 14H38Z" fill="#cf623c" />
        <path d="m37 56 7 3 12-4 8 7 12-4 7 4-5 11H40Z" fill="#f8e5b5" />
        <path d="m27 61 24 11 35-9-13 56H47Z" fill="#f2b760" />
        <path d="m27 61 24 11 13 47H47Z" fill="#ffd890" />
        <path d="m51 72 35-9-13 56H62Z" fill="#d79246" />
        <path d="m36 85 23 8 20-9-6 35H47Z" fill="#eee9d9" />
        <path d="m59 93 20-9-6 35H64Z" fill="#c4c6b3" />
        <path d="m49 99 11 4 7-3-3 10-11-2Z" fill="#e36f38" />
        <path d="m42 32 7-1m9 0h4m9 3 3 2" stroke="#ffe5ad" strokeWidth="3" />
      </svg>
      <span className="art-caption">+1 К ПРИКЛЮЧЕНИЯМ</span>
    </div>
  );
}
