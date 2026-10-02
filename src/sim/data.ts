/**
 * Game balance data. Numbers are the original Flash "Age of War" values
 * (as documented by the open-source Unity re-implementation of the original ActionScript).
 * Time values are expressed in original frames (41 fps) and converted to ticks at load.
 */
export const SIM_HZ = 41;
export const MAP_LEN = 900;
export const BASE_EDGE = 40; // x where a base ends, measured from its own map edge
export const MIN_GAP = 20;
export const MAX_ALIVE = 20;
export const MAX_QUEUE = 5;
export const WALK_SPEED = 40; // units / second, equal for every troop
export const START_GOLD = 175;
export const KILL_GOLD_MULT = 1.3;
export const KILL_XP_MULT = 2;
export const TURRET_SELL_RATIO = 0.5;
export const SPECIAL_COOLDOWN = 60 * SIM_HZ;
export const PROJECTILE_SPEED = 250;

export const AGE_NAMES = ['Stone', 'Castle', 'Renaissance', 'Modern', 'Future'] as const;
export const BASE_HP = [500, 1100, 2000, 3200, 4700];
export const XP_TO_EVOLVE = [4000, 14000, 45000, 200000];
export const SLOT_COST = [1000, 3000, 7500]; // buying slot #2, #3, #4
export const TURRET_SLOT_Y = [20, 68, 116, 164];

export type Mount = 'none' | 'dino' | 'horse' | 'cannon' | 'tank' | 'mech';
export type Look = 'club' | 'sling' | 'sword' | 'bow' | 'duel' | 'musket' | 'rifle' | 'blade' | 'blaster' | 'super';

export interface UnitDef {
  id: number;
  age: number; // 0..4
  tier: number; // 0..3 (3 = super soldier)
  name: string;
  cost: number;
  train: number; // ticks
  hp: number;
  melee: number;
  ranged: number;
  meleeRange: number;
  rangedRange: number;
  length: number;
  /** ticks until the first strike after contact */
  meleeFirst: number;
  /** ticks between melee strikes */
  meleeEvery: number;
  rangedFirst: number;
  rangedStandEvery: number;
  rangedWalkEvery: number;
  mount: Mount;
  look: Look;
}

const f2t = (frames: number) => Math.max(1, Math.round(frames));
const s2t = (sec: number) => Math.max(1, Math.round(sec * SIM_HZ));

// [name, cost, trainFrames, hp, melee, ranged, meleeRange, rangedRange, length, pauseFrames,
//  meleeFirstSec, meleeSpeedSec, rangedStandSec, rangedWalkSec, mount, look]
type Row = [string, number, number, number, number, number, number, number, number, number, number, number, number, number, Mount, Look];
const ROWS: Row[] = [
  ['Clubman', 15, 40, 55, 16, 0, 20, 0, 20, 20, 0.43, 1, 0, 0, 'none', 'club'],
  ['Slingshot', 25, 40, 42, 10, 8, 20, 100, 20, 20, 0.43, 1, 0.8, 1.07, 'none', 'sling'],
  ['Dino Rider', 100, 100, 160, 40, 0, 20, 0, 80, 45, 0.32, 1.12, 0, 0, 'dino', 'club'],
  ['Swordsman', 50, 70, 100, 35, 0, 20, 0, 20, 20, 0.62, 1.235, 0, 0, 'none', 'sword'],
  ['Archer', 75, 50, 80, 20, 14, 20, 130, 20, 20, 0.62, 1.235, 1, 1, 'none', 'bow'],
  ['Knight', 500, 100, 300, 60, 0, 20, 0, 80, 60, 0.35, 1.3, 0, 0, 'horse', 'sword'],
  ['Duelist', 200, 100, 200, 79, 0, 25, 0, 20, 25, 0.32, 1.05, 0, 0, 'none', 'duel'],
  ['Musketeer', 400, 100, 160, 40, 20, 25, 130, 20, 25, 0.15, 1.15, 1.15, 1.2, 'none', 'musket'],
  ['Cannoneer', 1000, 200, 600, 120, 0, 25, 0, 20, 25, 0.65, 1.95, 0, 0, 'cannon', 'club'],
  ['Infantry', 1500, 100, 350, 100, 0, 25, 0, 20, 25, 0.17, 0.75, 0, 0, 'none', 'rifle'],
  ['Gunner', 2000, 100, 300, 60, 30, 25, 130, 20, 25, 0.07, 0.52, 0.52, 1.2, 'none', 'rifle'],
  ['Tank', 7000, 300, 1200, 300, 0, 20, 0, 120, 100, 0.55, 1.57, 0, 0, 'tank', 'rifle'],
  ['God Blade', 5000, 100, 1000, 250, 0, 20, 0, 20, 40, 0.32, 0.92, 0, 0, 'none', 'blade'],
  ['Blaster', 6000, 100, 800, 130, 80, 20, 110, 20, 40, 0.32, 0.7, 0.35, 0.95, 'none', 'blaster'],
  ['War Machine', 20000, 300, 3000, 600, 0, 20, 0, 100, 100, 0.25, 2.25, 0, 0, 'mech', 'blaster'],
  ['Super Soldier', 150000, 100, 4000, 400, 400, 20, 130, 20, 40, 0.32, 0.7, 0.35, 0.95, 'none', 'super'],
];

export const UNITS: UnitDef[] = ROWS.map((r, id) => {
  const [name, cost, train, hp, melee, ranged, mr, rr, length, pause, mf, ms, rs, rw, mount, look] = r;
  const pauseSec = pause / SIM_HZ;
  return {
    id,
    age: id === 15 ? 4 : Math.floor(id / 3),
    tier: id === 15 ? 3 : id % 3,
    name,
    cost,
    train: f2t(train),
    hp,
    melee,
    ranged,
    meleeRange: mr,
    rangedRange: rr,
    length,
    meleeFirst: s2t(mf),
    meleeEvery: s2t(ms + pauseSec),
    rangedFirst: 1,
    rangedStandEvery: s2t(rs + pauseSec),
    rangedWalkEvery: s2t(rw + pauseSec),
    mount,
    look,
  };
});

export interface TurretDef {
  id: number;
  age: number;
  tier: number;
  name: string;
  cost: number;
  first: number; // ticks
  every: number; // ticks
  damage: number;
  range: number;
  frag: number; // fragment damage (applied twice on average)
  flame: boolean;
  proj: 'rock' | 'egg' | 'catapult' | 'fire' | 'oil' | 'ball' | 'bullet' | 'rocket' | 'laser' | 'plasma';
}

const T_NAMES = ['Rock Slingshot', 'Egg Automatic', 'Primitive Catapult', 'Catapult', 'Fire Catapult', 'Oil Thrower', 'Small Cannon', 'Medium Cannon', 'Big Cannon', 'Gun', 'Rocket Launcher', 'Double Gun', 'Laser', 'Red Blaster', 'Blue Blaster'];
const T_COST = [100, 200, 500, 500, 750, 1000, 1500, 3000, 6000, 7000, 9000, 14000, 24000, 40000, 100000];
const T_SPEED = [0.8, 0.25, 1.37, 2.47, 2.47, 1.92, 1.12, 2, 2, 1.12, 1, 0.5, 1, 0.25, 0.25];
const T_ADD = [30, 11, 20, 70, 70, 50, 50, 70, 70, 70, 80, 0, 40, 11, 11];
const T_DMG = [12, 5, 25, 40, 50, 125, 30, 70, 100, 70, 100, 60, 100, 40, 60];
const T_RANGE = [350, 300, 380, 400, 300, 50, 500, 500, 500, 500, 500, 500, 400, 500, 550];
const T_FRAG = [0, 0, 0, 0, 10, 0, 0, 0, 30, 0, 0, 0, 0, 0, 0];
const T_FIRST = [0.1, 0, 0.17, 0.35, 0.35, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const T_PROJ: TurretDef['proj'][] = ['rock', 'egg', 'catapult', 'catapult', 'fire', 'oil', 'ball', 'ball', 'ball', 'bullet', 'rocket', 'bullet', 'laser', 'laser', 'plasma'];

export const TURRETS: TurretDef[] = T_NAMES.map((name, id) => ({
  id,
  age: Math.floor(id / 3),
  tier: id % 3,
  name,
  cost: T_COST[id] as number,
  first: s2t(T_FIRST[id] as number),
  every: s2t((T_SPEED[id] as number) + (T_ADD[id] as number) / (SIM_HZ * 2)),
  damage: T_DMG[id] as number,
  range: T_RANGE[id] as number,
  frag: T_FRAG[id] as number,
  flame: id === 5,
  proj: T_PROJ[id] as TurretDef['proj'],
}));

export interface SpecialDef {
  kind: 'meteors' | 'arrows' | 'heal' | 'bombs' | 'lasers';
  count: number;
  interval: number; // ticks
  damage: number;
  spacing?: number;
  duration?: number;
}

export const SPECIALS: SpecialDef[] = [
  { kind: 'meteors', count: 22, interval: f2t(9), damage: 200 },
  { kind: 'arrows', count: 40, interval: f2t(5), damage: 200 },
  { kind: 'heal', count: 1, interval: 1, damage: 0, duration: s2t(14.6) },
  { kind: 'bombs', count: 15, interval: f2t(15), damage: 400, spacing: 60 },
  { kind: 'lasers', count: 18, interval: f2t(5), damage: 1000, spacing: 50 },
];

export const unitsOfAge = (age: number): UnitDef[] =>
  UNITS.filter((u) => u.age === age && (u.tier < 3 || age === 4));
export const turretsOfAge = (age: number): TurretDef[] => TURRETS.filter((t) => t.age === age);
