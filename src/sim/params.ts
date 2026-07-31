import type { ParcelType, TypeParams, Tool } from './types';

/** Grid geometry. */
export const W = 32;
export const H = 21;
export const CELL = 28; // internal resolution per cell (display scales to fit)

/**
 * Per-type parameters. Fuel load and flammability are kept separate on purpose
 * (brief §1). Colours are harmonised with the site's "encre & braise" palette:
 * greens for the wooded types, straw for the open/degraded ones, ember for the
 * built parcels, charcoal for burnt ground.
 */
export const TYPES: Record<ParcelType, TypeParams> = {
  pin: { n: "Pinède d'adret", fuel: 0.85, flam: 1.0, bio: 35, can: 0.9, col: '#3f5230', speed: 2 },
  feuillu: { n: 'Chênaie / feuillus', fuel: 0.5, flam: 0.55, bio: 72, can: 0.85, col: '#6f8f45', speed: 3 },
  mixte: { n: 'Mosaïque sylvopastorale', fuel: 0.5, flam: 0.55, bio: 84, can: 0.6, col: '#93a55a', speed: 3 },
  garrigue: { n: 'Garrigue / lande', fuel: 0.8, flam: 0.95, bio: 56, can: 0.15, col: '#b0a35e', speed: 1 },
  pelouse: { n: 'Pelouse sèche', fuel: 0.42, flam: 0.92, bio: 52, can: 0, col: '#d3c48a', speed: 1 },
  friche: { n: 'Friche à graminées', fuel: 0.48, flam: 1.1, bio: 22, can: 0, col: '#e0c85c', speed: 1 },
  ripi: { n: 'Ripisylve / fond humide', fuel: 0.5, flam: 0.3, bio: 92, can: 0.8, col: '#2f7d78', speed: 3 },
  rocher: { n: 'Rocher / pelouse rase', fuel: 0.04, flam: 0.05, bio: 24, can: 0, col: '#c0b9a6', speed: 1 },
  bati: { n: 'Bâti', fuel: 0.35, flam: 0.55, bio: 6, can: 0, col: '#dccdb0', speed: 2 },
  brule: { n: 'Parcelle brûlée', fuel: 0.1, flam: 0.15, bio: 12, can: 0, col: '#3c3730', speed: 1 },
};

/**
 * Density calibration (brief §2). Values are game orders of magnitude, not
 * transposable measurements: the ~440 tiges/ha threshold comes from Spanish
 * radiata-pine plantations that explicitly excluded the pin noir. It only
 * penalises UNMANAGED stands.
 */
export const DENSITY = {
  threshold: 440, // tiges/ha, severity rises above this (unmanaged only)
  gameMax: 1000, // normalisation ceiling
  growth: 34, // tiges/ha gained per season (spontaneous closure)
  thinTo: 360, // éclaircie brings density down toward this
  thinStep: 300, // reduction per thinning
  managedYears: 10, // memory of the "managed" status
};

/** Types with a tree stratum, for which density is meaningful. */
export function isWooded(t: ParcelType): boolean {
  return TYPES[t].can >= 0.3;
}

/**
 * Post-fire regeneration & survival (brief §3). A young dense stand is the most
 * vulnerable, for about fifteen years; old stands survive a surface fire
 * (thicker bark, higher crown) but nothing survives a severe crown fire.
 */
export const REGEN = {
  years: 3, // seasons before an unmanaged burnt cell settles into a new state
  youngAge: 12, // below this a stand is "young" and vulnerable
  survivalMax: 0.85, // ceiling on old-stand survival of a surface fire
};

/** Human label for a pine species. */
export function pineLabel(sp: 'noir' | 'alep' | undefined): string {
  return sp === 'alep' ? "pin d'Alep" : 'pin noir';
}

/**
 * Firefighter defendability (brief §4, Pimont et al. 2019). Crews can hold the
 * front for a building only if a treated apron of sufficient depth surrounds it
 * AND the slope is gentle enough; beyond ~50 m of treated vegetation the flux
 * drops under the intervention threshold, but on steep ground even that fails.
 * Slope is normalised to 0–1 (see terrain).
 */
export const DEFEND = {
  slopeSteep: 0.62, // above this normalised slope, no defence is possible
  slopeMod: 0.34, // above this, a deeper (radius-2) apron is required
  clearSous: 0.2, // understorey below this = "treated" (débroussaillé or pâturé)
};

/**
 * Suppression paradox (brief §5, Kreider et al. 2024). A funded suppression
 * policy stamps out most ignitions in calm years — a visible, immediate benefit
 * — but a suppressed fire never thins the fuel, so the landscape keeps closing.
 * Suppression collapses under extreme drought and wind, so the fire that finally
 * escapes runs on years of accumulated fuel. Needs a long horizon to bite.
 */
export const SUPPRESS = {
  base: 1.55, // formula intercept (clamped below): calm years suppress hard
  droughtK: 1.15, // suppression falls with drought (extreme years leak)
  windK: 0.4, // and with wind
  maxProb: 0.97, // ceiling on suppression success
};

/**
 * Doctrine de lutte (amendment §5). The best use of the policy system, and the
 * only way to make the suppression paradox actually playable.
 *
 * Cran 1 costs money and nothing in acceptability — it is what everyone
 * expects — and works spectacularly for years. Its consequence is deferred and
 * deliberately unannounced: fuel accumulates, the low-intensity fires that did
 * the maintenance disappear, and the landscape closes. The player must read
 * that in the slow-variable gauges, not in a warning; the after-fire report
 * says it plainly, but only in retrospect.
 *
 * `letRunDrought` / `letRunWind` are the "manageable conditions" ceiling, and
 * `keepOut` the distance in cells from a building below which a fire is fought
 * whatever the doctrine.
 */
export const DOCTRINE: Record<
  1 | 2 | 3,
  {
    label: string;
    short: string;
    pa: number;
    social: number;
    letRunDrought: number;
    letRunWind: number;
    keepOut: number;
    hint: string;
  }
> = {
  1: {
    label: 'Extinction systématique',
    short: 'Tout éteindre',
    pa: 3,
    social: 0,
    letRunDrought: 0,
    letRunWind: 0,
    keepOut: 0,
    hint: "Tout départ est attaqué et éteint. Coût modéré, efficacité immédiate et spectaculaire, <b>aucun coût d'acceptabilité</b> : c'est ce que tout le monde attend.",
  },
  2: {
    label: 'Extinction sauf conditions favorables',
    short: 'Laisser courir parfois',
    pa: 2,
    social: 1.2,
    letRunDrought: 0.55,
    letRunWind: 0.7,
    keepOut: 4,
    hint: "Certains départs, en conditions maîtrisables et loin des enjeux, sont laissés courir sous surveillance. Coût d'acceptabilité modéré.",
  },
  3: {
    label: 'Feu géré',
    short: 'Feu géré',
    pa: 1,
    social: 3,
    letRunDrought: 0.78,
    letRunWind: 0.95,
    keepOut: 3,
    hint: "Les départs sont laissés courir chaque fois que possible et servent de traitement du combustible. <b>Coût d'acceptabilité fort</b>, risque apparent élevé.",
  },
};

/** Changing doctrine mid-course is possible, but never free. */
export const DOCTRINE_SWITCH = { pa: 2, social: 6 };

/** Default and short-mode horizons (brief §5, §9). */
export const HORIZON = { long: 45, short: 12 };

/** Fire / ember render colours. */
export const FIRE = {
  crown: '#b0431c', // ember
  surface: '#e0922a',
  smoulder: '#3a342e',
  ember: '#f0a31c',
};

/** Legend order for the map. */
export const LEGEND_KEYS: ParcelType[] = [
  'pin', 'feuillu', 'mixte', 'garrigue', 'pelouse', 'friche', 'ripi', 'rocher', 'bati', 'brule',
];

/**
 * Ponctual levers (amendment §6). Everything recurring moved to POLICIES; what
 * remains here is what is genuinely a one-off act on one parcel — harden this
 * hamlet now, open a break on that crest, treat a black spot found after a
 * fire. `sources` lists the reference ids each mechanic is drawn from; every id
 * must appear in the page frontmatter `sources` so `reference()` validates it
 * and the in-game sources panel can cite it.
 */
export const TOOLS: Tool[] = [
  {
    id: 'zone0', gl: '⌂', nm: 'Durcir le bâti + zone 0', zn: '0–5 m · sur le bâti', pa: 3,
    hint: "Avant-toits fermés, grilles anti-braises, 5 premiers mètres minéraux. <b>Le meilleur rendement du jeu</b> : divise par ~5 la probabilité d'allumage par braise. Ne réduit pas la surface brûlée, protège la cible.",
    sources: ['cohen-home-ignition-zone', 'calfire-defensible-space', 'syphard-2014'],
  },
  {
    id: 'debr', gl: '✂', nm: 'Débroussailler', zn: 'sous-bois · une parcelle', pa: 2,
    hint: "Agit sur le <b>sous-bois</b> (à ne pas confondre avec l'éclaircie, qui agit sur les arbres) : on casse l'échelle vers les houppiers. <b>Réduire n'est pas raser</b> : répété au même endroit, le sol s'appauvrit et la parcelle bascule en friche à graminées, plus inflammable qu'avant.",
    sources: ['pimont-2019-debroussaillement', 'wragg-2018', 'csfs-grasslands', 'revertegat-2025-vulnefeu'],
  },
  {
    id: 'mixte', gl: '❦', nm: 'Planter en mosaïque', zn: 'sur brûlé, friche, pelouse', pa: 2,
    hint: "Feuillus et essences variées : humidité, biodiversité, faible inflammabilité. Met <b>4 ans</b> à s'installer. C'est le geste qui empêche la reconstruction à l'identique après feu.",
    sources: ['mixed-forests-flammability-2018', 'canopee-forets-melangees'],
  },
  {
    id: 'pin', gl: '▲', nm: 'Planter du pin', zn: 'sur brûlé, friche, pelouse', pa: 1,
    hint: "Reboisement RTM : du <b>pin noir</b>. Rapide et productif (+1 PA/an une fois mûr), mais le combustible le plus inflammable de la carte, et surtout : <b>après un feu de cime, le pin noir ne revient pas</b> (pas de cônes sérotineux). Reconstituer une pinède homogène reproduit la vulnérabilité.",
    sources: ['fady-perret-2020-pin-noir', 'alexandrian-rigolot-1992', 'canopee-arbres-sensibles', 'baeza-santana', 'revertegat-2025-vulnefeu'],
  },
];
