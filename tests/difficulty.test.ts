import { describe, expect, it } from 'vitest';
import { playBot, SKILLS } from './bot';

const SEEDS = [7919, 15838, 23757, 31676, 39595, 47514];

function winRate(levels: number[]): number {
  let wins = 0;
  let runs = 0;
  for (const n of levels) {
    for (const seed of SEEDS) {
      runs += 1;
      if (playBot(n, seed + n, SKILLS.careful).won) wins += 1;
    }
  }
  return wins / runs;
}

// A steering bot is a stand-in for a careful player, not a measure of fun. These bounds only guard the shape
// of the curve: the first commutes are friendly and the later ones are clearly harder.
// For the full picture run: PZC_BALANCE=1 npx vitest run tests/balance.test.ts --silent=false
describe('difficulty curve', () => {
  it('early commutes are winnable and later ones are harder', () => {
    const early = winRate([1, 2]);
    const late = winRate([13, 14]);
    console.log(`difficulty: early ${early.toFixed(2)} late ${late.toFixed(2)}`);
    expect(early).toBeGreaterThanOrEqual(0.5);
    expect(late).toBeLessThanOrEqual(early - 0.2);
  }, 120_000);
});
