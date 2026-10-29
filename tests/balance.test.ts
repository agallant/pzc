import { describe, it } from 'vitest';
// Slow (minutes): run with PZC_BALANCE=1 npx vitest run tests/balance.test.ts --silent=false
import { playBot, SKILLS } from './bot';

describe('difficulty curve (measurement)', () => {
  it.skipIf(!process.env.PZC_BALANCE)('prints win rates', () => {
    const rows: string[] = [];
    for (const name of ['careful', 'average'] as const) {
      for (let n = 1; n <= 20; n += 1) {
        let wins = 0;
        let hits = 0;
        let slack = 0;
        const runs = 24;
        for (let s = 1; s <= runs; s++) {
          const o = playBot(n, s * 7919, SKILLS[name]);
          if (o.won) wins += 1;
          hits += o.hits;
          slack += o.won ? o.timeLeft / o.timeLimit : 0;
        }
        rows.push(`${name} L${n}: win ${(wins / runs).toFixed(2)} hits ${(hits / runs).toFixed(1)} slack ${(slack / Math.max(1, wins)).toFixed(2)}`);
      }
    }
    console.log(rows.join('\n'));
  }, 600_000);
});
