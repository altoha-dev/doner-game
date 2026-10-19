import { PARTY_RULES, placementError } from '@doner-game/shared';
import type { ArenaCommand, ArenaDefinition, ArenaSession, MatchSnapshot } from '@doner-game/shared';

// No API client, account balances, storage or rewards in this adapter.
// A new instance is a new match. React navigation/unmount ends the local session.
export function createLocalSession(arena: ArenaDefinition): ArenaSession {
  let snapshot: MatchSnapshot = freeze({ matchId: `local-${crypto.randomUUID()}`, arenaId: arena.id, arenaRevision: arena.revision, revision: 0, phase: 'BUILD', round: 1, placements: [], results: [] });
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispatch(command: ArenaCommand) {
      let next = snapshot;
      const reject = (reason: string) => ({ ok: false, reason });
      switch (command.type) {
        case 'PLACE': {
          if (snapshot.phase !== 'BUILD') return reject('Строительство завершено');
          if (snapshot.placements.some(p => p.round === snapshot.round)) return reject('Один бесплатный блок за раунд');
          const error = placementError(arena, snapshot.placements, command.position);
          if (error) return reject(error);
          next = { ...snapshot, placements: [...snapshot.placements, { ...command.position, ...PARTY_RULES.basicPlatform, id: `${snapshot.matchId}:${snapshot.round}`, catalogId: 'basic-platform', ownerId: 'local-player', round: snapshot.round }] };
          break;
        }
        case 'START_RACE':
          if (snapshot.phase !== 'BUILD' || !snapshot.placements.some(p => p.round === snapshot.round)) return reject('Сначала подтвердите блок');
          next = { ...snapshot, phase: 'RACE' }; break;
        case 'FINISH_LOCAL':
          if (snapshot.phase !== 'RACE' || !Number.isFinite(command.elapsedMs) || command.elapsedMs < 0) return reject('Нет активного забега');
          next = { ...snapshot, phase: 'RESULTS', results: [...snapshot.results, { round: snapshot.round, elapsedMs: Math.round(command.elapsedMs), playerId: 'local-player' }] }; break;
        case 'NEXT_ROUND':
          if (snapshot.phase !== 'RESULTS') return reject('Сначала завершите забег');
          next = snapshot.round >= PARTY_RULES.localRoundLimit ? { ...snapshot, phase: 'MATCH_FINISHED' } : { ...snapshot, phase: 'BUILD', round: snapshot.round + 1 };
      }
      snapshot = freeze({ ...next, revision: snapshot.revision + 1 });
      listeners.forEach(listener => listener());
      return { ok: true };
    },
  };
}
function freeze(snapshot: MatchSnapshot): MatchSnapshot {
  snapshot.placements.forEach(Object.freeze); snapshot.results.forEach(Object.freeze);
  Object.freeze(snapshot.placements); Object.freeze(snapshot.results);
  return Object.freeze(snapshot);
}
