import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sfx } from '../src/platform/audio';

/** Just enough of the Web Audio API to see which notes get scheduled and how loud they are. */
function fakeAudio() {
  const notes: { type: string; freq: number; peak: number }[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
    setTargetAtTime() {},
  });
  class FakeContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = async () => {};
    createGain() {
      const gain = param();
      const node: Record<string, unknown> = { gain, connect: (n: unknown) => n };
      const last = { peak: 0 };
      gain.exponentialRampToValueAtTime = ((v: number) => {
        last.peak = Math.max(last.peak, v);
      }) as never;
      node.peak = last;
      return node;
    }
    createOscillator() {
      const frequency = param();
      const rec = { type: 'sine', freq: 0, peak: 0 };
      frequency.setValueAtTime = ((f: number) => {
        rec.freq = f;
      }) as never;
      const osc = {
        frequency,
        set type(t: string) {
          rec.type = t;
        },
        connect(gainNode: { peak?: { peak: number } }) {
          // The gain node's ramps run after this connect, so read its peak lazily when asked.
          Object.defineProperty(rec, 'peak', { get: () => gainNode.peak?.peak ?? 0, enumerable: true });
          return gainNode;
        },
        start() {
          notes.push(rec);
        },
        stop() {},
      };
      return osc;
    }
  }
  vi.stubGlobal('window', { AudioContext: FakeContext });
  return notes;
}

afterEach(() => vi.unstubAllGlobals());

describe('music', () => {
  it('stays silent when the sound switch or the music switch is off', async () => {
    const notes = fakeAudio();
    const sfx = new Sfx();
    await sfx.unlock();
    sfx.musicEnabled = true;
    sfx.enabled = false;
    sfx.music(0.5);
    expect(notes).toHaveLength(0);
    sfx.enabled = true;
    sfx.musicEnabled = false;
    sfx.music(0.5);
    expect(notes).toHaveLength(0);
  });

  it('plays notes a phone speaker can reproduce, and more of them as it gets tenser', async () => {
    const calm = fakeAudio();
    const sfx = new Sfx();
    await sfx.unlock();
    sfx.musicEnabled = true;
    sfx.music(0);
    expect(calm.length).toBeGreaterThan(0);
    // Phone speakers give out below roughly 100 Hz, so nothing may sit only down there.
    expect(Math.min(...calm.map((n) => n.freq))).toBeGreaterThanOrEqual(80);
    expect(calm.some((n) => n.freq >= 200)).toBe(true);
    // It used to peak at 0.06 when calm, which was barely audible next to the effects (about 0.2).
    expect(Math.max(...calm.map((n) => n.peak))).toBeGreaterThanOrEqual(0.15);

    const tense = fakeAudio();
    const sfx2 = new Sfx();
    await sfx2.unlock();
    sfx2.musicEnabled = true;
    sfx2.music(1);
    expect(tense.length).toBeGreaterThan(calm.length);
  });

  it('stops when told there should be no music', async () => {
    const notes = fakeAudio();
    const sfx = new Sfx();
    await sfx.unlock();
    sfx.musicEnabled = true;
    sfx.music(0.5);
    const before = notes.length;
    sfx.music(null);
    sfx.music(null);
    expect(notes.length).toBe(before);
  });
});
