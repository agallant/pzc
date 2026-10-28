import { MAX_HP, type Game } from '../game/sim';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** In-game overlay. Values are only written to the DOM when they change. */
export class Hud {
  readonly root: HTMLElement;
  readonly sprint: HTMLButtonElement;
  readonly pause: HTMLButtonElement;
  private hearts: HTMLElement[] = [];
  private heartsBox = el('div', 'hearts');
  private timer = el('div', 'timer');
  private score = el('div', 'score');
  private combo = el('div', 'combo');
  private stamina = el('div', 'stamina');
  private staminaFill = el('div', 'stamina-fill');
  private progress = el('div', 'progress');
  private progressFill = el('div', 'progress-fill');
  private toast = el('div', 'toast');
  private last: Record<string, string> = {};
  private toastTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    const top = el('div', 'hud-top');
    for (let i = 0; i < MAX_HP; i++) {
      const h = el('span', 'heart', '♥');
      h.setAttribute('aria-hidden', 'true');
      this.hearts.push(h);
      this.heartsBox.append(h);
    }
    this.pause = el('button', 'icon-btn', 'II');
    this.pause.type = 'button';
    this.pause.setAttribute('aria-label', 'Pause');
    top.append(this.heartsBox, this.timer, this.pause);
    const sub = el('div', 'hud-sub');
    sub.append(this.score, this.combo);
    this.stamina.append(this.staminaFill);
    this.stamina.setAttribute('aria-hidden', 'true');
    this.progress.append(this.progressFill);
    this.progress.setAttribute('aria-hidden', 'true');
    this.sprint = el('button', 'sprint', 'RUN');
    this.sprint.type = 'button';
    this.sprint.setAttribute('aria-label', 'Run (hold)');
    this.toast.setAttribute('role', 'status');
    root.append(top, sub, this.stamina, this.progress, this.sprint, this.toast);
  }

  private set(key: string, value: string, apply: () => void): void {
    if (this.last[key] === value) return;
    this.last[key] = value;
    apply();
  }

  update(game: Game, dt: number): void {
    const p = game.player;
    this.set('hp', String(p.hp), () => {
      this.hearts.forEach((h, i) => h.classList.toggle('lost', i >= p.hp));
      this.heartsBox.setAttribute('aria-label', `${p.hp} of ${MAX_HP} hearts left`);
    });
    this.set('time', clock(game.timeLeft), () => {
      this.timer.textContent = clock(game.timeLeft);
    });
    this.set('urgent', String(game.timeLeft < 10), () => this.timer.classList.toggle('urgent', game.timeLeft < 10));
    this.set('score', String(Math.round(game.score)), () => {
      this.score.textContent = String(Math.round(game.score));
    });
    this.set('combo', String(game.combo), () => {
      this.combo.textContent = game.combo > 1 ? `x${game.combo}` : '';
    });
    this.set('stam', String(Math.round(p.stamina / 2)), () => {
      this.staminaFill.style.width = `${p.stamina}%`;
    });
    this.set('exh', String(p.exhausted), () => this.stamina.classList.toggle('exhausted', p.exhausted));
    this.set('boost', String(p.boost > 0), () => this.stamina.classList.toggle('boosted', p.boost > 0));
    const prog = Math.round(100 * (1 - p.y / game.level.height));
    this.set('prog', String(prog), () => {
      this.progressFill.style.height = `${Math.max(0, Math.min(100, prog))}%`;
    });
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }
  }

  say(text: string, seconds = 1.8): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this.toastTimer = seconds;
  }

  reset(): void {
    this.last = {};
    this.toast.classList.remove('show');
    this.toastTimer = 0;
  }
}
