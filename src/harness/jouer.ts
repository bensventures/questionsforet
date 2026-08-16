import type { Decisions, Doctrine, Etat } from '../model/types';
import { creerRng } from '../model/rng';
import { creerEtat } from '../model/terrain';
import { avancer } from '../model/avancer';
import { HORIZON } from '../model/params';
import { indicateurs } from '../model/indicateurs';
import { comptes } from '../model/economie';

/**
 * Couche d'exécution sans interface (§2, §12).
 *
 * Sans elle, les critères de calibration du §12 sont inapplicables à la main.
 * C'est la partie à construire en premier, avant tout réglage : c'est
 * exactement ce que la v2 n'avait pas, et c'est pourquoi sa calibration se
 * faisait à l'aveugle.
 */

/** Une stratégie scriptée décide, à chaque tour, ce que le joueur ferait. */
export interface Strategie {
  nom: string;
  decider(etat: Etat, tour: number): Decisions;
}

export interface Resultat {
  graine: number;
  /** Constructions debout à la fin, sur le total. */
  batiDebout: number;
  batiTotal: number;
  batiPct: number;
  /** Part de la carte parcourue au moins une fois. */
  bruleePct: number;
  /** Part des peuplements boisés denses et non gérés. */
  fermeePct: number;
  /** Part du massif sous le seuil de densité — observation, plus une cible. */
  sousSeuilPct: number;
  /**
   * Part sous le seuil sur la **fraction stratégique** : couronnes de hameaux
   * et secteurs sous contrat. On ne gère pas le massif, on gère des zones
   * stratégiques, et le reste peut rester dense — c'est un résultat souhaité,
   * pas un échec (amendement 2, A.2).
   */
  sousSeuilStrategiquePct: number;
  /** Part du paysage capable de se reconstituer après feu (feuillus, ripisylve). */
  recuperationPct: number;
  /** Part des constructions conformes à leur obligation, en fin de partie. */
  conformitePct: number;
  /** Pertes ventilées par conformité (amendement 2, C). */
  braiseConforme: number;
  frontConforme: number;
  braiseNonConforme: number;
  frontNonConforme: number;
  /** Part des parcelles boisées en état mosaïque (§1, règle 1). */
  mosaiquePct: number;
  densiteMoyenne: number;
  biodiversite: number;
  /** Pertes de bâti par cause (patch 3, assertion 1). */
  pertesBraise: number;
  pertesFront: number;
  pertesSecoursDebordes: number;
  departsEteints: number;
  /** Étés passés en extinction systématique : le témoin du piège, désormais
   *  la posture héritée. */
  toursCran1: number;
  /** Occasions où les constructions défendables ont dépassé les équipes. */
  toursSecoursDebordes: number;
  /** Conversion irréversible : pin noir devenu lande ou pelouse. */
  pinNoirPerdu: number;
  /** Part de la carte en friche à graminées à la fin (piège du renoncement). */
  frichePct: number;
  /** Surface maximale effectivement entretenue en un tour : le plafond du patch 2. */
  surfaceTenueMax: number;
  /** Politiques abandonnées faute de moyens (cible §12), déduites tour à tour. */
  renoncements: number;
  /** Le même compte, tenu par le modèle et lu par l'écran de fin de partie. */
  renoncementsModele: number;
  /**
   * Vivier d'éleveurs en fin de partie, en trois grandeurs séparées : c'est ce
   * qui distingue un zéro de succès (tous engagés) d'un zéro de déprise (tous
   * perdus). Le compteur agrégé qui les précédait ne le permettait pas.
   */
  eleveursEngages: number;
  eleveursDisponibles: number;
  eleveursPerdus: number;
  depense: number;
  recettes: number;
}

export function jouerPartie(graine: number, strat: Strategie, tours = HORIZON.long): Resultat {
  const rng = creerRng(graine);
  const etat = creerEtat(graine, rng, tours);

  let pinNoirDepart = 0;
  for (const c of etat.grille) if (c.type === 'pinNoir') pinNoirDepart++;
  let toursSecoursDebordes = 0;
  let surfaceTenueMax = 0;
  let renoncements = 0;

  const clef = (a: { id: string; secteur: number }) => `${a.id}:${a.secteur}`;
  for (;;) {
    const avant = new Set(etat.politiques.map(clef));
    const decisions = strat.decider(etat, etat.tour);
    const levees = new Set((decisions.lever ?? []).map(clef));
    const t = avancer(etat, decisions, rng);
    const b = etat.dernierFeu;
    if (b && b.defendables > b.equipes) toursSecoursDebordes++;
    // Une politique présente avant le tour, absente après, et que la stratégie
    // n'a pas levée elle-même, a été abandonnée faute de moyens : c'est le
    // renoncement que le §12 attend d'un joueur compétent.
    const apres = new Set(etat.politiques.map(clef));
    for (const k of avant) if (!apres.has(k) && !levees.has(k)) renoncements++;
    const tenue = comptes(etat).surfaceTenue;
    if (tenue > surfaceTenueMax) surfaceTenueMax = tenue;
    if (t.termine) break;
  }

  // Les indicateurs de paysage et de bâti viennent du noyau : l'écran de fin de
  // partie lira exactement la même fonction, sinon les cibles du §12 et ce que
  // le joueur voit finiraient par diverger.
  const ind = indicateurs(etat);

  return {
    graine,
    batiDebout: ind.batiDebout, batiTotal: ind.batiTotal, batiPct: ind.batiPct,
    bruleePct: ind.bruleePct,
    fermeePct: ind.fermeePct,
    sousSeuilPct: ind.sousSeuilPct,
    sousSeuilStrategiquePct: ind.sousSeuilStrategiquePct,
    recuperationPct: ind.recuperationPct,
    conformitePct: ind.conformitePct,
    braiseConforme: etat.cumul.braiseConforme,
    frontConforme: etat.cumul.frontConforme,
    braiseNonConforme: etat.cumul.braiseNonConforme,
    frontNonConforme: etat.cumul.frontNonConforme,
    mosaiquePct: ind.mosaiquePct,
    densiteMoyenne: ind.densiteMoyenne,
    biodiversite: ind.biodiversite,
    pertesBraise: etat.cumul.pertesBraise,
    pertesFront: etat.cumul.pertesFront,
    pertesSecoursDebordes: etat.cumul.pertesSecoursDebordes,
    departsEteints: etat.cumul.departsEteints,
    toursCran1: etat.cumul.toursCran1,
    toursSecoursDebordes,
    pinNoirPerdu: Math.max(0, pinNoirDepart - ind.pinNoir),
    frichePct: ind.frichePct,
    surfaceTenueMax,
    renoncements,
    renoncementsModele: etat.cumul.renoncements,
    eleveursEngages: etat.moyens.eleveurs.engages,
    eleveursDisponibles: etat.moyens.eleveurs.disponibles,
    eleveursPerdus: etat.moyens.eleveurs.perdus,
    depense: Math.round(etat.cumul.depense),
    recettes: Math.round(etat.cumul.recettes),
  };
}

/** Joue N parties d'une stratégie et agrège. */
export function jouerLot(strat: Strategie, parties: number, tours = HORIZON.long): Resultat[] {
  const out: Resultat[] = [];
  for (let k = 0; k < parties; k++) out.push(jouerPartie(1000 + k * 7919, strat, tours));
  return out;
}

export const moyenne = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
export const ecartType = (v: number[]) => {
  const m = moyenne(v);
  return Math.sqrt(moyenne(v.map((x) => (x - m) ** 2)));
};
export const agrege = (r: Resultat[], champ: keyof Resultat) => moyenne(r.map((x) => x[champ] as number));

/** Doctrine constante, la brique de la plupart des stratégies. */
export function doctrineFixe(nom: string, cran: Doctrine): Strategie {
  return { nom, decider: () => ({ doctrine: cran }) };
}
