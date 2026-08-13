import type { TypeVeg } from '../model/types';
import { TYPES } from '../model/params';

/**
 * Couleurs et paliers du langage de paysage.
 *
 * Les valeurs viennent du § 11 de la carte de référence et sont **normatives**.
 * Les bornes de paliers, en revanche, n'y figurent pas : la carte de référence
 * fabrique son relief et ses couvertures par une formule analytique, alors que
 * nous les recevons d'une simulation. Elles ont donc été **mesurées** sur des
 * parties réelles (`src/harness/distributions.ts`).
 *
 * Depuis la carte de référence, un glyphe n'a plus qu'une couleur pilotable :
 * la masse de feuillage porte `currentColor` et reçoit la rampe par un
 * `style="color: …"`. Les nuances internes et les marqueurs ■/○ restent
 * littéraux dans le dessin.
 */

export type Palier = 1 | 2 | 3 | 4;
export type EtatFeu = 'sain' | 'roussi' | 'consomme';

/** § 11.1. Quatre paliers, du sec au frais. */
const RAMPES: Partial<Record<TypeVeg, readonly [string, string, string, string]>> = {
  chene: ['0.66 0.045 118', '0.61 0.065 130', '0.55 0.095 142', '0.49 0.11 148'],
  // Le hêtre n'a pas de palier sec : la carte de référence répète H2 en H1
  // plutôt que d'inventer un ocre. Le modèle ne l'installe de toute façon que
  // sur station fraîche ; c'est un repli, pas une station.
  hetre: ['0.67 0.075 124', '0.67 0.075 124', '0.62 0.105 132', '0.56 0.12 138'],
  pinNoir: ['0.50 0.03 130', '0.45 0.042 145', '0.40 0.055 158', '0.36 0.065 162'],
  pinSylvestre: ['0.74 0.045 115', '0.70 0.062 132', '0.65 0.085 150', '0.60 0.10 155'],
  garrigue: ['0.62 0.04 108', '0.58 0.05 114', '0.52 0.06 118', '0.48 0.07 124'],
  ripisylve: ['0.60 0.12 148', '0.60 0.12 148', '0.60 0.12 148', '0.58 0.13 150'],
};

/** § 11.1, litière. Reste claire à tous les paliers pour porter les motifs. */
const SOL = ['0.90 0.03 76', '0.86 0.035 82', '0.82 0.04 88', '0.76 0.045 96'] as const;

/** § 11.2, réserve chaude : teinte 30–70, chroma > 0,09, interdite au végétal. */
export const FEU = {
  actif: 'oklch(0.72 0.19 48)',
  roussi: 'oklch(0.58 0.13 55)',
  consomme: 'oklch(0.34 0.035 45)',
  sol: 'oklch(0.52 0.015 60)',
} as const;

/** § 11.3, encres et fonds de la planche. */
export const ENCRE = {
  gestion: 'oklch(0.40 0.015 90)',
  parcelle: 'oklch(0.34 0.02 120)',
  grille: 'oklch(0.44 0.02 100)',
  cadre: 'oklch(0.26 0.02 130)',
  fondCarte: 'oklch(0.86 0.035 82)',
  courbe: 'oklch(0.58 0.035 65)',
  maitresse: 'oklch(0.42 0.05 60)',
  cote: 'oklch(0.34 0.05 58)',
  talweg: 'oklch(0.52 0.09 220)',
  crete: 'oklch(0.32 0.02 90)',
  hachure: 'oklch(0.34 0.035 55)',
  halo: 'oklch(0.90 0.03 78)',
} as const;

/**
 * Bornes des paliers, mesurées et non supposées (§ voir `distributions.ts`).
 * Deux principes : un seuil déjà porté par le modèle devient une borne visuelle
 * (440 tiges/ha, seuil de sévérité) ; sinon les bornes suivent les quartiles
 * observés, pour que les quatre paliers servent. Des quartiles théoriques sur
 * 0–1 laissaient 57 % des cellules au palier sec et **aucune** au palier frais.
 */
const BORNES = {
  humidite: [0.1, 0.22, 0.32],
  densite: [440, 700, 950],
  sousBois: [0.55, 0.9],
} as const;

const classer = (v: number, bornes: readonly number[]): Palier =>
  ((bornes.findIndex((b) => v < b) + 1 || bornes.length + 1) as Palier);

export const palierHumidite = (humidite: number): Palier => classer(humidite, BORNES.humidite);
export const palierDensite = (densite: number): Palier => classer(densite, BORNES.densite);

/**
 * Charge de la strate basse → palier de motif de sol.
 *
 * SB 0 et SB 1 ne se déduisent pas de la valeur. SB 0 est le sol brûlé (aucune
 * cellule vivante ne descend sous 0,02 dans le modèle). SB 1 est **réservé** :
 * sa présence signifie un entretien, pâturage ou dégagement, jamais un état
 * naturel (§ 7).
 */
export function palierSousBois(
  sousBois: number,
  options: { paturage?: boolean; debroussaille?: boolean; brule?: boolean } = {},
): 0 | 1 | 2 | 3 | 4 {
  if (options.brule) return 0;
  if (options.paturage || options.debroussaille) return 1;
  return (classer(sousBois, BORNES.sousBois) + 1) as 2 | 3 | 4;
}

/** Teinte de la masse de feuillage, à poser en `color` sur le `<use>`. */
export function couleurVegetation(type: TypeVeg, palier: Palier): string | null {
  const r = RAMPES[type];
  return r ? `oklch(${r[palier - 1]})` : null;
}

/** Teinte du sol : litière indexée par l'humidité, ou sol brûlé. */
export const couleurSol = (palier: Palier, brule = false): string =>
  brule ? FEU.sol : `oklch(${SOL[palier - 1]})`;

/**
 * § 7, motifs de sous-bois. `null` = aucun motif (SB 0).
 *
 * Le rocher n'en porte jamais : le § 3.4 de la carte de référence le pose à
 * SB 0, et notre modèle lui laisse un sous-bois tiré au hasard à la génération
 * puis jamais entretenu — un semis de points sur de la roche, au palier d'un
 * bruit figé.
 */
export const motifSousBois = (palier: 0 | 1 | 2 | 3 | 4, type?: TypeVeg): string | null =>
  palier === 0 || type === 'rocher' ? null : `m-sb${palier}`;

/**
 * Symbole d'une couverture (§ 8.1), en tenant compte de l'âge et du feu.
 *
 * Le pin noir est la seule essence dont le tracé change avec l'âge : le
 * houppier se comprime, le fût nu s'allonge, et c'est un fait de combustibilité.
 * Après feu, la substitution suit le § 8.3 : silhouette conservée et houppier
 * chaud pour le roussi, souche à rejet ou chicot pour le consommé, et **rien**
 * pour les couvertures basses, dont le glyphe disparaît sans remplaçant.
 */
export function glyphe(type: TypeVeg, age: Palier | number, etatFeu: EtatFeu): string | null {
  if (etatFeu === 'roussi') {
    if (type === 'pinNoir' || type === 'pinSylvestre') return 'm-pin-roussi';
    if (type === 'chene' || type === 'hetre') return 'm-chene-roussi';
  }
  if (etatFeu === 'consomme') {
    if (type === 'chene' || type === 'hetre') return 'm-souche';
    if (type === 'pinNoir' || type === 'pinSylvestre') return 'm-pin-mort';
    if (type === 'garrigue' || type === 'friche' || type === 'pelouse') return null;
  }
  switch (type) {
    case 'chene': return 'm-chene';
    case 'hetre': return 'm-hetre';
    case 'pinNoir': return age >= 3 ? 'm-pin3' : 'm-pin';
    case 'pinSylvestre': return 'm-sylv';
    case 'garrigue': return 'm-garrigue';
    case 'pelouse': return 'm-pelouse';
    case 'friche': return 'm-friche';
    case 'ripisylve': return 'm-ripi';
    case 'rocher': return 'm-rocher';
    case 'bati': return 'm-bati';
  }
}

/** § 8.2, largeur de base du glyphe. */
export function largeurGlyphe(type: TypeVeg, age: Palier | number): number {
  if (type === 'bati') return 118;
  if (type === 'rocher') return 86;
  if (type === 'ripisylve') return 96;
  if (type === 'garrigue' || type === 'friche' || type === 'pelouse') return 96;
  return age >= 3 ? 108 : age >= 2 ? 84 : 62;
}

/**
 * § 8.2, les deux régimes de semis.
 *
 * Un **peuplement** se sème sur la bande basse de la cellule ; une couverture
 * non forestière garde la ligne de pied. La v3 pose cette distinction parce
 * qu'une cellule qui alignait ses glyphes se lisait comme une haie.
 *
 * La ripisylve est arborée dans le modèle mais **non forestière** ici : le
 * handoff la range avec la garrigue et le bâti, son glyphe figurant un cordon
 * rivulaire et non un peuplement à compter.
 */
export const estPeuplement = (type: TypeVeg): boolean =>
  type === 'chene' || type === 'hetre' || type === 'pinNoir' || type === 'pinSylvestre';

/**
 * Effectif d'un peuplement par palier de densité. La v3 remplace l'intervalle
 * à juger (2 à 5 glyphes plus ou moins espacés) par un effectif à compter : le
 * couvert fermé se voit au recouvrement continu de douze houppiers, non à un
 * pas de semis qu'il faudrait mesurer à l'œil.
 */
const EFFECTIF = [3, 5, 8, 12] as const;

/**
 * Tapis : les couvertures qui *sont* leur propre strate basse — garrigue,
 * pelouse, friche.
 *
 * Sur ces parcelles, la densité de tiges est un canal mort : le modèle ne la
 * fait pas croître (`lent.ts` ne vieillit et ne densifie que si `arbore`), si
 * bien qu'elle ne quitte jamais le premier palier de toute une partie. Le
 * nombre de glyphes n'y dit donc *rien*. Ce qui varie, c'est le sous-bois, qui
 * est la végétation elle-même puisque rien ne pousse au-dessus : le motif de
 * sol et les touffes décrivent la même strate, et la dire deux fois la rend
 * illisible — une garrigue dense se noie dans le semis de points qui la couvre.
 *
 * **Le rocher en est exclu**, bien qu'il soit sans arbres : `lent.ts` saute
 * aussi son sous-bois, gelé à la valeur tirée à la génération. Y porter le
 * sous-bois ferait compter des cailloux au gré d'un bruit que rien n'entretient.
 */
export const estTapis = (type: TypeVeg): boolean =>
  type === 'garrigue' || type === 'pelouse' || type === 'friche';

/**
 * Effectif d'un tapis par palier de sous-bois (0 à 4). Même échelle de lecture
 * que les peuplements : compter, et non juger un espacement.
 */
const EFFECTIF_TAPIS = [2, 3, 5, 8, 12] as const;
export const effectifTapis = (sousBois: 0 | 1 | 2 | 3 | 4): number => EFFECTIF_TAPIS[sousBois];

/**
 * § 8.2, nombre d'instances semées.
 *
 * `etalee` signale une couverture basse passée au régime de semis. Elle en
 * demande davantage : trois touffes alignées couvrent leur parcelle, les mêmes
 * trois réparties sur une bande la laissent nue. On monte donc garrigue, friche
 * et pelouse à six, sans toucher au régime de ligne de pied, qui reste conforme
 * au handoff. Rocher et ripisylve gardent leurs deux instances : ce sont des
 * accidents et un cordon, pas des tapis.
 */
export function nombreInstances(type: TypeVeg, densite: Palier, etalee = false): number {
  if (estPeuplement(type)) return EFFECTIF[densite - 1];
  if (type === 'bati') return 1;
  if (type === 'rocher' || type === 'ripisylve') return 2;
  return etalee ? 6 : 3; // garrigue, friche, pelouse
}
