import type { Cellule, Meteo } from './types';
import { TYPES, DENSITE, HUMIDITE, SURVIE, ISSUE, ENTRETIEN, SOUS_BOIS, METRES_PAR_CELLULE } from './params';
import { borne, dans, idx } from './util';

/**
 * Variables dérivées (§4.4). Recalculées à chaque lecture, jamais stockées :
 * c'est ce qui garantit qu'aucune ne peut dériver de l'état qui la produit.
 *
 * La chaîne causale que le joueur doit pouvoir suivre (règle 2) est :
 *
 *   levier → densité / sousBois / durcissement
 *          → humiditeLocale et combustible
 *          → inflammabilite
 *          → propagation et intensite
 *          → issue de la parcelle et sort des constructions
 *
 * Trois maillons, tous affichables. C'est l'absence de `humiditeLocale` dans la
 * v2 qui rendait l'hydrologie et l'indice de sécheresse incompréhensibles.
 */

/**
 * Humidité locale 0–1 (§5). Endogène, par cellule : c'est celle que le joueur
 * influence, par opposition à la sécheresse régionale, qui est une météo.
 *
 * Un couvert fermé tamponne le microclimat, un couvert ouvert assèche. C'est ce
 * terme qui donne au couvert fermé une valeur positive, et donc qui empêche
 * « raser tout » d'être gagnant.
 */
export function humiditeLocale(c: Cellule, meteo: Meteo): number {
  const T = TYPES[c.type];
  let h = HUMIDITE.base;
  h += HUMIDITE.topo[c.positionTopo];
  h += T.couvert * HUMIDITE.poidsCouvert;
  h -= c.expositionSud * HUMIDITE.poidsExpositionSud;
  h -= meteo.secheresse * HUMIDITE.poidsSecheresse;
  return borne(h, 0, 1);
}

/** Charge de combustible 0–1, dérivée du type, de la densité, du sous-bois et
 *  de l'effet résiduel d'un brûlage (§4.4). */
export function combustible(c: Cellule): number {
  const T = TYPES[c.type];
  const partArboree = T.arbore ? borne(c.densite / DENSITE.plafond, 0, 1) * 0.3 : 0;
  let f = T.combustible * 0.45 + c.sousBois * 0.4 + partArboree;
  if (c.effetBrulage > 0) f *= 0.6 + 0.05 * (8 - c.effetBrulage);
  return borne(f, 0.02, 1);
}

/**
 * Inflammabilité 0–1 : combustible confronté à l'humidité locale, pondéré par
 * l'inflammabilité intrinsèque du type.
 *
 * Particularité des herbacées (§4.4) : une pelouse ou une friche porte le feu à
 * un taux de couvert bien plus bas que des ligneux. Une parcelle rasée mal
 * entretenue est donc plus inflammable que la forêt qu'elle a remplacée.
 */
export function inflammabilite(c: Cellule, meteo: Meteo): number {
  const T = TYPES[c.type];
  const f = combustible(c);
  // En dessous du seuil de couvert du type, le feu ne trouve pas de continuité.
  const continuite = borne((f - T.seuilCouvert * 0.35) / (1 - T.seuilCouvert * 0.35), 0, 1);
  const sec = 1 - humiditeLocale(c, meteo) * 0.88;
  return borne(T.inflammabilite * (0.25 + 0.75 * continuite) * sec, 0, 1);
}

/** Vitesse de propagation relative du type : l'herbe court, la forêt traîne. */
export function vitesse(c: Cellule): number {
  return TYPES[c.type].vitesse;
}

/**
 * Continuité verticale : ce qui fait passer un feu de surface en cime. C'est le
 * sous-bois qui fournit l'échelle, et une densité au-dessus du seuil sans
 * gestion qui l'aggrave nettement.
 */
export function continuiteVerticale(c: Cellule): number {
  const T = TYPES[c.type];
  if (!T.arbore) return 0;
  const surdensite = c.densite > DENSITE.seuil && !estGeree(c) ? 0.35 : 0;
  return borne(T.couvert * (0.12 + 0.42 * c.sousBois + surdensite), 0, 1);
}

/** Intensité 0–1 en une cellule : combustible, humidité, vent et pente (§7.4). */
export function intensite(c: Cellule, meteo: Meteo): number {
  const f = combustible(c);
  const sec = 1 - humiditeLocale(c, meteo);
  const vent = 0.6 + meteo.ventForce * 0.5;
  const pente = 1 + c.pente * 0.55;
  return borne(f * (0.35 + 0.65 * sec) * vent * pente * (1 + continuiteVerticale(c) * 0.7), 0, 1.4);
}

/**
 * Durée d'exposition produite par une cellule, dans les unités de la règle de
 * survie du §8.1. Elle croît avec le sous-bois : c'est la litière et la
 * broussaille qui font brûler longtemps au pied des arbres, pas la cime.
 */
export function residence(c: Cellule): number {
  return SURVIE.residenceBase + c.sousBois * SURVIE.residenceParSousBois;
}

/** Épaisseur d'écorce en cm, fonction de l'âge et de l'essence (§8.1). */
export function epaisseurEcorce(c: Cellule): number {
  return TYPES[c.type].ecorceParTour * c.age;
}

/**
 * Survie individuelle au feu de surface (§8.1) : un arbre survit si la durée
 * d'exposition reste sous environ trois fois le carré de l'épaisseur d'écorce.
 *
 * Conséquence de jeu recherchée : laisser vieillir les peuplements devient une
 * mesure de prévention lisible, et les jeunes peuplements denses à branchaison
 * basse sont le vrai point faible.
 */
export function survitAuFeuDeSurface(c: Cellule): boolean {
  const e = epaisseurEcorce(c);
  return residence(c) < SURVIE.facteurEcorce * e * e;
}

/**
 * Sévérité normalisée 0–1 subie par une parcelle, à partir de l'intensité du
 * feu qui l'a parcourue et de sa propre continuité verticale.
 *
 * La normalisation est essentielle et non cosmétique : `intensite` monte à 1,4
 * et la continuité à 1, donc une sévérité non bornée dépasse largement les
 * seuils du §8.1 et **toutes** les parcelles finissent en houppier consommé.
 * Les trois issues du §8.1 redeviennent alors les deux du brief précédent, et
 * la correction que le §8.1 apporte est perdue.
 */
export function severite(intensiteFeu: number, c: Cellule): number {
  const i = borne(intensiteFeu / 1.4, 0, 1);
  return borne(i * (0.45 + 0.55 * continuiteVerticale(c)), 0, 1);
}

/** Laquelle des trois issues du §8.1 la parcelle subit-elle ? */
export function issueSubie(c: Cellule, meteo: Meteo): 'surface' | 'houppierRoussi' | 'houppierConsomme' {
  const s = severite(intensite(c, meteo), c);
  if (s >= ISSUE.houppierConsomme) return 'houppierConsomme';
  if (s >= ISSUE.houppierRoussi) return 'houppierRoussi';
  return 'surface';
}

/** La parcelle porte-t-elle encore une mémoire de gestion (§4.2) ? */
export function estGeree(c: Cellule): boolean {
  return c.gestion < DENSITE.memoireGestion;
}

/** Peuplement dense et non géré : le moteur de sévérité. */
export function estFermee(c: Cellule): boolean {
  return TYPES[c.type].arbore && c.densite > DENSITE.seuil && !estGeree(c);
}

/**
 * État mosaïque (règle 1). Ce n'est pas un type de terrain mais un état
 * émergent : une parcelle boisée, pâturée depuis plusieurs tours, dont la
 * densité reste sous le seuil. Le contrat cesse, l'état se défait.
 */
export function estMosaique(c: Cellule): boolean {
  return (
    TYPES[c.type].arbore &&
    c.paturage >= ENTRETIEN.toursMosaique &&
    c.densite <= DENSITE.seuil &&
    c.sousBois <= SOUS_BOIS.seuilTraite
  );
}

/** Une surface ouverte est-elle en train d'être abandonnée (patch 2) ? */
export function enDesherence(c: Cellule): boolean {
  return c.ouverture > 0 && c.sansEntretien >= ENTRETIEN.toursAvantFriche;
}

/**
 * Profondeur réellement traitée autour d'une construction, en mètres, mesurée
 * sur la grille fine : on s'éloigne par anneaux jusqu'à rencontrer du sous-bois
 * non traité. C'est ce qui alimente la défendabilité (§7.4), et c'est mesuré,
 * pas déclaré : une politique qui ne tient pas le terrain ne produit pas de
 * profondeur.
 */
export function profondeurTraiteeReelle(grille: Cellule[], c: Cellule, rayonMax = 4): number {
  for (let r = 1; r <= rayonMax; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // anneau seulement
        if (!dans(c.x + dx, c.y + dy)) continue;
        const n = grille[idx(c.x + dx, c.y + dy)];
        if (n.type === 'bati' || n.type === 'rocher') continue;
        if (n.sousBois > SOUS_BOIS.seuilTraite) return (r - 1) * METRES_PAR_CELLULE;
      }
    }
  }
  return rayonMax * METRES_PAR_CELLULE;
}
