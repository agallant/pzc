import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WalkRecord } from '../src/platform/storage';
import { beginLock, checkIn } from '../src/walk/lock';

const here = { latitude: 35, longitude: 139, accuracy: 5 };

/** A geolocation whose pending requests are answered by hand. */
function fakeGeolocation() {
  const pending: Array<() => void> = [];
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: (ok: (p: { coords: typeof here }) => void) => {
        pending.push(() => ok({ coords: here }));
      },
    },
  });
  vi.stubGlobal('document', { hidden: false });
  return pending;
}

function walkRecord(): WalkRecord {
  return { required: 100, pure: 0, zombie: 0, level: 1, seed: 1, score: 0, lock: null };
}

afterEach(() => vi.unstubAllGlobals());

describe('lock races', () => {
  it('beginLock reports a lock cancelled while its first fix was pending', async () => {
    const pending = fakeGeolocation();
    const walk = walkRecord();
    const started = beginLock(walk, true);
    walk.lock = null;
    pending.forEach((answer) => answer());
    expect(await started).toBe(false);
    expect(walk.lock).toBeNull();
  });

  it('beginLock keeps its fix when nothing changed', async () => {
    const pending = fakeGeolocation();
    const walk = walkRecord();
    const started = beginLock(walk, true);
    pending.forEach((answer) => answer());
    expect(await started).toBe(true);
    expect(walk.lock?.fix).not.toBeNull();
  });

  it('checkIn credits nothing when the lock was replaced during the final fix', async () => {
    const pending = fakeGeolocation();
    const walk = walkRecord();
    walk.lock = { at: 0, hiddenAt: null, hiddenMs: 20 * 60_000, fix: { lat: 35, lon: 139, accuracy: 5 } };
    const checking = checkIn(walk, 20 * 60_000);
    walk.lock = null;
    pending.forEach((answer) => answer());
    const outcome = await checking;
    expect(outcome.stale).toBe(true);
    expect(walk.pure).toBe(0);
  });
});
