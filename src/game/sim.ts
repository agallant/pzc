import { circleRectPush, clamp, pointInRect } from './geometry';
import { BELT_SPEED } from './level';
import { PERSONAS, type Persona } from './personas';
import { createRng, type Rng } from './rng';
import type { Level, PickupSpec, Rect, ZombieKind } from './types';

export const STEP = 1 / 60;
export const MAX_HP = 3;

const SPRINT_FACTOR = 1.6;
const LIFT_WAIT = 1.2;
const LIFT_RIDE = 2.4;
export const ZOMBIE_R = 0.38;
const NEAR_GAP = 0.5;
export const CAR_W = 3.2;
export const CAR_H = 1.7;

export interface Input {
  /** Desired direction, each axis -1..1, length <= 1. */
  dx: number;
  dy: number;
  sprint: boolean;
}

export type GameEvent =
  | { type: 'hit'; x: number; y: number; by: 'zombie' | 'car' | 'train' }
  | { type: 'nearMiss'; x: number; y: number; points: number; combo: number }
  | { type: 'coin'; x: number; y: number }
  | { type: 'coffee'; x: number; y: number }
  | { type: 'ping'; x: number; y: number }
  | { type: 'honk'; x: number; y: number }
  | { type: 'exhausted' }
  | { type: 'liftStart' }
  | { type: 'liftEnd' }
  | { type: 'wrongWay' }
  | { type: 'trainLeft' }
  | { type: 'won' }
  | { type: 'dead' };

export interface Player {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  heading: number;
  r: number;
  hp: number;
  stamina: number;
  staminaMax: number;
  exhausted: boolean;
  invuln: number;
  boost: number;
  sprinting: boolean;
  /** Seconds spent standing on the lift pad. */
  pad: number;
  /** Seconds into a lift ride, or null. */
  ride: number | null;
}

export type ZombieState = 'walk' | 'ping' | 'stop' | 'wait' | 'cross' | 'stand';
export interface Zombie {
  id: number;
  kind: ZombieKind;
  x: number;
  y: number;
  px: number;
  py: number;
  heading: number;
  speed: number;
  weave: number;
  turn: number;
  state: ZombieState;
  timer: number;
  lane: Rect;
  skin: number;
  nearCooldown: number;
  /** 0..1 glow of an incoming notification. */
  flash: number;
}

export interface Car {
  x: number;
  y: number;
  px: number;
  vx: number;
  hue: number;
  honked: boolean;
}

interface CarLane {
  crossing: number;
  y: number;
  dir: 1 | -1;
  timer: number;
}

export interface Pickup extends PickupSpec {
  taken: boolean;
}

export type Status = 'playing' | 'won' | 'dead';

export interface Game {
  level: Level;
  persona: Persona;
  inWrongWay: boolean;
  rng: Rng;
  time: number;
  timeLeft: number;
  status: Status;
  player: Player;
  zombies: Zombie[];
  cars: Car[];
  carLanes: CarLane[];
  pickups: Pickup[];
  score: number;
  coins: number;
  nearMisses: number;
  hits: number;
  combo: number;
  comboTimer: number;
  bestY: number;
  /** Events produced since the last drain; the UI reads and clears them. */
  events: GameEvent[];
}

export function createGame(level: Level): Game {
  const rng = createRng(level.seed ^ 0x5bd1e995);
  const zombies: Zombie[] = level.zombies.map((s, id) => ({
    id,
    kind: s.kind,
    x: s.x,
    y: s.y,
    px: s.x,
    py: s.y,
    heading: s.heading,
    speed: s.speed,
    weave: s.weave,
    turn: 0,
    state: s.kind === 'waiter' ? 'wait' : s.kind === 'queue' || s.kind === 'rider' ? 'stand' : 'walk',
    timer: s.kind === 'stopper' ? rng.range(1, 3) : 0,
    lane: s.lane,
    skin: s.skin,
    nearCooldown: 0,
    flash: 0,
  }));
  const carLanes: CarLane[] = [];
  level.crossings.forEach((c, crossing) => {
    carLanes.push({ crossing, y: c.road.y + c.road.h * 0.3, dir: -1, timer: 0 });
    carLanes.push({ crossing, y: c.road.y + c.road.h * 0.7, dir: 1, timer: 0.5 });
  });
  const { x, y } = level.spawn;
  const persona = PERSONAS[level.persona];
  return {
    level,
    persona,
    inWrongWay: false,
    rng,
    time: 0,
    timeLeft: level.timeLimit,
    status: 'playing',
    player: {
      x, y, px: x, py: y, vx: 0, vy: 0, heading: -Math.PI / 2, r: persona.radius,
      hp: MAX_HP, stamina: persona.staminaMax, staminaMax: persona.staminaMax, exhausted: false, invuln: 0, boost: 0,
      sprinting: false, pad: 0, ride: null,
    },
    zombies,
    cars: [],
    carLanes,
    pickups: level.pickups.map((p) => ({ ...p, taken: false })),
    score: 0,
    coins: 0,
    nearMisses: 0,
    hits: 0,
    combo: 0,
    comboTimer: 0,
    bestY: y,
    events: [],
  };
}

/** Pedestrian signal state for a crossing. `left` is seconds until it changes. */
export function signalState(game: Game, index: number): { pedGreen: boolean; left: number } {
  const c = game.level.crossings[index];
  if (!c) return { pedGreen: false, left: 0 };
  const total = c.pedGreen + c.carGreen;
  const phase = (game.time + c.offset) % total;
  return phase < c.pedGreen
    ? { pedGreen: true, left: c.pedGreen - phase }
    : { pedGreen: false, left: total - phase };
}

/** Moves a circle out of walls and the world edge; returns the summed wall normals it touched. */
function collide(body: { x: number; y: number }, r: number, game: Game): { nx: number; ny: number } {
  let nx = 0;
  let ny = 0;
  const c = { x: body.x, y: body.y, r };
  for (let pass = 0; pass < 2; pass++) {
    for (const w of game.level.walls) {
      if (Math.abs(w.x + w.w / 2 - c.x) > w.w / 2 + r + 1 || Math.abs(w.y + w.h / 2 - c.y) > w.h / 2 + r + 1) continue;
      const push = circleRectPush(c, w);
      if (!push) continue;
      c.x += push.nx * push.depth;
      c.y += push.ny * push.depth;
      nx += push.nx;
      ny += push.ny;
    }
  }
  body.x = clamp(c.x, r, game.level.width - r);
  body.y = clamp(c.y, r, game.level.height - r);
  return { nx, ny };
}

function surfaceAt(game: Game, x: number, y: number): 'stairs' | 'escalator' | null {
  for (const z of game.level.zones) {
    if ((z.floor === 'stairs' || z.floor === 'escalator') && pointInRect(x, y, z)) return z.floor;
  }
  return null;
}

function stepLift(game: Game, dt: number): boolean {
  const p = game.player;
  const lift = game.level.lift;
  if (!lift) return false;
  if (p.ride !== null) {
    p.ride += dt;
    p.vx = 0;
    p.vy = 0;
    p.invuln = Math.max(p.invuln, 0.3);
    if (p.ride >= LIFT_RIDE) {
      p.ride = null;
      p.pad = 0;
      p.x = p.px = lift.to.x + lift.to.w / 2;
      p.y = p.py = lift.to.y + lift.to.h / 2;
      p.invuln = 0.8;
      game.events.push({ type: 'liftEnd' });
    }
    return true;
  }
  if (lift.working && pointInRect(p.x, p.y, lift.from)) {
    p.pad += dt;
    if (p.pad >= LIFT_WAIT) {
      p.ride = 0;
      game.events.push({ type: 'liftStart' });
    }
  } else {
    p.pad = 0;
  }
  return false;
}

function stepPlayer(game: Game, input: Input, dt: number): void {
  const p = game.player;
  const persona = game.persona;
  p.px = p.x;
  p.py = p.y;
  if (stepLift(game, dt)) return;
  const len = Math.hypot(input.dx, input.dy);
  const moving = len > 0.05;
  const surface = surfaceAt(game, p.x, p.y);
  const climbing = surface === 'stairs' && moving;
  const wantSprint = persona.canSprint && input.sprint && moving && !p.exhausted && p.stamina > 0;
  p.sprinting = wantSprint;
  let speed = persona.speed * (wantSprint ? SPRINT_FACTOR : 1);
  if (surface === 'stairs') speed *= persona.stairsSpeed;
  if (p.boost > 0) speed *= 1.25;
  if (p.exhausted) speed *= 0.6;
  const scale = moving ? Math.min(1, len) / len : 0;
  const k = Math.min(1, dt * 12);
  p.vx += (input.dx * scale * speed - p.vx) * k;
  p.vy += (input.dy * scale * speed - p.vy) * k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (surface === 'escalator') p.y -= BELT_SPEED * dt;
  collide(p, p.r, game);
  if (moving && Math.hypot(p.vx, p.vy) > 0.4) {
    const d = Math.atan2(p.vy, p.vx) - p.heading;
    p.heading += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 14);
  }
  let drain = 0;
  if (wantSprint) drain += 30;
  if (climbing) drain += persona.stairsDrain;
  if (drain > 0) {
    p.stamina = Math.max(0, p.stamina - drain * dt);
    if (p.stamina <= 0 && !p.exhausted) {
      p.exhausted = true;
      game.events.push({ type: 'exhausted' });
    }
  } else {
    p.stamina = Math.min(p.staminaMax, p.stamina + (moving ? 16 : 26) * persona.regen * dt);
    if (p.exhausted && p.stamina >= p.staminaMax * 0.3) p.exhausted = false;
  }
  p.invuln = Math.max(0, p.invuln - dt);
  p.boost = Math.max(0, p.boost - dt);
}

function crossingFor(game: Game, z: Zombie): number {
  const i = game.level.crossings.findIndex((c) => Math.abs(z.y - (c.road.y + c.road.h / 2)) < c.road.h / 2 + 6);
  return Math.max(0, i);
}

function stepZombie(game: Game, z: Zombie, dt: number): void {
  z.px = z.x;
  z.py = z.y;
  z.nearCooldown = Math.max(0, z.nearCooldown - dt);
  z.flash = Math.max(0, z.flash - dt * 2.5);
  const rng = game.rng;

  switch (z.kind) {
    case 'queue':
      // Standing in line, thumb scrolling. Now and then the phone buzzes.
      if (rng.next() < dt * 0.05) z.flash = 1;
      return;
    case 'rider': {
      // Standing on the escalator, thumbs busy. The belt carries them round and round.
      z.y -= BELT_SPEED * dt;
      if (z.y < z.lane.y - 0.5) z.y += z.lane.h + 1.0;
      if (rng.next() < dt * 0.05) z.flash = 1;
      return;
    }
    case 'waiter': {
      const idx = crossingFor(game, z);
      const road = game.level.crossings[idx]?.road;
      if (!road) return;
      if (z.state === 'wait') {
        const sig = signalState(game, idx);
        if (sig.pedGreen && sig.left > 3) {
          z.state = 'cross';
          z.timer = rng.range(0, 0.8); // they only notice when the crowd moves
        }
        return;
      }
      if (z.timer > 0) {
        z.timer -= dt;
        return;
      }
      z.x += Math.cos(z.heading) * z.speed * dt;
      z.y += Math.sin(z.heading) * z.speed * dt;
      const arrivedSouth = z.heading > 0 && z.y > road.y + road.h + 1.2;
      const arrivedNorth = z.heading < 0 && z.y < road.y - 1.2;
      if (arrivedSouth || arrivedNorth) {
        z.kind = 'shuffler';
        z.state = 'walk';
        z.lane = arrivedSouth
          ? { x: 1.6, y: road.y + road.h + 0.6, w: game.level.width - 3.2, h: 3.5 }
          : { x: 1.6, y: road.y - 4.1, w: game.level.width - 3.2, h: 3.5 };
        z.heading = rng.pick([0, Math.PI]);
        z.speed = 0.8;
      }
      collide(z, ZOMBIE_R, game);
      return;
    }
    case 'streamer': {
      z.x += Math.cos(z.heading) * z.speed * dt;
      const { lane } = z;
      if (z.x > lane.x + lane.w) z.x = lane.x;
      else if (z.x < lane.x) z.x = lane.x + lane.w;
      return;
    }
    case 'stopper': {
      z.timer -= dt;
      if (z.state === 'walk' && z.timer <= 0) {
        // A notification lands: the phone lights up, then the zombie stops dead in the walkway.
        z.state = 'ping';
        z.timer = 0.45;
        z.flash = 1;
        game.events.push({ type: 'ping', x: z.x, y: z.y });
      } else if (z.state === 'ping' && z.timer <= 0) {
        z.state = 'stop';
        z.timer = rng.range(1.0, 2.4);
      } else if (z.state === 'stop' && z.timer <= 0) {
        z.state = 'walk';
        z.timer = rng.range(1.5, 3.5);
        z.heading += rng.range(-0.8, 0.8);
      }
      if (z.state === 'stop') return;
      break;
    }
    default:
      break;
  }

  // Wander: drift the heading, walk, bounce off walls and the edge of the lane.
  z.turn += (rng.next() - 0.5) * z.weave * dt * 6;
  z.turn = clamp(z.turn, -z.weave, z.weave);
  z.heading += z.turn * dt;
  z.x += Math.cos(z.heading) * z.speed * dt;
  z.y += Math.sin(z.heading) * z.speed * dt;
  const { nx, ny } = collide(z, ZOMBIE_R, game);
  let vx = Math.cos(z.heading);
  let vy = Math.sin(z.heading);
  if (nx !== 0 && vx * nx < 0) vx = -vx;
  if (ny !== 0 && vy * ny < 0) vy = -vy;
  const { lane } = z;
  if (z.x < lane.x) vx = Math.abs(vx);
  else if (z.x > lane.x + lane.w) vx = -Math.abs(vx);
  if (z.y < lane.y) vy = Math.abs(vy);
  else if (z.y > lane.y + lane.h) vy = -Math.abs(vy);
  z.heading = Math.atan2(vy, vx);
}

function stepCars(game: Game, dt: number): void {
  const w = game.level.width;
  for (const lane of game.carLanes) {
    lane.timer -= dt;
    const sig = signalState(game, lane.crossing);
    // Only dispatch cars while there is time to clear the road before pedestrians get their turn.
    if (!sig.pedGreen && sig.left > 2.6 && lane.timer <= 0) {
      lane.timer = game.rng.range(0.9, 2.0);
      const x = lane.dir === 1 ? -CAR_W : w + CAR_W;
      game.cars.push({
        x,
        px: x,
        y: lane.y,
        vx: lane.dir * game.rng.range(9, 12),
        hue: game.rng.int(0, 5),
        honked: false,
      });
    }
  }
  for (const car of game.cars) {
    car.px = car.x;
    car.x += car.vx * dt;
  }
  game.cars = game.cars.filter((car) => car.x > -CAR_W * 2 && car.x < w + CAR_W * 2);
}

function damage(game: Game, by: 'zombie' | 'car' | 'train', fromX: number, fromY: number): void {
  const p = game.player;
  if (p.invuln > 0 || game.status !== 'playing') return;
  p.hp -= 1;
  p.invuln = 1.6;
  game.hits += 1;
  game.combo = 0;
  game.comboTimer = 0;
  const d = Math.hypot(p.x - fromX, p.y - fromY) || 1;
  const kb = by === 'car' ? 9 : by === 'zombie' ? 6 : 0;
  p.vx = ((p.x - fromX) / d) * kb;
  p.vy = ((p.y - fromY) / d) * kb;
  game.events.push({ type: 'hit', x: p.x, y: p.y, by });
  if (p.hp <= 0) {
    game.status = 'dead';
    game.events.push({ type: 'dead' });
  }
}

function awardNearMiss(game: Game, x: number, y: number): void {
  game.combo = Math.min(5, game.combo + 1);
  game.comboTimer = 4;
  game.nearMisses += 1;
  const points = 25 * game.combo;
  game.score += points;
  game.events.push({ type: 'nearMiss', x, y, points, combo: game.combo });
}

function stepCollisions(game: Game): void {
  const p = game.player;
  for (const z of game.zombies) {
    const gap = Math.hypot(z.x - p.x, z.y - p.y) - ZOMBIE_R - p.r;
    if (gap < 0) {
      damage(game, 'zombie', z.x, z.y);
      z.nearCooldown = 2.5;
    } else if (gap < NEAR_GAP && z.nearCooldown <= 0 && p.invuln <= 0 && Math.hypot(p.vx, p.vy) > 1.5) {
      z.nearCooldown = 2.5;
      awardNearMiss(game, z.x, z.y);
    }
  }
  for (const car of game.cars) {
    const rect = { x: car.x - CAR_W / 2, y: car.y - CAR_H / 2, w: CAR_W, h: CAR_H };
    const near = { x: rect.x - 2.5, y: rect.y - 0.9, w: rect.w + 5, h: rect.h + 1.8 };
    if (!car.honked && pointInRect(p.x, p.y, near)) {
      car.honked = true;
      game.events.push({ type: 'honk', x: car.x, y: car.y });
    }
    if (circleRectPush({ x: p.x, y: p.y, r: p.r }, rect)) damage(game, 'car', car.x, car.y);
  }
}

function stepPickups(game: Game): void {
  const p = game.player;
  for (const pk of game.pickups) {
    if (pk.taken || Math.hypot(pk.x - p.x, pk.y - p.y) > p.r + 0.45) continue;
    pk.taken = true;
    if (pk.type === 'coin') {
      game.coins += 1;
      game.score += 10;
      game.events.push({ type: 'coin', x: pk.x, y: pk.y });
    } else {
      p.boost = 6;
      p.stamina = p.staminaMax;
      p.exhausted = false;
      game.events.push({ type: 'coffee', x: pk.x, y: pk.y });
    }
  }
}

export function step(game: Game, input: Input, dt: number = STEP): void {
  if (game.status !== 'playing') return;
  game.time += dt;
  stepPlayer(game, input, dt);
  for (const z of game.zombies) stepZombie(game, z, dt);
  stepCars(game, dt);
  stepCollisions(game);
  stepPickups(game);

  const p = game.player;
  const ww = game.level.wrongWay;
  if (ww) {
    const inside = pointInRect(p.x, p.y, ww);
    if (inside && !game.inWrongWay) game.events.push({ type: 'wrongWay' });
    game.inWrongWay = inside;
  }
  if (p.y < game.bestY) {
    game.score += (game.bestY - p.y) * 2;
    game.bestY = p.y;
  }
  game.comboTimer -= dt;
  if (game.comboTimer <= 0) game.combo = 0;

  if (game.status === 'playing' && pointInRect(p.x, p.y, game.level.goal)) {
    game.status = 'won';
    game.events.push({ type: 'won' });
    return;
  }
  game.timeLeft -= dt;
  if (game.status === 'playing' && game.timeLeft <= 0) {
    // The doors closed and the train pulled out. The next one costs a heart and some patience.
    game.events.push({ type: 'trainLeft' });
    game.timeLeft = 25;
    damage(game, 'train', p.x, p.y);
  }
}

export interface Result {
  stars: number;
  score: number;
  timeBonus: number;
  heartBonus: number;
}

export function scoreResult(game: Game): Result {
  const timeBonus = Math.round(Math.max(0, game.timeLeft) * 15);
  const heartBonus = game.player.hp * 100;
  let stars = 1;
  if (game.player.hp >= 2) stars += 1;
  if (game.hits === 0 && game.timeLeft >= game.level.timeLimit * 0.25) stars += 1;
  return { stars, score: Math.round(game.score) + timeBonus + heartBonus, timeBonus, heartBonus };
}
