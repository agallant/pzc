export interface Point {
  x: number;
  y: number;
}

/** The closest of `points` to (x, y) that is within `range`, or null when none is close enough to groan. */
export function nearestWithin<T extends Point>(points: readonly T[], x: number, y: number, range: number): T | null {
  let best: T | null = null;
  let bestD = range * range;
  for (const p of points) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d <= bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}
