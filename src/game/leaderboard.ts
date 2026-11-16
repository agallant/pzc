/** A finished run: the score it banked, how many commutes it made, and the local date it ended. */
export interface RunRecord {
  score: number;
  commutes: number;
  day: string | null;
}

export const MAX_RUNS = 5;

/** The best runs, highest first. A score of zero is not worth a place, and on a tie the newer run is listed first. */
export function topRuns(list: readonly RunRecord[]): RunRecord[] {
  return list
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RUNS);
}

/** `list` with `entry` added, newest first among equals. */
export function recordRun(list: readonly RunRecord[], entry: RunRecord): RunRecord[] {
  return topRuns([entry, ...list]);
}
