import type { RoundSettlement } from './economy.js';
import type { Orientation, TrapId, TrapSnapshot } from './traps.js';
import type { CharacterId } from './characters.js';
import type { MatchSnapshot, Point } from './party.js';
import type { PhysicsPlayer, PlayerControls, PlayerImpact } from './physics.js';

export const ONLINE_RULES = {
  buildMs: 60000, raceMs: 90000, reconnectGraceMs: 30000, roomTtlMs: 7200000,
  snapshotHz: 15, movementHz: 15, maxRounds: 5, maxPlacements: 20,
  ackMs: 8000, maxNameLength: 20, previewHz: 12, previewHeartbeatMs: 500, previewTtlMs: 1800,
} as const;
export const PLAYER_COLORS = ['#ffb66d', '#72ddeb', '#c4a2ff', '#9ae0a5'] as const;
export interface OnlinePlayer {
  playerId: string; displayName: string; photoUrl: string | null; characterId: CharacterId;
  ready: boolean; connected: boolean; left: boolean; buildDone: boolean; seat: number; score?: number;
}
export interface OnlineFinish {
  playerId: string; round: number; position: number | null; durationMs: number | null;
  points?: number; doners?: number; finishedAt: number | null; status: 'FINISHED' | 'DNF' | 'ABORTED';
}
export interface OnlineRoom {
  roomId: string; code: string; hostId: string; capacity: number; revision: number;
  expiresAt: number; deadline: number | null; raceStartedAt: number | null;
  inviteLink: string | null; recoveryMessage: string | null;
  balances?: Record<string, number>; rounds?: RoundSettlement[]; players: OnlinePlayer[]; match: MatchSnapshot; finishes: OnlineFinish[];
}
export type RoomCommand =
  | { type: 'CREATE'; capacity: number }
  | { type: 'JOIN'; code: string }
  | { type: 'RESUME' }
  | { type: 'LEAVE' }
  | { type: 'READY'; ready: boolean }
  | { type: 'CHARACTER'; characterId: CharacterId }
  | { type: 'START' }
  | { type: 'PLACE'; round: number; commandId: string; expectedRevision: number; position: Point; trapId?: TrapId; orientation?: Orientation }
  | { type: 'SKIP'; round: number }
  | { type: 'NEXT' }
  | { type: 'CLOSE' };
export type RoomReply = { ok: true; room: OnlineRoom | null } | { ok: false; code: string; message: string };
// Body center x and feet y in logical pixels, never identity or client finish rank.
export interface Movement {
  round: number; sequence: number; x: number; y: number; velocityX: number; velocityY: number;
}
export interface RaceControls extends PlayerControls { round: number }
// One sequence is one fixed physics step. Packets retain a short redundant input tail.
export interface RaceInputBatch { round: number; frames: readonly PlayerControls[] }
export interface NetworkPlayer extends PhysicsPlayer { round: number }
export interface NetworkImpact extends PlayerImpact { id: string; tick: number }
export interface MovementSnapshot { roomId: string; round: number; sequence: number; serverTime: number; tick: number; players: NetworkPlayer[]; impacts: NetworkImpact[]; traps?: TrapSnapshot }
export interface BuildPreviewInput { round: number; sequence: number; objectType: TrapId; orientation?: Orientation; position: Point | null }
export interface BuildPreview {
  playerId: string; displayName: string; seat: number; sequence: number; objectType: TrapId; orientation?: Orientation;
  position: Point; valid: boolean; reason: string | null; expiresAt: number;
}
export interface PreviewSnapshot { roomId: string; round: number; sequence: number; serverTime: number; previews: BuildPreview[] }
export function buildPlayerStatus(room: OnlineRoom, player: OnlinePlayer, previews: readonly BuildPreview[]): string {
  if (!player.connected) return 'ОТКЛЮЧЁН';
  const placed = room.match.placements.find(p => p.ownerId === player.playerId && p.round === room.match.round);
  if (placed && !player.buildDone) return 'БЛОК ГОТОВ · EXTRA ИЛИ ЗАВЕРШИТЬ';
  if (placed) return placed.catalogId === 'basic-platform' ? 'ПОСТАВИЛ БЛОК' : 'ПОСТАВИЛ ЛОВУШКУ';
  if (player.buildDone) return 'ПРОПУСТИЛ';
  return previews.some(p => p.playerId === player.playerId) ? 'ВЫБИРАЕТ МЕСТО' : 'ВЫБИРАЕТ БЛОК';
}
export interface ClientEvents {
  'room:command': (command: RoomCommand, ack: (reply: RoomReply) => void) => void;
  'race:move': (movement: Movement) => void;
  'race:input': (input: RaceInputBatch) => void;
  'net:ping': (ack: () => void) => void;
  'build:preview': (preview: BuildPreviewInput) => void;
}
export interface ServerEvents {
  'room:snapshot': (room: OnlineRoom) => void;
  'race:snapshot': (snapshot: MovementSnapshot) => void;
  'race:correction': (player: NetworkPlayer) => void;
  'build:previews': (snapshot: PreviewSnapshot) => void;
  'session:error': (error: { code: string; message: string }) => void;
}
export function buildMiniAppLink(botUsername: string, startParam = 'home'): string {
  const username = botUsername.replace(/^@/, '');
  if (!/^[a-zA-Z0-9_]{5,32}$/.test(username) || !/^[a-zA-Z0-9_-]{1,512}$/.test(startParam)) throw new Error('Invalid Mini App link');
  return `https://t.me/${username}?startapp=${encodeURIComponent(startParam)}`;
}
export function roomCodeFromStartParam(value: string): string | null {
  return /^room_([A-Z2-9]{6})$/i.exec(value)?.[1]?.toUpperCase() ?? null;
}
