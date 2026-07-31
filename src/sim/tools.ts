import type { Cell, GameState, ToolId } from './types';
import { TOOLS } from './params';
import { inb, idx } from './util';

export interface LogMsg {
  text: string;
  cls?: 'hot' | 'good';
}

export interface ApplyResult {
  /** Whether the action was valid and PA should be spent. */
  spend: boolean;
  messages: LogMsg[];
  /** A prescribed burn that escaped into a real fire. */
  escaped?: boolean;
}

function neigh(state: GameState, c: Cell, r: number, fn: (n: Cell) => void): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (inb(c.x + dx, c.y + dy)) fn(state.grid[idx(c.x + dx, c.y + dy)]);
    }
  }
}

const min = Math.min;

/**
 * Apply a ponctual lever to a cell. Mutates the cell(s) and returns messages
 * plus whether PA should be spent. Never touches the DOM. The recurring
 * mechanics live in policies.ts; what stays here is the one-off act.
 */
export function applyTool(state: GameState, c: Cell, tool: ToolId): ApplyResult {
  const at = `(${c.x},${c.y})`;

  switch (tool) {
    case 'zone0': {
      if (c.t !== 'bati' || c.destroyed) return { spend: false, messages: [{ text: "Le durcissement ne s'applique qu'au bâti debout." }] };
      if (c.hard) return { spend: false, messages: [{ text: 'Ce bâtiment est déjà durci.' }] };
      c.hard = true;
      c.sous = 0.05;
      neigh(state, c, 1, (n) => { if (n.t !== 'bati') n.sous = min(n.sous, 0.25); });
      return { spend: true, messages: [{ text: `Zone 0 minérale et bâti durci en ${at}.`, cls: 'good' }] };
    }

    case 'debr': {
      if (c.t === 'bati' || c.t === 'rocher') return { spend: false, messages: [{ text: 'Rien à débroussailler ici.' }] };
      c.sous = min(c.sous, 0.12);
      c.disturb++;
      if (c.disturb >= 3 && (c.t === 'garrigue' || c.t === 'pelouse' || c.t === 'mixte')) {
        c.t = 'friche';
        c.can = 0;
        return { spend: true, messages: [{ text: `Débroussaillement répété en ${at} : le couvert cède la place à un tapis de graminées. <b>Plus inflammable qu'avant.</b>`, cls: 'hot' }] };
      }
      return { spend: true, messages: [{ text: `Sous-bois réduit en ${at}.` }] };
    }

    case 'mixte':
    case 'pin': {
      if (!(c.t === 'brule' || c.t === 'friche' || c.t === 'pelouse')) return { spend: false, messages: [{ text: 'On ne plante que sur brûlé, friche ou pelouse.' }] };
      c.plant = tool;
      c.plantT = tool === 'mixte' ? 4 : 3;
      return {
        spend: true,
        messages: [{ text: tool === 'mixte' ? 'Plantation en mosaïque engagée. 4 ans avant installation.' : 'Plantation de pin engagée. 3 ans, puis +1 PA/an.' }],
      };
    }
  }
}

export function toolById(id: ToolId) {
  return TOOLS.find((t) => t.id === id)!;
}

/**
 * Whether a lever can meaningfully be applied to a cell — used to highlight
 * valid targets on the map when a tool is selected. Mirrors the guards in
 * applyTool(); for the neighbourhood tools it flags plausible centres.
 */
export function isValidTarget(c: Cell, tool: ToolId): boolean {
  switch (tool) {
    case 'zone0':
      return c.t === 'bati' && !c.destroyed && !c.hard;
    case 'debr':
      return c.t !== 'bati' && c.t !== 'rocher';
    case 'mixte':
    case 'pin':
      return c.t === 'brule' || c.t === 'friche' || c.t === 'pelouse';
  }
}
