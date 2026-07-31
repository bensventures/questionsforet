import type { Cell, GameState } from './types';
import type { Rng } from './rng';
import { TYPES, REGEN, DENSITY, isWooded } from './params';
import { idx, inb, clamp } from './util';
import { ignitability, moisture, crownRisk, defendable, isManaged } from './model';

/** Individual survival of a surface fire, rising with stand age (bark). A crown
 *  fire is handled by the caller and never survives. */
function survivesSurfaceFire(c: Cell, rng: Rng): boolean {
  const p = clamp((c.age - REGEN.youngAge * 0.6) / 26, 0, REGEN.survivalMax);
  return rng.chance(p);
}

/** A firebrand in flight, in grid coordinates (rendering interpolates). */
export interface Ember {
  gx0: number;
  gy0: number;
  gx1: number;
  gy1: number;
  t: number;
  tx: number;
  ty: number;
}

export interface FireRun {
  embers: Ember[];
  burnedThis: number;
  structHit: number;
  spots: number;
  emberBuiltHit: number; // embers landing on a building
  emberBuiltIgn: number; // embers that ignited a building
  emberHeldHard: number; // embers landing on a hardened building without igniting it
  frontBuiltIgn: number; // buildings taken by the front (undefendable)
  crownCells: number; // cells that burned as crown fire (severity)
  // --- attribution for the after-fire report (amendment §2.2) ---
  closedSevere: number; // crown cells that were dense & unmanaged (closure-driven severity)
  pinNoirLost: number; // pin noir stands killed by crown fire (won't return)
  grazeFailed: number; // grazed cells that burned (a break that had lapsed)
  escaped: boolean;
}

export function newFireRun(escaped: boolean): FireRun {
  return {
    embers: [], burnedThis: 0, structHit: 0, spots: 0,
    emberBuiltHit: 0, emberBuiltIgn: 0, emberHeldHard: 0, frontBuiltIgn: 0, crownCells: 0,
    closedSevere: 0, pinNoirLost: 0, grazeFailed: 0, escaped,
  };
}

/**
 * One tick of fire behaviour. Mutates the grid and the run, and returns whether
 * the fire is still active. No rendering here — the UI loop calls this and then
 * draws the current state and the embers in flight.
 */
export function stepFire(state: GameState, run: FireRun, rng: Rng): boolean {
  const { grid, drought } = state;
  const wd = state.wind ?? { a: rng.range(0, 6.28), s: 0.6 };
  const wx = Math.cos(wd.a);
  const wy = Math.sin(wd.a);

  // Advance and land airborne embers.
  for (let e = run.embers.length - 1; e >= 0; e--) {
    run.embers[e].t += 0.12;
    if (run.embers[e].t >= 1) {
      landEmber(state, run, run.embers[e], rng);
      run.embers.splice(e, 1);
    }
  }

  for (const c of grid) {
    if (c.fs === 1) {
      c.fs = 2;
      c.ft = TYPES[c.t].speed;
      c.crown = crownRisk(c) > 0.42 && drought > 0.35;
      if (c.t !== 'bati' && c.t !== 'brule') {
        run.burnedThis++;
        state.burnedCum++;
        if (!c.everBurnt) { c.everBurnt = true; state.burnedEver++; }
        if (c.crown) run.crownCells++;
      }
      // Ember projection — the mechanic that defeats any perimeter (brief §4).
      // Most embers travel a short-to-medium distance in the wind; a tail of
      // long throws crosses the whole map, so no cleared ring protects the
      // village. Landing probability then depends on the receiving cell, and
      // for buildings only on their hardening (zone 0).
      const pE = (c.crown ? 0.36 : 0.11) * (0.5 + wd.s);
      if (rng.chance(pE)) {
        const longThrow = rng.chance(0.28); // the >10 km spotting tail
        const base = c.crown ? rng.range(4, 16) : rng.range(2, 8);
        const dist = (longThrow ? base * rng.range(1.8, 3.4) : base) * (0.6 + wd.s);
        const jitter = longThrow ? 4 : 2;
        const tx = Math.round(c.x + wx * dist + rng.range(-jitter, jitter));
        const ty = Math.round(c.y + wy * dist + rng.range(-jitter, jitter));
        if (inb(tx, ty)) {
          run.embers.push({ gx0: c.x, gy0: c.y, gx1: tx, gy1: ty, t: 0, tx, ty });
          run.spots++;
        }
      }
    } else if (c.fs === 2) {
      c.ft--;
      if (c.ft <= 0) {
        c.fs = 3;
        if (c.t === 'bati') {
          if (!c.destroyed) { c.destroyed = true; state.lost++; run.structHit++; }
        } else if (isWooded(c.t) && !c.crown && survivesSurfaceFire(c, rng)) {
          // Old stand survives a surface fire: it is thinned, not killed. The
          // fire did management's work — density drops and the stand carries
          // "managed" memory a while, lowering its crown risk. This is the
          // virtuous cycle that suppression removes (the paradox).
          c.sous = 0.06;
          c.density = Math.max(180, c.density * 0.55);
          c.managedFor = Math.max(c.managedFor, 4);
          c.burn = 0;
        } else {
          // Attribute the outcome before the cell loses its identity.
          if (c.crown && isWooded(c.t)) {
            if (c.density > DENSITY.threshold && !isManaged(c)) run.closedSevere++;
            if (c.t === 'pin' && c.species === 'noir') run.pinNoirLost++;
          }
          if (c.graze > 0) run.grazeFailed++;
          c.wasT = c.t;
          c.wasSpecies = c.species;
          c.t = 'brule';
          c.burn = 1;
          c.sous = 0.05;
          c.can = 0;
          c.graze = 0;
          c.plant = null;
        }
      } else {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (!inb(c.x + dx, c.y + dy)) continue;
            const n = grid[idx(c.x + dx, c.y + dy)];
            if (n.fs !== 0) continue;
            const align = (dx * wx + dy * wy) / Math.hypot(dx, dy);
            const windF = 1 + align * wd.s * 1.5;
            const slopeF = 1 + clamp((n.el - c.el) * 9, -0.5, 1.4); // fire climbs
            let p = 0.42 * ignitability(n, drought) * Math.max(0.05, windF) * slopeF;
            if (n.t === 'bati') {
              if (defendable(grid, n)) continue; // crews hold the front; only embers threaten
              p = 0.55 * (1 - moisture(n, drought) * 0.5);
              if (n.hard) p *= 0.35;
              if (n.sous < 0.15) p *= 0.35; // cleared zone 0
            }
            if (rng.chance(p)) {
              n.fs = 1;
              if (n.t === 'bati') run.frontBuiltIgn++;
            }
          }
        }
      }
    }
  }

  return run.embers.length > 0 || grid.some((c) => c.fs === 1 || c.fs === 2);
}

function landEmber(state: GameState, run: FireRun, e: Ember, rng: Rng): void {
  const n = state.grid[idx(e.tx, e.ty)];
  if (n.fs !== 0) return;
  if (n.t === 'bati') {
    if (n.destroyed) return;
    run.emberBuiltHit++;
    // Only hardening (zone 0) protects against embers: neither the perimeter
    // nor cleared surroundings help once a firebrand lands on the roof.
    const p = n.hard ? 0.72 * 0.2 : 0.72;
    if (rng.chance(p)) { n.fs = 1; run.emberBuiltIgn++; }
    else if (n.hard) run.emberHeldHard++;
    return;
  }
  if (rng.chance(ignitability(n, state.drought) * 0.8)) n.fs = 1;
}
