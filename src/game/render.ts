import type { StickView } from '../platform/input';
import { STICK_MAX } from '../platform/input';
import { clamp } from './geometry';
import { BELT_SPEED } from './level';
import type { PersonaId } from './personas';
import { CAR_H, CAR_W, signalState, ZOMBIE_R, type Game, type GameEvent, type Zombie } from './sim';
import type { Decor, Rect, ThemeId, Wall } from './types';

interface Palette {
  pave: string;
  paveLine: string;
  road: string;
  building: string;
  buildingLit: string;
  concourse: string;
  concourseAlt: string;
  platform: string;
  train: string;
  accent: string;
}

const PALETTES: Record<ThemeId, Palette> = {
  sakura: {
    pave: '#c9bfc4', paveLine: '#b7abb2', road: '#3a3d48', building: '#4f4663', buildingLit: '#ffd98a',
    concourse: '#dcd8d2', concourseAlt: '#cfcac3', platform: '#c4cad6', train: '#d7dde6', accent: '#e8506a',
  },
  hangang: {
    pave: '#b8c3cd', paveLine: '#a6b2bd', road: '#343a44', building: '#2f4560', buildingLit: '#9fd8ff',
    concourse: '#d6dde3', concourseAlt: '#c8d1d9', platform: '#bcc8d4', train: '#dfe6ee', accent: '#2d7be0',
  },
  jade: {
    pave: '#cdbf9f', paveLine: '#bbad8d', road: '#3d3a38', building: '#6b3a35', buildingLit: '#ffe08a',
    concourse: '#e2d8c3', concourseAlt: '#d5c9b0', platform: '#cfc6b3', train: '#e6e1d4', accent: '#d93a2e',
  },
  rhine: {
    pave: '#b7ad9f', paveLine: '#a49a8c', road: '#383a3c', building: '#5d4a3f', buildingLit: '#ffe0a0',
    concourse: '#d9d4c9', concourseAlt: '#cbc5b9', platform: '#c3c0b8', train: '#e2e4e2', accent: '#2f8f5b',
  },
};

const OVERLAY = new Set(['sign', 'forkSign', 'notice', 'doorMarker']);
const COAT_BY_PERSONA: Record<PersonaId, string> = {
  commuter: '#ff9f43',
  suitcase: '#e8648a',
  tired: '#8f86d9',
  crutches: '#4fc3a1',
  wheelchair: '#4aa3e0',
};

const SKINS = ['#e9c4a3', '#d2a37c', '#b57b57', '#f1d2b8', '#8d5a3c', '#e0b48f'];
const COATS = ['#6f8f7c', '#7d7aa6', '#a07a6c', '#6c86a8', '#98a06c', '#a8708f'];
const CARS = ['#d84a4a', '#e3b341', '#4a8fd8', '#e8e8ea', '#3a3a42', '#59b36b'];

/** Set from `Fx.reduced` at the start of each frame: when true, nothing on the canvas pulses, bobs or wobbles. */
let still = false;
let capColor = '#ff9f43';

export interface Camera {
  x: number;
  y: number;
}

export interface Viewport {
  w: number;
  h: number;
  dpr: number;
  scale: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  life: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: string;
  size: number;
}

/** Transient visual effects: floating text, particles and screen shake. */
export class Fx {
  texts: FloatText[] = [];
  particles: Particle[] = [];
  shake = 0;
  reduced = false;
  /** Colour of the player's cap (the equipped outfit). */
  cap = '#ff9f43';

  text(x: number, y: number, text: string, color: string): void {
    this.texts.push({ x, y, text, color, age: 0, life: 1.1 });
  }

  burst(x: number, y: number, color: string, n: number): void {
    if (this.reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: 0.4 + Math.random() * 0.3, color, size: 0.08 + Math.random() * 0.1 });
    }
  }

  handle(e: GameEvent): void {
    switch (e.type) {
      case 'hit':
        this.text(e.x, e.y - 0.8, e.by === 'car' ? 'HONK!' : e.by === 'train' ? 'MISSED IT!' : 'BUMP!', '#ff6b6b');
        this.burst(e.x, e.y, '#ff6b6b', 14);
        if (!this.reduced) this.shake = 0.6;
        break;
      case 'nearMiss':
        this.text(e.x, e.y - 0.9, e.combo > 1 ? `Excuse me! x${e.combo}` : 'Excuse me!', '#ffd166');
        break;
      case 'coin':
        this.burst(e.x, e.y, '#ffd34d', 5);
        break;
      case 'coffee':
        this.text(e.x, e.y - 0.8, 'CAFFEINATED!', '#c98b5b');
        this.burst(e.x, e.y, '#c98b5b', 10);
        break;
      default:
        break;
    }
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    for (const t of this.texts) t.age += dt;
    this.texts = this.texts.filter((t) => t.age < t.life);
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }
}

export function computeViewport(w: number, h: number, dpr: number): Viewport {
  return { w, h, dpr: Math.min(dpr, 2), scale: Math.min(w / 10, h / 14) };
}

export function updateCamera(cam: Camera, game: Game, vp: Viewport, dt: number, snap: boolean): void {
  const viewW = vp.w / vp.scale;
  const viewH = vp.h / vp.scale;
  const p = game.player;
  const wantX = viewW >= game.level.width ? game.level.width / 2 : clamp(p.x, viewW / 2, game.level.width - viewW / 2);
  const wantY = clamp(p.y - viewH * 0.14, viewH / 2, Math.max(viewH / 2, game.level.height - viewH / 2));
  const k = snap ? 1 : Math.min(1, dt * 7);
  cam.x += (wantX - cam.x) * k;
  cam.y += (wantY - cam.y) * k;
}

function visible(r: Rect, x0: number, y0: number, x1: number, y1: number): boolean {
  return r.x < x1 && r.x + r.w > x0 && r.y < y1 && r.y + r.h > y0;
}

export function drawGame(
  ctx: CanvasRenderingContext2D,
  game: Game,
  cam: Camera,
  vp: Viewport,
  alpha: number,
  fx: Fx,
  stick: StickView | null,
  time: number,
): void {
  const pal = PALETTES[game.level.theme];
  still = fx.reduced;
  capColor = fx.cap;
  const { w, h, dpr, scale } = vp;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b141a';
  ctx.fillRect(0, 0, w, h);

  const shakeX = fx.shake > 0 ? (Math.random() - 0.5) * fx.shake * 0.5 : 0;
  const shakeY = fx.shake > 0 ? (Math.random() - 0.5) * fx.shake * 0.5 : 0;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cam.x + shakeX, -cam.y + shakeY);

  const x0 = cam.x - w / 2 / scale - 1;
  const x1 = cam.x + w / 2 / scale + 1;
  const y0 = cam.y - h / 2 / scale - 1;
  const y1 = cam.y + h / 2 / scale + 1;

  // Keep everything (including commuters streaming in from off-map) inside the world.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, game.level.width, game.level.height);
  ctx.clip();

  drawFloors(ctx, game, pal, x0, y0, x1, y1, time);
  for (const d of game.level.decor) if (!OVERLAY.has(d.kind) && visible(d, x0, y0, x1, y1)) drawDecor(ctx, d, game, time);
  drawPickups(ctx, game, time, x0, y0, x1, y1);
  for (const wl of game.level.walls) if (visible(wl, x0, y0, x1, y1)) drawWall(ctx, wl, pal);
  for (const d of game.level.decor) if (OVERLAY.has(d.kind) && visible(d, x0, y0, x1, y1)) drawDecor(ctx, d, game, time);

  const people: { y: number; draw: () => void }[] = [];
  for (const z of game.zombies) {
    const zy = z.py + (z.y - z.py) * alpha;
    if (zy < y0 - 2 || zy > y1 + 2) continue;
    people.push({ y: zy, draw: () => drawZombie(ctx, z, alpha, game.time) });
  }
  const p = game.player;
  const py = p.py + (p.y - p.py) * alpha;
  people.push({ y: py, draw: () => drawPlayer(ctx, game, alpha) });
  people.sort((a, b) => a.y - b.y);
  for (const person of people) person.draw();

  for (const car of game.cars) drawCar(ctx, car.px + (car.x - car.px) * alpha, car.y, car.vx, CARS[car.hue % CARS.length] as string);

  for (const part of fx.particles) {
    ctx.globalAlpha = 1 - part.age / part.life;
    ctx.fillStyle = part.color;
    ctx.fillRect(part.x - part.size, part.y - part.size, part.size * 2, part.size * 2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of fx.texts) {
    const k = t.age / t.life;
    ctx.globalAlpha = 1 - k * k;
    ctx.font = '800 0.62px system-ui, sans-serif';
    ctx.lineWidth = 0.12;
    ctx.strokeStyle = '#10202a';
    ctx.strokeText(t.text, t.x, t.y - (still ? 0.6 : k * 1.2));
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y - (still ? 0.6 : k * 1.2));
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (game.player.hp === 1 && game.status === 'playing') drawDanger(ctx, w, h, time);
  if (stick?.active) drawStick(ctx, stick, dpr);
}

function drawFloors(ctx: CanvasRenderingContext2D, game: Game, pal: Palette, x0: number, y0: number, x1: number, y1: number, time: number): void {
  for (const z of game.level.zones) {
    if (!visible(z, x0, y0, x1, y1)) continue;
    const top = Math.max(z.y, y0);
    const bot = Math.min(z.y + z.h, y1);
    switch (z.floor) {
      case 'pavement': {
        ctx.fillStyle = pal.pave;
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.strokeStyle = pal.paveLine;
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        for (let x = z.x + 1.4; x < z.x + z.w; x += 1.4) {
          ctx.moveTo(x, top);
          ctx.lineTo(x, bot);
        }
        for (let y = Math.ceil(top / 1.4) * 1.4; y < bot; y += 1.4) {
          ctx.moveTo(z.x, y);
          ctx.lineTo(z.x + z.w, y);
        }
        ctx.stroke();
        break;
      }
      case 'road': {
        ctx.fillStyle = pal.road;
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.fillStyle = '#d9d9d0';
        const mid = z.y + z.h / 2;
        for (let x = 0; x < z.w; x += 1.6) ctx.fillRect(x, mid - 0.06, 0.9, 0.12);
        break;
      }
      case 'concourse': {
        ctx.fillStyle = pal.concourse;
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.fillStyle = pal.concourseAlt;
        const size = 2;
        for (let y = Math.floor(top / size) * size; y < bot; y += size) {
          for (let x = 0; x < z.w; x += size) if (((x / size) + (y / size)) % 2 === 0) ctx.fillRect(x, y, size, size);
        }
        break;
      }
      case 'platform':
        ctx.fillStyle = pal.platform;
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        for (let y = Math.floor(top / 3) * 3; y < bot; y += 3) ctx.fillRect(z.x, y, z.w, 0.08);
        break;
      case 'train':
        ctx.fillStyle = '#9aa5b1';
        ctx.fillRect(z.x, z.y, z.w, z.h);
        break;
      case 'stairs': {
        ctx.fillStyle = '#bdb6ab';
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let y = Math.ceil(top / 0.9) * 0.9; y < bot; y += 0.9) ctx.fillRect(z.x, y, z.w, 0.45);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let y = Math.ceil(top / 0.9) * 0.9; y < bot; y += 0.9) ctx.fillRect(z.x, y, z.w, 0.07);
        ctx.fillStyle = 'rgba(16,32,42,0.35)';
        ctx.font = '800 1.1px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let y = z.y + 3; y < z.y + z.h - 1; y += 6) ctx.fillText('▲', z.x + z.w / 2, y);
        break;
      }
      case 'escalator': {
        ctx.fillStyle = '#58626e';
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        const off = (time * BELT_SPEED) % 0.4;
        for (let y = Math.floor(top / 0.4) * 0.4 - off; y < bot; y += 0.4) ctx.fillRect(z.x, y, z.w, 0.06);
        ctx.fillStyle = '#f2c230';
        ctx.fillRect(z.x + z.w / 2 - 0.03, z.y, 0.06, z.h);
        ctx.fillStyle = '#2b323a';
        ctx.fillRect(z.x, z.y, 0.12, z.h);
        ctx.fillRect(z.x + z.w - 0.12, z.y, 0.12, z.h);
        break;
      }
    }
  }
}

function drawWall(ctx: CanvasRenderingContext2D, wl: Wall, pal: Palette): void {
  const { x, y, w, h } = wl;
  switch (wl.kind) {
    case 'building': {
      ctx.fillStyle = pal.building;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x, y, w, 0.12);
      for (let wy = Math.ceil(y / 1.6) * 1.6; wy < y + h - 0.8; wy += 1.6) {
        const lit = Math.sin(wy * 12.9898 + x * 78.233) > 0.2;
        ctx.fillStyle = lit ? pal.buildingLit : 'rgba(0,0,0,0.28)';
        ctx.fillRect(x + w / 2 - 0.35, wy, 0.7, 0.9);
      }
      break;
    }
    case 'pillar':
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + 0.1, y + 0.12, w, h);
      ctx.fillStyle = '#eceff3';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#98a2ad';
      ctx.lineWidth = 0.08;
      ctx.strokeRect(x + 0.04, y + 0.04, w - 0.08, h - 0.08);
      break;
    case 'planter':
      ctx.fillStyle = '#6b4a35';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#4f9a58';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, w * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6dbb70';
      ctx.beginPath();
      ctx.arc(x + w * 0.42, y + h * 0.42, w * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'bench':
      ctx.fillStyle = '#7a5a3c';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#92704c';
      if (w >= h) for (let bx = x + 0.1; bx < x + w - 0.1; bx += 0.4) ctx.fillRect(bx, y + 0.08, 0.28, h - 0.16);
      else for (let by = y + 0.1; by < y + h - 0.1; by += 0.4) ctx.fillRect(x + 0.08, by, w - 0.16, 0.28);
      break;
    case 'vending':
      ctx.fillStyle = pal.accent;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#fff6d8';
      ctx.fillRect(x + 0.15, y + 0.15, w - 0.3, h * 0.55);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + 0.15, y + h * 0.8, w - 0.3, 0.2);
      break;
    case 'gate':
      ctx.fillStyle = '#4a5560';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#7bd0ff';
      ctx.fillRect(x + 0.08, y + 0.35, w - 0.16, 0.12);
      break;
    case 'barrier':
      ctx.fillStyle = '#7d8896';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, y, w, h < w ? h : 0.1);
      break;
    case 'shaft':
      ctx.fillStyle = '#8c97a3';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x + 0.15, y + 0.15, w - 0.3, h - 0.3);
      ctx.strokeStyle = '#6a7580';
      ctx.lineWidth = 0.08;
      ctx.strokeRect(x + 0.15, y + 0.15, w - 0.3, h - 0.3);
      break;
    case 'train': {
      ctx.fillStyle = pal.train;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = pal.accent;
      ctx.fillRect(x, y + h - 0.35, w, 0.25);
      if (h > 2) {
        ctx.fillStyle = '#7fa0bf';
        for (let wx = x + 0.4; wx < x + w - 0.8; wx += 1.6) ctx.fillRect(wx, y + h * 0.35, 1.0, 0.7);
      }
      break;
    }
  }
}

function drawDecor(ctx: CanvasRenderingContext2D, d: Decor, game: Game, time: number): void {
  switch (d.kind) {
    case 'crosswalk':
      ctx.fillStyle = 'rgba(245,245,238,0.92)';
      for (let x = d.x; x < d.x + d.w - 0.1; x += 0.95) ctx.fillRect(x, d.y + 0.1, 0.5, d.h - 0.2);
      break;
    case 'yellowLine':
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = d.x + 0.3; x < d.x + d.w; x += 0.6) ctx.fillRect(x, d.y + d.h + 0.15, 0.22, 0.22);
      break;
    case 'sign': {
      ctx.fillStyle = '#1f3d63';
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.06;
      ctx.strokeRect(d.x + 0.08, d.y + 0.08, d.w - 0.16, d.h - 0.16);
      if (d.chip) {
        ctx.fillStyle = d.chip;
        ctx.fillRect(d.x + 0.08, d.y + 0.08, 0.3, d.h - 0.16);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.min(0.55, d.h * 0.46)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = d.sub ? `${d.text ?? ''}  ${d.sub}` : (d.text ?? '');
      ctx.fillText(label, d.x + d.w / 2, d.y + d.h / 2 + 0.02, d.w - 0.7);
      break;
    }
    case 'forkSign': {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(d.x + 0.1, d.y + 0.12, d.w, d.h);
      ctx.fillStyle = '#1f3d63';
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.07;
      ctx.strokeRect(d.x + 0.08, d.y + 0.08, d.w - 0.16, d.h - 0.16);
      const left = d.arrow === 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 0.9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(left ? '\u25c0' : '\u25b6', left ? d.x + 0.65 : d.x + d.w - 0.65, d.y + d.h / 2);
      const cx = left ? d.x + d.w - 0.7 : d.x + 0.7;
      ctx.fillStyle = d.chip ?? '#888';
      ctx.beginPath();
      ctx.arc(cx, d.y + d.h / 2, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 0.7px system-ui, sans-serif';
      ctx.fillText(d.index !== undefined ? String(d.index) : '', cx, d.y + d.h / 2 + 0.03);
      const mid = d.x + d.w / 2 + (left ? 0.1 : 0.0);
      ctx.font = '800 0.52px system-ui, sans-serif';
      ctx.fillText(d.text ?? '', mid, d.y + (d.sub ? d.h * 0.36 : d.h / 2), d.w - 2.9);
      if (d.sub) {
        ctx.font = '600 0.4px system-ui, sans-serif';
        ctx.fillStyle = '#cfe0f5';
        ctx.fillText(d.sub, mid, d.y + d.h * 0.72, d.w - 2.9);
      }
      break;
    }
    case 'notice': {
      ctx.fillStyle = d.chip ?? '#b33a3a';
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.06;
      ctx.strokeRect(d.x + 0.07, d.y + 0.07, d.w - 0.14, d.h - 0.14);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.min(0.5, d.h * 0.42)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.text ?? '', d.x + d.w / 2, d.y + d.h / 2 + 0.02, d.w - 0.3);
      break;
    }
    case 'floorLine':
      ctx.fillStyle = d.chip ?? '#fff';
      ctx.globalAlpha = 0.85;
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.globalAlpha = 1;
      break;
    case 'lift': {
      const lift = game.level.lift;
      const working = lift?.working ?? false;
      ctx.fillStyle = working ? '#cfd8e0' : '#8b8f94';
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.strokeStyle = '#7b8793';
      ctx.lineWidth = 0.08;
      ctx.strokeRect(d.x + 0.05, d.y + 0.05, d.w - 0.1, d.h - 0.1);
      ctx.fillStyle = working ? '#4a5560' : '#5b5f64';
      ctx.font = '900 0.8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.index === 0 ? '\u25b2' : '\u25cf', d.x + d.w / 2, d.y + d.h / 2);
      const p = game.player;
      if (d.index === 0 && working && p.pad > 0 && p.ride === null) {
        ctx.strokeStyle = '#35c46a';
        ctx.lineWidth = 0.18;
        ctx.beginPath();
        ctx.arc(d.x + d.w / 2, d.y + d.h / 2, 0.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.pad / 1.2));
        ctx.stroke();
      }
      break;
    }
    case 'gateLight':
      if (d.index === 1) {
        ctx.fillStyle = '#35c46a';
        ctx.beginPath();
        ctx.moveTo(d.x + d.w / 2, d.y);
        ctx.lineTo(d.x + d.w / 2 + 0.4, d.y + 0.5);
        ctx.lineTo(d.x + d.w / 2 - 0.4, d.y + 0.5);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#e04646';
        ctx.lineWidth = 0.14;
        ctx.beginPath();
        ctx.moveTo(d.x + d.w / 2 - 0.3, d.y);
        ctx.lineTo(d.x + d.w / 2 + 0.3, d.y + 0.5);
        ctx.moveTo(d.x + d.w / 2 + 0.3, d.y);
        ctx.lineTo(d.x + d.w / 2 - 0.3, d.y + 0.5);
        ctx.stroke();
      }
      break;
    case 'doorMarker': {
      const pulse = still ? 0.7 : 0.55 + 0.25 * Math.sin(time * 5);
      ctx.fillStyle = `rgba(80,230,140,${pulse})`;
      ctx.fillRect(d.x + 0.15, d.y, d.w - 0.3, d.h);
      ctx.fillStyle = '#10202a';
      ctx.font = '800 0.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`CAR ${game.level.car}`, d.x + d.w / 2, d.y + 0.6);
      ctx.fillText('▲', d.x + d.w / 2, d.y + 1.3 - (still ? 0 : 0.12 * Math.sin(time * 6)));
      break;
    }
    case 'signal': {
      const s = signalState(game, d.index ?? 0);
      ctx.fillStyle = '#1b2026';
      ctx.fillRect(d.x, d.y, d.w, d.h);
      const blink = !s.pedGreen || s.left > 3 || still || Math.floor(time * 4) % 2 === 0;
      ctx.fillStyle = s.pedGreen ? (blink ? '#4cf08a' : '#1b5a35') : '#ff4d4d';
      ctx.beginPath();
      ctx.arc(d.x + d.w / 2, d.y + d.h / 2, d.w * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 0.45px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.ceil(s.left)), d.x + d.w / 2, d.y + d.h + 0.35);
      break;
    }
  }
}

function drawPickups(ctx: CanvasRenderingContext2D, game: Game, time: number, x0: number, y0: number, x1: number, y1: number): void {
  for (const pk of game.pickups) {
    if (pk.taken || pk.x < x0 || pk.x > x1 || pk.y < y0 || pk.y > y1) continue;
    const bob = still ? 0 : Math.sin(time * 4 + pk.x * 3) * 0.06;
    if (pk.type === 'coin') {
      ctx.fillStyle = '#e7a915';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.arc(pk.x - 0.03, pk.y + bob - 0.03, 0.17, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(pk.x, pk.y + 0.3, 0.3, 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4f1ea';
      ctx.fillRect(pk.x - 0.22, pk.y - 0.25 + bob, 0.44, 0.5);
      ctx.fillStyle = '#7a4a2a';
      ctx.fillRect(pk.x - 0.22, pk.y - 0.25 + bob, 0.44, 0.18);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(pk.x - 0.08, pk.y - 0.35 + bob);
      ctx.quadraticCurveTo(pk.x - 0.2, pk.y - 0.55 + bob, pk.x - 0.05, pk.y - 0.7 + bob);
      ctx.stroke();
    }
  }
}

function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, color: string): void {
  const dir = Math.sign(vx) || 1;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - CAR_W / 2 + 0.1, y - CAR_H / 2 + 0.15, CAR_W, CAR_H);
  ctx.fillStyle = color;
  ctx.fillRect(x - CAR_W / 2, y - CAR_H / 2, CAR_W, CAR_H);
  ctx.fillStyle = 'rgba(20,30,40,0.75)';
  ctx.fillRect(x - CAR_W * 0.1 + dir * CAR_W * 0.08, y - CAR_H / 2 + 0.14, CAR_W * 0.3, CAR_H - 0.28);
  ctx.fillStyle = '#fff4b8';
  ctx.fillRect(x + dir * (CAR_W / 2 - 0.12), y - CAR_H / 2 + 0.12, 0.12, 0.3);
  ctx.fillRect(x + dir * (CAR_W / 2 - 0.12), y + CAR_H / 2 - 0.42, 0.12, 0.3);
}

function person(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number,
  r: number,
  coat: string,
  skin: string,
  gait: number,
  moving: boolean,
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 0.06, y + 0.08, r * 1.05, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  const swing = moving ? Math.sin(gait) * r * 0.5 : 0;
  ctx.fillStyle = '#2b2f3a';
  ctx.beginPath();
  ctx.ellipse(swing, -r * 0.55, r * 0.3, r * 0.22, 0, 0, Math.PI * 2);
  ctx.ellipse(-swing, r * 0.55, r * 0.3, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.7, r * 1.0, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(r * 0.12, 0, r * 0.52, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawZombie(ctx: CanvasRenderingContext2D, z: Zombie, alpha: number, time: number): void {
  const x = z.px + (z.x - z.px) * alpha;
  const y = z.py + (z.y - z.py) * alpha;
  const moving = z.state === 'walk' || z.state === 'cross' || z.state === 'ping';
  const gait = time * z.speed * 5 + z.id;
  person(ctx, x, y, z.heading, ZOMBIE_R, COATS[z.skin % COATS.length] as string, SKINS[(z.skin + 2) % SKINS.length] as string, gait, moving);
  // The zombie pose: both arms straight out, holding a glowing phone, eyes never leaving it.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(z.heading);
  const glow = 0.35 + 0.65 * z.flash;
  const grad = ctx.createRadialGradient(ZOMBIE_R * 1.9, 0, 0, ZOMBIE_R * 1.9, 0, ZOMBIE_R * (1.4 + z.flash));
  grad.addColorStop(0, `rgba(120,225,255,${0.55 * glow})`);
  grad.addColorStop(1, 'rgba(120,225,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(ZOMBIE_R * 1.9, 0, ZOMBIE_R * (1.4 + z.flash), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COATS[z.skin % COATS.length] as string;
  ctx.lineWidth = ZOMBIE_R * 0.28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ZOMBIE_R * 0.2, -ZOMBIE_R * 0.7);
  ctx.lineTo(ZOMBIE_R * 1.55, -ZOMBIE_R * 0.28);
  ctx.moveTo(ZOMBIE_R * 0.2, ZOMBIE_R * 0.7);
  ctx.lineTo(ZOMBIE_R * 1.55, ZOMBIE_R * 0.28);
  ctx.stroke();
  ctx.fillStyle = '#10202a';
  ctx.fillRect(ZOMBIE_R * 1.4, -ZOMBIE_R * 0.3, ZOMBIE_R * 0.7, ZOMBIE_R * 0.6);
  ctx.fillStyle = z.flash > 0.2 ? '#ffffff' : '#7fe1ff';
  ctx.fillRect(ZOMBIE_R * 1.46, -ZOMBIE_R * 0.24, ZOMBIE_R * 0.58, ZOMBIE_R * 0.48);
  ctx.restore();
  if (z.state === 'ping') {
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(x, y - ZOMBIE_R * 2.1, ZOMBIE_R * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '800 0.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', x, y - ZOMBIE_R * 2.1 + 0.02);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, game: Game, alpha: number): void {
  const p = game.player;
  if (p.ride !== null) return;
  // After a hit the player flashes; with reduced motion they are just faded instead.
  const faded = p.invuln > 0 && (still || Math.floor(p.invuln * 10) % 2 === 0);
  if (faded && !still) return;
  ctx.globalAlpha = faded ? 0.55 : 1;
  const x = p.px + (p.x - p.px) * alpha;
  const y = p.py + (p.y - p.py) * alpha;
  const speed = Math.hypot(p.vx, p.vy);
  const r = p.r;
  const id = game.persona.id;
  if (p.boost > 0) {
    ctx.strokeStyle = 'rgba(201,139,91,0.55)';
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.1 + (still ? 0 : Math.sin(game.time * 12) * 0.05), 0, Math.PI * 2);
    ctx.stroke();
  }
  person(ctx, x, y, p.heading, r * 1.15, COAT_BY_PERSONA[id], '#f1d2b8', game.time * (speed * 2.6), speed > 0.4 && id !== 'wheelchair');
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(p.heading);
  if (id === 'commuter' || id === 'tired') {
    ctx.fillStyle = id === 'tired' ? '#5a4a7a' : '#3b6ea8'; // rucksack: carrying the whole day
    ctx.fillRect(-r * 1.5, -r * 0.7, r * 0.9, r * 1.4);
  } else if (id === 'suitcase') {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-r * 1.9, r * 0.9, r * 1.5, r * 1.0);
    ctx.fillStyle = '#7f261c';
    ctx.fillRect(-r * 1.9, r * 1.25, r * 1.5, r * 0.12);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, r * 1.4);
    ctx.lineTo(r * 0.3, r * 0.7);
    ctx.stroke();
  } else if (id === 'crutches') {
    ctx.strokeStyle = '#9aa5ad';
    ctx.lineWidth = r * 0.16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 0.9);
    ctx.lineTo(r * 1.3, -r * 1.25);
    ctx.moveTo(r * 0.1, r * 0.9);
    ctx.lineTo(r * 1.3, r * 1.25);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#2b2f3a';
    ctx.fillRect(-r * 0.9, -r * 1.25, r * 1.8, r * 0.38);
    ctx.fillRect(-r * 0.9, r * 0.87, r * 1.8, r * 0.38);
    ctx.fillStyle = '#7d8996';
    ctx.fillRect(-r * 1.2, -r * 0.6, r * 0.5, r * 1.2);
  }
  ctx.fillStyle = '#2b2f3a'; // hair, because the player is the one looking up
  ctx.beginPath();
  ctx.arc(-r * 0.05, 0, r * 0.62, Math.PI * 0.5, Math.PI * 1.5);
  ctx.fill();
  ctx.fillStyle = capColor; // the equipped cap, earned by walking
  ctx.beginPath();
  ctx.arc(-r * 0.02, 0, r * 0.66, Math.PI * 0.38, Math.PI * 1.62);
  ctx.fill();
  ctx.fillRect(r * 0.3, -r * 0.34, r * 0.32, r * 0.68);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(r * 0.45, -r * 0.22, r * 0.11, 0, Math.PI * 2);
  ctx.arc(r * 0.45, r * 0.22, r * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Red edges when one more bump ends the run. */
function drawDanger(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const pulse = still ? 0.3 : 0.24 + 0.1 * Math.sin(time * 5);
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, 'rgba(255,40,70,0)');
  g.addColorStop(1, `rgba(255,40,70,${pulse})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawStick(ctx: CanvasRenderingContext2D, s: StickView, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(s.ox, s.oy, STICK_MAX, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const d = Math.hypot(s.x - s.ox, s.y - s.oy);
  const m = Math.min(d, STICK_MAX);
  const nx = d > 0 ? (s.x - s.ox) / d : 0;
  const ny = d > 0 ? (s.y - s.oy) / d : 0;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(s.ox + nx * m, s.oy + ny * m, 24, 0, Math.PI * 2);
  ctx.fill();
}
