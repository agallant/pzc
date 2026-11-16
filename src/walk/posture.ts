/**
 * Guesses whether the phone is held up in front of the face (the "zombie posture").
 *
 * When you look at a screen the phone is tilted so its screen points partly upward, and it is held
 * steadily. In a pocket, a bag or a swinging hand the screen is mostly vertical or the orientation
 * keeps changing. This reads only the gravity direction, so it works on any phone with an
 * accelerometer. It is a heuristic, which is why touching the screen also counts as phone use.
 */

const LOOK_MIN_Z = 0.42; // |gravity along the screen normal| / |gravity|: 0 = upright, 1 = flat
const STEADY_SECONDS = 1.6;
const STEADY_DRIFT = 0.22; // allowed change in the gravity direction, as a unit-vector distance

export class PostureTracker {
  private ux = 0;
  private uy = 0;
  private uz = 1;
  private ready = false;
  private anchor = { x: 0, y: 0, z: 1 };
  private anchorT = 0;
  private looking = false;

  /** Feed raw accelerometer samples (including gravity); returns true while the phone looks held up. */
  push(t: number, ax: number, ay: number, az: number): boolean {
    const m = Math.hypot(ax, ay, az);
    if (m < 1) return this.looking;
    const x = ax / m;
    const y = ay / m;
    const z = az / m;
    if (!this.ready) {
      this.ux = x;
      this.uy = y;
      this.uz = z;
      this.anchor = { x, y, z };
      this.anchorT = t;
      this.ready = true;
    }
    // Walking shakes the signal; a slow low-pass leaves the average tilt.
    this.ux += (x - this.ux) * 0.05;
    this.uy += (y - this.uy) * 0.05;
    this.uz += (z - this.uz) * 0.05;
    const drift = Math.hypot(this.ux - this.anchor.x, this.uy - this.anchor.y, this.uz - this.anchor.z);
    if (drift > STEADY_DRIFT) {
      this.anchor = { x: this.ux, y: this.uy, z: this.uz };
      this.anchorT = t;
      this.looking = false;
    }
    const tilted = Math.abs(this.uz) >= LOOK_MIN_Z;
    this.looking = tilted && t - this.anchorT >= STEADY_SECONDS;
    return this.looking;
  }

  reset(): void {
    this.ready = false;
    this.looking = false;
  }
}
