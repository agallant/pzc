import type { LiveView } from '../walk/live';

const STATUS: Record<LiveView['phase'], string> = {
  starting: 'Put me in your pocket and start walking. Eyes up.',
  walking: 'Walking. Keep it up!',
  looking: 'ZOMBIE ALERT. Steps do not count while you look at me or touch me.',
  noSensor: 'No motion data. This browser is not sharing its sensors. Go back and use "Lock my phone and walk".',
  done: 'You walked it off. Phone out, commuter.',
};

/**
 * The screen shown during a live walk: near-black, so it is cheap to leave on, and dull on purpose.
 * There is nothing here worth looking at.
 */
export class WalkScreen {
  private root = document.createElement('div');
  private count = document.createElement('p');
  private status = document.createElement('p');
  private zombie = document.createElement('p');
  private note = document.createElement('p');
  private awake = document.createElement('p');
  private button = document.createElement('button');
  private onStop: () => void = () => {};
  private onDone: () => void = () => {};
  private phase: LiveView['phase'] = 'starting';
  private lastBucket = -1;

  constructor(parent: HTMLElement) {
    this.root.className = 'walkview';
    this.root.hidden = true;
    this.count.className = 'walk-count';
    this.status.className = 'walk-status';
    this.status.setAttribute('role', 'status');
    this.zombie.className = 'walk-zombie';
    this.note.className = 'walk-note';
    this.awake.className = 'walk-note';
    this.button.type = 'button';
    this.button.className = 'btn walk-btn';
    this.button.addEventListener('click', () => (this.phase === 'done' ? this.onDone() : this.onStop()));
    this.root.append(this.count, this.status, this.zombie, this.note, this.awake, this.button);
    parent.append(this.root);
  }

  show(onStop: () => void, onDone: () => void): void {
    this.onStop = onStop;
    this.onDone = onDone;
    this.root.hidden = false;
    this.lastBucket = -1;
  }

  hide(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  update(v: LiveView): void {
    this.phase = v.phase;
    this.count.textContent = `${v.pure} / ${v.required}`;
    this.count.setAttribute('aria-label', `${v.pure} of ${v.required} pure steps`);
    this.status.textContent = STATUS[v.phase];
    this.root.classList.toggle('alert', v.phase === 'looking');
    this.zombie.textContent = v.zombie > 0 ? `Zombie steps: ${v.zombie} (not counted)` : '';
    if (v.note) this.note.textContent = v.note;
    this.awake.textContent = v.awake ? '' : 'This browser would not keep the screen awake. If it dims, raise your auto-lock time, or use "Lock my phone and walk".';
    this.button.textContent = v.phase === 'done' ? 'Back to the commute' : 'Stop walking';
    this.button.classList.toggle('primary', v.phase === 'done');
    // A faint buzz every 25 pure steps, so you know it is working without looking.
    const bucket = Math.floor(v.pure / 25);
    if (this.lastBucket >= 0 && bucket > this.lastBucket) this.onMilestone();
    this.lastBucket = bucket;
  }

  onMilestone: () => void = () => {};
}
