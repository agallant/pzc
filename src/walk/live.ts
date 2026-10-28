import type { WalkRecord } from '../platform/storage';
import { checkInCredit } from './credit';
import { PostureTracker } from './posture';
import { keepScreenOn, requestMotion, type MotionPermission } from './sensors';
import { StepDetector } from './stepDetector';

/** After a touch, steps are phone-use steps for this long. */
const TOUCH_GRACE_MS = 4000;
const NO_SENSOR_MS = 3500;
/** Steps are held back this long before they count, so picking the phone up cannot bank the steps just before it is noticed. */
const HOLD_SECONDS = 2;

export type LivePhase = 'starting' | 'walking' | 'looking' | 'noSensor' | 'done';

export interface LiveView {
  phase: LivePhase;
  pure: number;
  zombie: number;
  required: number;
  /** A one-off message such as "Counted 40 steps from the time the screen was off". */
  note?: string;
  /** False if the browser would not keep the screen on. */
  awake: boolean;
}

/**
 * "Pocket mode": count steps live from the accelerometer while the screen stays on (and black).
 * A step is pure only if the phone is not held up in the zombie posture and has not been touched
 * lately. If the screen goes off anyway, the time away is credited like a check-in.
 */
export class LiveWalk {
  private detector = new StepDetector();
  private posture = new PostureTracker();
  private lastTouch = -Infinity;
  private looking = false;
  private walking = false;
  private gotMotion = false;
  private release: (() => void) | null = null;
  private awake = false;
  private hiddenAt: number | null = null;
  private noSensorTimer = 0;
  private note: string | undefined;
  private done = false;
  private stopped = false;
  private pending: { t: number; n: number }[] = [];

  constructor(
    private readonly walk: WalkRecord,
    private readonly onView: (view: LiveView) => void,
    private readonly onProgress: (pure: number) => void,
  ) {}

  /** Must be called straight from a tap: iOS only shows its motion permission prompt then. */
  async start(): Promise<MotionPermission> {
    const permission = await requestMotion();
    if (permission !== 'granted' || this.stopped) return permission;
    window.addEventListener('devicemotion', this.onMotion);
    document.addEventListener('pointerdown', this.onTouch, true);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.noSensorTimer = window.setTimeout(() => {
      if (!this.gotMotion) this.emit();
    }, NO_SENSOR_MS);
    this.release = await keepScreenOn();
    if (this.stopped) {
      // Stop arrived while the wake lock was being taken: give it straight back.
      this.release?.();
      this.release = null;
      return 'granted';
    }
    this.awake = this.release !== null;
    this.emit();
    return 'granted';
  }

  stop(): void {
    this.stopped = true;
    window.removeEventListener('devicemotion', this.onMotion);
    document.removeEventListener('pointerdown', this.onTouch, true);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.clearTimeout(this.noSensorTimer);
    this.release?.();
    this.release = null;
  }

  private phase(): LivePhase {
    if (this.done) return 'done';
    if (!this.gotMotion && !this.walking) return performance.now() > this.startedAt + NO_SENSOR_MS ? 'noSensor' : 'starting';
    if (this.looking || this.recentlyTouched()) return 'looking';
    return this.walking ? 'walking' : 'starting';
  }

  private startedAt = performance.now();

  private recentlyTouched(): boolean {
    return performance.now() - this.lastTouch < TOUCH_GRACE_MS;
  }

  private emit(): void {
    this.onView({
      phase: this.phase(),
      pure: this.walk.pure,
      zombie: this.walk.zombie,
      required: this.walk.required,
      note: this.note,
      awake: this.awake,
    });
    this.note = undefined;
  }

  private onTouch = (): void => {
    this.lastTouch = performance.now();
    this.emit();
  };

  private onMotion = (e: DeviceMotionEvent): void => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null || g.z == null || this.done) return;
    this.gotMotion = true;
    const t = e.timeStamp / 1000;
    this.looking = this.posture.push(t, g.x, g.y, g.z);
    const r = this.detector.push(t, g.x, g.y, g.z);
    const wasWalking = this.walking;
    this.walking = r.walking;
    const before = this.walk.pure;
    const phoneUse = this.looking || this.recentlyTouched();
    if (r.steps > 0) {
      if (phoneUse) this.walk.zombie += r.steps;
      else this.pending.push({ t, n: r.steps });
    }
    if (phoneUse) {
      for (const p of this.pending) this.walk.zombie += p.n;
      this.pending = [];
    } else {
      while (this.pending[0] && t - (this.pending[0] as { t: number }).t >= HOLD_SECONDS) {
        const p = this.pending.shift() as { t: number; n: number };
        this.walk.pure = Math.min(this.walk.required, this.walk.pure + p.n);
      }
    }
    if (r.steps > 0 || wasWalking !== this.walking || this.walk.pure !== before) this.emit();
    if (this.walk.pure !== before) this.advance(before);
  };

  private advance(before: number): void {
    this.onProgress(this.walk.pure);
    if (this.walk.pure >= this.walk.required && !this.done) {
      this.done = true;
      this.stop();
      this.emit();
    } else if (Math.floor(before / 25) !== Math.floor(this.walk.pure / 25)) {
      this.emit();
    }
  }

  private onVisibility = (): void => {
    const now = Date.now();
    if (document.hidden) {
      this.hiddenAt = now;
      this.pending = [];
      this.onProgress(this.walk.pure);
      return;
    }
    if (this.hiddenAt === null) return;
    const credit = checkInCredit({ awayMs: now - this.hiddenAt });
    this.hiddenAt = null;
    if (credit.steps > 0) {
      const before = this.walk.pure;
      this.walk.pure = Math.min(this.walk.required, this.walk.pure + credit.steps);
      this.note = `Counted ${this.walk.pure - before} steps for the time the screen was off.`;
      this.advance(before);
    }
    this.emit();
  };
}
