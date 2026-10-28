import { describe, expect, it } from 'vitest';
import { generateLevel } from '../src/game/level';
import { createGame, MAX_HP, scoreResult, step, STEP, type Game } from '../src/game/sim';
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
});
