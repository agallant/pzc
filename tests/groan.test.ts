import { describe, expect, it } from 'vitest';
import { nearestWithin } from '../src/game/groan';

describe('nearestWithin', () => {
  const pts = [
    { id: 'far', x: 20, y: 0 },
    { id: 'mid', x: 4, y: 3 },
    { id: 'near', x: 1, y: 1 },
  ];

  it('picks the closest point inside the range', () => {
    expect(nearestWithin(pts, 0, 0, 6)?.id).toBe('near');
  });

  it('returns null when nothing is in range', () => {
    expect(nearestWithin(pts, 100, 100, 6)).toBeNull();
    expect(nearestWithin([], 0, 0, 6)).toBeNull();
  });

  it('counts a point exactly at the range edge', () => {
    expect(nearestWithin([{ x: 6, y: 0 }], 0, 0, 6)).not.toBeNull();
  });
});
