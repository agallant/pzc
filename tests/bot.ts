import { circleRectPush } from '../src/game/geometry';
import { BELT_SPEED, generateLevel } from '../src/game/level';
import { createGame, signalState, step, STEP, ZOMBIE_R, type Game, type Input, type Zombie } from '../src/game/sim';
import { PERSONAS } from '../src/game/personas';
import type { Rect, Wall } from '../src/game/types';
import { findPath } from './helpers';

export interface BotSkill {
  /** Gap (world units) the bot tries to keep from a zombie. */
  margin: number;
  /** Seconds of look-ahead when predicting where zombies will be. */
  horizon: number;
  /** Random steering error in radians, so no two attempts are the same. */
  jitter: number;
  /** Seconds between decisions: a slower bot reacts later. */
  reaction: number;
}

export const SKILLS = {
  careful: { margin: 0.55, horizon: 1.0, jitter: 0.04, reaction: 0.05 },
  average: { margin: 0.35, horizon: 0.7, jitter: 0.12, reaction: 0.15 },
  hasty: { margin: 0.2, horizon: 0.45, jitter: 0.2, reaction: 0.25 },
} satisfies Record<string, BotSkill>;

export interface Outcome {
  won: boolean;
  /** Where it ended and what hurt it, for tuning. */
  at: { x: number; y: number };
  causes: string[];
  hits: number;
  /** Seconds of the clock left when it finished (0 if it never did). */
  timeLeft: number;
  timeLimit: number;
}

const CELL = 3;

interface Memory {
  heading: number | null;
  checkAt: number;
  checkX: number;
  checkY: number;
  squeezeUntil: number;
  /** Waiting at a red light on purpose, which is not being stuck. */
  holding: boolean;
}

interface Grid {
  cols: number;
  cells: Wall[][];
}

function bucketWalls(walls: Wall[], width: number, height: number): Grid {
  const cols = Math.ceil(width / CELL) + 1;
  const rows = Math.ceil(height / CELL) + 1;
  const cells: Wall[][] = Array.from({ length: cols * rows }, () => []);
  for (const w of walls) {
    for (let r = Math.max(0, Math.floor((w.y - 1) / CELL)); r <= Math.min(rows - 1, Math.floor((w.y + w.h + 1) / CELL)); r++) {
      for (let c = Math.max(0, Math.floor((w.x - 1) / CELL)); c <= Math.min(cols - 1, Math.floor((w.x + w.w + 1) / CELL)); c++) {
        (cells[r * cols + c] as Wall[]).push(w);
      }
    }
  }
  return { cols, cells };
}

function wallsAt(grid: Grid, x: number, y: number): Wall[] {
  return grid.cells[Math.max(0, Math.floor(y / CELL)) * grid.cols + Math.max(0, Math.floor(x / CELL))] ?? [];
}

/** Where a zombie will be in `t` seconds, as far as a player can tell. */
function zombieAt(z: Zombie, t: number): { x: number; y: number } {
  if (z.kind === 'queue') return { x: z.x, y: z.y };
  if (z.kind === 'rider') {
    // The belt carries them up and round, as the simulator does.
    const y = z.y - BELT_SPEED * t;
    return { x: z.x, y: y < z.lane.y - 0.5 ? y + z.lane.h + 1.0 : y };
  }
  if (z.kind === 'waiter' && z.state === 'wait') return { x: z.x, y: z.y };
  if (z.state === 'stop' || z.state === 'stand' || z.state === 'ping') return { x: z.x, y: z.y };
  return { x: z.x + Math.cos(z.heading) * z.speed * t, y: z.y + Math.sin(z.heading) * z.speed * t };
}

/** Plays one commute with a bot that follows the route, dodges zombies and waits for the green man. */
export function playBot(number: number, seed: number, skill: BotSkill): Outcome {
  const level = generateLevel(number, seed);
  const game = createGame(level);
  const stepFree = PERSONAS[level.persona].stairsSpeed === 0;
  const path = findPath(level, { lift: stepFree }) ?? [];
  const grid = bucketWalls(level.walls, level.width, level.height);
  let wobble = (seed * 2654435761) >>> 0;
  const rand = (): number => {
    wobble = (Math.imul(wobble, 1664525) + 1013904223) >>> 0;
    return wobble / 0x100000000;
  };
  let i = 0;
  let t = 0;
  let sinceDecision = 99;
  let input: Input = { dx: 0, dy: 0, sprint: false };
  const memory: Memory = { heading: null, checkAt: 0, checkX: game.player.x, checkY: game.player.y, squeezeUntil: 0, holding: false };
  const causes: string[] = [];
  const trace = process.env.PZC_TRACE === '1';
  while (game.status === 'playing' && t < 240) {
    if (trace && Math.abs((t % 4) - 0) < STEP) console.log(t.toFixed(0), game.player.x.toFixed(2), game.player.y.toFixed(2), 'hp', game.player.hp, 'in', input.dx.toFixed(2), input.dy.toFixed(2), 'i', i);
    if (sinceDecision >= skill.reaction) {
      // Stuck for a few seconds? Then squeeze past, accepting a closer pass than usual.
      if (t >= memory.checkAt) {
        if (!memory.holding && Math.hypot(game.player.x - memory.checkX, game.player.y - memory.checkY) < 0.6) memory.squeezeUntil = t + 2.5;
        memory.checkAt = t + 2.5;
        memory.checkX = game.player.x;
        memory.checkY = game.player.y;
      }
      const choice = decide(game, path, i, grid, skill, rand, memory, t);
      i = choice.next;
      input = choice.input;
      sinceDecision = 0;
    }
    step(game, input, STEP);
    t += STEP;
    sinceDecision += STEP;
    for (const e of game.events) {
      if (e.type !== 'hit') continue;
      const z = e.by === 'zombie' ? [...game.zombies].sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0] : undefined;
      causes.push(`${e.by}${z ? `:${z.kind}/${z.state}` : ''}@${e.y.toFixed(0)} t${t.toFixed(0)}`);
    }
    game.events.length = 0;
  }
  return { won: game.status === 'won', at: { x: game.player.x, y: game.player.y }, causes, hits: game.hits, timeLeft: game.status === 'won' ? game.timeLeft : 0, timeLimit: level.timeLimit };
}

function decide(game: Game, path: { x: number; y: number }[], from: number, grid: Grid, skill: BotSkill, rand: () => number, memory: Memory, now: number): { input: Input; next: number } {
  const p = game.player;
  let i = from;
  const goal = game.level.goal;
  const aim = (k: number): { x: number; y: number } => path[Math.min(path.length - 1, k + 3)] ?? { x: goal.x + goal.w / 2, y: goal.y + goal.h / 2 };
  while (i < path.length && Math.hypot(aim(i).x - p.x, aim(i).y - p.y) < 0.35) i += 1;
  const target = aim(i);
  const base = Math.atan2(target.y - p.y, target.x - p.x);
  const speed = game.persona.speed * 0.95;

  // Hold at the kerb unless the green man gives time to cross.
  let hold = false;
  game.level.crossings.forEach((c, k) => {
    const south = c.road.y + c.road.h;
    if (p.y > south && p.y < south + 2.6 && Math.sin(base) < 0) {
      const sig = signalState(game, k);
      const need = (c.road.h + 2) / speed + 0.6;
      if (!(sig.pedGreen && sig.left >= need)) hold = true;
    }
  });

  // Never look past the point being aimed at, or the train's end wall looks like a collision at the door.
  const toTarget = Math.hypot(target.x - p.x, target.y - p.y);
  const travel = (t: number): number => Math.min(speed * t, toTarget);
  memory.holding = hold;
  const near = game.zombies.filter((z) => Math.abs(z.y - p.y) < 6 && Math.abs(z.x - p.x) < 6);
  const margin = now < memory.squeezeUntil ? skill.margin * 0.2 : skill.margin;
  const steps = [0.25, 0.5, 0.75, 1].map((f) => f * skill.horizon);
  let best = base;
  let bestCost = Infinity;
  const headingCost = (theta: number): number => {
    let cost = 0;
    for (const t of steps) {
      const x = p.x + Math.cos(theta) * travel(t);
      const y = p.y + Math.sin(theta) * travel(t);
      for (const z of near) {
        const zp = zombieAt(z, t);
        const gap = Math.hypot(x - zp.x, y - zp.y) - ZOMBIE_R - p.r;
        if (gap < margin) cost += ((margin - gap) / margin) ** 2 * 30;
      }
      for (const w of wallsAt(grid, x, y)) {
        if (circleRectPush({ x, y, r: p.r + 0.1 }, w as Rect)) cost += 60;
      }
    }
    const fx = p.x + Math.cos(theta) * travel(skill.horizon);
    const fy = p.y + Math.sin(theta) * travel(skill.horizon);
    return cost + Math.hypot(target.x - fx, target.y - fy) * 0.6;
  };
  // At a red light it may shuffle about to dodge, but not step into the road.
  const roadCost = (theta: number): number => (hold && Math.sin(theta) < 0 ? 200 : 0);
  let stillCost = Infinity;
  if (hold) {
    stillCost = 0;
    for (const t of steps) {
      for (const z of near) {
        const zp = zombieAt(z, t);
        const gap = Math.hypot(p.x - zp.x, p.y - zp.y) - ZOMBIE_R - p.r;
        if (gap < margin) stillCost += ((margin - gap) / margin) ** 2 * 30;
      }
    }
    stillCost += toTarget * 0.6 + 0.3;
  }
  for (let k = -8; k <= 8; k++) {
    const theta = base + (k * Math.PI) / 12;
    // Keep the heading it already had unless something clearly better turns up, so it does not dither.
    const keep = memory.heading === null ? 0 : Math.abs(Math.atan2(Math.sin(theta - memory.heading), Math.cos(theta - memory.heading))) * 0.6;
    const cost = headingCost(theta) + Math.abs(k) * 0.08 + keep + roadCost(theta);
    if (cost < bestCost) {
      bestCost = cost;
      best = theta;
    }
  }
  const standStill = stillCost <= bestCost;
  memory.heading = standStill ? memory.heading : best;
  best += (rand() - 0.5) * 2 * skill.jitter;
  // Steering error must not nudge it into the road at a red light either.
  if (hold && Math.sin(best) < 0) best = Math.atan2(-Math.sin(best), Math.cos(best));
  const remaining = Math.max(0, p.y - goal.y);
  const hurry = game.timeLeft < remaining / (game.persona.speed * 0.85);
  return {
    input: { dx: standStill ? 0 : Math.cos(best), dy: standStill ? 0 : Math.sin(best), sprint: !standStill && hurry && p.stamina > 15 && game.persona.canSprint },
    next: i,
  };
}
