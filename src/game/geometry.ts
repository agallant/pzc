import type { Rect } from './types';

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Push {
  nx: number;
  ny: number;
  depth: number;
}

const result: Push = { nx: 0, ny: 0, depth: 0 };

/** Push-out vector for a circle overlapping a rectangle, or null. The result object is reused. */
export function circleRectPush(c: Circle, rect: Rect): Push | null {
  const cx = Math.max(rect.x, Math.min(c.x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(c.y, rect.y + rect.h));
  const dx = c.x - cx;
  const dy = c.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= c.r * c.r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    result.nx = dx / d;
    result.ny = dy / d;
    result.depth = c.r - d;
    return result;
  }
  // Centre is inside the rectangle: leave through the nearest side.
  const left = c.x - rect.x;
  const right = rect.x + rect.w - c.x;
  const top = c.y - rect.y;
  const bottom = rect.y + rect.h - c.y;
  const m = Math.min(left, right, top, bottom);
  result.nx = m === left ? -1 : m === right ? 1 : 0;
  result.ny = m === top ? -1 : m === bottom ? 1 : 0;
  if (result.nx === 0 && result.ny === 0) result.ny = 1;
  result.depth = m + c.r;
  return result;
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
