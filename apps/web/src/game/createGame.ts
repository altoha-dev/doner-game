import Phaser from 'phaser';
import { CHARACTERS, PLAYER_COLORS, PLAYER_PHYSICS } from '@doner-game/shared';
import type { BuildPreview, MovementSnapshot, NetworkImpact, NetworkPlayer, RaceControls } from '@doner-game/shared';
import type { NetworkBridge } from '../multiplayer/connection';
import { RacePrediction } from '../multiplayer/prediction';
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
  input: GameInput; reducedMotion: boolean; network?: NetworkBridge; onReady(): void; onGoal(elapsedMs: number): void;
}
export function createGame({ host, arena, characterId, snapshot: initialSnapshot, input, reducedMotion, network, onReady, onGoal }: Options): GameRuntime {
  let disposed = false, paused = false, snapshot = initialSnapshot;
  let centerX = 192, preview: Point | null = null, valid = false;
  const visual = getPlayerVisual(characterId);
  const spawn = () => arena.spawns[network?.getRoom()?.players.find(p => p.playerId === network.localId)?.seat ?? 0] ?? arena.spawns[0]!;
  const measure = () => ({ width: Math.max(1, Math.floor(host.clientWidth / 2)), height: Math.max(1, Math.floor(host.clientHeight / 2)) });
  class ArenaScene extends Phaser.Scene {
    player!: Phaser.Physics.Arcade.Sprite;
    private solids!: Phaser.Physics.Arcade.StaticGroup;
    private placed = new Set<string>();
    private grid!: Phaser.GameObjects.Graphics;
    private ghost!: Phaser.GameObjects.Graphics;
    private phase: MatchSnapshot['phase'] | null = null;
    private round = -1;
    private groundedAt = -Infinity;
    private jumpAt = -Infinity;
    private elapsedMs = 0;
    private reachedGoal = false;
    private prediction = network ? new RacePrediction(network.localId, arena) : null;
    private accumulator = 0;
    private offset = { x: 0, y: 0 };
    private sentAt = -Infinity;
    private ownLabel?: Phaser.GameObjects.Text;
    private remote = new Map<string, { sprite: Phaser.GameObjects.Sprite; label: Phaser.GameObjects.Text; target: NetworkPlayer | null; fromX: number; fromY: number; receivedAt: number }>();
    private cancelNetwork: (() => void)[] = [];
    private previews = new Map<string, { graphic: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; value: BuildPreview; fromX: number; fromY: number; at: number }>();
    private impacts!: Phaser.GameObjects.Graphics;
    private seenImpacts = new Set<string>();
    private particles: { impact: NetworkImpact; at: number }[] = [];
    private frameTimes: number[] = [];
    preload() { if (visual.sheet) this.load.spritesheet(visual.texture, visual.sheet.url, visual.sheet); }
    create() {
      if (disposed) return;
      createWinterTextures(this, characterId, !visual.sheet);
      if (network) for (const character of CHARACTERS) createWinterTextures(this, character.id);
      drawArena(this, arena, reducedMotion);
      this.solids = this.physics.add.staticGroup();
      for (const rect of arena.geometry) this.solids.add(this.add.rectangle(rect.x, rect.y, rect.width, rect.height, 0, 0).setOrigin(0));
      this.player = this.physics.add.sprite(spawn().x, spawn().y, visual.texture, visual.idle[0]).setOrigin(visual.origin.x, visual.origin.y).setDepth(5);
      this.player.setSize(visual.body.width, visual.body.height).setOffset(visual.body.offsetX, visual.body.offsetY).setCollideWorldBounds(true);
      this.player.setMaxVelocity(MOVEMENT.speed, MOVEMENT.maxFall).setDragX(MOVEMENT.drag);
      this.physics.world.setBounds(0, 0, arena.width, arena.height);
      this.physics.add.collider(this.player, this.solids);
      this.cameras.main.setBounds(0, 0, arena.width, arena.height).setDeadzone(32, 32);
      this.grid = this.add.graphics().setDepth(3);
      this.grid.lineStyle(1, 0x9dd9e5, .18);
      for (let x = 0; x < arena.width; x += arena.grid) this.grid.lineBetween(x, 176, x, 272);
      for (let y = 176; y <= 272; y += arena.grid) this.grid.lineBetween(0, y, arena.width, y);
      for (const a of arena.protectedAreas) this.grid.fillStyle(0xf68b83, .09).fillRect(a.x, 176, a.width, 96);
      this.ghost = this.add.graphics().setDepth(6);
      this.impacts = this.add.graphics().setDepth(8);
      this.apply(); this.resize();
      if (network) {
        this.cancelNetwork.push(network.subscribeMovement((value, reset) => this.receiveMovement(value, reset)), network.subscribePreviews(() => this.syncPreviews()));
        const initial = network.getMovement();
        if (initial && snapshot.phase === 'RACE') this.receiveMovement(initial, true);
      }
      this.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this); this.cancelNetwork.forEach(cancel => cancel()); });
      onReady();
    }
    apply() {
      if (!this.player) return;
      for (const block of snapshot.placements) if (!this.placed.has(block.id)) {
        this.solids.add(this.add.image(block.x, block.y, 'built-block').setOrigin(0).setDepth(2));
        this.placed.add(block.id);
      }
      if (this.phase !== snapshot.phase || this.round !== snapshot.round) {
        this.round = snapshot.round;
        input.clear(); this.groundedAt = -Infinity; this.jumpAt = -Infinity;
        this.phase = snapshot.phase;
        if (snapshot.phase === 'RACE') {
          this.reachedGoal = false; this.elapsedMs = 0;
          this.accumulator = 0; this.offset = { x: 0, y: 0 }; this.sentAt = -Infinity;
          const room = network?.getRoom(); if (room) this.prediction?.begin(room);
          this.player.setPosition(spawn().x, spawn().y).setVelocity(0, 0).setAcceleration(0, 0);
          (this.player.body as Phaser.Physics.Arcade.Body).reset(this.player.x, this.player.y);
          this.cameras.main.startFollow(this.player, true, 1, 1);
        } else { this.cameras.main.stopFollow(); this.player.setVelocity(0, 0).setAcceleration(0, 0); }
      }
      this.syncPlayers();
      this.syncPreviews();
      this.grid.setVisible(snapshot.phase === 'BUILD');
      this.player.setVisible(snapshot.phase !== 'BUILD');
      this.refreshPause(); this.buildView();
      if (import.meta.env.DEV) { host.dataset.phase = snapshot.phase; host.dataset.placements = String(this.placed.size); host.dataset.character = characterId; }
    }
    syncPlayers() {
      if (!network) return;
      const room = network.getRoom(); if (!room) return;
      const label = (name: string) => this.add.text(0, 0, name, { fontFamily: 'monospace', fontSize: '7px', color: '#f2f5e9', backgroundColor: '#152640', padding: { x: 2, y: 1 } }).setOrigin(.5, 1).setDepth(10);
      const me = room.players.find(p => p.playerId === network.localId);
      if (!this.ownLabel) this.ownLabel = label(me?.displayName ?? 'Игрок');
      this.ownLabel.setVisible(snapshot.phase === 'RACE');
      for (const p of room.players.filter(p => !p.left && p.playerId !== network.localId)) {
        if (!this.remote.has(p.playerId)) {
          const at = arena.spawns[p.seat] ?? arena.spawns[0]!;
          this.remote.set(p.playerId, { sprite: this.add.sprite(at.x, at.y, getPlayerVisual(p.characterId).texture, 0).setOrigin(.5, 1).setDepth(5), label: label(p.displayName), target: null, fromX: at.x, fromY: at.y, receivedAt: 0 });
        }
      }
      for (const [id, actor] of this.remote) {
        if (!room.players.some(p => p.playerId === id && !p.left)) { actor.sprite.destroy(); actor.label.destroy(); this.remote.delete(id); }
        else { actor.sprite.setVisible(snapshot.phase === 'RACE'); actor.label.setVisible(snapshot.phase === 'RACE'); }
      }
      if (room.finishes.some(f => f.playerId === network.localId && f.round === snapshot.round)) { this.reachedGoal = true; this.player.setVelocity(0, 0).setAcceleration(0, 0); input.clear(); }
    }
    receiveMovement(value: MovementSnapshot, reset: boolean) {
      if (!this.player || value.round !== snapshot.round || snapshot.phase !== 'RACE') return;
      this.prediction?.reconcile(value, reset);
      const me = this.prediction?.own;
      if (me) {
        const dx = this.player.x - me.x, dy = this.player.y - me.y;
        const contact = this.prediction!.players.some(p => p.playerId !== me.playerId && p.active && Math.abs(p.x - me.x) < PLAYER_PHYSICS.width + 4 && Math.abs(p.y - me.y) < PLAYER_PHYSICS.height + 4);
        this.offset = !reset && !contact && Math.hypot(dx, dy) < PLAYER_PHYSICS.correctionSnapDistance ? { x: dx, y: dy } : { x: 0, y: 0 };
      }
      for (const player of value.players) {
        const actor = this.remote.get(player.playerId);
        if (actor) { actor.fromX = actor.sprite.x; actor.fromY = actor.sprite.y; actor.target = player; actor.receivedAt = performance.now(); }
      }
      for (const impact of value.impacts) {
        if (this.seenImpacts.has(impact.id)) continue;
        this.seenImpacts.add(impact.id);
        if (!reducedMotion) this.particles.push({ impact, at: performance.now() });
        if (import.meta.env.DEV) host.dataset.lastImpact = impact.kind;
      }
      if (this.seenImpacts.size > 256) this.seenImpacts = new Set([...this.seenImpacts].slice(-128));
    }
    syncPreviews() {
      if (!network || !this.ghost) return;
      const values = snapshot.phase === 'BUILD' ? network.getPreviews().filter(p => p.playerId !== network.localId) : [];
      for (const [id, item] of this.previews) if (!values.some(p => p.playerId === id)) { item.graphic.destroy(); item.label.destroy(); this.previews.delete(id); }
      for (const value of values) {
        let item = this.previews.get(value.playerId);
        if (!item) {
          item = { graphic: this.add.graphics().setDepth(6).setPosition(value.position.x, value.position.y),
            label: this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '7px', backgroundColor: '#152640', padding: { x: 2, y: 1 } }).setOrigin(.5, 1).setDepth(9),
            value, fromX: value.position.x, fromY: value.position.y, at: performance.now() };
          this.previews.set(value.playerId, item);
        }
        if (item.value.position.x !== value.position.x || item.value.position.y !== value.position.y) {
          item.fromX = item.graphic.x; item.fromY = item.graphic.y; item.at = performance.now();
        }
        item.value = value;
        const ownerColor = PLAYER_COLORS[value.seat] ?? PLAYER_COLORS[0];
        item.graphic.clear().fillStyle(Number.parseInt(ownerColor.slice(1), 16), .28).fillRect(0, 0, 32, 16)
          .lineStyle(1, Number.parseInt((value.valid ? ownerColor : '#ff8a83').slice(1), 16)).strokeRect(0, 0, 32, 16);
        item.label.setText(`${value.valid ? '✓' : '×'} ${value.displayName}`).setColor(value.valid ? ownerColor : '#ff8a83');
      }
      if (import.meta.env.DEV) host.dataset.remotePreviews = JSON.stringify(values);
    }
    positionNames() {
      if (!network || snapshot.phase !== 'RACE') return;
      const placed: Phaser.Geom.Rectangle[] = [];
      for (const player of [...(network.getRoom()?.players ?? [])].sort((a, b) => a.seat - b.seat)) {
        const actor = this.remote.get(player.playerId);
        const sprite = player.playerId === network.localId ? this.player : actor?.sprite;
        const label = player.playerId === network.localId ? this.ownLabel : actor?.label;
        if (!sprite || !label || player.left) continue;
        let x = sprite.x, y = sprite.y - 27;
        const camera = this.cameras.main;
        if (x >= camera.scrollX && x <= camera.scrollX + camera.width) {
          x = Phaser.Math.Clamp(x, camera.scrollX + label.width / 2 + 2, camera.scrollX + camera.width - label.width / 2 - 2);
        }
        const bounds = new Phaser.Geom.Rectangle(x - label.width / 2, y - label.height, label.width, label.height);
        while (placed.some(other => Phaser.Geom.Intersects.RectangleToRectangle(bounds, other))) {
          y -= label.height + 2; bounds.y = y - label.height;
        }
        label.setPosition(x, y); placed.push(bounds);
      }
    }
    refreshPause() {
      if (!this.player) return;
      if (network || paused || snapshot.phase !== 'RACE') this.physics.pause(); else this.physics.resume();
    }
    buildView() {
      if (!this.player) return;
      this.ghost.clear();
      if (snapshot.phase !== 'BUILD') return;
      this.cameras.main.centerOn(centerX, 232);
      if (preview) {
        const seat = network?.getRoom()?.players.find(p => p.playerId === network.localId)?.seat ?? 0;
        const color = valid ? network ? Number.parseInt(PLAYER_COLORS[seat]!.slice(1), 16) : 0x9af1bf : 0xff8a83;
        this.ghost.fillStyle(color, .35).fillRect(preview.x, preview.y, 32, 16);
        this.ghost.lineStyle(1, color, 1).strokeRect(preview.x, preview.y, 32, 16);
        this.ghost.fillStyle(color).fillRect(preview.x + 14, preview.y + 6, 4, 4);
      }
    }
    resize() { this.cameras.main.setSize(this.scale.width, this.scale.height); this.buildView(); }
    update(time: number, delta: number) {
      if (disposed || !this.player) return;
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      if (network) {
        if (snapshot.phase === 'RACE' && network.isConnected()) {
          this.accumulator += Math.min(delta, 100);
          let control: RaceControls | undefined;
          while (this.accumulator >= 1000 / PLAYER_PHYSICS.tickHz) {
            this.accumulator -= 1000 / PLAYER_PHYSICS.tickHz;
            control = this.prediction!.step(paused ? 0 : input.direction as -1 | 0 | 1, !paused && input.consumeJump());
          }
          if (control && time - this.sentAt >= 1000 / PLAYER_PHYSICS.inputHz) { this.sentAt = time; network.sendInput(control); }
          const own = this.prediction?.own;
          if (own) {
            this.offset.x *= PLAYER_PHYSICS.correctionDecay; this.offset.y *= PLAYER_PHYSICS.correctionDecay;
            body.reset(own.x, own.y); body.blocked.down = own.grounded;
            this.player.setPosition(own.x + this.offset.x, own.y + this.offset.y).setVelocity(own.velocityX, own.velocityY);
            if (own.velocityX) this.player.setFlipX(own.velocityX < 0);
            this.player.setFrame(playerFrame(visual, own.grounded, own.velocityX, time));
            this.reachedGoal = own.finished;
          }
        }
        for (const actor of this.remote.values()) if (actor.target) {
          const alpha = Phaser.Math.Clamp((performance.now() - actor.receivedAt) / PLAYER_PHYSICS.interpolationMs, 0, 1);
          actor.sprite.setPosition(Phaser.Math.Linear(actor.fromX, actor.target.x, alpha), Phaser.Math.Linear(actor.fromY, actor.target.y, alpha));
          const own = this.prediction?.own, predicted = this.prediction?.players.find(p => p.playerId === actor.target!.playerId);
          if (own && predicted?.active && (own.supportId === predicted.playerId || predicted.supportId === own.playerId ||
            (Math.abs(predicted.x - own.x) < PLAYER_PHYSICS.width + 4 && Math.abs(predicted.y - own.y) < PLAYER_PHYSICS.height + 4))) {
            // Nearby contacts use the same predicted world as the local body; avoid drawing overlap.
            actor.sprite.setPosition(predicted.x, predicted.y);
          }
          actor.sprite.setFlipX(actor.target.velocityX < 0);
          const character = network.getRoom()?.players.find(p => p.playerId === actor.target!.playerId)?.characterId ?? 'altoha';
          actor.sprite.setFrame(playerFrame(getPlayerVisual(character), actor.target.grounded, actor.target.velocityX, time));
        }
        for (const item of this.previews.values()) {
          const alpha = Phaser.Math.Clamp((performance.now() - item.at) / PLAYER_PHYSICS.interpolationMs, 0, 1);
          item.graphic.setPosition(Math.round(Phaser.Math.Linear(item.fromX, item.value.position.x, alpha)), Math.round(Phaser.Math.Linear(item.fromY, item.value.position.y, alpha)));
          item.label.setPosition(item.graphic.x + 16, item.graphic.y - 3);
        }
        this.impacts.clear();
        this.particles = this.particles.filter(p => performance.now() - p.at < 180).slice(-12);
        for (const particle of this.particles) {
          const progress = (performance.now() - particle.at) / 180;
          this.impacts.fillStyle(particle.impact.kind === 'push' ? 0xffb66d : 0x9ae0dd, 1 - progress);
          for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.impacts.fillRect(Math.round(particle.impact.x + dx! * (2 + progress * 6)), Math.round(particle.impact.y + dy! * (2 + progress * 5)), 2, 2);
        }
        this.positionNames();
      }
      if (!network && !paused && snapshot.phase === 'RACE' && !this.reachedGoal) {
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
          if (!network) { this.reachedGoal = true; input.clear(); onGoal(this.elapsedMs); }
        }
      }
      if (import.meta.env.DEV) {
        this.frameTimes.push(delta); if (this.frameTimes.length > 120) this.frameTimes.shift();
        host.dataset.fps = String(Math.round(1000 * this.frameTimes.length / this.frameTimes.reduce((a, b) => a + b, 0)));
        host.dataset.authoritativePlayers = JSON.stringify(network?.getMovement()?.players ?? []);
        host.dataset.authoritativeImpacts = JSON.stringify(network?.getMovement()?.impacts ?? []);
        host.dataset.playerSupport = this.prediction?.own?.supportId ?? '';
        host.dataset.impactParticles = String(this.particles.length);
        host.dataset.renderedPlayers = JSON.stringify([{ playerId: network?.localId, x: this.player.x, y: this.player.y, texture: this.player.texture.key, name: this.ownLabel?.text }, ...[...this.remote.entries()].map(([playerId, p]) => ({ playerId, x: p.sprite.x, y: p.sprite.y, texture: p.sprite.texture.key, name: p.label.text }))]);
        host.dataset.remotePlayers = String(this.remote.size);
        host.dataset.remoteNames = [...this.remote.values()].map(p => p.label.text).join(',');
        host.dataset.remotePositions = JSON.stringify([...this.remote.values()].map(p => ({ x: Math.round(p.sprite.x), y: Math.round(p.sprite.y) })));
        host.dataset.playerX = String(Math.round(this.prediction?.own?.x ?? body.center.x)); host.dataset.playerBottom = String(Math.round(this.prediction?.own?.y ?? body.bottom));
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
