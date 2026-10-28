import { circleRectPush } from './geometry';
import { createRng, type Rng } from './rng';
import type { Decor, Level, PickupSpec, Rect, ThemeId, Wall, WallKind, Zone, ZombieKind, ZombieSpec } from './types';

export const WORLD_W = 14;
const PLAYER_R = 0.3;
const START_CLEAR = 8;
const TRAIN_H = 4;
const THEMES: ThemeId[] = ['sakura', 'hangang', 'jade', 'rhine'];

const NAME_A = [
  'Aoba', 'Hikari', 'Sakura', 'Midori', 'Tsuki', 'Hana', 'Yuzu', 'Kawa', 'Seorae', 'Hanbit', 'Mirae', 'Dongju',
  'Lumen', 'Rhein', 'Alder', 'Nordic', 'Vesper', 'Linden', 'Jiangbei', 'Lantern', 'Meihua', 'Qingshan',
];
const NAME_B = ['Central', 'Gate', 'Plaza', 'Junction', 'Yard', 'Cross', 'Market', 'Park', 'Terminal', 'Hills'];

interface Ctx {
  rng: Rng;
  diff: number;
  zones: Zone[];
  walls: Wall[];
  decor: Decor[];
  zombies: ZombieSpec[];
  pickups: PickupSpec[];
  crossings: Level['crossings'];
  height: number;
}

type SegmentKind = 'street' | 'crossing' | 'concourse' | 'platform';
interface SegmentPlan {
  kind: SegmentKind;
  len: number;
}

function wall(ctx: Ctx, kind: WallKind, x: number, y: number, w: number, h: number): void {
  ctx.walls.push({ kind, x, y, w, h });
}

function name(rng: Rng): string {
  return `${rng.pick(NAME_A)} ${rng.pick(NAME_B)}`;
}

function blockedAt(ctx: Ctx, x: number, y: number, r: number): boolean {
  const c = { x, y, r };
  for (const w of ctx.walls) if (circleRectPush(c, w)) return true;
  return false;
}

function addZombie(ctx: Ctx, spec: Omit<ZombieSpec, 'skin'>): void {
  ctx.zombies.push({ ...spec, skin: ctx.rng.int(0, 5) });
}

/** Finds a free spot in `area`, away from walls, the start and other zombies. */
function freeSpot(ctx: Ctx, area: Rect, avoid: Rect[] = []): { x: number; y: number } | null {
  for (let i = 0; i < 14; i++) {
    const x = ctx.rng.range(area.x, area.x + area.w);
    const y = ctx.rng.range(area.y, area.y + area.h);
    if (y > ctx.height - START_CLEAR) continue;
    if (blockedAt(ctx, x, y, 0.7)) continue;
    if (avoid.some((a) => x > a.x && x < a.x + a.w && y > a.y && y < a.y + a.h)) continue;
    if (ctx.zombies.some((z) => Math.hypot(z.x - x, z.y - y) < 1.3)) continue;
    return { x, y };
  }
  return null;
}

function spawnWanderers(ctx: Ctx, area: Rect, count: number, avoid: Rect[] = []): void {
  const { rng, diff } = ctx;
  const stopperP = Math.min(0.35, 0.16 + 0.02 * diff);
  const speedBoost = Math.min(0.5, diff * 0.03);
  let placed = 0;
  while (placed < count) {
    const spot = freeSpot(ctx, area, avoid);
    if (!spot) break;
    const roll = rng.next();
    const lane = area;
    if (roll < 0.12) {
      // A herd: three abreast, a moving wall of lowered heads.
      const heading = rng.chance(0.7) ? -Math.PI / 2 : Math.PI / 2;
      const speed = rng.range(0.8, 1.1) + speedBoost * 0.5;
      for (let k = -1; k <= 1; k++) {
        const x = spot.x + k * 1.0;
        if (x < area.x || x > area.x + area.w || blockedAt(ctx, x, spot.y, 0.6)) continue;
        addZombie(ctx, { kind: 'shuffler', x, y: spot.y, heading, speed, weave: 0, lane });
        placed++;
      }
      continue;
    }
    let kind: ZombieKind = 'shuffler';
    let heading: number;
    if (roll < 0.12 + stopperP) kind = 'stopper';
    if (roll > 0.8) heading = Math.PI / 2 + rng.range(-0.5, 0.5);
    else if (roll > 0.62) heading = rng.chance(0.5) ? 0 : Math.PI;
    else heading = -Math.PI / 2 + rng.range(-0.9, 0.9);
    addZombie(ctx, {
      kind,
      x: spot.x,
      y: spot.y,
      heading,
      speed: rng.range(0.8, 1.5) + speedBoost,
      weave: rng.range(0.3, 1.1),
      lane,
    });
    placed++;
  }
}

function coinTrail(ctx: Ctx, yTop: number, yBot: number): void {
  const { rng } = ctx;
  const y0 = rng.range(yTop + 3, yBot - 8);
  const cx = rng.range(3.5, WORLD_W - 3.5);
  const amp = rng.range(0.6, 1.6);
  for (let i = 0; i < 6; i++) {
    const x = cx + Math.sin(i * 0.9) * amp;
    const y = y0 + i * 1.1;
    if (y > ctx.height - START_CLEAR + 4 || blockedAt(ctx, x, y, 0.6)) continue;
    ctx.pickups.push({ type: 'coin', x, y });
  }
}

function buildStreet(ctx: Ctx, yTop: number, yBot: number): void {
  const { rng, diff } = ctx;
  const len = yBot - yTop;
  ctx.zones.push({ floor: 'pavement', x: 0, y: yTop, w: WORLD_W, h: len });
  wall(ctx, 'building', 0, yTop, 1.4, len);
  wall(ctx, 'building', WORLD_W - 1.4, yTop, 1.4, len);
  let lastPlanter = yBot;
  for (let y = yBot - 6; y > yTop + 2; y -= rng.range(4, 7)) {
    if (lastPlanter - y < 3) continue;
    lastPlanter = y;
    const x = rng.range(2.4, WORLD_W - 3.4);
    if (rng.chance(0.5)) wall(ctx, 'planter', x, y, 1.0, 1.0);
    else wall(ctx, 'bench', x, y, 2.0, 0.8);
  }
  const count = Math.round(len * Math.min(0.28, 0.1 + 0.014 * diff));
  spawnWanderers(ctx, { x: 1.6, y: yTop + 1, w: WORLD_W - 3.2, h: len - 2 }, count);
  coinTrail(ctx, yTop, yBot);
}

function buildCrossing(ctx: Ctx, yTop: number, yBot: number): void {
  const { rng, diff } = ctx;
  const curb = 5;
  const road: Rect = { x: 0, y: yTop + curb, w: WORLD_W, h: yBot - yTop - curb * 2 };
  const north: Rect = { x: 0, y: yTop, w: WORLD_W, h: curb };
  const south: Rect = { x: 0, y: road.y + road.h, w: WORLD_W, h: curb };
  ctx.zones.push({ floor: 'pavement', ...north }, { floor: 'road', ...road }, { floor: 'pavement', ...south });
  for (const c of [north, south]) {
    wall(ctx, 'building', 0, c.y, 1.4, c.h);
    wall(ctx, 'building', WORLD_W - 1.4, c.y, 1.4, c.h);
  }
  ctx.decor.push({ kind: 'crosswalk', x: 3.5, y: road.y, w: 7, h: road.h });
  const pedGreen = Math.max(8.5, 11 - diff * 0.2);
  const carGreen = Math.max(5.5, 9 - diff * 0.25);
  const index = ctx.crossings.length;
  ctx.crossings.push({ road, pedGreen, carGreen, offset: rng.range(0, pedGreen + carGreen) });
  ctx.decor.push({ kind: 'signal', x: 2.4, y: road.y - 0.9, w: 0.7, h: 0.7, index });
  ctx.decor.push({ kind: 'signal', x: 10.9, y: road.y + road.h + 0.2, w: 0.7, h: 0.7, index });

  const waiters = Math.min(8, 3 + Math.floor(diff / 2));
  const crowd = (curbRect: Rect, dir: 1 | -1): void => {
    for (let i = 0; i < waiters; i++) {
      const near = dir === 1 ? road.y - 2.4 : road.y + road.h + 0.4;
      const spot = freeSpot(ctx, { x: 2.8, y: near, w: 8.4, h: 2.0 });
      if (!spot) continue;
      addZombie(ctx, {
        kind: 'waiter',
        x: spot.x,
        y: spot.y,
        heading: dir === 1 ? Math.PI / 2 : -Math.PI / 2,
        speed: rng.range(1.0, 1.4),
        weave: 0.3,
        lane: curbRect,
      });
    }
    spawnWanderers(ctx, { x: 1.6, y: curbRect.y + 0.5, w: WORLD_W - 3.2, h: curbRect.h - 3 }, 2);
  };
  crowd(north, 1);
  crowd(south, -1);
}

function buildConcourse(ctx: Ctx, yTop: number, yBot: number): void {
  const { rng, diff } = ctx;
  const len = yBot - yTop;
  ctx.zones.push({ floor: 'concourse', x: 0, y: yTop, w: WORLD_W, h: len });

  // Rows of pillars with a crowd lane between each pair of rows.
  const rows: number[] = [];
  for (let y = yBot - 9; y > yTop + 11; y -= 8) rows.push(y);
  const laneYs: number[] = [];
  for (let i = 0; i + 1 < rows.length; i++) laneYs.push(((rows[i] as number) + (rows[i + 1] as number)) / 2);
  for (const y of rows) for (const x of [4, 7, 10]) wall(ctx, 'pillar', x - 0.55, y - 0.55, 1.1, 1.1);

  // Side walls with doorways where the commuter streams enter and leave.
  for (const [x0, w] of [[0, 1.4], [WORLD_W - 1.4, 1.4]] as const) {
    let y = yTop;
    for (const ly of [...laneYs].sort((a, b) => a - b)) {
      wall(ctx, 'building', x0, y, w, ly - 1.1 - y);
      y = ly + 1.1;
    }
    wall(ctx, 'building', x0, y, w, yBot - y);
  }
  for (let i = 0; i < 3; i++) {
    const y = rng.range(yTop + 8, yBot - 8);
    if (laneYs.some((ly) => Math.abs(ly - y) < 2.2)) continue;
    wall(ctx, 'vending', rng.chance(0.5) ? 1.4 : WORLD_W - 2.4, y, 1.0, 1.6);
  }

  // Ticket gates near the top of the hall; some are out of order.
  const gateY = yTop + 4;
  const gaps = diff > 4 ? 5 : 4;
  const gapW = 1.5;
  const inner = WORLD_W - 2.8;
  const pieceW = (inner - gaps * gapW) / (gaps + 1);
  const closed = new Set<number>();
  const closedCount = Math.min(rng.int(0, 2), gaps - 2);
  while (closed.size < closedCount) closed.add(rng.int(0, gaps - 1));
  let x = 1.4;
  for (let i = 0; i <= gaps; i++) {
    wall(ctx, 'gate', x, gateY, pieceW, 1.0);
    x += pieceW;
    if (i === gaps) break;
    if (closed.has(i)) wall(ctx, 'gate', x, gateY, gapW, 1.0);
    ctx.decor.push({ kind: 'gateLight', x, y: gateY + 1.1, w: gapW, h: 0.5, index: closed.has(i) ? 0 : 1 });
    x += gapW;
  }
  ctx.decor.push({ kind: 'sign', x: 3, y: yTop + 1.0, w: 8, h: 1.2, text: 'platform' });

  // Commuter streams cross the hall wall to wall, never looking up.
  const lanes = Math.min(laneYs.length, 2 + Math.floor(diff / 3));
  const avoid: Rect[] = [];
  laneYs.forEach((ly, i) => {
    avoid.push({ x: 0, y: ly - 1.5, w: WORLD_W, h: 3 });
    if (i >= lanes) return;
    const dir = (i + (diff % 2)) % 2 === 0 ? 1 : -1;
    const count = 3 + Math.min(3, Math.floor(diff / 3));
    const lane: Rect = { x: -2, y: ly - 0.7, w: WORLD_W + 4, h: 1.4 };
    const spacing = lane.w / count;
    for (let k = 0; k < count; k++) {
      addZombie(ctx, {
        kind: 'streamer',
        x: lane.x + k * spacing + rng.range(0, spacing * 0.5),
        y: ly + rng.range(-0.3, 0.3),
        heading: dir === 1 ? 0 : Math.PI,
        speed: rng.range(1.5, 2.1) + Math.min(0.6, diff * 0.05),
        weave: 0,
        lane,
      });
    }
  });
  avoid.push({ x: 0, y: gateY - 1, w: WORLD_W, h: 3 });
  spawnWanderers(ctx, { x: 1.6, y: yTop + 6, w: WORLD_W - 3.2, h: len - 7 }, Math.round(len * (0.06 + 0.004 * diff)), avoid);
  coinTrail(ctx, yTop, yBot);
  coinTrail(ctx, yTop, yBot);
}

function buildPlatform(ctx: Ctx, yTop: number, yBot: number): Rect {
  const { rng, diff } = ctx;
  const len = yBot - yTop;
  const doors = 4;
  const doorW = 2.0;
  const doorX = (i: number): number => ((i + 0.5) * WORLD_W) / doors;
  const goalDoor = rng.int(0, doors - 1);
  ctx.zones.push({ floor: 'train', x: 0, y: yTop, w: WORLD_W, h: TRAIN_H });
  ctx.zones.push({ floor: 'platform', x: 0, y: yTop + TRAIN_H, w: WORLD_W, h: len - TRAIN_H });

  wall(ctx, 'train', 0, yTop, WORLD_W, 2.2);
  let x = 0;
  for (let i = 0; i < doors; i++) {
    wall(ctx, 'train', x, yTop + 2.2, doorX(i) - doorW / 2 - x, TRAIN_H - 2.2);
    x = doorX(i) + doorW / 2;
  }
  wall(ctx, 'train', x, yTop + 2.2, WORLD_W - x, TRAIN_H - 2.2);
  wall(ctx, 'barrier', 0, yTop + TRAIN_H, 0.7, len - TRAIN_H);
  wall(ctx, 'barrier', WORLD_W - 0.7, yTop + TRAIN_H, 0.7, len - TRAIN_H);
  ctx.decor.push({ kind: 'yellowLine', x: 0, y: yTop + TRAIN_H + 0.35, w: WORLD_W, h: 0.25 });
  ctx.decor.push({ kind: 'doorMarker', x: doorX(goalDoor) - 1.0, y: yTop + 2.2, w: 2.0, h: 1.8, index: goalDoor });

  for (let y = yTop + TRAIN_H + 9; y < yBot - 7; y += 9) {
    for (const px of [3.2, 10.8]) wall(ctx, 'pillar', px - 0.5, y - 0.5, 1.0, 1.0);
    if (rng.chance(0.6)) wall(ctx, 'bench', 0.7, y + 2.5, 0.8, 2.4);
    if (rng.chance(0.6)) wall(ctx, 'bench', WORLD_W - 1.5, y + 2.5, 0.8, 2.4);
  }

  // Queues stand in front of the other doors, heads down; the player's own door stays clearer.
  const queueAvoid: Rect[] = [];
  for (let i = 0; i < doors; i++) {
    const n = i === goalDoor ? rng.int(0, 1) : Math.min(5, rng.int(2, 3) + Math.floor(diff / 5));
    for (let k = 0; k < n; k++) {
      const side = i === goalDoor ? (rng.chance(0.5) ? -0.8 : 0.8) : rng.range(-0.3, 0.3);
      addZombie(ctx, {
        kind: 'queue',
        x: doorX(i) + side,
        y: yTop + TRAIN_H + 1.3 + k * 1.15,
        heading: -Math.PI / 2,
        speed: 0,
        weave: 0,
        lane: { x: 0, y: yTop, w: WORLD_W, h: len },
      });
    }
    queueAvoid.push({ x: doorX(i) - 1.2, y: yTop + TRAIN_H, w: 2.4, h: 6.5 });
  }
  spawnWanderers(
    ctx,
    { x: 1.0, y: yTop + TRAIN_H + 6, w: WORLD_W - 2.0, h: len - TRAIN_H - 7 },
    Math.round(len * Math.min(0.2, 0.08 + 0.01 * diff)),
    queueAvoid,
  );
  coinTrail(ctx, yTop, yBot);
  return { x: doorX(goalDoor) - 0.9, y: yTop + 2.2, w: 1.8, h: 0.9 };
}

function planSegments(number: number, rng: Rng): SegmentPlan[] {
  const plan: SegmentPlan[] = [{ kind: 'street', len: 24 + rng.int(0, 8) }];
  if (number >= 2 || rng.chance(0.4)) plan.push({ kind: 'crossing', len: 15 });
  if (number >= 3) plan.push({ kind: 'street', len: 16 + rng.int(0, 6) });
  if (number >= 5 && rng.chance(0.6)) plan.push({ kind: 'crossing', len: 15 });
  plan.push({ kind: 'concourse', len: Math.min(42, 30 + Math.floor(number / 2)) });
  plan.push({ kind: 'platform', len: 34 });
  return plan;
}

export function generateLevel(number: number, seed: number): Level {
  const rng = createRng(seed ^ Math.imul(number, 0x9e3779b1));
  const diff = number - 1;
  const plan = planSegments(number, rng);
  const height = plan.reduce((sum, s) => sum + s.len, 0);
  const ctx: Ctx = {
    rng,
    diff,
    zones: [],
    walls: [],
    decor: [],
    zombies: [],
    pickups: [],
    crossings: [],
    height,
  };

  let yBot = height;
  let goal: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let goalDoor = 0;
  for (const seg of plan) {
    const yTop = yBot - seg.len;
    if (seg.kind === 'street') buildStreet(ctx, yTop, yBot);
    else if (seg.kind === 'crossing') buildCrossing(ctx, yTop, yBot);
    else if (seg.kind === 'concourse') buildConcourse(ctx, yTop, yBot);
    else {
      goal = buildPlatform(ctx, yTop, yBot);
      goalDoor = ctx.decor.find((d) => d.kind === 'doorMarker')?.index ?? 0;
    }
    yBot = yTop;
  }

  // One coffee somewhere in the middle of the route.
  for (let i = 0; i < 20; i++) {
    const x = rng.range(3, WORLD_W - 3);
    const y = rng.range(height * 0.3, height * 0.7);
    if (!blockedAt(ctx, x, y, 0.8)) {
      ctx.pickups.push({ type: 'coffee', x, y });
      break;
    }
  }

  const waits = ctx.crossings.length * 7;
  const timeLimit = Math.ceil(height / 3.1 + 14 + waits - Math.min(10, diff * 0.8));
  return {
    number,
    seed,
    theme: rng.pick(THEMES),
    from: name(rng),
    to: name(rng),
    car: goalDoor + 1,
    width: WORLD_W,
    height,
    spawn: { x: WORLD_W / 2, y: height - 2 },
    goal,
    timeLimit,
    zones: ctx.zones,
    walls: ctx.walls,
    decor: ctx.decor,
    zombies: ctx.zombies,
    pickups: ctx.pickups,
    crossings: ctx.crossings,
  };
}

export const PLAYER_RADIUS = PLAYER_R;
