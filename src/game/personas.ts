export type PersonaId = 'commuter' | 'suitcase' | 'tired' | 'crutches' | 'wheelchair';

export interface Persona {
  id: PersonaId;
  name: string;
  blurb: string;
  radius: number;
  /** Walking speed in world units per second. */
  speed: number;
  canSprint: boolean;
  /** Fraction of walking speed kept on stairs. 0 means stairs and escalators are impassable. */
  stairsSpeed: number;
  /** Stamina lost per second while climbing. */
  stairsDrain: number;
  staminaMax: number;
  /** Stamina regained per second, as a multiple of the usual rate. */
  regen: number;
  /** Extra time on the clock, as a fraction. */
  timeBonus: number;
}

export const PERSONAS: Record<PersonaId, Persona> = {
  commuter: {
    id: 'commuter',
    name: 'Daily commuter',
    blurb: 'Rucksack, lanyard, running on coffee.',
    radius: 0.3,
    speed: 3.4,
    canSprint: true,
    stairsSpeed: 0.62,
    stairsDrain: 10,
    staminaMax: 100,
    regen: 1,
    timeBonus: 0,
  },
  suitcase: {
    id: 'suitcase',
    name: 'Traveller with a suitcase',
    blurb: 'Wider turns, and stairs will wreck you. Look for an escalator or lift.',
    radius: 0.42,
    speed: 3.2,
    canSprint: true,
    stairsSpeed: 0.4,
    stairsDrain: 18,
    staminaMax: 100,
    regen: 0.9,
    timeBonus: 0.1,
  },
  tired: {
    id: 'tired',
    name: 'Night-shift worker',
    blurb: 'Hasn’t slept. Small tank, slow to recover. Save your sprints.',
    radius: 0.3,
    speed: 3.0,
    canSprint: true,
    stairsSpeed: 0.55,
    stairsDrain: 14,
    staminaMax: 70,
    regen: 0.55,
    timeBonus: 0.1,
  },
  crutches: {
    id: 'crutches',
    name: 'Broken ankle, crutches',
    blurb: 'Slower, no sprinting, and stairs are a nightmare. You get extra time.',
    radius: 0.36,
    speed: 2.4,
    canSprint: false,
    stairsSpeed: 0.3,
    stairsDrain: 22,
    staminaMax: 100,
    regen: 1,
    timeBonus: 0.35,
  },
  wheelchair: {
    id: 'wheelchair',
    name: 'Wheelchair user',
    blurb: 'Stairs and escalators are closed to you. Find the step-free route, and hope the lift works.',
    radius: 0.45,
    speed: 3.0,
    canSprint: false,
    stairsSpeed: 0,
    stairsDrain: 0,
    staminaMax: 100,
    regen: 1,
    timeBonus: 0.25,
  },
};
