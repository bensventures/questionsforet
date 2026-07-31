import type { Cell } from './types';
import { TYPES, DENSITY, DEFEND, isWooded } from './params';
import { clamp, idx, inb } from './util';

/**
 * Pure model functions — no canvas, no DOM, no global state. Everything the
 * fire and season logic needs is derived here so it can be unit-tested with a
 * seeded RNG.
 */

/** Moisture 0–1: lower slopes, shade, hydrological works and riparian raise it;
 *  aspect, over-thinning and drought lower it. */
export function moisture(c: Cell, drought: number): number {
  let m = 0.3;
  m += (1 - c.el) * 0.22; // cooler downslope
  m += c.can * 0.16; // shade
  m += c.wet * 0.34; // hydro works (permanent)
  if (c.t === 'ripi') m += 0.24;
  if (c.t === 'feuillu' || c.t === 'mixte') m += 0.06;
  m -= c.adret * 0.16;
  m -= c.ecl > 1 ? 0.1 : 0; // over-thinning dries out
  m -= drought * 0.52;
  return clamp(m, 0, 1);
}

/** Fuel load 0–1: type baseline blended with understorey, reduced by grazing
 *  and by a fading prescribed-burn effect. */
export function fuel(c: Cell): number {
  const T = TYPES[c.t];
  let f = T.fuel * 0.55 + c.sous * 0.45;
  if (c.graze > 0) f *= 0.55;
  if (c.pb > 0) f *= 0.6 + 0.05 * (8 - c.pb); // prescribed burn fades
  return clamp(f, 0.02, 1);
}

/** Probability-ish ignitability of a cell under the current drought. */
export function ignitability(c: Cell, drought: number): number {
  return TYPES[c.t].flam * (0.3 + 0.7 * fuel(c)) * (1 - moisture(c, drought) * 0.88);
}

/** Stem density normalised to 0–1 against the game ceiling. */
export function densityNorm(c: Cell): number {
  return clamp(c.density / DENSITY.gameMax, 0, 1);
}

/** Whether the stand still carries "managed" memory. */
export function isManaged(c: Cell): boolean {
  return c.managedFor > 0;
}

/** A stand dense past the threshold and no longer managed — the risk driver. */
export function isClosed(c: Cell): boolean {
  return isWooded(c.t) && c.density > DENSITY.threshold && !isManaged(c);
}

/**
 * Vertical continuity: how likely a surface fire climbs to the crown. Now
 * driven by canopy, understorey AND stem density — with a sharp penalty for
 * dense, unmanaged stands (Repeto-Deudero), which managing (thinning) removes.
 */
export function crownRisk(c: Cell): number {
  const penalty = c.density > DENSITY.threshold && !isManaged(c) ? 0.4 : 0;
  return c.can * (0.15 + 0.35 * c.sous + 0.45 * densityNorm(c) + penalty);
}

/**
 * Whether firefighters can hold the front for a building: gentle enough slope
 * and a treated (low-fuel) apron of the required depth all around. Steeper
 * ground needs a deeper apron; past the steep limit, no defence at all. This
 * gates the FRONT only — embers still get past (that is zone 0's job).
 */
export function defendable(grid: Cell[], c: Cell): boolean {
  if (c.t !== 'bati' || c.destroyed) return false;
  if (c.slope >= DEFEND.slopeSteep) return false;
  const need = c.slope >= DEFEND.slopeMod ? 2 : 1;
  for (let dy = -need; dy <= need; dy++) {
    for (let dx = -need; dx <= need; dx++) {
      if ((!dx && !dy) || !inb(c.x + dx, c.y + dy)) continue;
      const n = grid[idx(c.x + dx, c.y + dy)];
      if (n.t === 'bati' || n.t === 'rocher') continue;
      if (n.sous > DEFEND.clearSous) return false; // untreated understorey in the apron
    }
  }
  return true;
}

/** Share of wooded parcels that are dense and unmanaged, 0–100 ("paysage fermé"). */
export function closedShare(grid: Cell[]): number {
  let wooded = 0;
  let closed = 0;
  for (const c of grid) {
    if (!isWooded(c.t)) continue;
    wooded++;
    if (isClosed(c)) closed++;
  }
  return wooded ? Math.round((closed / wooded) * 100) : 0;
}

/** Mean stem density of the wooded massif (tiges/ha) — a slow variable. */
export function meanDensity(grid: Cell[]): number {
  let s = 0;
  let n = 0;
  for (const c of grid) if (isWooded(c.t)) { s += c.density; n++; }
  return n ? Math.round(s / n) : 0;
}

/** Share of wooded parcels currently under active management, 0–100. */
export function managedShare(grid: Cell[]): number {
  let wooded = 0;
  let managed = 0;
  for (const c of grid) if (isWooded(c.t)) { wooded++; if (isManaged(c)) managed++; }
  return wooded ? Math.round((managed / wooded) * 100) : 0;
}

/** Share of standing buildings that are hardened (zone 0), 0–100. */
export function hardenedShare(grid: Cell[]): number {
  let built = 0;
  let hard = 0;
  for (const c of grid) if (c.t === 'bati' && !c.destroyed) { built++; if (c.hard) hard++; }
  return built ? Math.round((hard / built) * 100) : 0;
}

/** Landscape biodiversity index, 0–100. */
export function biodiversity(grid: Cell[]): number {
  let s = 0;
  let n = 0;
  for (const c of grid) {
    if (c.t === 'bati') continue;
    let v = TYPES[c.t].bio;
    if (c.graze > 0) v += 6;
    if (c.disturb > 1) v -= 14;
    if (c.wet > 0) v += 8;
    if (c.burn > 0 && c.burn < 3) v -= 12;
    s += clamp(v, 0, 100);
    n++;
  }
  return Math.round(s / n);
}
