export interface Outfit {
  id: string;
  name: string;
  /** Lifetime pure steps needed to unlock. */
  steps: number;
  cap: string;
}

/** Cosmetic caps, unlocked only by walking for real. The more you walk, the better you dress. */
export const OUTFITS: readonly Outfit[] = [
  { id: 'orange', name: 'Plain cap', steps: 0, cap: '#ff9f43' },
  { id: 'teal', name: 'Teal bobble hat', steps: 300, cap: '#2fc4a6' },
  { id: 'violet', name: 'Violet beanie', steps: 1000, cap: '#8f6bff' },
  { id: 'crimson', name: 'Crimson flat cap', steps: 2500, cap: '#d63a4a' },
  { id: 'gold', name: 'Golden hour hat', steps: 6000, cap: '#f2c230' },
  { id: 'neon', name: 'Neon sprinter visor', steps: 12000, cap: '#3dffb5' },
];

export function outfitById(id: string): Outfit {
  return OUTFITS.find((o) => o.id === id) ?? (OUTFITS[0] as Outfit);
}

export function isUnlocked(outfit: Outfit, lifetimeSteps: number): boolean {
  return lifetimeSteps >= outfit.steps;
}
