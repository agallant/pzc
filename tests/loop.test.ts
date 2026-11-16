import { describe, expect, it } from 'vitest';
import { currentStreak, dailyLevelNumber, dailySeed, dayKey, previousDay, recordDaily } from '../src/game/daily';
import { OUTFITS, isUnlocked, outfitById } from '../src/game/outfits';
import { exportSave, importSave, loadSave, parseSave } from '../src/platform/storage';

describe('daily commute', () => {
  it('formats local dates and steps back a day across month and year ends', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
  });

  it('is the same for everyone on a date, and varies by date', () => {
    expect(dailySeed('2026-10-28')).toBe(dailySeed('2026-10-28'));
    expect(dailySeed('2026-10-28')).not.toBe(dailySeed('2026-10-29'));
    for (let d = 1; d <= 28; d++) {
      const n = dailyLevelNumber(`2026-02-${String(d).padStart(2, '0')}`);
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(12);
    }
  });

  it('builds streaks on consecutive days and resets after a gap', () => {
    const daily = parseSave({}).daily;
    recordDaily(daily, '2026-10-26', 500);
    recordDaily(daily, '2026-10-27', 600);
    recordDaily(daily, '2026-10-27', 650);
    expect(daily.streak).toBe(2);
    expect(daily.score).toBe(650);
    recordDaily(daily, '2026-10-29', 100);
    expect(daily.streak).toBe(1);
    expect(daily.bestStreak).toBe(2);
    expect(daily.score).toBe(100);
  });

  it('ignores a day older than the last completed one (clock set back)', () => {
    const daily = parseSave({}).daily;
    recordDaily(daily, '2026-10-27', 600);
    recordDaily(daily, '2026-10-26', 900);
    expect(daily.last).toBe('2026-10-27');
    expect(daily.streak).toBe(1);
    expect(daily.score).toBe(600);
  });

  it('lets a streak lapse when yesterday was missed', () => {
    const daily = parseSave({}).daily;
    recordDaily(daily, '2026-10-26', 1);
    recordDaily(daily, '2026-10-27', 1);
    expect(currentStreak(daily, '2026-10-27')).toBe(2);
    expect(currentStreak(daily, '2026-10-28')).toBe(2);
    expect(currentStreak(daily, '2026-10-29')).toBe(0);
  });
});

describe('outfits', () => {
  it('unlock by lifetime walked steps, starting with one for free', () => {
    expect(isUnlocked(OUTFITS[0]!, 0)).toBe(true);
    expect(isUnlocked(OUTFITS[1]!, 299)).toBe(false);
    expect(isUnlocked(OUTFITS[1]!, 300)).toBe(true);
    expect(outfitById('nope').id).toBe('orange');
    expect(parseSave({ outfit: 'nope' }).outfit).toBe('orange');
    expect(parseSave({ outfit: 'teal', stats: { steps: 300 } }).outfit).toBe('teal');
    expect(parseSave({ outfit: 'gold', stats: { steps: 10 } }).outfit).toBe('orange');
    for (let i = 1; i < OUTFITS.length; i++) expect(OUTFITS[i]!.steps).toBeGreaterThan(OUTFITS[i - 1]!.steps);
  });
});

describe('backup', () => {
  it('round-trips a save', () => {
    const save = parseSave({ run: { level: 6, score: 1234, continues: 2 }, stats: { steps: 777 }, outfit: 'teal', highScore: 5000 });
    const back = importSave(exportSave(save));
    expect(back).toEqual(save);
  });

  it('rejects text that is not a backup', () => {
    expect(importSave('hello')).toBeNull();
    expect(importSave('{"run":{"level":9}}')).toBeNull();
    expect(importSave('null')).toBeNull();
  });

  it('survives storage that throws', () => {
    expect(loadSave().run.level).toBe(1);
  });
});
