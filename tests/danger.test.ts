import { describe, expect, it } from 'vitest';
import { CALM_UNTIL, dangerLevel } from '../src/game/danger';

describe('dangerLevel', () => {
  it('is calm with full hearts and plenty of time', () => {
    expect(dangerLevel(3, 3, 60)).toBe(0);
    expect(dangerLevel(3, 3, CALM_UNTIL)).toBe(0);
  });

  it('rises as hearts are lost', () => {
    const levels = [3, 2, 1].map((hp) => dangerLevel(hp, 3, 60));
    expect(levels[0]).toBeLessThan(levels[1] as number);
    expect(levels[1]).toBeLessThan(levels[2] as number);
    expect(dangerLevel(2, 3, 60)).toBeCloseTo(0.35);
  });

  it('rises as the clock runs down, and never leaves 0 to 1', () => {
    expect(dangerLevel(3, 3, 20)).toBeLessThan(dangerLevel(3, 3, 5));
    for (const hp of [0, 1, 2, 3, 9]) {
      for (const t of [-5, 0, 10, 30, 90]) {
        const d = dangerLevel(hp, 3, t);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is maximal on the last heart with no time left', () => {
    expect(dangerLevel(1, 3, 0)).toBe(1);
  });

  it('does not divide by zero with a single heart', () => {
    expect(dangerLevel(1, 1, 60)).toBe(0);
  });
});
