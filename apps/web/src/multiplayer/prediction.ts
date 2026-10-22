import { createPhysicsPlayer, fanForces, PLAYER_PHYSICS, stepPlayers } from '@doner-game/shared';
import type { ArenaDefinition, MovementSnapshot, NetworkPlayer, OnlineRoom, PlayerControls, RaceControls, RaceInputBatch, Rect, TrapPlacement } from '@doner-game/shared';

/** Shared solver prediction. Only the server can accept positions, contacts or finishes. */
export class RacePrediction {
  players: NetworkPlayer[] = [];
  private pending: RaceControls[] = [];
  private sequence = 0;
  private jump = 0;
  private round = -1;
  private snapshotSequence = -1;
  private serverTick = -1;
  private remoteSteps = 0;
  lastCorrection = { distance: 0, reset: false };
  private placements: readonly TrapPlacement[] = [];
  private solids: readonly Rect[] = [];
  constructor(readonly localId: string, private arena: ArenaDefinition) {}
  begin(room: OnlineRoom) {
    this.round = room.match.round; this.sequence = 0; this.jump = 0; this.pending = [];
    this.snapshotSequence = -1; this.serverTick = -1; this.remoteSteps = 0;
    this.lastCorrection = { distance: 0, reset: true };
    this.placements = room.match.placements;
    this.solids = [...this.arena.geometry, ...room.match.placements];
    this.players = room.players.filter(p => !p.left).map(p => {
      const spawn = this.arena.spawns[p.seat]!;
      return { ...createPhysicsPlayer(p.playerId, p.seat, spawn.x, spawn.y), round: this.round, active: p.connected };
    });
  }
  get own() { return this.players.find(p => p.playerId === this.localId); }
  reconcile(snapshot: MovementSnapshot, reset: boolean) {
    if (snapshot.round !== this.round || (!reset && (snapshot.sequence <= this.snapshotSequence || snapshot.tick < this.serverTick))) return false;
    const me = snapshot.players.find(p => p.playerId === this.localId); if (!me) return;
    const before = this.own && { x: this.own.x, y: this.own.y };
    const lifeChanged = (this.own?.life?.serial ?? 0) !== (me.life?.serial ?? 0);
    const resync = lifeChanged || (reset && this.serverTick >= 0) || this.sequence - me.sequence > PLAYER_PHYSICS.maxPredictionSteps;
    if (resync) { this.pending = []; this.sequence = me.sequence; this.jump = me.jumpSerial; }
    this.snapshotSequence = snapshot.sequence; this.serverTick = snapshot.tick; this.remoteSteps = 0;
    this.sequence = Math.max(this.sequence, me.sequence); this.jump = Math.max(this.jump, me.jumpSerial);
    this.pending = this.pending.filter(p => p.sequence > me.sequence).slice(-PLAYER_PHYSICS.maxPredictionSteps);
    this.players = snapshot.players.map(p => ({ ...p }));
    for (const input of this.pending) this.simulate(input);
    this.lastCorrection = { distance: before ? Math.hypot(before.x - this.own!.x, before.y - this.own!.y) : 0, reset: reset || resync };
    return true;
  }
  step(direction: -1 | 0 | 1, jumpPressed: boolean): RaceControls {
    if (jumpPressed) this.jump++;
    const input = { round: this.round, sequence: ++this.sequence, direction, jump: this.jump };
    this.pending.push(input); if (this.pending.length > PLAYER_PHYSICS.maxPredictionSteps) this.pending.shift();
    this.simulate(input); return input;
  }
  packet(): RaceInputBatch {
    return { round: this.round, frames: this.pending.slice(-PLAYER_PHYSICS.inputPacketSteps).map(({ sequence, direction, jump }) => ({ sequence, direction, jump })) };
  }
  private simulate(input: RaceControls) {
    this.remoteSteps++;
    const controls = new Map<string, PlayerControls>();
    for (const p of this.players) {
      if (p.playerId === this.localId) { p.active = !p.finished && (!p.life || p.life.phase === 'ALIVE'); controls.set(p.playerId, input); }
      else controls.set(p.playerId, { sequence: p.sequence, direction: this.remoteSteps <= PLAYER_PHYSICS.remotePredictionSteps ? p.direction : 0, jump: p.jumpSerial });
    }
    stepPlayers(this.players, controls, this.solids, this.arena.width, this.arena.height, fanForces(this.players, this.placements));
  }
}
