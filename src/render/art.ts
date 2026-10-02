import { Container, FillGradient, Graphics } from 'pixi.js';
import type { UnitDef } from '../sim/data';

export const TEAM = { mine: 0x38bdf8, theirs: 0xf87171 } as const;

const rect = (g: Graphics, x: number, y: number, w: number, h: number, c: number) => g.rect(x, y, w, h).fill(c);
const circ = (g: Graphics, x: number, y: number, r: number, c: number) => g.circle(x, y, r).fill(c);
const poly = (g: Graphics, pts: number[], c: number) => g.poly(pts).fill(c);
const line = (g: Graphics, x1: number, y1: number, x2: number, y2: number, w: number, c: number) =>
  g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w, color: c, cap: 'round' });

// ───────────────────────── units ─────────────────────────
export interface Rig {
  root: Container;
  /** everything that is lifted/bobbed together (mount + rider) */
  body: Container;
  legs: Graphics[];
  arm: Graphics | null;
  spin: Graphics[];
  stride: number;
  height: number;
  reach: number; // draw half-length, used for hp bar offset
}

interface Palette { skin: number; cloth: number; cloth2: number; metal: number; hair: number }
const PAL: Palette[] = [
  { skin: 0xe0a070, cloth: 0x8a5a2b, cloth2: 0x5b3a1a, metal: 0x9ca3af, hair: 0x3b2410 }, // stone
  { skin: 0xe8b88a, cloth: 0x6b7280, cloth2: 0x374151, metal: 0xd1d5db, hair: 0x713f12 }, // castle
  { skin: 0xf1c8a5, cloth: 0x7c3a5a, cloth2: 0xe5c07b, metal: 0xc0c5cc, hair: 0x422006 }, // renaissance
  { skin: 0xe9b995, cloth: 0x55633d, cloth2: 0x3b4529, metal: 0x4b5563, hair: 0x292524 }, // modern
  { skin: 0xdbeafe, cloth: 0xe2e8f0, cloth2: 0x64748b, metal: 0x22d3ee, hair: 0x0f172a }, // future
];

function humanParts(def: UnitDef, team: number, rider: boolean) {
  const p = PAL[def.age] as Palette;
  const root = new Container();
  const legB = new Graphics(), legF = new Graphics(), torso = new Graphics(), head = new Graphics(), arm = new Graphics();
  const hipY = rider ? -6 : -15;
  // legs (pivot at hip)
  for (const [g, c] of [[legB, p.cloth2], [legF, p.cloth]] as const) {
    g.position.set(0, hipY);
    rect(g, -2.2, 0, 4.4, 15, c);
    rect(g, -2.2, 12, 6, 3, 0x1f2937);
  }
  const top = hipY - 17;
  // torso
  g_torso(torso, def, p, team, top, hipY);
  // head
  circ(head, 1, top - 5, 5.2, p.skin);
  circ(head, 3.4, top - 5.4, 0.9, 0x111827);
  hat(head, def, p, team, top);
  // weapon arm (pivot at shoulder)
  arm.position.set(2, top + 4);
  weapon(arm, def, p, team);
  root.addChild(legB, torso, head, legF, arm);
  return { root, legs: [legB, legF], arm, height: 40 };
}

function g_torso(g: Graphics, def: UnitDef, p: Palette, team: number, top: number, hipY: number) {
  g.roundRect(-6.5, top, 13, hipY - top + 2, 3).fill(p.cloth);
  rect(g, -6.5, hipY - 4, 13, 3, p.cloth2);
  if (def.age === 0) { // fur pelt
    poly(g, [-6.5, top, 6.5, top + 8, 6.5, top + 14, -6.5, top + 14], p.cloth2);
  } else if (def.age === 1) { // tabard
    rect(g, -3.5, top + 2, 7, hipY - top - 3, team);
  } else if (def.age === 2) { // sash + frills
    poly(g, [-6.5, top + 2, 6.5, top + 12, 6.5, top + 15, -6.5, top + 5], team);
    rect(g, -5, top, 10, 2, p.cloth2);
  } else if (def.age === 3) { // vest
    rect(g, -6.5, top + 2, 13, 9, p.cloth2);
    rect(g, -6.5, top + 12, 13, 2, team);
  } else { // armor
    rect(g, -6.5, top + 2, 13, 4, p.metal);
    rect(g, -1, top + 6, 2, 9, p.metal);
    circ(g, 0, top + 4, 2.2, team);
  }
}

function hat(g: Graphics, def: UnitDef, p: Palette, team: number, top: number) {
  const hy = top - 5;
  switch (def.age) {
    case 0: rect(g, -4.5, hy - 6, 9, 3, p.hair); circ(g, -3, hy - 3, 3, p.hair); break;
    case 1: g.arc(1, hy, 6, Math.PI, 0).fill(p.metal); rect(g, -5, hy - 1, 12, 2, p.metal); break;
    case 2: poly(g, [-5, hy - 2, 7, hy - 2, 4, hy - 8, -3, hy - 8], p.cloth2); rect(g, -6, hy - 2, 14, 1.6, p.cloth2); poly(g, [-2, hy - 8, 0, hy - 14, 2, hy - 8], team); break;
    case 3: g.arc(1, hy, 6, Math.PI, 0).fill(p.cloth2); rect(g, -5, hy - 1, 12, 1.8, p.cloth2); break;
    default: g.arc(1, hy + 1, 6.2, Math.PI, 0).fill(p.metal); rect(g, -5, hy - 1.5, 4, 5, 0x0891b2); break;
  }
}

function weapon(g: Graphics, def: UnitDef, p: Palette, team: number) {
  rect(g, 0, -1.6, 8, 3.2, p.skin); // forearm
  switch (def.look) {
    case 'club': line(g, 8, 0, 20, -8, 3.2, 0x7c4a1e); circ(g, 21, -9, 4, 0x6b3f17); break;
    case 'sling': line(g, 8, 0, 14, -6, 1.2, 0xd6c7a1); circ(g, 15, -7, 2.4, 0x9ca3af); break;
    case 'sword': line(g, 8, 0, 26, -2, 2.4, 0xe5e7eb); rect(g, 9, -4.5, 2, 9, 0xb45309); break;
    case 'bow': g.arc(12, 0, 11, -1.2, 1.2).stroke({ width: 2, color: 0x7c4a1e }); line(g, 12 + 11 * Math.cos(1.2), 11 * Math.sin(1.2), 12 + 11 * Math.cos(1.2), -11 * Math.sin(1.2), 0.8, 0xe5e7eb); break;
    case 'duel': line(g, 8, 0, 28, -1, 1.4, 0xf1f5f9); circ(g, 9, 0, 3, 0xd4a017); break;
    case 'musket': rect(g, 4, -2, 26, 3, 0x6b3f17); rect(g, 16, -2.6, 16, 1.6, 0x374151); break;
    case 'rifle': rect(g, 4, -2, 20, 3.4, 0x1f2937); rect(g, 18, -2.6, 10, 1.6, 0x111827); break;
    case 'blade': rect(g, 8, -1.6, 4, 3.2, 0x334155); g.moveTo(12, 0).lineTo(32, 0).stroke({ width: 3, color: 0x22d3ee, cap: 'round' }); g.moveTo(12, 0).lineTo(32, 0).stroke({ width: 7, color: 0x22d3ee, alpha: 0.25, cap: 'round' }); break;
    case 'blaster': rect(g, 4, -3, 18, 6, 0x475569); rect(g, 18, -2, 8, 4, 0x22d3ee); circ(g, 8, 0, 2, team); break;
    case 'super': rect(g, 4, -4, 22, 8, 0x334155); rect(g, 22, -3, 12, 6, 0xfacc15); circ(g, 10, 0, 2.6, 0xf43f5e); break;
  }
}

function rigHuman(def: UnitDef, team: number, riderLift = 0, scale = 1): Rig {
  const h = humanParts(def, team, riderLift > 0);
  const body = new Container();
  body.addChild(h.root);
  h.root.y = -riderLift;
  body.scale.set(scale);
  return { root: new Container(), body, legs: h.legs, arm: h.arm, spin: [], stride: 0.7, height: h.height * scale + riderLift, reach: 14 };
}

function mount(def: UnitDef, team: number): Rig {
  const rig = rigHuman(def, team, def.mount === 'dino' ? 40 : def.mount === 'horse' ? 33 : def.mount === 'cannon' ? 0 : 0, def.mount === 'cannon' ? 1 : 1);
  const m = new Graphics();
  const legsA = new Graphics(), legsB = new Graphics();
  const spin: Graphics[] = [];
  const wheels = new Container();
  switch (def.mount) {
    case 'dino': {
      legsA.position.set(-14, -26); legsB.position.set(14, -26);
      rect(legsA, -4, 0, 8, 26, 0x15803d); rect(legsA, -4, 22, 12, 4, 0x14532d);
      rect(legsB, -4, 0, 8, 26, 0x16a34a); rect(legsB, -4, 22, 12, 4, 0x14532d);
      m.ellipse(0, -36, 30, 16).fill(0x22c55e);
      poly(m, [-26, -40, -52, -30, -26, -30], 0x22c55e);
      m.ellipse(-4, -30, 22, 9).fill(0x86efac);
      m.roundRect(20, -56, 30, 18, 8).fill(0x22c55e);
      circ(m, 42, -50, 2.4, 0xffffff); circ(m, 43, -50, 1.2, 0x111827);
      for (let i = 0; i < 4; i++) poly(m, [-12 + i * 9, -50, -8 + i * 9, -60, -4 + i * 9, -50], team);
      for (let i = 0; i < 4; i++) poly(m, [38 + i * 3, -41, 40 + i * 3, -37, 42 + i * 3, -41], 0xffffff);
      break;
    }
    case 'horse': {
      legsA.position.set(-13, -22); legsB.position.set(13, -22);
      rect(legsA, -2.6, 0, 5, 22, 0x7c4a1e); rect(legsB, -2.6, 0, 5, 22, 0x92571f);
      m.ellipse(0, -28, 24, 11).fill(0x92571f);
      poly(m, [14, -34, 30, -50, 38, -46, 22, -26], 0x92571f);
      m.roundRect(28, -52, 14, 8, 4).fill(0x92571f);
      circ(m, 38, -49, 1.4, 0x111827);
      poly(m, [16, -40, 24, -50, 22, -38], 0x1f2937);
      line(m, -22, -32, -34, -22, 3.4, 0x1f2937);
      rect(m, -8, -42, 16, 5, team); // saddle blanket
      break;
    }
    case 'cannon': {
      m.roundRect(-14, -22, 56, 11, 5).fill(0x374151);
      m.roundRect(-8, -30, 54, 14, 6).fill(0x1f2937);
      rect(m, 40, -33, 6, 20, 0x374151);
      for (const wx of [-4, 22]) {
        const w = new Graphics();
        circ(w, 0, 0, 11, 0x78350f); circ(w, 0, 0, 4, 0xd4a017); rect(w, -1, -11, 2, 22, 0x451a03); rect(w, -11, -1, 22, 2, 0x451a03);
        w.position.set(wx, -11);
        wheels.addChild(w);
        spin.push(w);
      }
      rect(m, -10, -24, 6, 6, team);
      break;
    }
    case 'tank': {
      m.roundRect(-44, -15, 88, 13, 6).fill(0x111827);
      for (let i = 0; i < 6; i++) circ(m, -36 + i * 14.4, -8, 5.5, 0x374151);
      m.roundRect(-38, -32, 76, 19, 4).fill(0x4d5a3a);
      m.roundRect(-20, -46, 38, 15, 5).fill(0x56673f);
      rect(m, 16, -41, 46, 5, 0x3b4529);
      rect(m, 58, -42, 6, 7, 0x1f2937);
      rect(m, -34, -28, 10, 4, team);
      circ(m, -2, -52, 5, 0x3b4529);
      break;
    }
    case 'mech': {
      legsA.position.set(-14, -40); legsB.position.set(14, -40);
      for (const g of [legsA, legsB]) { rect(g, -5, 0, 10, 24, 0x475569); rect(g, -9, 22, 22, 6, 0x1e293b); rect(g, -3, 6, 6, 12, 0x22d3ee); }
      m.roundRect(-26, -78, 52, 40, 8).fill(0x64748b);
      m.roundRect(-18, -92, 38, 20, 6).fill(0x94a3b8);
      rect(m, -4, -88, 16, 6, 0x22d3ee);
      rect(m, 18, -64, 36, 8, 0x334155); rect(m, 50, -66, 10, 12, 0xfacc15);
      rect(m, -24, -70, 8, 8, team);
      m.circle(0, -58, 6).fill({ color: 0x22d3ee, alpha: 0.85 });
      break;
    }
    default: break;
  }
  const back = new Container();
  back.addChild(legsA, m, legsB, wheels);
  rig.body.addChildAt(back, 0);
  // vehicles hide the rider arm detail a bit and have no human legs
  if (def.mount === 'tank' || def.mount === 'mech' || def.mount === 'cannon') {
    for (const l of rig.legs) l.visible = false;
    const rider = rig.body.children[1] as Container;
    if (def.mount === 'tank') { rider.scale.set(0.01); rider.visible = false; }
    if (def.mount === 'mech') { rider.visible = false; }
    if (def.mount === 'cannon') { rider.x = -26; rider.y = 0; }
  }
  rig.legs = [legsA, legsB];
  rig.stride = def.mount === 'dino' || def.mount === 'horse' ? 0.55 : def.mount === 'mech' ? 0.3 : 0;
  rig.spin = spin;
  rig.height = def.mount === 'dino' ? 74 : def.mount === 'horse' ? 70 : def.mount === 'tank' ? 58 : def.mount === 'mech' ? 96 : 50;
  rig.reach = def.length / 2;
  if (def.mount === 'mech' || def.mount === 'tank' || def.mount === 'cannon') rig.arm = null;
  // mount "arm" for recoil: use mount graphics itself
  if (rig.arm === null) rig.arm = m;
  return rig;
}

export function buildRig(def: UnitDef, mine: boolean): Rig {
  const team = mine ? TEAM.mine : TEAM.theirs;
  const rig = def.mount === 'none'
    ? (() => { const r = rigHuman(def, team, 0, def.look === 'super' ? 1.35 : 1); return r; })()
    : mount(def, team);
  rig.root.addChild(rig.body);
  return rig;
}

export function animateRig(rig: Rig, def: UnitDef, t: number, moving: boolean, atk: number, mode: number) {
  const w = moving ? Math.sin(t * 9) : 0;
  const [a, b] = rig.legs;
  if (a && b) { a.rotation = w * rig.stride; b.rotation = -w * rig.stride; }
  rig.body.y = moving ? -Math.abs(w) * (def.mount === 'none' ? 1.6 : 1.2) : 0;
  for (const s of rig.spin) s.rotation = t * 5;
  const arm = rig.arm;
  if (!arm) return;
  if (def.mount === 'none') {
    if (mode === 1) arm.rotation = -1.1 + Math.sin(atk * Math.PI) * 2.3; // swing
    else if (mode === 2) arm.rotation = -0.15 - Math.sin(atk * Math.PI) * 0.15;
    else arm.rotation = moving ? -0.25 + w * 0.2 : -0.3;
  } else {
    arm.x = mode ? -Math.sin(atk * Math.PI) * 4 : 0; // recoil / lunge
  }
}

// ───────────────────────── turrets ─────────────────────────
export function buildTurret(id: number, mine: boolean): { root: Container; barrel: Container } {
  const team = mine ? TEAM.mine : TEAM.theirs;
  const root = new Container();
  const base = new Graphics();
  const barrel = new Container();
  const bg = new Graphics();
  barrel.addChild(bg);
  root.addChild(base, barrel);
  const age = Math.floor(id / 3);
  const tier = id % 3;
  const wood = 0x7c4a1e, iron = 0x4b5563, steel = 0x94a3b8, glow = 0x22d3ee;
  switch (age) {
    case 0:
      rect(base, -10, -6, 20, 6, wood);
      if (tier === 0) { barrel.position.set(0, -12); line(bg, -6, 4, 8, -8, 2.4, wood); circ(bg, 8, -9, 3.4, 0x9ca3af); }
      else if (tier === 1) { barrel.position.set(0, -12); rect(bg, -4, -4, 16, 8, 0xd6c7a1); circ(bg, 12, 0, 3, 0xfacc15); }
      else { barrel.position.set(0, -10); line(bg, -10, 6, 10, -12, 3, wood); circ(bg, 11, -13, 4.4, 0x6b7280); circ(base, -4, -4, 5, 0x57534e); }
      break;
    case 1:
      rect(base, -11, -8, 22, 8, 0x57534e);
      if (tier === 2) { barrel.position.set(0, -14); rect(bg, -12, -3, 26, 7, 0x8b5a2b); poly(bg, [14, -2, 24, 0, 14, 2], steel); rect(bg, -12, -3, 6, 7, team); }
      else { barrel.position.set(0, -14); line(bg, -8, 5, 10, -10, 3, wood); circ(bg, 11, -11, 4.6, tier === 1 ? 0xf97316 : 0x6b7280); circ(base, -3, -3, 4, 0x57534e); }
      break;
    case 2:
      rect(base, -11, -7, 22, 7, 0x44403c); circ(base, -6, -2, 4, 0x78350f); circ(base, 6, -2, 4, 0x78350f);
      barrel.position.set(0, -14);
      rect(bg, -10, -4, 28, 8, tier === 0 ? 0x374151 : 0x292524); rect(bg, 18, -5, 4, 10, 0x1f2937); rect(bg, -10, -4, 5, 8, team);
      if (tier === 2) rect(bg, -2, -9, 10, 5, 0x57534e);
      break;
    case 3:
      rect(base, -12, -6, 24, 6, 0x3f3f46); rect(base, -4, -14, 8, 8, 0x52525b);
      barrel.position.set(0, -16);
      rect(bg, -8, -4, 30, 6, tier === 0 ? 0x27272a : 0x3f3f46); rect(bg, 22, -5, 6, 8, 0x111827);
      if (tier === 1) rect(bg, -8, 2, 26, 4, 0x27272a);
      if (tier === 2) { rect(bg, -4, -9, 14, 8, 0x52525b); poly(bg, [24, -2, 38, 0, 24, 2], 0xef4444); }
      rect(bg, -8, -4, 5, 6, team);
      break;
    default:
      circ(base, 0, -6, 9, 0x334155); rect(base, -12, -3, 24, 3, 0x1e293b);
      barrel.position.set(0, -14);
      rect(bg, -6, -4, 26, 7, 0x475569); rect(bg, 20, -3, 6, 5, tier === 1 ? 0xef4444 : tier === 2 ? 0x3b82f6 : glow);
      circ(bg, -2, 0, 3, team);
      break;
  }
  return { root, barrel };
}

// ───────────────────────── bases ─────────────────────────
/** Draws a base facing right. Local origin = ground level at the inner edge of the base. */
export function buildBase(age: number, mine: boolean): Container {
  const team = mine ? TEAM.mine : TEAM.theirs;
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  switch (age) {
    case 0: { // cave + hide tents
      poly(g, [-110, 0, -100, -50, -70, -92, -30, -104, 0, -84, 12, -40, 18, 0], 0x78716c);
      poly(g, [-70, -92, -30, -104, -22, -80, -60, -70], 0xa8a29e);
      g.ellipse(-44, -22, 28, 32).fill(0x1c1917);
      poly(g, [-96, 0, -80, -42, -62, 0], 0x92400e); poly(g, [-96, 0, -80, -42, -86, 0], 0xb45309);
      for (let i = 0; i < 3; i++) line(g, -70 - i * 10, -96 + i * 5, -64 - i * 10, -108 + i * 5, 3, 0xf5f5f4);
      line(g, 6, 0, 6, -128, 3, 0x7c4a1e); poly(g, [6, -128, 34, -120, 6, -108], team);
      break;
    }
    case 1: { // castle
      rect(g, -108, -70, 128, 70, 0x78716c);
      for (let i = 0; i < 6; i++) rect(g, -108 + i * 22, -82, 12, 12, 0x78716c);
      rect(g, -28, -128, 44, 128, 0x6b7280);
      for (let i = 0; i < 4; i++) rect(g, -28 + i * 12, -140, 8, 12, 0x6b7280);
      poly(g, [-24, -140, -6, -170, 12, -140], 0x7f1d1d);
      rect(g, -92, -31, 26, 31, 0x3f2a14); circ(g, -79, -31, 13, 0x3f2a14);
      for (const y of [-100, -70]) rect(g, -14, y, 8, 18, 0x111827);
      line(g, -6, -170, -6, -192, 2.4, 0x92400e); poly(g, [-6, -192, 20, -184, -6, -176], team);
      for (let r = 0; r < 4; r++) for (let q = 0; q < 6; q++) rect(g, -108 + q * 22 + (r % 2) * 9, -66 + r * 16, 18, 1.4, 0x57534e);
      break;
    }
    case 2: { // palace
      rect(g, -112, -58, 132, 58, 0xe7e5e4);
      rect(g, -96, -92, 100, 36, 0xd6d3d1);
      poly(g, [-112, -58, -46, -108, 20, -58], 0x9a3412);
      g.ellipse(-46, -112, 20, 22).fill(0xfbbf24);
      rect(g, -48, -138, 4, 20, 0xb45309);
      for (let i = 0; i < 5; i++) { rect(g, -102 + i * 26, -50, 10, 50, 0xf5f5f4); rect(g, -104 + i * 26, -52, 14, 4, 0xa8a29e); }
      rect(g, -58, -22, 24, 22, 0x44403c); circ(g, -46, -22, 12, 0x44403c);
      line(g, 12, 0, 12, -150, 2.6, 0x57534e); poly(g, [12, -150, 40, -142, 12, -134], team);
      break;
    }
    case 3: { // bunker + tower
      rect(g, -112, -42, 130, 42, 0x57534e);
      rect(g, -112, -48, 130, 8, 0x44403c);
      rect(g, -72, -112, 46, 70, 0x6b7280);
      rect(g, -80, -120, 62, 10, 0x374151);
      for (let i = 0; i < 4; i++) rect(g, -66 + i * 11, -98, 7, 12, 0x93c5fd);
      rect(g, -98, -30, 36, 18, 0x1f2937); rect(g, -6, -30, 22, 18, 0x1f2937);
      rect(g, -50, -150, 3, 32, 0x9ca3af); circ(g, -48.5, -152, 4, 0xef4444);
      rect(g, -112, 0, 134, 4, 0x292524);
      line(g, 12, -4, 12, -140, 2.6, 0x57534e); poly(g, [12, -140, 40, -132, 12, -124], team);
      break;
    }
    default: { // sci-fi dome
      g.ellipse(-46, 0, 74, 18).fill(0x1e293b);
      g.arc(-46, 0, 62, Math.PI, 0).fill({ color: 0x38bdf8, alpha: 0.35 }); 
      g.arc(-46, 0, 62, Math.PI, 0).stroke({ width: 3, color: 0x7dd3fc });
      rect(g, -76, -90, 14, 90, 0x475569); rect(g, 6, -110, 14, 110, 0x475569);
      circ(g, -69, -96, 8, 0x22d3ee); circ(g, 13, -116, 8, 0x22d3ee);
      rect(g, -58, -48, 24, 48, 0x334155); rect(g, -34, -64, 24, 64, 0x3f4d63);
      for (let i = 0; i < 5; i++) rect(g, -54 + i * 10, -40 - (i % 2) * 12, 6, 6, 0xa5f3fc);
      line(g, 12, -4, 12, -150, 2.6, 0x94a3b8); poly(g, [12, -150, 40, -142, 12, -134], team);
      break;
    }
  }
  return c;
}

/** The little ledge each turret stands on, stacked up the base. */
export function drawSlotLedge(g: Graphics, unlocked: boolean) {
  g.clear();
  g.roundRect(-14, 0, 28, 5, 2).fill({ color: unlocked ? 0x57534e : 0x292524, alpha: unlocked ? 1 : 0.55 });
  if (!unlocked) g.roundRect(-14, 0, 28, 5, 2).stroke({ width: 1, color: 0xfacc15, alpha: 0.6 });
}

// ───────────────────────── scenery ─────────────────────────
export interface Theme { sky: [string, string, string]; far: number; mid: number; ground: number; ground2: number; cloud: number; stars?: boolean }
export const THEMES: Theme[] = [
  { sky: ['#fcd9a0', '#f9b873', '#f6925a'], far: 0xc58a5e, mid: 0xa3693c, ground: 0x8a5a2b, ground2: 0x6b4423, cloud: 0xfff1d6 },
  { sky: ['#9bd3f2', '#bfe4f7', '#e8f6fd'], far: 0x7a9fb5, mid: 0x4e8a4a, ground: 0x4d7c3a, ground2: 0x3a5f2b, cloud: 0xffffff },
  { sky: ['#a7e6df', '#c9efe9', '#f1fbf8'], far: 0x8f9a97, mid: 0x5e7e5a, ground: 0x6f7d5a, ground2: 0x535f43, cloud: 0xffffff },
  { sky: ['#8a97a8', '#aab4c1', '#cfd6df'], far: 0x6b7482, mid: 0x4a5160, ground: 0x4b4b45, ground2: 0x34342f, cloud: 0xe5e7eb },
  { sky: ['#140b3a', '#2c1a6b', '#5b2a9a'], far: 0x2e2a63, mid: 0x1f1b49, ground: 0x2a3550, ground2: 0x1b2338, cloud: 0x6d5bd0, stars: true },
];

export function skyGradient(theme: Theme): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: theme.sky[0] },
      { offset: 0.65, color: theme.sky[1] },
      { offset: 1, color: theme.sky[2] },
    ],
  });
}
