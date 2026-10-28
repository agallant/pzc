export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type WallKind = 'building' | 'pillar' | 'planter' | 'bench' | 'vending' | 'gate' | 'barrier' | 'train';
export interface Wall extends Rect {
  kind: WallKind;
}

export type FloorKind = 'pavement' | 'road' | 'concourse' | 'platform' | 'train';
export interface Zone extends Rect {
  floor: FloorKind;
}

export type DecorKind = 'crosswalk' | 'yellowLine' | 'sign' | 'gateLight' | 'doorMarker' | 'signal';
export interface Decor extends Rect {
  kind: DecorKind;
  text?: string;
  /** For signals: index into Level.crossings. For gate lights: 1 = open, 0 = out of order. */
  index?: number;
}

export type ZombieKind = 'shuffler' | 'stopper' | 'streamer' | 'waiter' | 'queue';
export interface ZombieSpec {
  kind: ZombieKind;
  x: number;
  y: number;
  heading: number;
  speed: number;
  /** Heading drift in rad/s: how much the zombie weaves while poking at the screen. */
  weave: number;
  lane: Rect;
  skin: number;
}

export interface PickupSpec {
  type: 'coin' | 'coffee';
  x: number;
  y: number;
}

export interface Crossing {
  /** The roadway band the cars drive through. */
  road: Rect;
  /** Seconds of green for pedestrians, then for cars. */
  pedGreen: number;
  carGreen: number;
  offset: number;
}

export type ThemeId = 'sakura' | 'hangang' | 'jade' | 'rhine';

export interface Level {
  number: number;
  seed: number;
  theme: ThemeId;
  from: string;
  to: string;
  /** Car and door the player must reach, e.g. "Car 4". */
  car: number;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  goal: Rect;
  timeLimit: number;
  zones: Zone[];
  walls: Wall[];
  decor: Decor[];
  zombies: ZombieSpec[];
  pickups: PickupSpec[];
  crossings: Crossing[];
}
