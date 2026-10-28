export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

/** Small seeded PRNG (mulberry32) so a level can be regenerated, and tested, from its seed. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, maxInclusive) => min + Math.floor(next() * (maxInclusive - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
    chance: (p) => next() < p,
  };
}

export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}
