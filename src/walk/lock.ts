import type { LockRecord, WalkRecord } from '../platform/storage';
import { checkInCredit, type Credit } from './credit';
import { getFix } from './sensors';

/**
 * Starts a "lock the phone and walk" segment. With `withLocation`, takes a first location fix.
 * Resolves to false when the lock was cancelled or replaced while the fix was pending.
 */
export async function beginLock(walk: WalkRecord, withLocation: boolean, now = Date.now()): Promise<boolean> {
  // Record the lock first: while the location request is pending the page can be hidden or discarded.
  const lock: LockRecord = { at: now, hiddenAt: document.hidden ? now : null, hiddenMs: 0, fix: null };
  walk.lock = lock;
  if (!withLocation) return true;
  const fix = await getFix();
  if (walk.lock !== lock) return false;
  lock.fix = fix;
  return true;
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
  /** True when the lock was cancelled or replaced during the check-in; nothing was credited. */
  stale?: boolean;
}

/** Ends the segment and adds its credit to the walk. */
export async function checkIn(walk: WalkRecord, now = Date.now()): Promise<CheckInOutcome> {
  const lock = walk.lock;
  if (!lock) return { credit: { steps: 0, verified: false, reason: 'too short' }, locationFailed: false };
  noteVisibility(lock, false, now);
  const wantsLocation = lock.fix !== null;
  const to = wantsLocation ? await getFix() : null;
  if (walk.lock !== lock) return { credit: { steps: 0, verified: false, reason: 'too short' }, locationFailed: false, stale: true };
  const credit = checkInCredit({ awayMs: lock.hiddenMs, from: lock.fix, to });
  walk.pure = Math.min(walk.required, walk.pure + credit.steps);
  walk.lock = null;
  return { credit, locationFailed: wantsLocation && !to };
}
