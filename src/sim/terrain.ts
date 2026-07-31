import type { Cell, GameState, ParcelType } from './types';
import type { Rng } from './rng';
import { W, H, TYPES } from './params';
import { idx, inb, clamp } from './util';
import { buildSectors } from './sectors';

/** Starting stem density by type — the Diois landscape starts largely closed
 *  and unmanaged (median well above the game threshold). */
function initDensity(t: import('./types').ParcelType, rng: Rng): number {
  if (t === 'pin') return rng.range(520, 860);
  if (t === 'feuillu') return rng.range(360, 560);
  if (t === 'mixte') return rng.range(300, 480);
  if (t === 'ripi') return rng.range(300, 500);
  return rng.range(80, 180);
}

/**
 * Generate relief (a few overlapping hills plus an east–west valley, the
 * Drôme), derive parcel types from elevation and aspect (adret vs ubac), then
 * drop a village and diffuse housing. Faithful port of the prototype's gen().
 */
export function generate(state: GameState, rng: Rng): void {
  const grid: Cell[] = [];

  const hills = [];
  for (let k = 0; k < 5; k++) {
    hills.push({ x: rng.range(2, W - 2), y: rng.range(1, H - 1), r: rng.range(6, 13), h: rng.range(0.5, 1) });
  }

  const elev: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let e = 0;
      for (const hl of hills) {
        const d = Math.hypot(x - hl.x, y - hl.y);
        e += hl.h * Math.exp(-(d * d) / (2 * hl.r * hl.r));
      }
      // Main east–west valley in the middle.
      e -= 0.55 * Math.exp(-Math.pow(y - (H * 0.62 + 2.2 * Math.sin(x / 5)), 2) / 9);
      elev[idx(x, y)] = e;
    }
  }
  const mn = Math.min(...elev);
  const mx = Math.max(...elev);
  for (let i = 0; i < elev.length; i++) elev[i] = (elev[i] - mn) / (mx - mn);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const el = elev[idx(x, y)];
      const dzy = elev[idx(x, Math.min(H - 1, y + 1))] - elev[idx(x, Math.max(0, y - 1))];
      const dzx = elev[idx(Math.min(W - 1, x + 1), y)] - elev[idx(Math.max(0, x - 1), y)];
      const slope = Math.hypot(dzx, dzy);
      const adret = clamp(-dzy * 3.2, 0, 1); // south-facing slope
      let t: ParcelType;
      if (el < 0.2) t = rng.chance(0.62) ? 'ripi' : 'pelouse';
      else if (el > 0.8) t = rng.chance(0.55) ? 'rocher' : 'pelouse';
      else if (adret > 0.3) t = rng.chance(0.62) ? 'pin' : 'garrigue';
      else t = rng.chance(0.6) ? 'feuillu' : 'mixte';

      const species =
        t === 'pin' ? (el < 0.42 && adret > 0.5 && rng.chance(0.35) ? 'alep' : 'noir') : undefined;
      grid.push({
        x, y, el, slope, adret, t,
        sous: rng.range(0.35, 0.8), can: TYPES[t].can,
        density: initDensity(t, rng), managedFor: 0,
        species, age: TYPES[t].can >= 0.3 ? rng.range(8, 34) : 0,
        wet: 0, graze: 0, grazeOn: false, hard: false, burn: 0, disturb: 0,
        ecl: 0, pb: 0, plant: null, plantT: 0, fs: 0, ft: 0, crown: false, shade: 0.5,
        sector: -1, // stamped by buildSectors() once the village is placed
        everBurnt: false,
      });
    }
  }

  state.grid = grid;

  // Schedule the guaranteed great fire (brief §6): it WILL come, at a
  // stochastic date in the back half of the game. What the player changes is
  // not whether it happens, but what is left afterwards.
  state.bigFireYear = Math.round(rng.range(0.45, 0.85) * state.maxYears);
  state.bigFireDone = false;

  computeShade(grid);

  // Normalise slope to 0–1 so defendability thresholds are map-independent.
  let maxSlope = 0;
  for (const c of grid) if (c.slope > maxSlope) maxSlope = c.slope;
  if (maxSlope > 0) for (const c of grid) c.slope /= maxSlope;

  // Continuous riparian strip along the valley floor.
  for (let i = 0; i < grid.length; i++) if (grid[i].el < 0.14 && rng.chance(0.6)) grid[i].t = 'ripi';

  // Village + diffuse housing. Settlements sit on gentle ground (as in reality),
  // so the built area is defendable in principle: the player's job is to make it
  // so, not to fight impossible terrain. The core anchors on the flattest low
  // spot; diffuse housing prefers gentle slopes.
  let vx = W >> 1;
  let vy = 0;
  let bestScore = Infinity;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 6; x < W - 6; x++) {
      const c = grid[idx(x, y)];
      const score = c.el + c.slope * 1.5; // low and flat
      if (score < bestScore) { bestScore = score; vx = x; vy = y; }
    }
  }
  let placed = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (inb(vx + dx, vy + dy) && rng.chance(0.8)) { setBati(grid[idx(vx + dx, vy + dy)], rng); placed++; }
    }
  }
  let tries = 0;
  while (placed < 20 && tries < 600) {
    tries++;
    const c = grid[rng.int(grid.length)];
    // Prefer gentle, low ground; steep cells are rarely built on.
    if (c.t !== 'bati' && c.el < 0.6 && c.slope < 0.45 && rng.chance(0.5)) { setBati(c, rng); placed++; }
  }
  // If terrain is unusually steep, top up wherever it is buildable at all.
  while (placed < 16 && tries < 1200) {
    tries++;
    const c = grid[rng.int(grid.length)];
    if (c.t !== 'bati' && c.el < 0.68 && c.slope < 0.6 && rng.chance(0.5)) { setBati(c, rng); placed++; }
  }

  // Sector découpage (amendment §3.2), last: crowns are drawn around the
  // buildings, so it needs the settlement in place. Fixed for the whole game.
  state.sectors = buildSectors(grid);
}

/**
 * Precompute a hillshade per cell: the elevation gradient lit from the
 * north-west. Values around 0.5 are flat; higher = sunlit slope, lower =
 * shaded slope. This is what makes relief (and therefore the talwegs where
 * hydro works belong) legible on the map.
 */
function computeShade(grid: Cell[]): void {
  // Light direction (north-west, slightly overhead), normalised.
  const lx = -0.6;
  const ly = -0.6;
  const lz = 0.53;
  const zScale = 6; // vertical exaggeration
  for (const c of grid) {
    const w = grid[idx(Math.max(0, c.x - 1), c.y)].el;
    const e = grid[idx(Math.min(W - 1, c.x + 1), c.y)].el;
    const n = grid[idx(c.x, Math.max(0, c.y - 1))].el;
    const s = grid[idx(c.x, Math.min(H - 1, c.y + 1))].el;
    const dzx = (e - w) * zScale;
    const dzy = (s - n) * zScale;
    // Surface normal (-dzx, -dzy, 1), normalised, dotted with the light.
    const len = Math.hypot(dzx, dzy, 1);
    const dot = (-dzx * lx + -dzy * ly + 1 * lz) / len;
    c.shade = clamp(0.5 + dot * 0.85, 0.05, 1);
  }
}

function setBati(c: Cell, rng: Rng): void {
  c.t = 'bati';
  c.sous = 0.5;
  c.can = 0;
  c.hab = Math.floor(rng.range(2, 6));
}
