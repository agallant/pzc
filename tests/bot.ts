import { generateLevel } from '../src/game/level';
import { createGame, signalState, step, STEP, type Game, type Input } from '../src/game/sim';
import { PERSONAS } from '../src/game/personas';
import { findPath } from './helpers';

export interface BotSkill {
  /** How far ahead (world units) the bot reacts to a zombie. */
  look: number;
  /** Random steering error in radians, so no two attempts are the same. */
  jitter: number;
}

export const SKILLS: Record<'careful' | 'average', BotSkill> = {
  careful: { look: 2.6, jitter: 0.05 },
  average: { look: 1.8, jitter: 0.18 },
};

export interface Outcome {
  won: boolean;
  hits: number;
  /** Seconds of the clock left when it finished (0 if it never did). */
  timeLeft: number;
  timeLimit: number;
}

/** Plays one commute with a path-following, zombie-avoiding bot that waits for the green man. */
export function playBot(number: number, seed: number, skill: BotSkill): Outcome {
  const level = generateLevel(number, seed);
  const game = createGame(level);
  const stepFree = PERSONAS[level.persona].stairsSpeed === 0;
  const path = findPath(level, { lift: stepFree }) ?? [];
  let wobble = (seed * 2654435761) >>> 0;
  const rand = (): number => {
    wobble = (Math.imul(wobble, 1664525) + 1013904223) >>> 0;
    return wobble / 0x100000000;
  };
  let i = 0;
  let t = 0;
  while (game.status === 'playing' && t < 240) {
    const input = decide(game, path, i, skill, rand);
    i = input.next;
    step(game, input.input, STEP);
    t += STEP;
  }
  return { won: game.status === 'won', hits: game.hits, timeLeft: game.status === 'won' ? game.timeLeft : 0, timeLimit: level.timeLimit };
}

function decide(game: Game, path: { x: number; y: number }[], from: number, skill: BotSkill, rand: () => number): { input: Input; next: number } {
  const p = game.player;
  let i = from;
  while (i < path.length - 1 && Math.hypot((path[i] as { x: number }).x - p.x, (path[i] as { y: number }).y - p.y) < 0.4) i += 1;
  const target = path[Math.min(path.length - 1, i + 3)] ?? { x: game.level.goal.x + game.level.goal.w / 2, y: game.level.goal.y + game.level.goal.h / 2 };
  let dx = target.x - p.x;
  let dy = target.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;

  // Step around zombies, harder the closer they are, and aim at where they are heading.
  for (const z of game.zombies) {
    const zx = z.x + Math.cos(z.heading) * z.speed * 0.4;
    const zy = z.y + Math.sin(z.heading) * z.speed * 0.4;
    const ex = p.x - zx;
    const ey = p.y - zy;
    const dist = Math.hypot(ex, ey);
    if (dist > skill.look || dist < 1e-3) continue;
    const w = ((skill.look - dist) / skill.look) ** 1.5 * 2.2;
    dx += (ex / dist) * w;
    dy += (ey / dist) * w;
  }

  // Hold at the kerb unless the green man gives time to cross.
  game.level.crossings.forEach((c, k) => {
    const road = c.road;
    const southEdge = road.y + road.h;
    if (p.y > southEdge && p.y < southEdge + 2.6 && dy < 0) {
      const sig = signalState(game, k);
      const need = (road.h + 2) / (game.persona.speed * 0.95) + 0.6;
      if (!(sig.pedGreen && sig.left >= need)) {
        dy = 0;
        dx *= 0.3;
      }
    }
  });

  const heading = Math.atan2(dy, dx) + (rand() - 0.5) * 2 * skill.jitter;
  const len = Math.min(1, Math.hypot(dx, dy));
  const remaining = Math.max(0, p.y - game.level.goal.y);
  const hurry = game.timeLeft < remaining / (game.persona.speed * 0.85);
  return { input: { dx: Math.cos(heading) * len, dy: Math.sin(heading) * len, sprint: hurry && p.stamina > 15 && game.persona.canSprint }, next: i };
}
