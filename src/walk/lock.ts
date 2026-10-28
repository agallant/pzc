import type { LockRecord, WalkRecord } from '../platform/storage';
import { checkInCredit, type Credit } from './credit';
import { getFix } from './sensors';

/** Starts a "lock the phone and walk" segment. With `withLocation`, takes a first location fix. */
export async function beginLock(walk: WalkRecord, withLocation: boolean, now = Date.now()): Promise<void> {
  const fix = withLocation ? await getFix() : null;
  walk.lock = { at: now, hiddenAt: document.hidden ? now : null, hiddenMs: 0, fix };
}

/** Track how long the screen was away. Call on visibility changes and when the app loads. */
export function noteVisibility(lock: LockRecord, hidden: boolean, now = Date.now()): void {
  if (hidden) {
    lock.hiddenAt ??= now;
  } else if (lock.hiddenAt !== null) {
    lock.hiddenMs += Math.max(0, now - lock.hiddenAt);
    lock.hiddenAt = null;
  }
}

export interface CheckInOutcome {
  credit: Credit;
  /** True when the player asked for location verification but we could not get a fix. */
  locationFailed: boolean;
}

/** Ends the segment and adds its credit to the walk. */
export async function checkIn(walk: WalkRecord, now = Date.now()): Promise<CheckInOutcome> {
  const lock = walk.lock;
  if (!lock) return { credit: { steps: 0, verified: false, reason: 'too short' }, locationFailed: false };
  noteVisibility(lock, false, now);
  const wantsLocation = lock.fix !== null;
  const to = wantsLocation ? await getFix() : null;
  const credit = checkInCredit({ awayMs: lock.hiddenMs, from: lock.fix, to });
  walk.pure = Math.min(walk.required, walk.pure + credit.steps);
  walk.lock = null;
  return { credit, locationFailed: wantsLocation && !to };
}
