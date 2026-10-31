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
  /** Background music, off unless the player asks for it. Needs `enabled` too: the sound switch silences everything. */
  musicEnabled = false;
  private ctx: AudioContext | null = null;
  private nextBeat = 0;
  private beat = 0;
  /** Everything the music plays goes through this, so it can be faded out as one when the music stops. */
  private musicBus: GainNode | null = null;

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

  /**
   * Call once a frame with how tense things are (0 to 1), or null when there should be no music. Notes are scheduled a
   * moment ahead, so a hidden tab (no frames) simply goes quiet; there are no timers to leak.
   */
  music(level: number | null): void {
    const ctx = this.ctx;
    if (level === null || !this.enabled || !this.musicEnabled || !ctx || ctx.state !== 'running') {
      this.nextBeat = 0;
      this.stopMusic();
      return;
    }
    const now = ctx.currentTime;
    if (!this.musicBus) {
      this.musicBus = ctx.createGain();
      this.musicBus.connect(ctx.destination);
    }
    const bus = this.musicBus;
    if (this.nextBeat < now) {
      this.nextBeat = now + 0.05;
      this.beat = 0;
    }
    const tension = Math.min(1, Math.max(0, level));
    const gap = 60 / (92 + 64 * tension);
    while (this.nextBeat < now + 0.3) {
      const at = this.nextBeat;
      const root = this.beat % 8 === 6 ? 82.4 : 55;
      this.tone(bus, 'triangle', root, at, gap * 0.9, 0.06 + 0.07 * tension);
      if (tension > 0.35 && this.beat % 2 === 1) this.tone(bus, 'square', this.beat % 4 === 1 ? 440 : 466, at, 0.07, 0.015 + 0.03 * tension);
      this.nextBeat += gap;
      this.beat += 1;
    }
  }

  /** Fade out whatever is still sounding, including notes already scheduled ahead, and start the next music on a fresh bus. */
  private stopMusic(): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    this.musicBus = null;
    if (!ctx || !bus) return;
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
  }

  private tone(bus: AudioNode, type: OscillatorType, freq: number, start: number, dur: number, peak: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.02);
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
