import { describe, expect, it } from 'vitest';
import { parseSave } from '../src/platform/storage';

describe('parseSave', () => {
  it('starts fresh from garbage', () => {
    for (const raw of [null, 'x', 42, [], { run: 'no' }]) {
      const s = parseSave(raw);
      expect(s.run).toEqual({ level: 1, score: 0, continues: 0 });
      expect(s.walk).toBeNull();
    }
  });

  it('migrates a first-release save', () => {
    const s = parseSave({ v: 1, nextLevel: 4, bestLevel: 3, highScore: 900, stars: { 1: 3, 2: 9 }, settings: { sound: false } });
    expect(s.run.level).toBe(4);
    expect(s.highScore).toBe(900);
    expect(s.stars).toEqual({ 1: 3 });
    expect(s.settings).toEqual({ sound: false, haptics: true, leftHanded: false, bigControls: false, largeText: false });
  });

  it('keeps a pending walk and clamps its progress', () => {
    const s = parseSave({
      run: { level: 5, score: 1200, continues: 2 },
      walk: { required: 350, pure: 9999, zombie: 4, level: 5, seed: 77, lock: { at: 10, hiddenAt: null, hiddenMs: 5000, fix: { lat: 1, lon: 2, accuracy: 8 } } },
    });
    expect(s.walk?.pure).toBe(350);
    expect(s.walk?.lock?.fix).toEqual({ lat: 1, lon: 2, accuracy: 8 });
    expect(s.walk?.score).toBe(0);
    expect(parseSave({ walk: { required: 5, score: 420 } }).walk?.score).toBe(420);
    expect(s.run.continues).toBe(2);
  });

  it('drops a walk with nothing required, and bad fixes', () => {
    expect(parseSave({ walk: { required: 0 } }).walk).toBeNull();
    const s = parseSave({ walk: { required: 10, lock: { at: 1, fix: { lat: 'a' } } } });
    expect(s.walk?.lock?.fix).toBeNull();
  });

  it('remembers that location was asked for even without a fix, and infers it for older locks', () => {
    const asked = parseSave({ walk: { required: 10, lock: { at: 1, locate: true, fix: null } } });
    expect(asked.walk?.lock?.locate).toBe(true);
    expect(asked.walk?.lock?.fix).toBeNull();
    const older = parseSave({ walk: { required: 10, lock: { at: 1, fix: { lat: 1, lon: 2, accuracy: 5 } } } });
    expect(older.walk?.lock?.locate).toBe(true);
    const plain = parseSave({ walk: { required: 10, lock: { at: 1 } } });
    expect(plain.walk?.lock?.locate).toBe(false);
  });
});

describe('runs', () => {
  it('starts with no finished runs', () => {
    expect(parseSave({}).runs).toEqual([]);
    expect(parseSave({ runs: 'no' }).runs).toEqual([]);
  });

  it('keeps well-formed runs, best first, and drops junk', () => {
    const s = parseSave({
      runs: [
        { score: 200, commutes: 2, day: '2026-10-01' },
        'junk',
        null,
        { score: 900, commutes: 6, day: 'not a date' },
        { score: 0, commutes: 9, day: '2026-10-02' },
        { score: -5, commutes: 1, day: '2026-10-03' },
      ],
    });
    expect(s.runs).toEqual([
      { score: 900, commutes: 6, day: null },
      { score: 200, commutes: 2, day: '2026-10-01' },
    ]);
  });

  it('never holds more than five runs', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ score: i + 1, commutes: 1, day: '2026-10-29' }));
    expect(parseSave({ runs: many }).runs.map((r) => r.score)).toEqual([12, 11, 10, 9, 8]);
  });
});

describe('settings', () => {
  it('defaults the control preferences and keeps them when set', () => {
    expect(parseSave({}).settings).toEqual({ sound: true, haptics: true, leftHanded: false, bigControls: false, largeText: false });
    const s = parseSave({ settings: { leftHanded: true, bigControls: true, sound: false } });
    expect(s.settings).toEqual({ sound: false, haptics: true, leftHanded: true, bigControls: true, largeText: false });
    expect(parseSave({ settings: { largeText: true } }).settings.largeText).toBe(true);
  });
});
