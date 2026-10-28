import { describe, expect, it } from 'vitest';
import { checkInCredit, haversine, stepsRequired } from '../src/walk/credit';
import { PostureTracker } from '../src/walk/posture';
import { StepDetector } from '../src/walk/stepDetector';

/** A phone walking at `spm` steps per minute: gravity plus a bounce at step frequency. */
function walk(detector: StepDetector, seconds: number, spm: number, amp = 3, start = 0, hz = 60): { steps: number; end: number } {
  let steps = 0;
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const f = spm / 60;
  let t = start;
  for (let i = 0; i < seconds * hz; i++) {
    t = start + i / hz;
    const bounce = amp * Math.max(0, Math.sin(2 * Math.PI * f * t)) ** 2;
    steps += detector.push(t, 0.3 * rand(), 9.81 + bounce + 0.4 * rand(), 1 + 0.3 * rand()).steps;
  }
  return { steps, end: t };
}

describe('StepDetector', () => {
  it('counts a normal walk within a few percent', () => {
    const d = new StepDetector();
    const { steps } = walk(d, 60, 110);
    expect(steps).toBeGreaterThan(110 * 0.92);
    expect(steps).toBeLessThan(110 * 1.08);
  });

  it('counts a slow and a brisk walk', () => {
    for (const spm of [80, 140]) {
      const { steps } = walk(new StepDetector(), 45, spm);
      expect(steps / (spm * 0.75)).toBeGreaterThan(0.9);
      expect(steps / (spm * 0.75)).toBeLessThan(1.1);
    }
  });

  it('ignores a phone sitting still', () => {
    const d = new StepDetector();
    let steps = 0;
    for (let i = 0; i < 60 * 30; i++) steps += d.push(i / 60, 0.01 * Math.sin(i), 9.81, 0.5).steps;
    expect(steps).toBe(0);
  });

  it('ignores random shaking', () => {
    const d = new StepDetector();
    let seed = 3;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let steps = 0;
    let t = 0;
    // Irregular shakes: bursts at random intervals from 0.1 to 1.8 seconds.
    for (let shake = 0; shake < 40; shake++) {
      const gap = 0.1 + rand() * 1.7;
      for (let i = 0; i < gap * 60; i++) {
        t += 1 / 60;
        steps += d.push(t, 0, 9.81 + (i < 5 ? 6 : 0), 1).steps;
      }
    }
    expect(steps).toBeLessThan(6);
  });

  it('stops counting when the walker stops, and picks up again', () => {
    const d = new StepDetector();
    const a = walk(d, 20, 105);
    let idle = 0;
    for (let i = 0; i < 60 * 8; i++) idle += d.push(a.end + (i + 1) / 60, 0, 9.81, 1).steps;
    expect(idle).toBeLessThanOrEqual(1);
    const b = walk(d, 20, 105, 3, a.end + 9);
    expect(b.steps).toBeGreaterThan(105 * (20 / 60) * 0.85);
  });
});

describe('PostureTracker', () => {
  const feed = (p: PostureTracker, seconds: number, ax: number, ay: number, az: number, start = 0): boolean => {
    let last = false;
    for (let i = 0; i < seconds * 60; i++) last = p.push(start + i / 60, ax, ay, az);
    return last;
  };

  it('flags a steady, screen-up hold as looking', () => {
    const p = new PostureTracker();
    expect(feed(p, 4, 0, 6.5, 7.3)).toBe(true);
  });

  it('does not flag an upright phone in a pocket', () => {
    const p = new PostureTracker();
    expect(feed(p, 6, 0.4, 9.7, 0.8)).toBe(false);
  });

  it('needs the hold to be steady before calling it looking', () => {
    const p = new PostureTracker();
    expect(feed(p, 0.8, 0, 6.5, 7.3)).toBe(false);
  });

  it('stops flagging once the phone goes back in a pocket', () => {
    const p = new PostureTracker();
    feed(p, 4, 0, 6.5, 7.3);
    expect(feed(p, 6, 0.4, 9.7, 0.8, 4)).toBe(false);
  });
});

describe('check-in credit', () => {
  const here = { lat: 35.68, lon: 139.76, accuracy: 10 };

  it('credits nothing for a very short absence', () => {
    expect(checkInCredit({ awayMs: 10_000 }).reason).toBe('too short');
  });

  it('discounts unverified time away', () => {
    const c = checkInCredit({ awayMs: 5 * 60_000 });
    expect(c.verified).toBe(false);
    expect(c.steps).toBe(Math.floor(5 * 100 * 0.7));
  });

  it('caps a very long absence', () => {
    expect(checkInCredit({ awayMs: 3 * 3600_000 }).steps).toBe(Math.floor(20 * 100 * 0.7));
  });

  it('verifies a real walk with two fixes', () => {
    const there = { lat: here.lat + 0.0045, lon: here.lon, accuracy: 10 }; // about 500 m north
    const c = checkInCredit({ awayMs: 7 * 60_000, from: here, to: there });
    expect(c.verified).toBe(true);
    expect(c.meters).toBeGreaterThan(450);
    expect(c.steps).toBeGreaterThan(Math.floor(7 * 100 * 0.7));
  });

  it('gives nothing for a vehicle', () => {
    const far = { lat: here.lat + 0.09, lon: here.lon, accuracy: 10 };
    expect(checkInCredit({ awayMs: 5 * 60_000, from: here, to: far }).reason).toBe('vehicle');
  });

  it('keeps the discount for a loop that ends where it began', () => {
    const c = checkInCredit({ awayMs: 5 * 60_000, from: here, to: { ...here } });
    expect(c.verified).toBe(false);
    expect(c.steps).toBe(Math.floor(5 * 100 * 0.7));
  });

  it('measures distance', () => {
    expect(haversine(here, { ...here, lat: here.lat + 0.001 })).toBeGreaterThan(105);
    expect(haversine(here, { ...here, lat: here.lat + 0.001 })).toBeLessThan(118);
  });

  it('asks for more steps each time', () => {
    const needs = [0, 1, 2, 3, 4, 5, 6, 7, 20].map(stepsRequired);
    for (let i = 1; i < needs.length; i++) expect(needs[i]).toBeGreaterThanOrEqual(needs[i - 1] as number);
    expect(needs[0]).toBe(100);
    expect(needs[needs.length - 1]).toBe(1500);
  });
});
