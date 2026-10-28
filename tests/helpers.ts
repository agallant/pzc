import { circleRectPush } from '../src/game/geometry';
import { PLAYER_RADIUS } from '../src/game/level';
import type { Level } from '../src/game/types';

const CELL = 0.25;

/** Grid BFS over static walls for a player-sized circle. Returns waypoints from spawn to goal, or null. */
export function findPath(level: Level): { x: number; y: number }[] | null {
  const cols = Math.ceil(level.width / CELL);
  const rows = Math.ceil(level.height / CELL);
  const free = new Uint8Array(cols * rows).fill(1);
  for (const w of level.walls) {
    const c0 = Math.max(0, Math.floor((w.x - PLAYER_RADIUS) / CELL));
    const c1 = Math.min(cols - 1, Math.ceil((w.x + w.w + PLAYER_RADIUS) / CELL));
    const r0 = Math.max(0, Math.floor((w.y - PLAYER_RADIUS) / CELL));
    const r1 = Math.min(rows - 1, Math.ceil((w.y + w.h + PLAYER_RADIUS) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (circleRectPush({ x: (c + 0.5) * CELL, y: (r + 0.5) * CELL, r: PLAYER_RADIUS }, w)) free[r * cols + c] = 0;
      }
    }
  }
  const start = Math.floor(level.spawn.y / CELL) * cols + Math.floor(level.spawn.x / CELL);
  const goal = Math.floor((level.goal.y + level.goal.h / 2) / CELL) * cols + Math.floor((level.goal.x + level.goal.w / 2) / CELL);
  const prev = new Int32Array(cols * rows).fill(-1);
  const queue = [start];
  prev[start] = start;
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] as number;
    if (cur === goal) break;
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
  if (prev[goal] === -1) return null;
  const path: { x: number; y: number }[] = [];
  for (let cur = goal; cur !== start; cur = prev[cur] as number) {
    path.push({ x: ((cur % cols) + 0.5) * CELL, y: (Math.floor(cur / cols) + 0.5) * CELL });
  }
  return path.reverse();
}
