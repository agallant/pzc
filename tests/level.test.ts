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
        expect(findPath(level, { lift: true }), `level ${number} seed ${seed}`).not.toBeNull();
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

function levelWith(predicate: (l: ReturnType<typeof generateLevel>) => boolean, number = 8) {
  for (let seed = 1; seed < 400; seed++) {
    const level = generateLevel(number, seed);
    if (predicate(level)) return level;
  }
  throw new Error('no matching level');
}

describe('transit features', () => {
  it('introduces the transit hall at commute 2 and signage forks at commute 3', () => {
    expect(generateLevel(1, 5).lift).toBeNull();
    expect(generateLevel(2, 5).lift).not.toBeNull();
    expect(generateLevel(2, 5).wrongWay).toBeNull();
    expect(generateLevel(3, 5).wrongWay).not.toBeNull();
    expect(generateLevel(3, 5).persona).toBe('commuter');
  });

  it('gives every persona a way through', () => {
    for (const persona of ['commuter', 'suitcase', 'tired', 'crutches', 'wheelchair'] as const) {
      for (let k = 0; k < 4; k++) {
        const level = levelWith((l) => l.persona === persona && l.seed > k * 50);
        expect(findPath(level, { lift: true }), `${persona} seed ${level.seed}`).not.toBeNull();
      }
    }
  });

  it('keeps wheelchair routes off the stairs and escalator, and the lift working', () => {
    for (let k = 0; k < 5; k++) {
      const level = levelWith((l) => l.persona === 'wheelchair' && l.seed > k * 60);
      expect(level.lift?.working).toBe(true);
      const path = findPath(level, { lift: true }) ?? [];
      expect(path.length).toBeGreaterThan(0);
      const steps = level.zones.filter((z) => z.floor === 'stairs' || z.floor === 'escalator');
      expect(steps.length).toBeGreaterThan(0);
      for (const pt of path) {
        const onSteps = steps.some((z) => pt.x > z.x && pt.x < z.x + z.w && pt.y > z.y && pt.y < z.y + z.h);
        expect(onSteps).toBe(false);
      }
    }
  });

  it('makes the wrong branch a dead end that the route never enters', () => {
    for (let k = 0; k < 6; k++) {
      const level = levelWith((l) => l.wrongWay !== null && l.seed > k * 40, 5);
      const ww = level.wrongWay!;
      for (const pt of findPath(level, { lift: true }) ?? []) {
        const inside = pt.x > ww.x && pt.x < ww.x + ww.w && pt.y > ww.y && pt.y < ww.y + ww.h;
        expect(inside).toBe(false);
      }
    }
  });

  it('signs the correct platform when signage is clear', () => {
    const level = levelWith((l) => l.signMode === 'clear', 6);
    const texts = level.decor.filter((d) => d.kind === 'forkSign').map((d) => d.text);
    expect(texts).toContain(`Platform ${level.platform}`);
    expect(texts.length).toBe(2);
  });

  it('leaves the correct sign out when signage is missing', () => {
    const level = levelWith((l) => l.signMode === 'missing', 8);
    const signs = level.decor.filter((d) => d.kind === 'forkSign');
    expect(signs.length).toBe(1);
    expect(signs[0]?.text).not.toBe(`Platform ${level.platform}`);
  });

  it('lets everyone but wheelchair users walk through on foot', () => {
    for (let k = 0; k < 8; k++) {
      const level = levelWith((l) => l.persona !== 'wheelchair' && l.seed > k * 30);
      expect(findPath(level), `${level.persona} seed ${level.seed}`).not.toBeNull();
    }
  });
});
