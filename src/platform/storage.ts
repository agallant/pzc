export interface Settings {
  sound: boolean;
  haptics: boolean;
}

export interface Save {
  v: 1;
  /** The commute the player will start next. */
  nextLevel: number;
  bestLevel: number;
  highScore: number;
  stars: Record<number, number>;
  settings: Settings;
}

const KEY = 'pzc:save:v1';

function fresh(): Save {
  return { v: 1, nextLevel: 1, bestLevel: 0, highScore: 0, stars: {}, settings: { sound: true, haptics: true } };
}

function sane(raw: unknown): Save {
  const base = fresh();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Partial<Save>;
  const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
  const stars: Record<number, number> = {};
  if (typeof r.stars === 'object' && r.stars !== null) {
    for (const [k, v] of Object.entries(r.stars)) if (typeof v === 'number' && v >= 1 && v <= 3) stars[Number(k)] = v;
  }
  return {
    v: 1,
    nextLevel: Math.max(1, Math.floor(num(r.nextLevel, 1))),
    bestLevel: Math.floor(num(r.bestLevel, 0)),
    highScore: Math.floor(num(r.highScore, 0)),
    stars,
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
