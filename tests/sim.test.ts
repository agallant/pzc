import { describe, expect, it } from 'vitest';
import { generateLevel } from '../src/game/level';
import { createGame, MAX_HP, scoreResult, step, STEP, type Game } from '../src/game/sim';
import { PERSONAS } from '../src/game/personas';
import { findPath } from './helpers';

function walkRoute(game: Game, sprint = false): number {
  const path = findPath(game.level) ?? [];
  let t = 0;
  for (let i = 0; i < path.length && game.status === 'playing'; ) {
    const target = path[Math.min(path.length - 1, i + 3)] as { x: number; y: number };
    const dx = target.x - game.player.x;
    const dy = target.y - game.player.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.35) {
      i += 1;
      continue;
    }
    step(game, { dx: dx / d, dy: dy / d, sprint });
    t += STEP;
    if (t > 600) break;
  }
  // Step the last bit into the doorway.
  for (let k = 0; k < 180 && game.status === 'playing'; k++) {
    const g = game.level.goal;
    const dx = g.x + g.w / 2 - game.player.x;
    const dy = g.y + g.h / 2 - game.player.y;
    const d = Math.hypot(dx, dy) || 1;
    step(game, { dx: dx / d, dy: dy / d, sprint });
    t += STEP;
  }
  return t;
}

describe('sim', () => {
  it('lets an unobstructed commuter make the train with time to spare', () => {
    for (const number of [1, 4, 9]) {
      const game = createGame(generateLevel(number, 42));
      game.zombies = [];
      game.level.crossings.length = 0;
      game.carLanes = [];
      const t = walkRoute(game);
      expect(game.status, `level ${number}`).toBe('won');
      expect(t).toBeLessThan(game.level.timeLimit * 0.85);
    }
  });

  it('is deterministic', () => {
    const run = () => {
      const g = createGame(generateLevel(3, 7));
      for (let i = 0; i < 600; i++) step(g, { dx: 0, dy: -1, sprint: false });
      return [g.player.x, g.player.y, g.hits, g.score, g.zombies.map((z) => z.x)];
    };
    expect(run()).toEqual(run());
  });

  it('costs a heart on contact, then grants brief invulnerability', () => {
    const game = createGame(generateLevel(1, 5));
    const z = game.zombies[0]!;
    z.kind = 'queue';
    z.state = 'stand';
    z.x = game.player.x;
    z.y = game.player.y - 0.4;
    step(game, { dx: 0, dy: 0, sprint: false });
    expect(game.player.hp).toBe(MAX_HP - 1);
    step(game, { dx: 0, dy: 0, sprint: false });
    expect(game.player.hp).toBe(MAX_HP - 1);
    expect(game.events.some((e) => e.type === 'hit')).toBe(true);
  });

  it('ends the run when the hearts are gone', () => {
    const game = createGame(generateLevel(1, 5));
    game.zombies = [];
    game.timeLeft = 0.01;
    game.player.hp = 1;
    step(game, { dx: 0, dy: 0, sprint: false });
    step(game, { dx: 0, dy: 0, sprint: false });
    expect(game.status).toBe('dead');
  });

  it('awards a near miss for brushing past a zombie', () => {
    const game = createGame(generateLevel(1, 5));
    game.zombies = game.zombies.slice(0, 1);
    const z = game.zombies[0]!;
    z.kind = 'queue';
    z.state = 'stand';
    z.x = game.player.x + 0.3 + 0.38 + 0.3;
    z.y = game.player.y - 3;
    game.player.vy = -3;
    for (let i = 0; i < 90; i++) step(game, { dx: 0, dy: -1, sprint: false });
    expect(game.nearMisses).toBe(1);
    expect(game.hits).toBe(0);
  });

  it('drains stamina while sprinting and rewards a coffee', () => {
    const game = createGame(generateLevel(1, 5));
    game.zombies = [];
    for (let i = 0; i < 60; i++) step(game, { dx: 0, dy: -1, sprint: true });
    expect(game.player.stamina).toBeLessThan(80);
    game.pickups = [{ type: 'coffee', x: game.player.x, y: game.player.y, taken: false }];
    step(game, { dx: 0, dy: 0, sprint: false });
    expect(game.player.stamina).toBe(100);
    expect(game.player.boost).toBeGreaterThan(5);
  });

  it('scores stars from hearts and time', () => {
    const game = createGame(generateLevel(1, 5));
    game.timeLeft = game.level.timeLimit * 0.5;
    expect(scoreResult(game).stars).toBe(3);
    game.hits = 1;
    game.player.hp = 2;
    expect(scoreResult(game).stars).toBe(2);
    game.player.hp = 1;
    expect(scoreResult(game).stars).toBe(1);
  });

  const hall = (persona?: string) => {
    for (let seed = 1; seed < 500; seed++) {
      const level = generateLevel(6, seed);
      if (persona ? level.persona === persona : level.persona === 'commuter') return level;
    }
    throw new Error('no level');
  };

  it('slows and tires the player on stairs, more so with a suitcase', () => {
    const rate = (persona: 'commuter' | 'suitcase') => {
      const game = createGame(hall(persona));
      game.zombies = [];
      const stairs = game.level.zones.find((z) => z.floor === 'stairs')!;
      game.player.x = game.player.px = stairs.x + 2;
      game.player.y = game.player.py = stairs.y + stairs.h - 1;
      for (let i = 0; i < 60; i++) step(game, { dx: 0, dy: -1, sprint: false });
      return { dist: game.player.py - game.player.y, stamina: game.player.stamina };
    };
    const commuter = rate('commuter');
    const suitcase = rate('suitcase');
    expect(commuter.dist).toBeLessThan(3.4 * 0.75);
    expect(commuter.stamina).toBeLessThan(95);
    expect(suitcase.dist).toBeLessThan(commuter.dist);
    expect(suitcase.stamina).toBeLessThan(commuter.stamina);
  });

  it('carries the player up a working escalator', () => {
    let level = hall();
    for (let seed = 1; !level.zones.some((z) => z.floor === 'escalator'); seed++) level = generateLevel(6, seed);
    const game = createGame(level);
    game.zombies = [];
    const esc = game.level.zones.find((z) => z.floor === 'escalator')!;
    game.player.x = game.player.px = esc.x + 1;
    game.player.y = game.player.py = esc.y + esc.h - 2;
    const y0 = game.player.y;
    for (let i = 0; i < 60; i++) step(game, { dx: 0, dy: 0, sprint: false });
    expect(y0 - game.player.y).toBeGreaterThan(1.3);
  });

  it('takes a working lift after a short wait', () => {
    let level = hall();
    for (let seed = 1; !level.lift?.working; seed++) level = generateLevel(6, seed);
    const game = createGame(level);
    game.zombies = [];
    const { from, to } = level.lift!;
    game.player.x = game.player.px = from.x + from.w / 2;
    game.player.y = game.player.py = from.y + from.h / 2;
    for (let i = 0; i < 60 * 1.5; i++) step(game, { dx: 0, dy: 0, sprint: false });
    expect(game.player.ride).not.toBeNull();
    for (let i = 0; i < 60 * 3; i++) step(game, { dx: 1, dy: 0, sprint: false });
    expect(game.player.ride).toBeNull();
    expect(game.player.y).toBeLessThan(to.y + to.h + 0.5);
    expect(game.player.y).toBeGreaterThan(to.y - 0.5);
  });

  it('keeps riding zombies on the escalator belt', () => {
    let level = hall();
    for (let seed = 1; !level.zombies.some((z) => z.kind === 'rider'); seed++) level = generateLevel(6, seed);
    const game = createGame(level);
    const esc = level.zones.find((z) => z.floor === 'escalator')!;
    for (let i = 0; i < 60 * 30; i++) {
      step(game, { dx: 0, dy: 0, sprint: false });
      for (const z of game.zombies.filter((q) => q.kind === 'rider')) {
        expect(z.y).toBeGreaterThan(esc.y - 0.6);
        expect(z.y).toBeLessThan(esc.y + esc.h + 0.6);
      }
      game.player.hp = 99;
    }
  });

  it('applies persona stats', () => {
    const game = createGame(hall('crutches'));
    expect(game.player.r).toBe(PERSONAS.crutches.radius);
    game.zombies = [];
    for (let i = 0; i < 30; i++) step(game, { dx: 0, dy: -1, sprint: true });
    expect(game.player.sprinting).toBe(false);
    const tired = createGame(hall('tired'));
    expect(tired.player.staminaMax).toBe(70);
  });
});
