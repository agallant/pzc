import { circleRectPush, pointInRect } from '../src/game/geometry';
import { PERSONAS } from '../src/game/personas';
import type { Level } from '../src/game/types';

const CELL = 0.25;

/** Grid BFS over static walls for a player-sized circle. Returns waypoints from spawn to goal, or null. */
export function findPath(level: Level, options: { lift?: boolean } = {}): { x: number; y: number }[] | null {
  const radius = PERSONAS[level.persona].radius;
  const cols = Math.ceil(level.width / CELL);
  const rows = Math.ceil(level.height / CELL);
  const free = new Uint8Array(cols * rows).fill(1);
  for (const w of level.walls) {
    const c0 = Math.max(0, Math.floor((w.x - radius) / CELL));
    const c1 = Math.min(cols - 1, Math.ceil((w.x + w.w + radius) / CELL));
    const r0 = Math.max(0, Math.floor((w.y - radius) / CELL));
    const r1 = Math.min(rows - 1, Math.ceil((w.y + w.h + radius) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (circleRectPush({ x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, r: radius }, w)) free[r * cols + c] = 0;
      }
    }
  }
  const start = Math.floor(level.spawn.y / CELL) * cols + Math.floor(level.spawn.x / CELL);
  const inGoal = (cell: number): boolean => pointInRect(((cell % cols) + 0.5) * CELL, (Math.floor(cell / cols) + 0.5) * CELL, level.goal);
  let goal = -1;
  const cellOf = (x: number, y: number): number => Math.floor(y / CELL) * cols + Math.floor(x / CELL);
  const liftFrom = level.lift?.working && options.lift ? cellOf(level.lift.from.x + level.lift.from.w / 2, level.lift.from.y + level.lift.from.h / 2) : -1;
  const liftTo = level.lift ? cellOf(level.lift.to.x + level.lift.to.w / 2, level.lift.to.y + level.lift.to.h / 2) : -1;
  const prev = new Int32Array(cols * rows).fill(-1);
  const queue = [start];
  prev[start] = start;
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] as number;
    if (inGoal(cur)) {
      goal = cur;
      break;
    }
    if (cur === liftFrom && prev[liftTo] === -1) {
      prev[liftTo] = cur;
      queue.push(liftTo);
    }
    const cx = cur % cols;
    const cy = Math.floor(cur / cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const n = ny * cols + nx;
      if (prev[n] !== -1 || !free[n]) continue;
      prev[n] = cur;
      queue.push(n);
    }
  }
  if (goal === -1) return null;
  const path: { x: number; y: number }[] = [];
  for (let cur = goal; cur !== start; cur = prev[cur] as number) {
    path.push({ x: ((cur % cols) + 0.5) * CELL, y: (Math.floor(cur / cols) + 0.5) * CELL });
  }
  return path.reverse();
}
