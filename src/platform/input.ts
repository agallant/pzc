import type { Input } from '../game/sim';

const STICK_RADIUS = 56;
const DEAD_ZONE = 6;


export interface StickView {
  active: boolean;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

/** Floating virtual joystick on the canvas, a hold-to-sprint button, and a keyboard fallback. */
export class Controls {
  readonly stick: StickView = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
  private pointerId: number | null = null;
  private sprintHeld = false;
  private keys = new Set<string>();
  enabled = false;
  /** Multiplier for the joystick's reach, for the larger-controls setting. */
  stickScale = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey(true));
    window.addEventListener('keyup', this.onKey(false));
    window.addEventListener('blur', () => this.release());
  }

  bindSprint(button: HTMLElement): void {
    const press = (e: Event): void => {
      e.preventDefault();
      this.sprintHeld = true;
      button.classList.add('held');
    };
    const lift = (): void => {
      this.sprintHeld = false;
      button.classList.remove('held');
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', lift);
    button.addEventListener('pointercancel', lift);
    button.addEventListener('pointerleave', lift);
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  release(): void {
    this.pointerId = null;
    this.stick.active = false;
    this.sprintHeld = false;
    this.keys.clear();
  }

  read(): Input {
    let dx = 0;
    let dy = 0;
    if (this.enabled) {
      if (this.stick.active) {
        const sx = this.stick.x - this.stick.ox;
        const sy = this.stick.y - this.stick.oy;
        const d = Math.hypot(sx, sy);
        if (d > DEAD_ZONE) {
          const reach = STICK_RADIUS * this.stickScale;
          const m = Math.min(1, (d - DEAD_ZONE) / (reach - DEAD_ZONE));
          dx = (sx / d) * m;
          dy = (sy / d) * m;
        }
      }
      const k = this.keys;
      const kx = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
      const ky = (k.has('arrowdown') || k.has('s') ? 1 : 0) - (k.has('arrowup') || k.has('w') ? 1 : 0);
      if (kx || ky) {
        const m = Math.hypot(kx, ky);
        dx = kx / m;
        dy = ky / m;
      }
    }
    const sprint = this.enabled && (this.sprintHeld || this.keys.has('shift') || this.keys.has(' '));
    return { dx, dy, sprint };
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled || this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    const s = this.stick;
    s.active = true;
    s.ox = s.x = e.clientX;
    s.oy = s.y = e.clientY;
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    const s = this.stick;
    s.x = e.clientX;
    s.y = e.clientY;
    // The base follows the thumb so a long drag never needs a re-grip.
    const d = Math.hypot(s.x - s.ox, s.y - s.oy);
    const reach = STICK_RADIUS * this.stickScale;
    if (d > reach) {
      const f = (d - reach) / d;
      s.ox += (s.x - s.ox) * f;
      s.oy += (s.y - s.oy) * f;
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.stick.active = false;
  };

  private onKey = (down: boolean) => (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (!['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'shift', ' '].includes(key)) return;
    if (this.enabled && key === ' ') e.preventDefault();
    if (down) this.keys.add(key);
    else this.keys.delete(key);
  };
}

export const STICK_MAX = STICK_RADIUS;
