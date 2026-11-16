import type { Fix } from './credit';

export type MotionPermission = 'granted' | 'denied' | 'unsupported';

interface MotionEventCtor {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/** iOS asks for motion access, and only from a tap. Everywhere else the events just flow. Call this first in a click handler. */
export async function requestMotion(): Promise<MotionPermission> {
  const Ctor = (window as unknown as { DeviceMotionEvent?: MotionEventCtor }).DeviceMotionEvent;
  if (!Ctor) return 'unsupported';
  if (typeof Ctor.requestPermission === 'function') {
    try {
      return (await Ctor.requestPermission()) === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  return 'granted';
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

/** Keeps the screen on (Screen Wake Lock, iOS 16.4+ and current Android). Returns a release function, or null if unsupported. */
export async function keepScreenOn(): Promise<(() => void) | null> {
  const wl = (navigator as unknown as { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
  if (!wl) return null;
  let sentinel: WakeLockSentinelLike | null = null;
  let released = false;
  const acquire = async (): Promise<void> => {
    try {
      sentinel = await wl.request('screen');
    } catch {
      sentinel = null;
    }
  };
  await acquire();
  if (!sentinel) return null;
  // The lock is dropped whenever the page is hidden; take it again on return.
  const onVisible = (): void => {
    if (!released && document.visibilityState === 'visible') void acquire();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    released = true;
    document.removeEventListener('visibilitychange', onVisible);
    void sentinel?.release().catch(() => {});
  };
}

/** One location reading, or null if denied, unavailable or too slow. Never stored beyond the current walk. */
export function getFix(timeoutMs = 9000): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
