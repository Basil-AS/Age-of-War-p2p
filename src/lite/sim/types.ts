export type Side = 0 | 1;

export type Cmd =
  | { t: 'buy'; u: number }
  | { t: 'cancel'; i: number }
  | { t: 'turret'; id: number; slot: number }
  | { t: 'sell'; slot: number }
  | { t: 'slot' }
  | { t: 'evolve' }
  | { t: 'special' };

export interface Troop {
  uid: number;
  side: Side;
  def: number;
  x: number;
  hp: number;
  maxHp: number;
  /** ticks until next strike, -1 = not attacking */
  cd: number;
  mode: 0 | 1 | 2; // 0 idle, 1 melee, 2 ranged
  moving: boolean;
  regenUntil: number;
  /** tick the unit was spawned — cosmetic only */
  born: number;
}

export interface QueueItem {
  def: number;
  left: number;
  total: number;
}

export interface Player {
  gold: number;
  xp: number;
  age: number;
  baseHp: number;
  baseMax: number;
  queue: QueueItem[];
  turrets: (number | null)[]; // length 4
  turretCd: number[];
  slots: number;
  specialCd: number;
  /** free = AI player that is not charged for anything (original behaviour) */
  free: boolean;
  ageTick: number;
  kills: number;
}

export interface ActiveSpecial {
  side: Side;
  age: number;
  start: number;
  fired: number;
}

export type Ev =
  | { k: 'spawn'; side: Side; uid: number; def: number; x: number }
  | { k: 'melee'; uid: number; target: number; side: Side }
  | { k: 'shot'; side: Side; from: number; to: number; def: number; turret: number; slot: number; uid: number }
  | { k: 'hit'; x: number; side: Side; dmg: number; base: boolean; big: boolean }
  | { k: 'die'; uid: number; side: Side; def: number; x: number; gold: number }
  | { k: 'special'; side: Side; kind: string; x: number; dmg: number; hit: boolean; idx: number }
  | { k: 'evolve'; side: Side; age: number }
  | { k: 'turret'; side: Side; slot: number; id: number | null }
  | { k: 'end'; winner: number };

export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane';
