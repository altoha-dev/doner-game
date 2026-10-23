import type { Orientation, TrapId } from '@doner-game/shared';

// Original 32×16 pixel artwork shared by Phaser textures, live ghosts and SVG shop icons.
// Rectangles stay inside the existing footprint; these are paint instructions, never colliders.
export interface ArtPixel { x: number; y: number; w: number; h: number; color: number }
export function trapPixels(id: TrapId, facing: Orientation = 'none', frame = 0): ArtPixel[] {
  const pixels: ArtPixel[] = [];
  const box = (x: number, y: number, w: number, h: number, color: number) => pixels.push({ x: id === 'arcade-crossbow' && facing === 'left' ? 32 - x - w : x, y, w, h, color });
  const ink = 0x172c40, steel = 0x53798d, ice = 0xb3dce1, snow = 0xeaf4e8, warm = 0xffca7d;
  if (id === 'basic-platform') {
    box(0,0,32,16,ink); box(1,3,30,11,0x865e4d); box(2,4,28,8,0xb48c65);
    box(3,4,7,1,0xd6af7a); box(13,8,6,1,0xd6af7a); box(23,5,5,1,0xd6af7a);
    box(10,4,1,9,0x705342); box(21,4,1,9,0x705342); box(1,13,30,2,0x5d4950);
    for (const x of [2,27]) { box(x,3,3,11,steel); box(x,4,1,8,ice); box(x+1,5,1,1,ink); box(x+1,11,1,1,ink); }
    box(0,1,32,2,ice); box(1,0,30,2,snow); box(5,2,4,2,snow); box(23,2,3,1,snow); box(15,13,2,1,warm);
  } else if (id === 'fan') {
    box(0,1,32,15,ink); box(1,2,30,12,steel); box(2,3,28,8,0x76a7b3); box(3,11,26,3,0x426477);
    box(9,2,14,12,ink); box(11,1,10,14,ink); box(10,3,12,10,0x385b70);
    if (Math.floor(frame/6)%2) {
      box(12,3,3,4,ice); box(17,9,3,4,ice); box(10,8,5,2,snow); box(17,4,5,2,snow);
    } else { box(15,3,2,9,ice); box(11,7,10,2,snow); }
    box(15,7,3,3,warm); box(16,7,1,1,snow);
    box(10,5,1,5,steel); box(21,5,1,5,steel); box(12,12,8,1,steel);
    for (const x of [3,28]) { box(x,4,1,1,ice); box(x,11,1,1,ink); }
    box(1,0,8,2,snow); box(23,0,8,2,snow); box(2,14,6,2,ink); box(24,14,6,2,ink);
    if (facing === 'up') { box(26,5,1,5,warm); box(25,6,3,1,warm); box(24,7,5,1,warm); }
    else if (facing === 'left') { box(3,7,5,1,warm); box(4,6,1,3,warm); box(5,5,1,5,warm); }
    else { box(24,7,5,1,warm); box(26,5,1,5,warm); box(27,6,1,3,warm); }
    box(3,7,2,2,facing==='left'?warm:0x9ddabf);
  } else {
    box(1,12,29,4,ink); box(3,12,25,2,steel); box(5,14,5,1,ice); box(24,14,4,1,ice);
    box(12,8,6,5,0x765548); box(13,8,2,4,0xc69c6c); box(8,5,16,6,ink);
    box(5,6,21,3,0x9b7254); box(6,6,19,1,0xd3aa76); box(4,5,4,5,0x5f5460);
    box(18,0,3,3,ink); box(21,2,3,4,ink); box(24,4,2,7,ink); box(21,10,3,4,ink); box(18,13,3,2,ink);
    box(18,1,2,2,ice); box(21,3,2,3,steel); box(24,5,1,5,ice); box(21,10,2,3,steel); box(18,13,2,1,snow);
    box(18,3,1,9,0xabb5b5); box(7,7,23,1,ice); box(28,6,3,3,Math.floor(frame)%120>=96?warm:snow);
    box(11,5,3,1,snow); box(13,10,4,1,0xd3aa76); box(3,11,4,1,snow);
  }
  return pixels;
}
