import type { Cell, GameState } from './types';
import type { Rng } from './rng';
import type { LogMsg } from './tools';
import type { Sector, SectorKind } from './sectors';
import { TYPES, DENSITY, isWooded } from './params';
import { clamp } from './util';

/**
 * Public policies (amendment §3 and §4).
 *
 * The point is not ergonomic. A commune, a park, a fire service does not decide
 * parcel by parcel: it imposes and controls obligations, subsidises, contracts,
 * authorises. Moving the decision up to the policy level takes the game from a
 * false abstraction to a true one.
 *
 * Three rules hold the design together:
 *  - a policy always applies to a **designated sector**, never globally, so the
 *    nested zoning of the dossier survives (§3.2);
 *  - it costs **two currencies** — budget and social acceptability — because
 *    the policies that are cheap in money are usually the expensive ones to
 *    get accepted, and that arbitrage is the one elected officials meet (§3.3);
 *  - it takes **two to five turns to bite**, so early decisions matter more
 *    than late ones and piloting by sight is punished (§3.4).
 *
 * Pure module: mutates cells and state, never touches the DOM.
 */

export type PolicyId =
  | 'old'
  | 'durcir'
  | 'pastoral'
  | 'brulage'
  | 'eclaircie'
  | 'hydro'
  | 'reconstruction';

export interface PolicyCtx {
  state: GameState;
  sector: Sector;
  /** The sector's cells, resolved. */
  cells: Cell[];
  /** Adoption progress, 0–1 (§3.4). */
  ramp: number;
  /** Seasons this policy has been in force on this sector. */
  years: number;
  rng: Rng;
}

export interface PolicyTick {
  messages: LogMsg[];
  /** A prescribed burn that got away: the caller runs a real fire. */
  escaped?: boolean;
}

export interface Policy {
  id: PolicyId;
  gl: string;
  nm: string;
  /** Sector kinds this policy can be designated on. */
  scope: SectorKind[];
  /** Short label of the typical perimeter, for the palette. */
  zn: string;
  /** Action points to activate. */
  cost: number;
  /** Acceptability spent to activate. */
  social: number;
  /** Action points levied every year the policy stays in force. */
  upkeep: number;
  /** Acceptability drained every year (the coercive ones). */
  socialUpkeep: number;
  /** Turns to full effect. */
  delay: number;
  hint: string;
  /** Source ids; must appear in the page frontmatter `sources`. */
  sources: string[];
  tick(ctx: PolicyCtx): PolicyTick;
}

/** Acceptability dynamics (§3.3). */
export const ACCEPT = {
  start: 60,
  max: 100,
  /** Slow spontaneous recovery, per year. */
  regen: 0.8,
  /** Post-fire window of opportunity, when the fire actually hurt. */
  afterFire: 14,
  /** Smaller bump when a fire ran but cost no building. */
  afterNearMiss: 5,
  /**
   * The window opens the debate; it does not make everything acceptable. Past
   * this level, a fire buys nothing more — otherwise a long game with many
   * fires keeps the gauge pinned at the ceiling and the second currency stops
   * being a currency at all.
   */
  windowCeiling: 78,
};

/**
 * Cost multiplier for a perimeter. Designating a policy on a whole versant is
 * not the same decision as designating it on one hamlet crown, and without this
 * the player simply always picks the largest sector. It is also what makes
 * "treat the whole massif" unaffordable (garde-fou §7).
 */
export function perimeterScale(sector: Sector): number {
  return 0.45 + sector.cells.length / 95;
}

export function costOf(p: Policy, s: Sector): number {
  return Math.max(1, Math.round(p.cost * perimeterScale(s)));
}
export function socialOf(p: Policy, s: Sector): number {
  return Math.max(1, Math.round(p.social * perimeterScale(s)));
}
export function upkeepOf(p: Policy, s: Sector): number {
  return Math.max(1, Math.round(p.upkeep * perimeterScale(s)));
}
export function socialUpkeepOf(p: Policy, s: Sector): number {
  return p.socialUpkeep * perimeterScale(s);
}

const min = Math.min;
const max = Math.max;

/** Cells of a sector a vegetation treatment can act on. */
function treatable(cells: Cell[]): Cell[] {
  return cells.filter((c) => c.t !== 'bati' && c.t !== 'rocher');
}

/** How many cells a policy treats this year: a share scaled by adoption. */
function batch(n: number, share: number, ramp: number): number {
  return Math.max(1, Math.round(n * share * ramp));
}

export const POLICIES: Policy[] = [
  {
    id: 'old',
    gl: '§',
    nm: 'Contrôle des obligations de débroussaillement',
    zn: 'couronnes de hameaux',
    scope: ['couronne'],
    cost: 2,
    social: 14,
    upkeep: 1,
    socialUpkeep: 1.5,
    delay: 2,
    hint: "Faire appliquer et contrôler les OLD sur toute une couronne bâtie. Peu coûteux en argent, <b>très coûteux en acceptation</b> : c'est chez les gens. Rend les secours capables de tenir le front. <b>Effet pervers</b> : entretenu sans relâche au même endroit, le couvert cède la place à une friche à graminées, plus inflammable que l'état initial.",
    sources: ['pimont-2019-debroussaillement', 'revertegat-2025-vulnefeu', 'csfs-grasslands', 'wragg-2018'],
    tick({ cells, ramp, rng }) {
      const messages: LogMsg[] = [];
      let flipped = 0;
      for (const c of treatable(cells)) {
        // Adoption is partial: the target understorey drops as the policy takes.
        c.sous = min(c.sous, 0.12 + (1 - ramp) * 0.55);
        // Repeated clearing degrades the soil, exactly as the ponctual lever does.
        if (ramp > 0.9 && rng.chance(0.06)) {
          c.disturb++;
          if (c.disturb >= 3 && (c.t === 'garrigue' || c.t === 'pelouse' || c.t === 'mixte')) {
            c.t = 'friche';
            c.can = 0;
            flipped++;
          }
        }
      }
      if (flipped) {
        messages.push({
          text: `Contrôle des OLD : ${flipped} parcelle${flipped > 1 ? 's' : ''} basculée${flipped > 1 ? 's' : ''} en friche à graminées à force d'être rasée${flipped > 1 ? 's' : ''}. <b>Plus inflammable qu'avant.</b>`,
          cls: 'hot',
        });
      }
      return { messages };
    },
  },
  {
    id: 'durcir',
    gl: '⌂',
    nm: 'Aide au durcissement du bâti',
    zn: 'bâti d’un secteur',
    scope: ['couronne', 'adret', 'ubac', 'vallon', 'massif'],
    cost: 4,
    social: 3,
    upkeep: 1,
    socialUpkeep: 0,
    delay: 4,
    hint: "Subventionner avant-toits fermés, grilles anti-braises et zone 0 minérale, maison après maison. <b>Le meilleur rapport coût/pertes évitées du jeu</b>, et la seule protection réelle contre les braises. <b>Effet pervers</b> : aucun effet sur la surface brûlée, donc l'aide paraît inutile à qui regarde la mauvaise jauge.",
    sources: ['cohen-home-ignition-zone', 'calfire-defensible-space', 'syphard-2014', 'syphard-2019'],
    tick({ cells, ramp, rng }) {
      const messages: LogMsg[] = [];
      const todo = cells.filter((c) => c.t === 'bati' && !c.destroyed && !c.hard);
      let done = 0;
      // Households sign up progressively — that is what the delay represents.
      for (const c of todo) {
        if (!rng.chance(0.3 * ramp)) continue;
        c.hard = true;
        c.sous = 0.05;
        done++;
      }
      if (done) {
        messages.push({ text: `Aide au durcissement : ${done} logement${done > 1 ? 's' : ''} équipé${done > 1 ? 's' : ''} (zone 0 et ouvertures).`, cls: 'good' });
      }
      return { messages };
    },
  },
  {
    id: 'pastoral',
    gl: '☙',
    nm: 'Contrat pastoral',
    zn: 'versants et fonds',
    scope: ['adret', 'ubac', 'vallon', 'massif'],
    cost: 3,
    social: 4,
    upkeep: 2,
    socialUpkeep: 0,
    delay: 3,
    hint: "Contractualiser un troupeau sur tout un secteur : coupure verte ombragée, sous-bois entretenu en continu, valeur agricole. <b>Effet pervers</b> : un pâturage irrégulier laisse des poches de combustible qui compromettent toute la coupure, et le contrat s'éteint si le budget ne suit pas.",
    sources: ['sardaigne-grazing-2024', 'ruiz-mirazo-2011'],
    tick({ cells, ramp }) {
      const messages: LogMsg[] = [];
      const todo = treatable(cells).filter((c) => !c.graze);
      const n = batch(todo.length, 0.4, ramp);
      let done = 0;
      for (const c of todo.slice(0, n)) {
        c.graze = 1;
        c.grazeOn = true;
        done++;
      }
      if (done) messages.push({ text: `Contrat pastoral : ${done} parcelle${done > 1 ? 's' : ''} entrée${done > 1 ? 's' : ''} au pâturage.`, cls: 'good' });
      return { messages };
    },
  },
  {
    id: 'brulage',
    gl: '♨',
    nm: 'Programme de brûlage dirigé',
    zn: 'cœurs de massif et landes',
    scope: ['massif', 'adret'],
    cost: 2,
    social: 16,
    upkeep: 1,
    socialUpkeep: 2,
    delay: 2,
    hint: "Réintroduire un feu courant hors saison, en imitation du régime doux historique. Efficace et bon marché, mais <b>l'effet s'estompe en 6 à 8 ans</b>, les fumées se voient, et une échappée reste possible après un été très sec.",
    sources: ['fernandes-2022', 'prescribed-burning-shrublands-2024'],
    tick({ state, cells, ramp, rng }) {
      const messages: LogMsg[] = [];
      const todo = treatable(cells).filter((c) => c.pb <= 0);
      if (!todo.length) return { messages };
      // The window closes after a very dry summer: burning then is how it gets away.
      if (state.lastDrought > 0.72 && rng.chance(0.18 * ramp)) {
        const c = todo[rng.int(todo.length)];
        c.fs = 1;
        return {
          messages: [{ text: "<b>Échappée !</b> Le brûlage a débordé : le combustible n'avait pas repris l'humidité après l'été précédent.", cls: 'hot' }],
          escaped: true,
        };
      }
      const n = batch(todo.length, 0.3, ramp);
      let done = 0;
      for (const c of todo.slice(0, n)) {
        c.sous = min(c.sous, 0.08);
        c.pb = 8;
        done++;
      }
      if (done) messages.push({ text: `Brûlage dirigé conduit sur ${done} parcelle${done > 1 ? 's' : ''}. Effet estimé 6 à 8 ans.`, cls: 'good' });
      return { messages };
    },
  },
  {
    id: 'eclaircie',
    gl: '⌇',
    nm: 'Programme d’éclaircie sylvicole',
    zn: 'peuplements denses',
    scope: ['adret', 'ubac', 'massif', 'vallon'],
    cost: 4,
    social: 3,
    upkeep: 2,
    socialUpkeep: 0,
    delay: 3,
    hint: "Ramener la densité des peuplements sous le seuil et leur donner le statut <b>géré</b>, ce qui lève la surdensité. <b>Effet pervers</b> : éclaircir trop ouvre le couvert, assèche le sol et relance le sous-bois. Le seuil de jeu (~440 tiges/ha) vient de plantations espagnoles qui excluaient le pin noir.",
    sources: ['gilloz-2026-ifn-diois', 'repeto-deudero-2025', 'banerjee-2020', 'bigelow-north-2012', 'millikin-2024'],
    tick({ cells, ramp, rng }) {
      const messages: LogMsg[] = [];
      const todo = cells
        .filter((c) => isWooded(c.t) && c.density > DENSITY.thinTo)
        .sort((a, b) => b.density - a.density);
      if (!todo.length) return { messages };
      const n = batch(todo.length, 0.35, ramp);
      let done = 0;
      let over = 0;
      for (const c of todo.slice(0, n)) {
        c.density = max(DENSITY.thinTo, c.density - DENSITY.thinStep);
        c.managedFor = DENSITY.managedYears;
        c.ecl++;
        if (c.ecl === 1) {
          c.can = max(0.4, c.can - 0.12);
          c.sous = min(c.sous, 0.4);
        } else if (rng.chance(0.35)) {
          // Going back over the same stand opens it too far.
          c.can = max(0.15, c.can - 0.25);
          c.sous = min(1, c.sous + 0.3);
          over++;
        }
        done++;
      }
      if (done) messages.push({ text: `Éclaircie : ${done} peuplement${done > 1 ? 's' : ''} ramené${done > 1 ? 's' : ''} sous le seuil et passé${done > 1 ? 's' : ''} en géré.`, cls: 'good' });
      if (over) messages.push({ text: `${over} peuplement${over > 1 ? 's' : ''} éclairci${over > 1 ? 's' : ''} de trop : couvert ouvert, sol plus sec, sous-bois relancé.`, cls: 'hot' });
      return { messages };
    },
  },
  {
    id: 'hydro',
    gl: '≈',
    nm: 'Hydrologie de paysage',
    zn: 'fonds de vallon et talwegs',
    scope: ['vallon'],
    cost: 5,
    social: 2,
    upkeep: 1,
    socialUpkeep: 0,
    delay: 5,
    hint: "Seuils, baissières, gabions : ralentir, étaler, stocker. Maintient une végétation verte en saison de feu et crée des refuges. <b>Très long à produire son effet</b>, et sans humidité pérenne en août, cela ne fait que produire davantage de combustible estival.",
    sources: ['fairfax-whittle-2020', 'greiser-2023'],
    tick({ cells, ramp }) {
      const messages: LogMsg[] = [];
      const todo = treatable(cells).filter((c) => c.el <= 0.45 && c.wet <= 0);
      if (!todo.length) return { messages };
      const n = batch(todo.length, 0.25, ramp);
      let done = 0;
      for (const c of todo.slice(0, n)) {
        c.wet = 1;
        done++;
      }
      if (done) messages.push({ text: `Ouvrages hydrauliques : nappe soutenue sur ${done} parcelle${done > 1 ? 's' : ''} jusqu'en août.`, cls: 'good' });
      return { messages };
    },
  },
  {
    id: 'reconstruction',
    gl: '❦',
    nm: 'Encadrement de la reconstruction',
    zn: 'secteur parcouru par le feu',
    scope: ['couronne', 'adret', 'ubac', 'vallon', 'massif'],
    cost: 3,
    social: 7,
    upkeep: 1,
    socialUpkeep: 0.5,
    delay: 2,
    hint: "Orienter ce qui repousse après le feu vers la mosaïque, plutôt que de laisser le paysage se reconstituer tel qu'il a brûlé. <b>Sans elle, on rebâtit la vulnérabilité</b> : une pinède homogène redevient une pinède homogène, et le pin noir brûlé ne revient pas du tout.",
    sources: ['mixed-forests-flammability-2018', 'canopee-forets-melangees', 'fady-perret-2020-pin-noir'],
    tick({ cells, ramp, rng }) {
      const messages: LogMsg[] = [];
      // Acts on ground that has just burnt: steers it toward mosaic instead of
      // letting it settle back into shrubland or a like-for-like pine stand.
      const todo = cells.filter((c) => c.t === 'brule' && !c.plant);
      let done = 0;
      for (const c of todo) {
        if (!rng.chance(0.45 * ramp)) continue;
        c.plant = 'mixte';
        c.plantT = 4;
        done++;
      }
      if (done) messages.push({ text: `Reconstruction encadrée : ${done} parcelle${done > 1 ? 's' : ''} brûlée${done > 1 ? 's' : ''} orientée${done > 1 ? 's' : ''} vers la mosaïque.`, cls: 'good' });
      return { messages };
    },
  },
];

export function policyById(id: PolicyId): Policy {
  return POLICIES.find((p) => p.id === id)!;
}

/** Can this policy be designated on this sector kind? */
export function canApply(p: Policy, kind: SectorKind): boolean {
  return p.scope.includes(kind);
}

/**
 * Run every active policy for one year: advance adoption, levy upkeep in both
 * currencies, apply the effects. Called from endSeason.
 */
export function tickPolicies(state: GameState, rng: Rng): PolicyTick {
  const messages: LogMsg[] = [];
  let escaped = false;

  for (const active of state.policies) {
    const p = policyById(active.id);
    const sector = state.sectors[active.sector];
    if (!sector) continue;

    // Upkeep first: a policy the budget can no longer carry lapses, and the
    // ground it held goes back to what it was.
    const upkeep = upkeepOf(p, sector);
    if (state.pa < upkeep) {
      active.lapsed = true;
      messages.push({ text: `« ${p.nm} » n'est plus financé sur ${sector.name} : le programme s'interrompt.`, cls: 'hot' });
      continue;
    }
    active.lapsed = false;
    state.pa -= upkeep;
    state.spentCum += upkeep;
    state.accept = clamp(state.accept - socialUpkeepOf(p, sector), 0, ACCEPT.max);

    active.years++;
    active.ramp = clamp(active.years / p.delay, 0, 1);

    const cells = sector.cells.map((j) => state.grid[j]);
    const res = p.tick({ state, sector, cells, ramp: active.ramp, years: active.years, rng });
    for (const m of res.messages) messages.push({ text: `${sector.name} · ${m.text}`, cls: m.cls });
    if (res.escaped) escaped = true;
  }

  // Drop lapsed programmes: they are not free to restart.
  const lapsed = state.policies.filter((a) => a.lapsed);
  if (lapsed.length) state.policies = state.policies.filter((a) => !a.lapsed);

  // Acceptability recovers slowly on its own.
  state.accept = clamp(state.accept + ACCEPT.regen, 0, ACCEPT.max);

  return { messages, escaped };
}

/**
 * Post-fire window of opportunity (§3.3). Acceptance of constraint rises sharply
 * just after a fire, and falls back as the memory fades — a documented
 * phenomenon, and the moment a commune can carry a policy it could not carry
 * the year before.
 */
export function postFireWindow(state: GameState, lostBuildings: number, burned: number): LogMsg | null {
  if (burned <= 0) return null;
  if (state.accept >= ACCEPT.windowCeiling) return null;
  const bump = lostBuildings > 0 ? ACCEPT.afterFire : ACCEPT.afterNearMiss;
  const before = state.accept;
  state.accept = clamp(state.accept + bump, 0, ACCEPT.windowCeiling);
  const gained = Math.round(state.accept - before);
  if (gained <= 0) return null;
  return {
    text: lostBuildings > 0
      ? `Le feu a rouvert le débat : acceptabilité +${gained}. Ce qui était impensable l'an dernier peut passer maintenant.`
      : `On est passé près : acceptabilité +${gained}.`,
    cls: 'good',
  };
}

/**
 * Activate a policy on a sector. Returns null on success, or the reason it
 * cannot be done.
 */
export function activate(state: GameState, p: Policy, sector: Sector): string | null {
  if (!canApply(p, sector.kind)) return `« ${p.nm} » ne se désigne pas sur ${sector.name}.`;
  if (state.policies.some((a) => a.id === p.id && a.sector === sector.id)) {
    return `« ${p.nm} » est déjà en vigueur sur ${sector.name}.`;
  }
  const cost = costOf(p, sector);
  const social = socialOf(p, sector);
  if (state.pa < cost) return `Budget insuffisant : ${cost} PA pour un périmètre de ${sector.cells.length} parcelles.`;
  if (state.accept < social) {
    return `Acceptabilité insuffisante : ${social} points pour ${sector.name}. Il faudra attendre, viser un périmètre plus restreint, ou un feu pour ouvrir la fenêtre.`;
  }
  state.pa -= cost;
  state.spentCum += cost;
  state.accept = clamp(state.accept - social, 0, ACCEPT.max);
  state.policies.push({ id: p.id, sector: sector.id, years: 0, ramp: 0, lapsed: false });
  return null;
}

/** Lift a policy. The budget stops, the effects already obtained remain. */
export function deactivate(state: GameState, id: PolicyId, sectorId: number): void {
  state.policies = state.policies.filter((a) => !(a.id === id && a.sector === sectorId));
}
