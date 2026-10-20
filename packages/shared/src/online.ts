import type { CharacterId } from './characters.js';
import type { MatchSnapshot, Point } from './party.js';

export const ONLINE_RULES = {
  buildMs: 60000, raceMs: 90000, reconnectGraceMs: 30000, roomTtlMs: 7200000,
  snapshotHz: 15, movementHz: 15, maxRounds: 5, maxPlacements: 20,
  ackMs: 8000, maxNameLength: 20,
} as const;
export interface OnlinePlayer {
  playerId: string; displayName: string; photoUrl: string | null; characterId: CharacterId;
  ready: boolean; connected: boolean; left: boolean; buildDone: boolean; seat: number;
}
export interface OnlineFinish {
  playerId: string; round: number; position: number | null; durationMs: number | null;
  finishedAt: number | null; status: 'FINISHED' | 'DNF' | 'ABORTED';
}
export interface OnlineRoom {
  roomId: string; code: string; hostId: string; capacity: number; revision: number;
  expiresAt: number; deadline: number | null; raceStartedAt: number | null;
  inviteLink: string | null; recoveryMessage: string | null;
  players: OnlinePlayer[]; match: MatchSnapshot; finishes: OnlineFinish[];
}
export type RoomCommand =
  | { type: 'CREATE'; capacity: number }
  | { type: 'JOIN'; code: string }
  | { type: 'RESUME' }
  | { type: 'LEAVE' }
  | { type: 'READY'; ready: boolean }
  | { type: 'CHARACTER'; characterId: CharacterId }
  | { type: 'START' }
  | { type: 'PLACE'; round: number; commandId: string; expectedRevision: number; position: Point }
  | { type: 'SKIP'; round: number }
  | { type: 'NEXT' }
  | { type: 'CLOSE' };
export type RoomReply = { ok: true; room: OnlineRoom | null } | { ok: false; code: string; message: string };
// Body center x and feet y in logical pixels, never identity or client finish rank.
export interface Movement {
  round: number; sequence: number; x: number; y: number; velocityX: number; velocityY: number;
}
export interface NetworkPlayer extends Movement { playerId: string; finished: boolean }
export interface MovementSnapshot { roomId: string; round: number; sequence: number; serverTime: number; players: NetworkPlayer[] }
export interface ClientEvents {
  'room:command': (command: RoomCommand, ack: (reply: RoomReply) => void) => void;
  'race:move': (movement: Movement) => void;
}
export interface ServerEvents {
  'room:snapshot': (room: OnlineRoom) => void;
  'race:snapshot': (snapshot: MovementSnapshot) => void;
  'race:correction': (player: NetworkPlayer) => void;
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
