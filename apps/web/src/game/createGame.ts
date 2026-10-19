import Phaser from 'phaser';
import type { ArenaDefinition, CharacterId, MatchSnapshot, Point } from '@doner-game/shared';
import type { GameInput } from './input';
import { MOVEMENT } from './level';
import { createWinterTextures } from './textures';
import { drawArena } from './arenaPresentation';
import { getPlayerVisual, playerFrame } from './playerVisual';

export interface GameRuntime {
  applySnapshot(snapshot: MatchSnapshot): void;
  setBuildView(centerX: number, preview: Point | null, valid: boolean): void;
  screenToWorld(clientX: number, clientY: number): Point;
  setPaused(paused: boolean): void;
  destroy(): void;
}
interface Options {
  host: HTMLDivElement; arena: ArenaDefinition; characterId: CharacterId; snapshot: MatchSnapshot;
  input: GameInput; reducedMotion: boolean; onReady(): void; onGoal(elapsedMs: number): void;
}
export function createGame({ host, arena, characterId, snapshot: initialSnapshot, input, reducedMotion, onReady, onGoal }: Options): GameRuntime {
  let disposed = false, paused = false, snapshot = initialSnapshot;
  let centerX = 192, preview: Point | null = null, valid = false;
  const visual = getPlayerVisual(characterId);
  const measure = () => ({ width: Math.max(1, Math.floor(host.clientWidth / 2)), height: Math.max(1, Math.floor(host.clientHeight / 2)) });
  class ArenaScene extends Phaser.Scene {
    player!: Phaser.Physics.Arcade.Sprite;
    private solids!: Phaser.Physics.Arcade.StaticGroup;
    private placed = new Set<string>();
    private grid!: Phaser.GameObjects.Graphics;
    private ghost!: Phaser.GameObjects.Graphics;
    private phase: MatchSnapshot['phase'] | null = null;
    private groundedAt = -Infinity;
    private jumpAt = -Infinity;
    private elapsedMs = 0;
    private reachedGoal = false;
    preload() { if (visual.sheet) this.load.spritesheet(visual.texture, visual.sheet.url, visual.sheet); }
    create() {
      if (disposed) return;
      createWinterTextures(this, characterId, !visual.sheet);
      drawArena(this, arena, reducedMotion);
      this.solids = this.physics.add.staticGroup();
      for (const rect of arena.geometry) this.solids.add(this.add.rectangle(rect.x, rect.y, rect.width, rect.height, 0, 0).setOrigin(0));
      this.player = this.physics.add.sprite(arena.spawns[0]!.x, arena.spawns[0]!.y, visual.texture, visual.idle[0]).setOrigin(visual.origin.x, visual.origin.y).setDepth(5);
      this.player.setSize(visual.body.width, visual.body.height).setOffset(visual.body.offsetX, visual.body.offsetY).setCollideWorldBounds(true);
      this.player.setMaxVelocity(MOVEMENT.speed, 420).setDragX(MOVEMENT.drag);
      this.physics.world.setBounds(0, 0, arena.width, arena.height);
      this.physics.add.collider(this.player, this.solids);
      this.cameras.main.setBounds(0, 0, arena.width, arena.height).setDeadzone(32, 32);
      this.grid = this.add.graphics().setDepth(3);
      this.grid.lineStyle(1, 0x9dd9e5, .18);
      for (let x = 0; x < arena.width; x += arena.grid) this.grid.lineBetween(x, 176, x, 272);
      for (let y = 176; y <= 272; y += arena.grid) this.grid.lineBetween(0, y, arena.width, y);
      for (const a of arena.protectedAreas) this.grid.fillStyle(0xf68b83, .09).fillRect(a.x, 176, a.width, 96);
      this.ghost = this.add.graphics().setDepth(6);
      this.apply(); this.resize();
      this.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this));
      onReady();
    }
    apply() {
      if (!this.player) return;
      for (const block of snapshot.placements) if (!this.placed.has(block.id)) {
        this.solids.add(this.add.image(block.x, block.y, 'built-block').setOrigin(0).setDepth(2));
        this.placed.add(block.id);
      }
      if (this.phase !== snapshot.phase) {
        input.clear(); this.groundedAt = -Infinity; this.jumpAt = -Infinity;
        this.phase = snapshot.phase;
        if (snapshot.phase === 'RACE') {
          this.reachedGoal = false; this.elapsedMs = 0;
          this.player.setPosition(arena.spawns[0]!.x, arena.spawns[0]!.y).setVelocity(0, 0).setAcceleration(0, 0);
          (this.player.body as Phaser.Physics.Arcade.Body).reset(this.player.x, this.player.y);
          this.cameras.main.startFollow(this.player, true, 1, 1);
        } else { this.cameras.main.stopFollow(); this.player.setVelocity(0, 0).setAcceleration(0, 0); }
      }
      this.grid.setVisible(snapshot.phase === 'BUILD');
      this.player.setVisible(snapshot.phase !== 'BUILD');
      this.refreshPause(); this.buildView();
      if (import.meta.env.DEV) { host.dataset.phase = snapshot.phase; host.dataset.placements = String(this.placed.size); host.dataset.character = characterId; }
    }
    refreshPause() {
      if (!this.player) return;
      if (paused || snapshot.phase !== 'RACE') this.physics.pause(); else this.physics.resume();
      this.groundedAt = -Infinity; this.jumpAt = -Infinity;
    }
    buildView() {
      if (!this.player) return;
      this.ghost.clear();
      if (snapshot.phase !== 'BUILD') return;
      this.cameras.main.centerOn(centerX, 232);
      if (preview) {
        const color = valid ? 0x9af1bf : 0xff8a83;
        this.ghost.fillStyle(color, .35).fillRect(preview.x, preview.y, 32, 16);
        this.ghost.lineStyle(1, color, 1).strokeRect(preview.x, preview.y, 32, 16);
        this.ghost.fillStyle(color).fillRect(preview.x + 14, preview.y + 6, 4, 4);
      }
    }
    resize() { this.cameras.main.setSize(this.scale.width, this.scale.height); this.buildView(); }
    update(time: number, delta: number) {
      if (disposed || !this.player) return;
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      if (!paused && snapshot.phase === 'RACE' && !this.reachedGoal) {
        this.elapsedMs += Math.min(delta, 100);
        if (body.blocked.down) this.groundedAt = time;
        if (input.consumeJump()) this.jumpAt = time;
        if (time - this.jumpAt <= MOVEMENT.bufferMs && time - this.groundedAt <= MOVEMENT.coyoteMs) {
          this.player.setVelocityY(-MOVEMENT.jump); this.jumpAt = -Infinity; this.groundedAt = -Infinity;
        }
        this.player.setAccelerationX(input.direction * MOVEMENT.acceleration);
        if (input.direction) this.player.setFlipX(input.direction < 0);
        this.player.setFrame(playerFrame(visual, body.blocked.down, body.velocity.x, time));
        const f = arena.finish;
        if (body.right > f.x && body.left < f.x + f.width && body.bottom > f.y && body.top < f.y + f.height) {
          this.reachedGoal = true; input.clear(); onGoal(this.elapsedMs);
        }
      }
      if (import.meta.env.DEV) {
        host.dataset.playerX = String(Math.round(body.center.x)); host.dataset.playerBottom = String(Math.round(body.bottom));
        host.dataset.grounded = String(body.blocked.down); host.dataset.cameraX = String(Math.round(this.cameras.main.scrollX));
        host.dataset.cameraY = String(Math.round(this.cameras.main.scrollY));
      }
    }
  }
  const scene = new ArenaScene('snowy-chaos');
  const game = new Phaser.Game({
    type: Phaser.CANVAS, parent: host, ...measure(), backgroundColor: '#101e38', pixelArt: true, antialias: false, roundPixels: true, banner: false,
    scale: { mode: Phaser.Scale.NONE, zoom: 2, autoCenter: Phaser.Scale.CENTER_BOTH }, audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: MOVEMENT.gravity }, debug: false } }, scene: [scene],
  });
  const observer = new ResizeObserver(() => { if (!disposed && game.isBooted) { const size = measure(); game.scale.resize(size.width, size.height); } });
  observer.observe(host);
  return {
    applySnapshot(value) { snapshot = value; scene.apply(); },
    setBuildView(x, point, isValid) { centerX = x; preview = point; valid = isValid; scene.buildView(); },
    screenToWorld(x, y) {
      const rect = game.canvas.getBoundingClientRect();
      return { x: (x - rect.left) / 2 + scene.cameras.main.scrollX, y: (y - rect.top) / 2 + scene.cameras.main.scrollY };
    },
    setPaused(value) { paused = value; input.clear(); scene.refreshPause(); },
    destroy() { if (disposed) return; disposed = true; observer.disconnect(); input.clear(); game.destroy(true, false); game.canvas?.remove(); },
  };
}
