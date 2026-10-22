import { buildOffer, ONLINE_RULES, trapOrientation, placementError, SNOWY_CHAOS } from '@doner-game/shared';
import type { BuildPreview, BuildPreviewInput, OnlineRoom, PreviewSnapshot } from '@doner-game/shared';
type State = { round: number; values: Map<string, BuildPreview>; sequences: Map<string, number>; dirty: boolean };

export class BuildPreviews {
  private rooms = new Map<string, State>();
  private sequence = 0;
  private state(room: OnlineRoom) {
    let state = this.rooms.get(room.roomId);
    if (!state || state.round !== room.match.round) {
      state = { round: room.match.round, values: new Map(), sequences: new Map(), dirty: true };
      this.rooms.set(room.roomId, state);
    }
    return state;
  }
  update(room: OnlineRoom, userId: string, input: BuildPreviewInput, now: number) {
    const player = room.players.find(p => p.playerId === userId && !p.left && p.connected && !p.buildDone);
    if (!player || room.match.phase !== 'BUILD' || input.round !== room.match.round) return;
    const state = this.state(room);
    if (input.sequence <= (state.sequences.get(userId) ?? -1)) return;
    state.sequences.set(userId, input.sequence);
    if (!input.position) { if (state.values.delete(userId)) state.dirty = true; return; }
    const reason = !buildOffer(room, userId, input.objectType) ? 'Нет доступного размещения' : placementError(SNOWY_CHAOS, room.match.placements, input.position, ONLINE_RULES.maxPlacements, input.objectType, input.orientation);
    state.values.set(userId, { playerId: userId, displayName: player.displayName, seat: player.seat,
      sequence: input.sequence, objectType: input.objectType, orientation: trapOrientation(input.objectType, input.orientation)!, position: { ...input.position },
      valid: !reason, reason, expiresAt: now + ONLINE_RULES.previewTtlMs });
    state.dirty = true;
  }
  resetUser(room: OnlineRoom, userId: string) {
    const state = this.state(room); state.sequences.delete(userId);
    if (state.values.delete(userId)) state.dirty = true;
  }
  sync(room: OnlineRoom, now: number) {
    const state = this.state(room);
    for (const [id, preview] of state.values) {
      const player = room.players.find(p => p.playerId === id && !p.left && p.connected && !p.buildDone);
      if (room.match.phase !== 'BUILD' || !player || preview.expiresAt <= now) {
        state.values.delete(id); state.dirty = true;
      } else {
        const reason = !buildOffer(room, id, preview.objectType) ? 'Нет доступного размещения' : placementError(SNOWY_CHAOS, room.match.placements, preview.position, ONLINE_RULES.maxPlacements, preview.objectType, preview.orientation);
        if (reason !== preview.reason) { preview.reason = reason; preview.valid = !reason; state.dirty = true; }
      }
    }
    for (const id of state.sequences.keys()) if (!room.players.some(p => p.playerId === id && p.connected && !p.left)) state.sequences.delete(id);
  }
  snapshot(room: OnlineRoom, now: number): PreviewSnapshot {
    this.sync(room, now);
    return { roomId: room.roomId, round: room.match.round, sequence: ++this.sequence, serverTime: now, previews: [...this.state(room).values.values()].map(p => ({ ...p, position: { ...p.position } })) };
  }
  changed(room: OnlineRoom, now: number) {
    this.sync(room, now);
    const state = this.state(room);
    if (!state.dirty) return null;
    state.dirty = false; return this.snapshot(room, now);
  }
  remove(roomId: string) { this.rooms.delete(roomId); }
}
