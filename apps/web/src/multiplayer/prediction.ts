import { createPhysicsPlayer, PLAYER_PHYSICS, stepPlayers } from '@doner-game/shared';
import type { ArenaDefinition, MovementSnapshot, NetworkPlayer, OnlineRoom, PlayerControls, RaceControls, Rect } from '@doner-game/shared';

/** Shared solver prediction. Only the server can accept positions, contacts or finishes. */
export class RacePrediction {
  players: NetworkPlayer[] = [];
  private pending: RaceControls[] = [];
  private sequence = 0;
  private jump = 0;
  private round = -1;
  private solids: readonly Rect[] = [];
  constructor(readonly localId: string, private arena: ArenaDefinition) {}
  begin(room: OnlineRoom) {
    this.round = room.match.round; this.sequence = 0; this.jump = 0; this.pending = [];
    this.solids = [...this.arena.geometry, ...room.match.placements];
    this.players = room.players.filter(p => !p.left).map(p => {
      const spawn = this.arena.spawns[p.seat]!;
      return { ...createPhysicsPlayer(p.playerId, p.seat, spawn.x, spawn.y), round: this.round, active: p.connected };
    });
  }
  get own() { return this.players.find(p => p.playerId === this.localId); }
  reconcile(snapshot: MovementSnapshot, reset: boolean) {
    if (snapshot.round !== this.round) return;
    const me = snapshot.players.find(p => p.playerId === this.localId); if (!me) return;
    if (reset) { this.pending = []; this.sequence = me.sequence; this.jump = me.jumpSerial; }
    this.sequence = Math.max(this.sequence, me.sequence); this.jump = Math.max(this.jump, me.jumpSerial);
    this.pending = this.pending.filter(p => p.sequence > me.sequence).slice(-PLAYER_PHYSICS.maxPredictionSteps);
    this.players = snapshot.players.map(p => ({ ...p }));
    for (const input of this.pending) this.simulate(input);
  }
  step(direction: -1 | 0 | 1, jumpPressed: boolean): RaceControls {
    if (jumpPressed) this.jump++;
    const input = { round: this.round, sequence: ++this.sequence, direction, jump: this.jump };
    this.pending.push(input); if (this.pending.length > PLAYER_PHYSICS.maxPredictionSteps) this.pending.shift();
    this.simulate(input); return input;
  }
  private simulate(input: RaceControls) {
    const controls = new Map<string, PlayerControls>();
    for (const p of this.players) {
      if (p.playerId === this.localId) { p.active = !p.finished; controls.set(p.playerId, input); }
      else controls.set(p.playerId, { sequence: p.sequence, direction: p.direction, jump: p.jumpSerial });
    }
    stepPlayers(this.players, controls, this.solids, this.arena.width, this.arena.height);
  }
}
