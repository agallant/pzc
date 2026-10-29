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

/** Lets awaiting code reach its next geolocation request, then answers every request so far. */
async function answerAll(pending: Array<() => void>): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  while (pending.length > 0) pending.shift()?.();
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
    await answerAll(pending);
    expect(await started).toBe(false);
    expect(walk.lock).toBeNull();
  });

  it('beginLock keeps its fix when nothing changed', async () => {
    const pending = fakeGeolocation();
    const walk = walkRecord();
    const started = beginLock(walk, true);
    await answerAll(pending);
    expect(await started).toBe(true);
    expect(walk.lock?.fix).not.toBeNull();
  });

  it('checkIn credits nothing when the lock was replaced during the final fix', async () => {
    const pending = fakeGeolocation();
    const walk = walkRecord();
    walk.lock = { at: 0, hiddenAt: null, hiddenMs: 20 * 60_000, locate: true, fix: { lat: 35, lon: 139, accuracy: 5 } };
    const checking = checkIn(walk, 20 * 60_000);
    walk.lock = null;
    await answerAll(pending);
    const outcome = await checking;
    expect(outcome.stale).toBe(true);
    expect(walk.pure).toBe(0);
  });

  it('checkIn waits for a first fix that is still pending instead of treating it as unverified', async () => {
    const pending = fakeGeolocation();
    const walk = walkRecord();
    const started = beginLock(walk, true);
    const checking = checkIn(walk, 20 * 60_000);
    let settled = false;
    void checking.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    // Only the first fix is in flight; the final one is requested once it has settled.
    expect(pending).toHaveLength(1);
    pending.shift()?.();
    await started;
    await answerAll(pending);
    const outcome = await checking;
    expect(outcome.locationFailed).toBe(false);
  });

  it('checkIn reports a location failure when the starting fix is missing but location was asked for', async () => {
    const pending = fakeGeolocation();
    const walk = walkRecord();
    walk.lock = { at: 0, hiddenAt: null, hiddenMs: 20 * 60_000, locate: true, fix: null };
    const checking = checkIn(walk, 20 * 60_000);
    await answerAll(pending);
    const outcome = await checking;
    expect(outcome.locationFailed).toBe(true);
    expect(outcome.credit.verified).toBe(false);
  });

  it('checkIn does not ask for a final fix when the lock was cancelled while the first was pending', async () => {
    const pending = fakeGeolocation();
    const walk = walkRecord();
    const started = beginLock(walk, true);
    const checking = checkIn(walk, 20 * 60_000);
    walk.lock = null;
    pending.shift()?.();
    await started;
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(pending).toHaveLength(0);
    const outcome = await checking;
    expect(outcome.stale).toBe(true);
  });
});
