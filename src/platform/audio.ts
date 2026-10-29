type SfxName = 'hit' | 'coin' | 'coffee' | 'nearMiss' | 'ping' | 'honk' | 'win' | 'dead' | 'trainLeft' | 'tap' | 'lift' | 'wrong' | 'groan';

interface Tone {
  type: OscillatorType;
  from: number;
  to?: number;
  at?: number;
  dur: number;
  gain?: number;
}

const SFX: Record<SfxName, Tone[]> = {
  hit: [{ type: 'sawtooth', from: 260, to: 70, dur: 0.28, gain: 0.5 }],
  coin: [
    { type: 'square', from: 880, dur: 0.07, gain: 0.18 },
    { type: 'square', from: 1320, at: 0.07, dur: 0.12, gain: 0.18 },
  ],
  coffee: [
    { type: 'triangle', from: 523, dur: 0.09 },
    { type: 'triangle', from: 659, at: 0.09, dur: 0.09 },
    { type: 'triangle', from: 784, at: 0.18, dur: 0.16 },
  ],
  nearMiss: [{ type: 'triangle', from: 700, to: 320, dur: 0.16, gain: 0.25 }],
  ping: [
    { type: 'sine', from: 1568, dur: 0.07, gain: 0.12 },
    { type: 'sine', from: 2093, at: 0.09, dur: 0.1, gain: 0.12 },
  ],
  honk: [
    { type: 'square', from: 330, dur: 0.35, gain: 0.16 },
    { type: 'square', from: 415, dur: 0.35, gain: 0.16 },
  ],
  win: [
    { type: 'triangle', from: 523, dur: 0.12 },
    { type: 'triangle', from: 659, at: 0.12, dur: 0.12 },
    { type: 'triangle', from: 784, at: 0.24, dur: 0.12 },
    { type: 'triangle', from: 1047, at: 0.36, dur: 0.4 },
  ],
  dead: [{ type: 'sawtooth', from: 330, to: 55, dur: 0.9, gain: 0.4 }],
  trainLeft: [
    { type: 'sine', from: 988, dur: 0.18, gain: 0.3 },
    { type: 'sine', from: 740, at: 0.2, dur: 0.18, gain: 0.3 },
    { type: 'sine', from: 494, at: 0.4, dur: 0.3, gain: 0.3 },
  ],
  lift: [
    { type: 'sine', from: 1319, dur: 0.5, gain: 0.25 },
    { type: 'sine', from: 988, at: 0.0, dur: 0.5, gain: 0.12 },
  ],
  wrong: [
    { type: 'square', from: 180, dur: 0.18, gain: 0.2 },
    { type: 'square', from: 140, at: 0.2, dur: 0.3, gain: 0.2 },
  ],
  tap: [{ type: 'square', from: 520, dur: 0.04, gain: 0.1 }],
  // A low, slightly out-of-tune wobble: a zombie that has just noticed its battery is at 3%.
  groan: [
    { type: 'sawtooth', from: 118, to: 64, dur: 0.85, gain: 0.09 },
    { type: 'sawtooth', from: 125, to: 69, at: 0.04, dur: 0.8, gain: 0.07 },
  ],
};

/** Tiny synthesized sound effects: no audio files to download or cache. */
export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;

  /** Call from a user gesture: iOS Safari will not start audio otherwise. Resolves once the context is running (or has been given up on). */
  async unlock(): Promise<void> {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      const ctx = this.ctx;
      // iOS Safari reports "interrupted" after the page was backgrounded; a resume() is needed then too.
      // If the browser refuses, drop the context so the next user gesture builds a fresh one.
      if (ctx.state !== 'running') await ctx.resume().catch(() => (this.ctx = this.ctx === ctx ? null : this.ctx));
    } catch {
      this.ctx = null;
    }
  }

  /** `pan` is -1 (left) to 1 (right), so a ping or a horn can be placed in the world. */
  play(name: SfxName, pan = 0): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const panner = pan !== 0 && typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      panner.connect(ctx.destination);
    }
    for (const t of SFX[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + (t.at ?? 0);
      osc.type = t.type;
      osc.frequency.setValueAtTime(t.from, start);
      if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
      const peak = t.gain ?? 0.22;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
      osc.connect(gain).connect(panner ?? ctx.destination);
      osc.start(start);
      osc.stop(start + t.dur + 0.02);
    }
  }
}
