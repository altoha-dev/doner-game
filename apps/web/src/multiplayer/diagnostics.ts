import { PLAYER_PHYSICS } from '@doner-game/shared';

/** Numbers only, bounded history; no identities, URLs, tokens or payload logging. */
export class NetworkDiagnostics {
  rtt = 0; jitter = 0; tick = 0; stale = 0; gaps = 0;
  private previousAt = 0; private previousServerTime = 0; private previousTick = 0;
  private arrivals: number[] = [];
  private corrections: { at: number; distance: number }[] = [];
  largest = 0; error = 0;
  reset() { const rtt = this.rtt; Object.assign(this, new NetworkDiagnostics()); this.rtt = rtt; }
  snapshot(at: number, serverTime: number, tick: number) {
    if (this.previousAt) {
      this.jitter += .1 * (Math.abs(at - this.previousAt - (serverTime - this.previousServerTime)) - this.jitter);
      this.gaps += Math.max(0, Math.round((tick - this.previousTick) / (PLAYER_PHYSICS.tickHz / PLAYER_PHYSICS.snapshotHz)) - 1);
    }
    this.previousAt = at; this.previousServerTime = serverTime; this.previousTick = tick; this.tick = tick;
    this.arrivals.push(at); this.arrivals = this.arrivals.filter(t => at - t < 2000);
  }
  correction(at: number, distance: number, reset: boolean) {
    if (reset) return;
    this.error = distance; this.largest = Math.max(this.largest, distance);
    if (distance > .25) this.corrections.push({ at, distance });
    this.corrections = this.corrections.filter(c => at - c.at < 1000);
  }
  read(now: number, fps: number) {
    const arrivals = this.arrivals.filter(t => now - t < 2000);
    return { rttMs: Math.round(this.rtt), jitterMs: Math.round(this.jitter), serverTick: this.tick,
      snapshotHz: arrivals.length > 1 ? Math.round((arrivals.length - 1) * 1000 / Math.max(1, arrivals.at(-1)! - arrivals[0]!)) : 0,
      error: Number(this.error.toFixed(2)), correctionsPerSecond: this.corrections.filter(c => now - c.at < 1000).length,
      largestCorrection: Number(this.largest.toFixed(2)), staleSnapshots: this.stale, estimatedMissingSnapshots: this.gaps, fps };
  }
}
