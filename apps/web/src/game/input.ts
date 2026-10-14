export type GameAction = 'left' | 'right' | 'jump';
export const KEY_ACTIONS: Readonly<Record<string, GameAction>> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', KeyW: 'jump', ArrowUp: 'jump',
};

// Each physical key / finger owns a source, so releasing one never cancels another.
export class GameInput {
  private sources = new Map<string, GameAction>();
  private jumpQueued = false;
  press(source: string, action: GameAction) {
    if (this.sources.has(source)) return;
    this.sources.set(source, action);
    if (action === 'jump') this.jumpQueued = true;
  }
  release(source: string) { this.sources.delete(source); }
  held(action: GameAction) { return [...this.sources.values()].includes(action); }
  consumeJump() { const queued = this.jumpQueued; this.jumpQueued = false; return queued; }
  clear() { this.sources.clear(); this.jumpQueued = false; }
  get direction() { return Number(this.held('right')) - Number(this.held('left')); }
}
