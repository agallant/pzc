import type { Fix } from '../walk/credit';

export interface Settings {
  sound: boolean;
  haptics: boolean;
}

/** A "lock the phone and walk" segment that is waiting for its check-in. */
export interface LockRecord {
  at: number;
  /** When the page last went to the background, if it still is. */
  hiddenAt: number | null;
  hiddenMs: number;
  fix: Fix | null;
}

/** The walk that earns a continue. Survives closing the app. */
export interface WalkRecord {
  required: number;
  /** Pure steps so far: no phone use, not looking at the screen. */
  pure: number;
  /** Steps taken while using the phone. Shown, never counted. */
  zombie: number;
  /** The commute (and its seed) to restart once the walk is done. */
  level: number;
  seed: number;
  lock: LockRecord | null;
}

export interface Run {
  level: number;
  score: number;
  continues: number;
}

export interface Save {
  v: 2;
  run: Run;
  bestLevel: number;
  highScore: number;
  stars: Record<number, number>;
  walk: WalkRecord | null;
  settings: Settings;
}

const KEY = 'pzc:save:v1';

function fresh(): Save {
  return {
    v: 2,
    run: { level: 1, score: 0, continues: 0 },
    bestLevel: 0,
    highScore: 0,
    stars: {},
    walk: null,
    settings: { sound: true, haptics: true },
  };
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;

function fix(raw: unknown): Fix | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const f = raw as Partial<Fix>;
  if (typeof f.lat !== 'number' || typeof f.lon !== 'number' || !Number.isFinite(f.lat + f.lon)) return null;
  return { lat: f.lat, lon: f.lon, accuracy: num(f.accuracy, 50) };
}

function walk(raw: unknown): WalkRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const w = raw as Partial<WalkRecord>;
  const required = num(w.required, 0);
  if (required < 1) return null;
  let lock: LockRecord | null = null;
  if (typeof w.lock === 'object' && w.lock !== null) {
    const l = w.lock as Partial<LockRecord>;
    lock = {
      at: num(l.at, Date.now()),
      hiddenAt: l.hiddenAt === null || l.hiddenAt === undefined ? null : num(l.hiddenAt, 0),
      hiddenMs: num(l.hiddenMs, 0),
      fix: fix(l.fix),
    };
  }
  return {
    required,
    pure: Math.min(required, num(w.pure, 0)),
    zombie: num(w.zombie, 0),
    level: Math.max(1, num(w.level, 1)),
    seed: num(w.seed, 1),
    lock,
  };
}

function sane(raw: unknown): Save {
  const base = fresh();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Partial<Save> & { nextLevel?: unknown };
  const stars: Record<number, number> = {};
  if (typeof r.stars === 'object' && r.stars !== null) {
    for (const [k, v] of Object.entries(r.stars)) if (typeof v === 'number' && v >= 1 && v <= 3) stars[Number(k)] = v;
  }
  const run: Partial<Run> = typeof r.run === 'object' && r.run !== null ? r.run : {};
  return {
    v: 2,
    // Saves from the first release stored the next commute as `nextLevel`.
    run: {
      level: Math.max(1, num(run.level, num(r.nextLevel, 1))),
      score: num(run.score, 0),
      continues: num(run.continues, 0),
    },
    bestLevel: num(r.bestLevel, 0),
    highScore: num(r.highScore, 0),
    stars,
    walk: walk(r.walk),
    settings: {
      sound: r.settings?.sound !== false,
      haptics: r.settings?.haptics !== false,
    },
  };
}

/** Progress lives in localStorage. Every access is guarded: private windows and blocked storage throw. */
export function loadSave(): Save {
  try {
    const text = localStorage.getItem(KEY);
    return text ? sane(JSON.parse(text)) : fresh();
  } catch {
    return fresh();
  }
}

export function writeSave(save: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable or full: the game still works, progress just won't persist.
  }
}

export function resetSave(): Save {
  const save = fresh();
  writeSave(save);
  return save;
}

/** For tests: parse arbitrary stored data the way loadSave does. */
export function parseSave(raw: unknown): Save {
  return sane(raw);
}
