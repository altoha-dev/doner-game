import Phaser from 'phaser';
import type { GameLaunch } from './launch';
import type { GameInput } from './input';
import { MOVEMENT } from './level';
import { createPrototypeTextures } from './textures';

export interface GameRuntime { setPaused: (paused: boolean) => void; destroy: () => void }
interface Options {
  host: HTMLDivElement;
  launch: GameLaunch;
  input: GameInput;
  reducedMotion: boolean;
  onReady: () => void;
  onGoal: () => void;
}

export function createGame({ host, launch, input, reducedMotion, onReady, onGoal }: Options): GameRuntime {
  let disposed = false, paused = false;
  const measure = () => ({ width: Math.max(1, Math.floor(host.clientWidth / 2)), height: Math.max(1, Math.floor(host.clientHeight / 2)) });
  class PrototypeScene extends Phaser.Scene {
    private player!: Phaser.Physics.Arcade.Sprite;
    private far!: Phaser.GameObjects.TileSprite;
    private middle!: Phaser.GameObjects.TileSprite;
    private groundedAt = -Infinity;
    private jumpAt = -Infinity;
    private reachedGoal = false;
    create() {
      const { level, theme } = launch;
      createPrototypeTextures(this, theme);
      this.far = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'far').setOrigin(0).setScrollFactor(0).setDepth(-3);
      this.middle = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, 'middle').setOrigin(0).setScrollFactor(0).setDepth(-2);
      const solids = this.physics.add.staticGroup();
      for (const platform of level.platforms) {
        const tile = this.add.tileSprite(platform.x, platform.y, platform.width, platform.height, 'platform').setOrigin(0);
        solids.add(tile);
      }
      for (const x of [64, 304, 432, 752, 872, 1080]) this.add.image(x, 300, 'decor').setOrigin(0.5, 1).setDepth(-1);
      this.add.image(level.goal.x, level.goal.y, 'goal').setOrigin(0.1, 1);
      this.player = this.physics.add.sprite(level.spawn.x, level.spawn.y, 'player', 0).setDepth(2);
      this.player.setSize(10, 21).setOffset(3, 2).setCollideWorldBounds(true);
      this.player.setMaxVelocity(MOVEMENT.speed, 420).setDragX(MOVEMENT.drag);
      this.physics.world.setBounds(0, 0, level.width, level.height);
      this.physics.add.collider(this.player, solids);
      this.cameras.main.setBounds(0, 0, level.width, level.height).startFollow(this.player, true, 1, 1);
      this.cameras.main.setDeadzone(32, 32);
      this.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this));
      this.resize();
      if (paused) this.physics.pause();
      if (!disposed) onReady();
    }
    resize() {
      const { width, height } = this.scale;
      this.cameras.main.setSize(width, height);
      for (const layer of [this.far, this.middle]) {
        layer.setSize(width, height);
        layer.tilePositionY = 512 - height + 16;
      }
    }
    setPaused(value: boolean) {
      this.groundedAt = -Infinity; this.jumpAt = -Infinity;
      if (!this.player) return;
      if (value) this.physics.pause();
      else this.physics.resume();
    }
    update(time: number) {
      if (disposed || paused) return;
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      if (body.blocked.down) this.groundedAt = time;
      if (input.consumeJump()) this.jumpAt = time;
      if (time - this.jumpAt <= MOVEMENT.bufferMs && time - this.groundedAt <= MOVEMENT.coyoteMs) {
        this.player.setVelocityY(-MOVEMENT.jump);
        this.jumpAt = -Infinity; this.groundedAt = -Infinity;
      }
      const direction = input.direction;
      this.player.setAccelerationX(direction * MOVEMENT.acceleration);
      if (direction) this.player.setFlipX(direction < 0);
      this.player.setFrame(!body.blocked.down ? 3 : Math.abs(body.velocity.x) > 8 ? 1 + Math.floor(time / 120) % 2 : 0);
      const camera = this.cameras.main;
      this.far.tilePositionX = reducedMotion ? 0 : Math.round(camera.scrollX * 0.14);
      this.middle.tilePositionX = reducedMotion ? 0 : Math.round(camera.scrollX * 0.38);
      if (!this.reachedGoal && this.player.x >= launch.level.goal.x - 12) { this.reachedGoal = true; onGoal(); }
      // Read-only local diagnostics for browser QA, eliminated from production builds.
      if (import.meta.env.DEV) {
        host.dataset.playerX = String(Math.round(this.player.x));
        host.dataset.playerY = String(Math.round(this.player.y));
        host.dataset.cameraX = String(Math.round(camera.scrollX));
        host.dataset.grounded = String(body.blocked.down);
      }
    }
  }
  const scene = new PrototypeScene('prototype');
  const game = new Phaser.Game({
    type: Phaser.CANVAS, parent: host, ...measure(), backgroundColor: launch.theme.palette.sky,
    pixelArt: true, roundPixels: true, banner: false,
    scale: { mode: Phaser.Scale.NONE, zoom: 2, autoCenter: Phaser.Scale.CENTER_BOTH },
    audio: { noAudio: true }, input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: MOVEMENT.gravity }, debug: false } },
    scene: [scene],
  });
  const observer = new ResizeObserver(() => {
    if (!disposed && game.isBooted) { const size = measure(); game.scale.resize(size.width, size.height); }
  });
  observer.observe(host);
  return {
    setPaused(value) { paused = value; input.clear(); scene.setPaused(value); },
    destroy() {
      if (disposed) return;
      disposed = true;
      observer.disconnect(); input.clear();
      // Phaser finishes disposal on its next frame; keep core plugins for the next launch.
      game.destroy(true, false);
      game.canvas?.remove();
    },
  };
}
