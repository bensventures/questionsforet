import type { Sector } from './sectors';
import type { PolicyId } from './policies';

/** Parcel (land-cover) type keys. */
export type ParcelType =
  | 'pin'
  | 'feuillu'
  | 'mixte'
  | 'garrigue'
  | 'pelouse'
  | 'friche'
  | 'ripi'
  | 'rocher'
  | 'bati'
  | 'brule';

/** Static parameters attached to each parcel type. */
export interface TypeParams {
  /** Display name. */
  n: string;
  /** Base fuel load, 0–1 (distinct from flammability — brief §1). */
  fuel: number;
  /** Intrinsic flammability, 0–1. */
  flam: number;
  /** Biodiversity value, 0–100. */
  bio: number;
  /** Canopy cover, 0–1. */
  can: number;
  /** Map colour (harmonised with the site palette). */
  col: string;
  /** Spread resistance (higher = slower to burn through). */
  speed: number;
}

/** Pine species, which regenerate very differently after fire (brief §3). */
export type PineSpecies = 'noir' | 'alep';

/**
 * Ponctual levers (amendment §6). Deliberately few: what stays a single act is
 * what is unique and non-repeatable. Everything recurring became a policy, and
 * the contrast between the two registers is instructive in itself.
 */
export type ToolId = 'zone0' | 'debr' | 'mixte' | 'pin';

export interface Tool {
  id: ToolId;
  gl: string;
  nm: string;
  zn: string;
  pa: number;
  hint: string;
  /** Source ids (must exist in the page frontmatter `sources`). */
  sources: string[];
}

/**
 * Doctrine de lutte (amendment §5), settable at any time but costly to change.
 * 1 — extinction systématique; 2 — extinction sauf conditions favorables;
 * 3 — feu géré.
 */
export type DoctrineLevel = 1 | 2 | 3;

/** Fire state of a cell: 0 unburnt, 1 igniting, 2 burning, 3 burnt-out. */
export type FireState = 0 | 1 | 2 | 3;

export interface Cell {
  x: number;
  y: number;
  el: number;
  slope: number;
  adret: number;
  t: ParcelType;
  sous: number; // understorey density 0–1
  can: number; // canopy cover 0–1
  density: number; // stem density, tiges/ha (tree stratum)
  managedFor: number; // seasons of remaining "managed" status (memory)
  species?: PineSpecies; // for pine parcels: which pine
  age: number; // stand age in seasons (bark thickness → fire survival)
  wasSpecies?: PineSpecies; // species before burning, for regeneration
  wet: number; // hydrological support 0–1
  graze: number; // grazed (0/1)
  grazeOn: boolean; // grazing maintained this year
  hard: boolean; // building hardened + zone 0
  burn: number; // seasons since burnt (0 = not)
  disturb: number; // repeated-clearing counter
  ecl: number; // thinning counter
  pb: number; // prescribed-burn effect countdown
  plant: 'pin' | 'mixte' | null;
  plantT: number; // seasons until planting establishes
  fs: FireState;
  ft: number; // burning timer
  crown: boolean; // crown fire this event
  shade: number; // precomputed hillshade 0–1 (relief cue)
  sector: number; // sector id (amendment §3.2), fixed for the whole game
  everBurnt: boolean; // has burnt at least once (distinct from burnedCum)
  hab?: number; // households (for bâti)
  destroyed?: boolean;
  wasT?: ParcelType; // type before burning
  plantedPin?: boolean;
}

/** A policy in force on one sector, with its adoption progress (§3.4). */
export interface ActivePolicy {
  id: PolicyId;
  /** Sector id it was designated on. */
  sector: number;
  /** Seasons in force. */
  years: number;
  /** Adoption progress 0–1: effects scale with it. */
  ramp: number;
  /** Set when the budget could not carry it this year; dropped afterwards. */
  lapsed: boolean;
}

export interface Wind {
  a: number; // angle (radians)
  s: number; // strength
}

export interface GameState {
  w: number;
  h: number;
  grid: Cell[];
  /** Fixed découpage the policies will apply to (amendment §3.2). */
  sectors: Sector[];
  year: number;
  maxYears: number;
  pa: number;
  drought: number;
  lastDrought: number;
  burnedCum: number;
  /** Distinct cells burnt at least once — the share the §8 target speaks of. */
  burnedEver: number;
  lost: number;
  wind: Wind | null;
  /** Doctrine de lutte, 1 to 3 (amendment §5). Cran 1 is the tempting trap. */
  doctrine: DoctrineLevel;
  /** Ignitions stamped out over the game — the fuel treatment that never happened. */
  suppressedCum: number;
  /** Seasons spent at cran 1, for the retrospective after the great fire. */
  yearsAtCran1: number;
  /**
   * Social acceptability, 0–100 (amendment §3.3). The second currency: the
   * policies that cost little money often cost a great deal of acceptance, and
   * with a single currency that arbitrage disappears.
   */
  accept: number;
  /** Policies in force, each on its designated sector. */
  policies: ActivePolicy[];
  /** Cumulative action points spent over the game (a gauge, brief §6). */
  spentCum: number;
  /** The year the guaranteed great fire strikes (stochastic), and whether it has. */
  bigFireYear: number;
  bigFireDone: boolean;
}
