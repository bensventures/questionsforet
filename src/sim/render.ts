import type { Cell, GameState, ParcelType, ToolId } from './types';
import type { Ember } from './fire';
import { W, H, CELL, TYPES, FIRE, isWooded } from './params';
import { moisture, densityNorm, isClosed } from './model';
import { isValidTarget } from './tools';
import { SECTOR_KINDS } from './sectors';
import { idx, inb } from './util';

export interface DrawOpts {
  hover: { x: number; y: number } | null;
  embers: Ember[];
  busy: boolean;
  tool: ToolId | null;
  /** Sector view: tint each zone by kind and label it (amendment §3.2). */
  sectorView: boolean;
  /** Sector under the cursor, or -1. */
  hoverSector: number;
  /** Sectors a designated policy could be applied to (empty if none armed). */
  eligibleSectors: number[];
}

export function resizeCanvas(cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = W * CELL;
  const h = H * CELL;
  cv.width = w * dpr;
  cv.height = h * dpr;
  cv.style.aspectRatio = `${w}/${h}`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---- texture ink ----
const TEX: Record<string, string> = {
  conifer: 'rgba(28,42,20,0.82)',
  broadleaf: 'rgba(46,74,32,0.7)',
  shrub: 'rgba(90,80,38,0.7)',
  grass: 'rgba(120,104,44,0.7)',
  dryGrass: 'rgba(150,120,30,0.85)',
  water: 'rgba(30,96,102,0.85)',
  rock: 'rgba(110,102,84,0.85)',
  char: 'rgba(26,22,17,0.75)',
};

/** Deterministic jitter in [-1,1] from cell coordinates. */
function jit(x: number, y: number, salt: number): number {
  let n = (x * 73856093) ^ (y * 19349663) ^ (salt * 83492791);
  n = (n ^ (n >>> 13)) >>> 0;
  return (n / 4294967296) * 2 - 1;
}

function conifer(ctx: CanvasRenderingContext2D, x: number, y: number, hgt: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - hgt);
  ctx.lineTo(x - hgt * 0.55, y);
  ctx.lineTo(x + hgt * 0.55, y);
  ctx.closePath();
  ctx.fill();
}
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.fill();
}
function blade(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, wave: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + wave, y - len * 0.55, x + wave * 0.4, y - len);
  ctx.stroke();
}

/**
 * Paint the per-type motif. `s` is the cell size; `jx`/`jy` add organic jitter
 * on the map (pass 0 for the flat legend swatch).
 */
function paintTexture(ctx: CanvasRenderingContext2D, t: ParcelType, px: number, py: number, s: number, jx: number, jy: number): void {
  const X = (fx: number) => px + fx * s + jx;
  const Y = (fy: number) => py + fy * s + jy;

  switch (t) {
    case 'pin': {
      ctx.fillStyle = TEX.conifer;
      const h = s * 0.3;
      conifer(ctx, X(0.32), Y(0.55), h);
      conifer(ctx, X(0.62), Y(0.64), h);
      conifer(ctx, X(0.46), Y(0.84), h);
      break;
    }
    case 'feuillu': {
      ctx.fillStyle = TEX.broadleaf;
      const r = s * 0.15;
      blob(ctx, X(0.34), Y(0.5), r);
      blob(ctx, X(0.64), Y(0.56), r);
      blob(ctx, X(0.48), Y(0.76), r);
      break;
    }
    case 'mixte': {
      ctx.fillStyle = TEX.conifer;
      conifer(ctx, X(0.34), Y(0.66), s * 0.28);
      ctx.fillStyle = TEX.broadleaf;
      blob(ctx, X(0.64), Y(0.5), s * 0.15);
      blob(ctx, X(0.55), Y(0.8), s * 0.13);
      break;
    }
    case 'garrigue': {
      ctx.fillStyle = TEX.shrub;
      for (let i = 0; i < 5; i++) {
        blob(ctx, X(0.2 + 0.15 * i), Y(0.5 + 0.18 * jit(px + i, py, i)), s * 0.045);
      }
      ctx.strokeStyle = TEX.shrub;
      ctx.lineWidth = 1;
      blade(ctx, X(0.35), Y(0.8), s * 0.2, 1);
      blade(ctx, X(0.66), Y(0.82), s * 0.2, -1);
      break;
    }
    case 'pelouse': {
      ctx.strokeStyle = TEX.grass;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) blade(ctx, X(0.28 + 0.16 * i), Y(0.82), s * 0.24, jit(px, py + i, i) * 1.5);
      break;
    }
    case 'friche': {
      ctx.strokeStyle = TEX.dryGrass;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) blade(ctx, X(0.16 + 0.11 * i), Y(0.88), s * 0.42, jit(px, py + i, i) * 2.4);
      break;
    }
    case 'ripi': {
      ctx.strokeStyle = TEX.water;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px + s * 0.12, py + s * 0.62);
      ctx.quadraticCurveTo(px + s * 0.35, py + s * 0.5, px + s * 0.55, py + s * 0.62);
      ctx.quadraticCurveTo(px + s * 0.75, py + s * 0.74, px + s * 0.9, py + s * 0.6);
      ctx.stroke();
      ctx.fillStyle = TEX.broadleaf;
      blob(ctx, X(0.32), Y(0.34), s * 0.11);
      blob(ctx, X(0.66), Y(0.3), s * 0.1);
      break;
    }
    case 'rocher': {
      ctx.fillStyle = TEX.rock;
      for (let i = 0; i < 4; i++) {
        const rx = X(0.3 + 0.2 * i + 0.05 * jit(px, py, i));
        const ry = Y(0.45 + 0.12 * jit(px + i, py, i) + (i % 2) * 0.25);
        ctx.beginPath();
        ctx.moveTo(rx, ry - s * 0.07);
        ctx.lineTo(rx + s * 0.08, ry + s * 0.05);
        ctx.lineTo(rx - s * 0.08, ry + s * 0.05);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'brule': {
      ctx.strokeStyle = TEX.char;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const cx = X(0.3 + 0.2 * i);
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.1, Y(0.4));
        ctx.lineTo(cx + s * 0.1, Y(0.72));
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
}

function paintBati(ctx: CanvasRenderingContext2D, c: Cell, px: number, py: number, s: number): void {
  if (c.destroyed) {
    ctx.fillStyle = '#4a3b36';
    ctx.fillRect(px, py, s, s);
  }
  const ink = c.destroyed ? '#6a5850' : '#2b2620';
  // Roof.
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(px + s * 0.2, py + s * 0.46);
  ctx.lineTo(px + s * 0.5, py + s * 0.2);
  ctx.lineTo(px + s * 0.8, py + s * 0.46);
  ctx.closePath();
  ctx.fill();
  // Body.
  ctx.fillRect(px + s * 0.3, py + s * 0.46, s * 0.4, s * 0.32);
  if (c.hard) {
    ctx.strokeStyle = '#2c5340';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, s - 4, s - 4);
  }
  if (c.destroyed) {
    ctx.strokeStyle = '#b0431c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px + s * 0.24, py + s * 0.24);
    ctx.lineTo(px + s * 0.76, py + s * 0.76);
    ctx.moveTo(px + s * 0.76, py + s * 0.24);
    ctx.lineTo(px + s * 0.24, py + s * 0.76);
    ctx.stroke();
  }
}

function paintCell(ctx: CanvasRenderingContext2D, c: Cell, drought: number): void {
  const px = c.x * CELL;
  const py = c.y * CELL;
  const s = CELL;

  let base = TYPES[c.t].col;
  if (c.t === 'pin' && c.species === 'alep') base = '#6a7440'; // pin d'Alep: lighter, warmer than pin noir
  if (c.fs === 2) base = c.crown ? FIRE.crown : FIRE.surface;
  else if (c.fs === 3 && c.burn < 1) base = FIRE.smoulder;
  ctx.fillStyle = base;
  ctx.fillRect(px, py, s, s);

  if (c.fs === 2) return; // burning: flat, no relief/texture

  // Hillshade: the primary relief cue.
  if (c.shade > 0.5) { ctx.fillStyle = `rgba(255,251,240,${((c.shade - 0.5) * 0.5).toFixed(3)})`; ctx.fillRect(px, py, s, s); }
  else { ctx.fillStyle = `rgba(20,16,10,${((0.5 - c.shade) * 0.62).toFixed(3)})`; ctx.fillRect(px, py, s, s); }

  // Moisture tint (kept subtle so it doesn't fight the texture).
  const m = moisture(c, drought);
  if (m > 0.62) { ctx.fillStyle = `rgba(47,125,120,${((m - 0.62) * 0.5).toFixed(3)})`; ctx.fillRect(px, py, s, s); }
  else if (m < 0.22) { ctx.fillStyle = `rgba(176,67,28,${((0.22 - m) * 0.4).toFixed(3)})`; ctx.fillRect(px, py, s, s); }

  if (c.t === 'bati') {
    paintBati(ctx, c, px, py, s);
  } else {
    paintTexture(ctx, c.t, px, py, s, jit(c.x, c.y, 1) * 2, jit(c.x, c.y, 2) * 2);
    // Density: dense wooded stands darken (the closing landscape), and a
    // dense, unmanaged stand carries a warm ring (the risk driver).
    if (isWooded(c.t)) {
      const dn = densityNorm(c);
      if (dn > 0.4) { ctx.fillStyle = `rgba(18,28,14,${((dn - 0.4) * 0.32).toFixed(3)})`; ctx.fillRect(px, py, s, s); }
      if (isClosed(c)) {
        ctx.strokeStyle = 'rgba(176,67,28,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 2.5, py + 2.5, s - 5, s - 5);
      }
    }
  }

  // Hydrological work.
  if (c.wet > 0) {
    ctx.strokeStyle = 'rgba(30,90,110,.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px + 4, py + s - 7);
    ctx.quadraticCurveTo(px + s / 2, py + s - 13, px + s - 4, py + s - 7);
    ctx.stroke();
  }
  // Livestock.
  if (c.graze > 0) {
    ctx.fillStyle = c.grazeOn ? '#f4e7b0' : '#8b8264';
    blob(ctx, px + s - 7, py + 7, 3);
    blob(ctx, px + s - 13, py + 9, 2.4);
  }
  // Planting under way.
  if (c.plant) {
    ctx.fillStyle = c.plant === 'pin' ? '#3e5a2e' : '#5e8f4a';
    blob(ctx, px + 7, py + s - 7, 2.8);
  }

  ctx.strokeStyle = 'rgba(30,34,26,.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
}

/**
 * Sector overlay (amendment §3.2). Boundaries are always drawn, faintly, so the
 * player reads the map as a set of designated zones rather than a field of
 * cells; the sector view adds the per-kind wash and the names.
 */
function paintSectors(ctx: CanvasRenderingContext2D, state: GameState, opts: DrawOpts): void {
  const { grid, sectors } = state;
  if (!sectors.length) return;

  if (opts.sectorView) {
    for (const c of grid) {
      const s = sectors[c.sector];
      if (!s) continue;
      ctx.fillStyle = `rgba(${SECTOR_KINDS[s.kind].col},0.2)`;
      ctx.fillRect(c.x * CELL, c.y * CELL, CELL, CELL);
    }
  }

  // A designated policy is waiting for its perimeter: show which zones take it,
  // and veil the ones it cannot be applied to.
  if (opts.eligibleSectors.length && !opts.busy) {
    const ok = new Set(opts.eligibleSectors);
    for (const c of grid) {
      if (ok.has(c.sector)) {
        if (c.sector === opts.hoverSector) {
          ctx.fillStyle = 'rgba(176,67,28,0.2)';
          ctx.fillRect(c.x * CELL, c.y * CELL, CELL, CELL);
        }
      } else {
        ctx.fillStyle = 'rgba(28,24,18,0.42)';
        ctx.fillRect(c.x * CELL, c.y * CELL, CELL, CELL);
      }
    }
  }

  // Boundaries: a segment wherever two adjacent cells differ.
  const edges = (want: (a: number, b: number) => boolean) => {
    ctx.beginPath();
    for (const c of grid) {
      const px = c.x * CELL;
      const py = c.y * CELL;
      if (inb(c.x + 1, c.y)) {
        const o = grid[idx(c.x + 1, c.y)].sector;
        if (o !== c.sector && want(c.sector, o)) { ctx.moveTo(px + CELL, py); ctx.lineTo(px + CELL, py + CELL); }
      }
      if (inb(c.x, c.y + 1)) {
        const o = grid[idx(c.x, c.y + 1)].sector;
        if (o !== c.sector && want(c.sector, o)) { ctx.moveTo(px, py + CELL); ctx.lineTo(px + CELL, py + CELL); }
      }
    }
    ctx.stroke();
  };

  ctx.strokeStyle = opts.sectorView ? 'rgba(28,24,18,0.7)' : 'rgba(28,24,18,0.3)';
  ctx.lineWidth = opts.sectorView ? 2 : 1.25;
  edges(() => true);

  // The hovered sector, outlined: this is the perimeter a policy would apply to.
  const hs = opts.hoverSector;
  if (hs >= 0 && !opts.busy) {
    ctx.strokeStyle = 'rgba(176,67,28,0.95)';
    ctx.lineWidth = 3;
    edges((a, b) => a === hs || b === hs);
  }

  if (!opts.sectorView) return;

  // Names, hung on each sector's deepest cell.
  ctx.font = '600 12.5px "Hanken Grotesk Variable", "Hanken Grotesk", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const s of sectors) {
    const x = s.ax * CELL + CELL / 2;
    const y = s.ay * CELL + CELL / 2;
    const w = ctx.measureText(s.name).width;
    const pw = w + 12;
    const ph = 17;
    ctx.fillStyle = 'rgba(247,242,231,0.92)';
    ctx.strokeStyle = 'rgba(28,24,18,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - pw / 2, y - ph / 2, pw, ph, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1c1812';
    ctx.fillText(s.name, x, y + 0.5);
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

/** A legend swatch: base + texture (or house), flat lighting. */
export function drawSwatch(ctx: CanvasRenderingContext2D, t: ParcelType, s: number): void {
  ctx.fillStyle = TYPES[t].col;
  ctx.fillRect(0, 0, s, s);
  if (t === 'bati') {
    const cell = { x: 0, y: 0, t, hard: false, destroyed: false } as Cell;
    paintBati(ctx, cell, 0, 0, s);
  } else {
    paintTexture(ctx, t, 0, 0, s, 0, 0);
  }
  ctx.strokeStyle = 'rgba(30,34,26,.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
}

export function draw(ctx: CanvasRenderingContext2D, state: GameState, opts: DrawOpts): void {
  const { grid, drought } = state;
  ctx.clearRect(0, 0, W * CELL, H * CELL);

  for (const c of grid) paintCell(ctx, c, drought);

  paintSectors(ctx, state, opts);

  // Highlight where the selected lever can be applied (answers "where?").
  if (opts.tool && !opts.busy) {
    for (const c of grid) {
      if (!isValidTarget(c, opts.tool)) continue;
      const px = c.x * CELL;
      const py = c.y * CELL;
      ctx.fillStyle = 'rgba(176,67,28,0.12)';
      ctx.fillRect(px, py, CELL, CELL);
      ctx.strokeStyle = 'rgba(176,67,28,0.7)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 1, py + 1, CELL - 2, CELL - 2);
    }
  }

  // Embers in flight.
  for (const e of opts.embers) {
    const t = e.t;
    const bx0 = e.gx0 * CELL + CELL / 2;
    const by0 = e.gy0 * CELL + CELL / 2;
    const bx1 = e.gx1 * CELL + CELL / 2;
    const by1 = e.gy1 * CELL + CELL / 2;
    const x = bx0 + (bx1 - bx0) * t;
    const y = by0 + (by1 - by0) * t - Math.sin(Math.PI * t) * 30;
    ctx.strokeStyle = 'rgba(176,67,28,.42)';
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx0, by0);
    for (let ss = 0; ss <= t; ss += 0.06) {
      ctx.lineTo(bx0 + (bx1 - bx0) * ss, by0 + (by1 - by0) * ss - Math.sin(Math.PI * ss) * 30);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = FIRE.ember;
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, 7);
    ctx.fill();
  }

  if (opts.hover && !opts.busy) {
    ctx.strokeStyle = '#141008';
    ctx.lineWidth = 2;
    ctx.strokeRect(opts.hover.x * CELL + 1, opts.hover.y * CELL + 1, CELL - 2, CELL - 2);
  }

  if (opts.busy && state.wind) {
    ctx.save();
    ctx.translate(W * CELL - 34, 30);
    ctx.rotate(state.wind.a);
    ctx.fillStyle = 'rgba(28,31,26,.8)';
    ctx.beginPath();
    ctx.moveTo(0, -13); ctx.lineTo(6, 11); ctx.lineTo(0, 6); ctx.lineTo(-6, 11); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
