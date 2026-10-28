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
    expect(s.settings).toEqual({ sound: false, haptics: true, leftHanded: false, bigControls: false });
  });

  it('keeps a pending walk and clamps its progress', () => {
    const s = parseSave({
      run: { level: 5, score: 1200, continues: 2 },
      walk: { required: 350, pure: 9999, zombie: 4, level: 5, seed: 77, lock: { at: 10, hiddenAt: null, hiddenMs: 5000, fix: { lat: 1, lon: 2, accuracy: 8 } } },
    });
    expect(s.walk?.pure).toBe(350);
    expect(s.walk?.lock?.fix).toEqual({ lat: 1, lon: 2, accuracy: 8 });
    expect(s.run.continues).toBe(2);
  });

  it('drops a walk with nothing required, and bad fixes', () => {
    expect(parseSave({ walk: { required: 0 } }).walk).toBeNull();
    const s = parseSave({ walk: { required: 10, lock: { at: 1, fix: { lat: 'a' } } } });
    expect(s.walk?.lock?.fix).toBeNull();
  });
});

describe('settings', () => {
  it('defaults the control preferences and keeps them when set', () => {
    expect(parseSave({}).settings).toEqual({ sound: true, haptics: true, leftHanded: false, bigControls: false });
    const s = parseSave({ settings: { leftHanded: true, bigControls: true, sound: false } });
    expect(s.settings).toEqual({ sound: false, haptics: true, leftHanded: true, bigControls: true });
  });
});
