/** Credit for a "lock the phone and walk" check-in, from how long the screen was away and, optionally, two location fixes. */

export interface Fix {
  lat: number;
  lon: number;
  /** Reported accuracy radius in metres. */
  accuracy: number;
}

export interface CreditInput {
  awayMs: number;
  from?: Fix | null;
  to?: Fix | null;
  /** Steps per minute. */
  cadence?: number;
  /** Metres per step. */
  stride?: number;
}

export interface Credit {
  steps: number;
  verified: boolean;
  reason?: 'too short' | 'vehicle';
  meters?: number;
}

export const MIN_AWAY_SECONDS = 20;
export const MAX_AWAY_SECONDS = 20 * 60;
/** Fraction of a full walk credited when nothing backs up the time away. */
export const HONOUR_RATE = 0.7;
const MAX_WALK_SPEED = 3.0; // m/s: beyond this it is a bike or a car, not a walk

export function haversine(a: Fix, b: Fix): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Time away is the baseline, discounted because a phone left on a desk looks the same. Two fixes that
 * show real, walking-speed distance lift the discount; a loop that ends where it began cannot be
 * told from a phone left behind, so it keeps the discount.
 */
export function checkInCredit({ awayMs, from, to, cadence = 100, stride = 0.74 }: CreditInput): Credit {
  const seconds = Math.min(awayMs / 1000, MAX_AWAY_SECONDS);
  if (seconds < MIN_AWAY_SECONDS) return { steps: 0, verified: false, reason: 'too short' };
  const full = (seconds / 60) * cadence;
  const honour = Math.floor(full * HONOUR_RATE);
  if (!from || !to) return { steps: honour, verified: false };
  const meters = Math.max(0, haversine(from, to) - from.accuracy - to.accuracy);
  // Speed uses the real elapsed time; only the credit is capped.
  const speed = meters / (awayMs / 1000);
  if (speed > MAX_WALK_SPEED) return { steps: 0, verified: false, reason: 'vehicle', meters };
  const gps = meters / stride;
  if (gps >= honour) return { steps: Math.floor(Math.min(full, gps)), verified: true, meters };
  return { steps: honour, verified: false, meters };
}

/** Pure steps needed to continue, growing with every continue used in the run. */
export function stepsRequired(continuesUsed: number): number {
  const table = [100, 200, 350, 550, 800, 1100, 1500];
  return table[Math.min(continuesUsed, table.length - 1)] as number;
}
