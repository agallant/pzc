import type { Daily } from '../platform/storage';

/** Local calendar date as YYYY-MM-DD. */
export function dayKey(date: Date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Everyone gets the same commute on the same date. */
export function dailySeed(key: string): number {
  return hash(`pzc:${key}`);
}

/** Daily commutes cycle through a mid-game difficulty range, so they are never trivial or brutal. */
export function dailyLevelNumber(key: string): number {
  return 4 + (hash(`level:${key}`) % 9);
}

export function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return dayKey(new Date(y, m - 1, d - 1));
}

/** Records a completed daily commute, extending the streak if yesterday was also done. */
export function recordDaily(daily: Daily, key: string, score: number): void {
  if (daily.scoreDay !== key) {
    daily.scoreDay = key;
    daily.score = 0;
  }
  daily.score = Math.max(daily.score, score);
  if (daily.last === key) return;
  daily.streak = daily.last === previousDay(key) ? daily.streak + 1 : 1;
  daily.bestStreak = Math.max(daily.bestStreak, daily.streak);
  daily.last = key;
}

/** The streak as it stands today: it lapses if yesterday was missed. */
export function currentStreak(daily: Daily, today: string): number {
  if (daily.last === today || daily.last === previousDay(today)) return daily.streak;
  return 0;
}
