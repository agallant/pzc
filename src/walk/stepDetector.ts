/**
 * Step counting from accelerometer samples (including gravity).
 *
 * Browsers expose no pedometer, so steps are found as peaks in the acceleration magnitude. To keep
 * a shaken or fidgeting phone from counting, a step only counts once it is part of a short, regular
 * rhythm of walking pace (about 1.2 to 3.3 steps per second). The first few steps of a walk are
 * credited retroactively once the rhythm is confirmed.
 */

const MIN_INTERVAL = 0.3;
const MAX_INTERVAL = 1.0;
const CONFIRM_STEPS = 4;
const MAX_JITTER = 0.4;
const IDLE_AFTER = 1.6;
const MIN_PEAK = 0.9;

export interface StepResult {
  /** Steps newly credited by this sample. */
  steps: number;
  walking: boolean;
}

export class StepDetector {
  private gravity = 9.81;
  private window: number[] = [];
  private prev1 = 0;
  private prev2 = 0;
  private amplitude = 2;
  private lastPeakAt = -Infinity;
  private candidate: number[] = [];
  private confirmed = false;
  private started = false;

  /** `t` is in seconds, any epoch; samples should arrive at roughly 20 Hz or faster. */
  push(t: number, ax: number, ay: number, az: number): StepResult {
    const mag = Math.hypot(ax, ay, az);
    if (!this.started) {
      this.gravity = mag || 9.81;
      this.started = true;
    }
    // Slow low-pass for gravity, then a short moving average to take the jitter off.
    this.gravity += (mag - this.gravity) * 0.02;
    this.window.push(mag - this.gravity);
    if (this.window.length > 5) this.window.shift();
    const s = this.window.reduce((a, b) => a + b, 0) / this.window.length;

    let steps = 0;
    // A peak is a local maximum seen one sample late.
    const isPeak = this.prev1 > this.prev2 && this.prev1 >= s && this.prev1 > Math.max(MIN_PEAK, this.amplitude * 0.45);
    if (isPeak) {
      const peakT = t;
      const dt = peakT - this.lastPeakAt;
      this.amplitude += (this.prev1 - this.amplitude) * 0.2;
      if (dt >= MIN_INTERVAL) {
        steps = this.onStep(peakT, dt);
        this.lastPeakAt = peakT;
      }
    } else if (this.confirmed && t - this.lastPeakAt > IDLE_AFTER) {
      this.reset();
    } else if (!this.confirmed && this.candidate.length > 0 && t - this.lastPeakAt > MAX_INTERVAL) {
      this.candidate = [];
    }
    this.prev2 = this.prev1;
    this.prev1 = s;
    return { steps, walking: this.confirmed };
  }

  private onStep(t: number, dt: number): number {
    if (dt > MAX_INTERVAL) {
      // Too long since the last peak: start a new candidate rhythm.
      this.candidate = [t];
      this.confirmed = false;
      return 0;
    }
    if (this.confirmed) {
      return 1;
    }
    this.candidate.push(t);
    if (this.candidate.length < CONFIRM_STEPS + 1) return 0;
    const gaps: number[] = [];
    for (let i = 1; i < this.candidate.length; i++) gaps.push((this.candidate[i] as number) - (this.candidate[i - 1] as number));
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const regular = gaps.every((g) => Math.abs(g - mean) / mean < MAX_JITTER);
    if (!regular) {
      this.candidate.shift();
      return 0;
    }
    this.confirmed = true;
    const credited = this.candidate.length;
    this.candidate = [];
    return credited;
  }

  reset(): void {
    this.confirmed = false;
    this.candidate = [];
    this.lastPeakAt = -Infinity;
  }
}
