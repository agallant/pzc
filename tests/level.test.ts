import { describe, expect, it } from 'vitest';
import { generateLevel } from '../src/game/level';
import { findPath } from './helpers';

describe('generateLevel', () => {
  it('is deterministic for a seed', () => {
    expect(generateLevel(4, 1234)).toEqual(generateLevel(4, 1234));
  });

  it('differs between seeds', () => {
    expect(generateLevel(4, 1).zombies).not.toEqual(generateLevel(4, 2).zombies);
  });

  it('always has a walkable route from the start to the train door', () => {
    for (let number = 1; number <= 20; number++) {
      for (let seed = 1; seed <= 6; seed++) {
        const level = generateLevel(number, seed * 7919);
        expect(findPath(level), `level ${number} seed ${seed}`).not.toBeNull();
      }
    }
  });

  it('keeps the start clear and everything inside the world', () => {
    for (let number = 1; number <= 12; number++) {
      const level = generateLevel(number, number * 31);
      for (const z of level.zombies) {
        expect(Math.hypot(z.x - level.spawn.x, z.y - level.spawn.y)).toBeGreaterThan(5);
        expect(z.y).toBeGreaterThan(0);
        expect(z.y).toBeLessThan(level.height);
      }
      for (const w of level.walls) {
        expect(w.w).toBeGreaterThan(0);
        expect(w.h).toBeGreaterThan(0);
      }
    }
  });

  it('gets busier as the commute number grows', () => {
    const early = generateLevel(1, 99);
    const late = generateLevel(15, 99);
    expect(late.zombies.length).toBeGreaterThan(early.zombies.length);
    expect(late.height).toBeGreaterThan(early.height);
  });
});
