import type { Cell } from './types';
import { W, H, isWooded } from './params';
import { idx, inb } from './util';
import { isClosed, isManaged } from './model';

/**
 * Sector découpage (amendment §3.2).
 *
 * Policies are never global switches: each one applies to a designated zone.
 * The map is therefore cut once, at generation time, into a dozen legible
 * sectors (hamlet crowns, adret and ubac slopes, valley floors, massif cores),
 * so the player keeps reasoning spatially — the nested zoning is the whole
 * conceptual point of the dossier — but at a grain of a few zones instead of
 * several hundred cells.
 *
 * The découpage is administrative and fixed for the whole game: buildings burn,
 * stands convert, but the sector a decision applies to does not move.
 *
 * Pure module: no canvas, no DOM. `buildSectors` is deterministic given a grid.
 */

export type SectorKind = 'couronne' | 'vallon' | 'adret' | 'ubac' | 'massif';

export interface SectorKindInfo {
  /** Generic label, used when a kind has a single sector. */
  label: string;
  /** Overlay tint, as an "r,g,b" triplet (alpha applied at draw time). */
  col: string;
}

export const SECTOR_KINDS: Record<SectorKind, SectorKindInfo> = {
  couronne: { label: 'Couronne bâtie', col: '176,67,28' },
  vallon: { label: 'Fond de vallon', col: '47,125,120' },
  adret: { label: "Versant d'adret", col: '186,146,54' },
  ubac: { label: "Versant d'ubac", col: '58,104,64' },
  massif: { label: 'Cœur de massif', col: '124,116,98' },
};

export interface Sector {
  /** Index in the returned array; also what `Cell.sector` stores. */
  id: number;
  kind: SectorKind;
  name: string;
  /** Grid indices belonging to this sector. */
  cells: number[];
  /** Best cell to hang a label on (deepest inside the sector, not the centroid,
   *  which can fall outside a concave shape). */
  ax: number;
  ay: number;
}

/**
 * Découpage tuning. `maxCouronnes` is deliberate: only the largest built
 * clusters earn a crown sector of their own. Isolated houses fall inside the
 * surrounding slope sector, which is exactly the problem mitage poses to a
 * commune — no hamlet-scale policy covers them.
 *
 * `maxCells` matters as much as the count: terrain alone yields components
 * covering half the map, and a policy perimeter that size would hand the player
 * "treat the whole massif" in a single decision (garde-fou §7). Anything above
 * the ceiling is bisected. `maxSectors` is a soft cap, only honoured when a
 * merge exists that respects the ceiling.
 */
export const SECTORS = {
  crownRadius: 2, // cells around a building that belong to its crown
  maxCouronnes: 3,
  minCells: 12, // below this a component is absorbed by a neighbour
  maxCells: 120, // above this a sector is split (~18% of the map)
  maxSectors: 14,
};

const NB4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Connected components (8-connectivity) of an arbitrary subset of cells. */
function components(grid: Cell[], cells: number[]): number[][] {
  const set = new Set(cells);
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const start of cells) {
    if (seen.has(start)) continue;
    const group: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const j = stack.pop()!;
      group.push(j);
      const c = grid[j];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!inb(c.x + dx, c.y + dy)) continue;
          const m = idx(c.x + dx, c.y + dy);
          if (set.has(m) && !seen.has(m)) { seen.add(m); stack.push(m); }
        }
      }
    }
    out.push(group);
  }
  return out;
}

/**
 * Bisect a sector across its longer axis, at the median, then re-cut each half
 * into connected pieces — a concave shape can fall apart, and every piece must
 * stay of one tenant to be a usable perimeter. Returns the original if the cut
 * does not separate anything.
 */
function bisect(grid: Cell[], cells: number[]): number[][] {
  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  for (const j of cells) {
    const c = grid[j];
    if (c.x < minx) minx = c.x;
    if (c.x > maxx) maxx = c.x;
    if (c.y < miny) miny = c.y;
    if (c.y > maxy) maxy = c.y;
  }
  const horizontal = maxx - minx >= maxy - miny;
  const coord = (j: number) => (horizontal ? grid[j].x : grid[j].y);
  const sorted = [...cells].sort((a, b) => coord(a) - coord(b));
  const med = coord(sorted[sorted.length >> 1]);
  const a = cells.filter((j) => coord(j) < med);
  const b = cells.filter((j) => coord(j) >= med);
  if (!a.length || !b.length) return [cells];
  return [...components(grid, a), ...components(grid, b)];
}

/** Terrain domain of a cell, before components are cut and merged. */
function domainOf(c: Cell, nearBati: boolean): SectorKind {
  if (nearBati) return 'couronne';
  if (c.el < 0.22) return 'vallon';
  if (c.el > 0.66) return 'massif';
  if (c.adret > 0.3) return 'adret';
  return 'ubac';
}

/**
 * Cut the grid into sectors and stamp `cell.sector`. Returns the sectors,
 * indexed by id.
 */
export function buildSectors(grid: Cell[]): Sector[] {
  const n = grid.length;

  // 1. Domain per cell. Crowns first: they override the terrain classification.
  const nearBati = new Uint8Array(n);
  for (const c of grid) {
    if (c.t !== 'bati') continue;
    const r = SECTORS.crownRadius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (inb(c.x + dx, c.y + dy)) nearBati[idx(c.x + dx, c.y + dy)] = 1;
      }
    }
  }
  const domain: SectorKind[] = new Array(n);
  for (let i = 0; i < n; i++) domain[i] = domainOf(grid[i], nearBati[i] === 1);

  // 2. Connected components of each domain (8-connectivity, so diagonal
  //    slivers stay attached rather than becoming their own scraps).
  const owner = new Int32Array(n).fill(-1);
  const parts = new Map<number, { kind: SectorKind; cells: number[] }>();
  let nextId = 0;
  for (let i = 0; i < n; i++) {
    if (owner[i] >= 0) continue;
    const kind = domain[i];
    const id = nextId++;
    const cells: number[] = [];
    const stack = [i];
    owner[i] = id;
    while (stack.length) {
      const j = stack.pop()!;
      cells.push(j);
      const c = grid[j];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!inb(c.x + dx, c.y + dy)) continue;
          const m = idx(c.x + dx, c.y + dy);
          if (owner[m] < 0 && domain[m] === kind) {
            owner[m] = id;
            stack.push(m);
          }
        }
      }
    }
    parts.set(id, { kind, cells });
  }

  // --- merge helpers -------------------------------------------------------
  /** Shared border length (in cell edges) with each neighbouring part. */
  const borders = (id: number): Map<number, number> => {
    const m = new Map<number, number>();
    for (const j of parts.get(id)!.cells) {
      const c = grid[j];
      for (const [dx, dy] of NB4) {
        if (!inb(c.x + dx, c.y + dy)) continue;
        const o = owner[idx(c.x + dx, c.y + dy)];
        if (o === id) continue;
        m.set(o, (m.get(o) ?? 0) + 1);
      }
    }
    return m;
  };

  /**
   * Best neighbour to merge into. Priority: one that keeps the result under the
   * size ceiling, then one of the same kind, then the longest shared border.
   */
  const pickTarget = (id: number, allowCouronne: boolean, requireFit = false): number => {
    const me = parts.get(id)!;
    let best = -1;
    let bestScore = -1;
    for (const [o, len] of borders(id)) {
      const p = parts.get(o);
      if (!p) continue;
      if (p.kind === 'couronne' && !allowCouronne) continue;
      const fits = p.cells.length + me.cells.length <= SECTORS.maxCells;
      if (requireFit && !fits) continue;
      const score = len + (p.kind === me.kind ? 1000 : 0) + (fits ? 5000 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  };

  const mergeInto = (from: number, to: number): void => {
    const a = parts.get(to)!;
    const b = parts.get(from)!;
    for (const j of b.cells) owner[j] = to;
    a.cells.push(...b.cells);
    parts.delete(from);
  };

  // 3. Split oversized parts. Relief hands us components covering half the map;
  //    left whole they would let one decision treat the entire massif.
  for (let guard = 0; guard < 200; guard++) {
    let big = -1;
    for (const [id, p] of parts) {
      if (p.cells.length > SECTORS.maxCells) { big = id; break; }
    }
    if (big < 0) break;
    const p = parts.get(big)!;
    const pieces = bisect(grid, p.cells);
    if (pieces.length < 2) break; // indivisible: leave it rather than spin
    parts.delete(big);
    for (const piece of pieces) {
      const id = nextId++;
      for (const j of piece) owner[j] = id;
      parts.set(id, { kind: p.kind, cells: piece });
    }
  }

  // 3a. Demote surplus crowns: keep the largest few, hand the rest back to the
  //     terrain around them (the mitage that no hamlet policy will cover).
  const couronnes = [...parts.entries()]
    .filter(([, p]) => p.kind === 'couronne')
    .sort((a, b) => b[1].cells.length - a[1].cells.length);
  for (const [id] of couronnes.slice(SECTORS.maxCouronnes)) {
    const t = pickTarget(id, false);
    if (t >= 0) mergeInto(id, t);
  }

  // 3b. Absorb scraps too small to be a meaningful policy perimeter.
  for (let guard = 0; guard < 1000; guard++) {
    let small = -1;
    let smallest = SECTORS.minCells;
    for (const [id, p] of parts) {
      if (p.cells.length < smallest) {
        smallest = p.cells.length;
        small = id;
      }
    }
    if (small < 0) break;
    const t = pickTarget(small, true);
    if (t < 0) break;
    mergeInto(small, t);
  }

  // 3c. Soft cap on the count, sparing the crowns (they are the point of the
  //     zoning) and never above the size ceiling: merging the two smallest
  //     zones into an unusable perimeter would defeat the split above. If no
  //     legal merge is left, keep the extra sector.
  for (let guard = 0; guard < 1000 && parts.size > SECTORS.maxSectors; guard++) {
    const pool = [...parts.entries()]
      .filter(([, p]) => p.kind !== 'couronne')
      .sort((a, b) => a[1].cells.length - b[1].cells.length);
    let merged = false;
    for (const [id] of pool) {
      const t = pickTarget(id, false, true);
      if (t < 0) continue;
      mergeInto(id, t);
      merged = true;
      break;
    }
    if (!merged) break;
  }

  // 4. Re-index sequentially, name, and stamp the cells.
  const ordered = [...parts.entries()].sort((a, b) => b[1].cells.length - a[1].cells.length);
  const sectors: Sector[] = ordered.map(([, p], i) => {
    const anchor = anchorOf(grid, p.cells);
    return { id: i, kind: p.kind, name: '', cells: p.cells, ax: anchor.x, ay: anchor.y };
  });
  for (const s of sectors) for (const j of s.cells) grid[j].sector = s.id;
  nameSectors(grid, sectors);
  return sectors;
}

/**
 * Deepest cell of a sector, by multi-source BFS inward from its edge. Used as
 * the label anchor: a centroid can land outside a concave sector, this cannot.
 */
function anchorOf(grid: Cell[], cells: number[]): { x: number; y: number } {
  const inSet = new Set(cells);
  const dist = new Map<number, number>();
  const queue: number[] = [];
  for (const j of cells) {
    const c = grid[j];
    for (const [dx, dy] of NB4) {
      if (!inb(c.x + dx, c.y + dy) || !inSet.has(idx(c.x + dx, c.y + dy))) {
        dist.set(j, 0);
        queue.push(j);
        break;
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const j = queue[head];
    const c = grid[j];
    const d = dist.get(j)!;
    for (const [dx, dy] of NB4) {
      if (!inb(c.x + dx, c.y + dy)) continue;
      const m = idx(c.x + dx, c.y + dy);
      if (!inSet.has(m) || dist.has(m)) continue;
      dist.set(m, d + 1);
      queue.push(m);
    }
  }
  let best = cells[0];
  let bd = -1;
  for (const j of cells) {
    const d = dist.get(j) ?? 0;
    if (d > bd) {
      bd = d;
      best = j;
    }
  }
  return { x: grid[best].x, y: grid[best].y };
}

/** Rough compass position of a point on the map. */
function compass(x: number, y: number): string {
  const nx = (x / (W - 1)) * 2 - 1;
  const ny = (y / (H - 1)) * 2 - 1;
  const ew = nx > 0.3 ? 'est' : nx < -0.3 ? 'ouest' : '';
  const ns = ny > 0.3 ? 'sud' : ny < -0.3 ? 'nord' : '';
  if (ns && ew) return `${ns}-${ew}`;
  return ns || ew || 'central';
}

function meanEl(grid: Cell[], cells: number[]): number {
  let s = 0;
  for (const j of cells) s += grid[j].el;
  return s / cells.length;
}

/** Height qualifiers used to separate sectors that collide on kind + compass. */
const TIERS: Record<number, string[]> = {
  2: ['haut', 'bas'],
  3: ['haut', 'médian', 'bas'],
};

/**
 * Name each sector. A kind with a single sector keeps its plain label; when
 * several share a kind they are qualified by compass position. Sectors that
 * still collide are separated by height — and all the members of a colliding
 * group get the qualifier, so they read as peers rather than as one sector and
 * its subdivision.
 */
function nameSectors(grid: Cell[], sectors: Sector[]): void {
  const count: Record<string, number> = {};
  for (const s of sectors) count[s.kind] = (count[s.kind] ?? 0) + 1;

  // The largest crown is the village; the others are hamlets.
  let villageDone = false;
  const draft = new Map<number, string>();
  for (const s of sectors) {
    if (s.kind === 'couronne') {
      if (!villageDone) {
        villageDone = true;
        draft.set(s.id, 'Couronne du village');
      } else {
        draft.set(s.id, `Couronne du hameau ${compass(s.ax, s.ay)}`);
      }
    } else {
      const base = SECTOR_KINDS[s.kind].label;
      draft.set(s.id, count[s.kind] > 1 ? `${base} ${compass(s.ax, s.ay)}` : base);
    }
  }

  const groups = new Map<string, Sector[]>();
  for (const s of sectors) {
    const k = draft.get(s.id)!;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }

  const used = new Set<string>();
  for (const [base, members] of groups) {
    if (members.length === 1) {
      members[0].name = base;
      used.add(base);
      continue;
    }
    const tiers = TIERS[members.length];
    const byHeight = [...members].sort((a, b) => meanEl(grid, b.cells) - meanEl(grid, a.cells));
    byHeight.forEach((s, i) => {
      let name = tiers ? `${base}, ${tiers[i]}` : `${base} ${i + 1}`;
      for (let k = 2; used.has(name); k++) name = `${base} ${i + 1}·${k}`;
      used.add(name);
      s.name = name;
    });
  }
}

export interface SectorStats {
  cells: number;
  wooded: number;
  /** Mean stem density of the wooded cells, tiges/ha. */
  meanDensity: number;
  /** Share of wooded cells dense and unmanaged, 0–100. */
  closedPct: number;
  /** Share of wooded cells under active management, 0–100. */
  managedPct: number;
  bati: number;
  batiOk: number;
  batiHard: number;
  grazed: number;
  /** Mean understorey load, 0–100. */
  sousPct: number;
  /** Share of the sector currently burnt ground, 0–100. */
  burntPct: number;
}

/** Aggregate a sector's state — what a policy decision will be judged on. */
export function sectorStats(grid: Cell[], s: Sector): SectorStats {
  let wooded = 0;
  let dens = 0;
  let closed = 0;
  let managed = 0;
  let bati = 0;
  let batiOk = 0;
  let batiHard = 0;
  let grazed = 0;
  let sous = 0;
  let burnt = 0;
  for (const j of s.cells) {
    const c = grid[j];
    if (isWooded(c.t)) {
      wooded++;
      dens += c.density;
      if (isClosed(c)) closed++;
      if (isManaged(c)) managed++;
    }
    if (c.t === 'bati') {
      bati++;
      if (!c.destroyed) {
        batiOk++;
        if (c.hard) batiHard++;
      }
    }
    if (c.graze > 0) grazed++;
    if (c.t === 'brule') burnt++;
    sous += c.sous;
  }
  const pct = (v: number, d: number) => (d ? Math.round((v / d) * 100) : 0);
  return {
    cells: s.cells.length,
    wooded,
    meanDensity: wooded ? Math.round(dens / wooded) : 0,
    closedPct: pct(closed, wooded),
    managedPct: pct(managed, wooded),
    bati,
    batiOk,
    batiHard,
    grazed,
    sousPct: pct(sous, s.cells.length),
    burntPct: pct(burnt, s.cells.length),
  };
}