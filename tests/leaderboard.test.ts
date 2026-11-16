import { describe, expect, it } from 'vitest';
import { MAX_RUNS, recordRun, topRuns, type RunRecord } from '../src/game/leaderboard';

const run = (score: number, commutes = 1, day: string | null = '2026-10-29'): RunRecord => ({ score, commutes, day });

describe('leaderboard', () => {
  it('keeps the best runs, highest first, and no more than the limit', () => {
    let list: RunRecord[] = [];
    for (const s of [300, 900, 100, 700, 500, 800, 200]) list = recordRun(list, run(s));
    expect(list.map((r) => r.score)).toEqual([900, 800, 700, 500, 300]);
    expect(list).toHaveLength(MAX_RUNS);
  });

  it('ignores a run that scored nothing', () => {
    expect(recordRun([], run(0))).toEqual([]);
    expect(recordRun([run(50)], run(0))).toEqual([run(50)]);
  });

  it('lists the newer run first on a tie', () => {
    const older = run(400, 3, '2026-10-01');
    const newer = run(400, 5, '2026-10-29');
    expect(recordRun([older], newer)).toEqual([newer, older]);
  });

  it('does not change the list it is given', () => {
    const list = [run(10)];
    recordRun(list, run(20));
    expect(list).toEqual([run(10)]);
  });

  it('drops zero scores and trims an over-long list', () => {
    const many = Array.from({ length: 9 }, (_, i) => run(i));
    const top = topRuns(many);
    expect(top.map((r) => r.score)).toEqual([8, 7, 6, 5, 4]);
  });
});
