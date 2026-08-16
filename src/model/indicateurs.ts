import type { Etat } from './types';
import { TYPES, DENSITE } from './params';
import { estFermee, estGeree, estMosaique } from './derive';

/**
 * Indicateurs de paysage et de bâti, lus sur un état à un instant donné.
 *
 * Ils vivaient dans `src/harness/jouer.ts`, seul consommateur tant qu'il n'y
 * avait pas d'interface. L'écran de fin de partie demande exactement les mêmes :
 * les laisser dans le harnais aurait produit deux calculs pour un seul concept,
 * qui divergent au premier ajustement. Le harnais et l'interface lisent
 * désormais cette fonction, et les cibles du §12 portent donc sur ce que le
 * joueur voit.
 *
 * Fonction **pure et sans mémoire** : tout ce qui relève du cumul de partie
 * (pertes par cause, dépenses, renoncements) reste dans `etat.cumul`, qui a son
 * propre processus. On ne recalcule ici que ce qui se lit sur la grille.
 */

export interface Indicateurs {
  batiDebout: number;
  batiTotal: number;
  /** Part du bâti encore debout. */
  batiPct: number;
  /** Part des constructions debout qui respectent leur obligation. */
  conformitePct: number;
  /** Part des peuplements boisés denses et non gérés. */
  fermeePct: number;
  /** Part du massif boisé sous le seuil de densité. Observation, pas cible. */
  sousSeuilPct: number;
  /**
   * La même part sur la **fraction stratégique** : couronnes bâties et secteurs
   * sous contrat. C'est elle que le §12 vise, pas le massif entier (amendement
   * 2, A.2), et c'est le seul dénominateur sur lequel le joueur a un levier.
   */
  sousSeuilStrategiquePct: number;
  /** Part des parcelles boisées en état mosaïque. */
  mosaiquePct: number;
  /** Part du paysage capable de se reconstituer après feu. */
  recuperationPct: number;
  /** Part de la carte en friche à graminées : le piège du renoncement. */
  frichePct: number;
  densiteMoyenne: number;
  biodiversite: number;
  /** Parcelles de pin noir restantes, pour mesurer la conversion irréversible. */
  pinNoir: number;
  /** Parcelles de pin noir converties en lande ou pelouse depuis la génération.
   *  Sans retour spontané possible : c'est la seule ligne en braise de
   *  l'écran de fin. */
  pinNoirConverti: number;
  /** Part de la carte parcourue au moins une fois. Observation, jamais notée. */
  bruleePct: number;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Cellules de la fraction stratégique : couronnes bâties et secteurs sous
 *  contrat pastoral ou d'éclaircie. */
export function fractionStrategique(etat: Etat): Set<number> {
  const strategiques = new Set<number>();
  for (const sec of etat.secteurs) {
    const sousContrat = etat.politiques.some(
      (a) => a.secteur === sec.id && (a.id === 'pastoral' || a.id === 'eclaircie'),
    );
    if (sec.nature === 'couronne' || sousContrat) for (const i of sec.cellules) strategiques.add(i);
  }
  return strategiques;
}

export function indicateurs(etat: Etat): Indicateurs {
  let batiTotal = 0;
  let batiDebout = 0;
  let conformes = 0;
  let boisees = 0;
  let fermees = 0;
  let sousSeuil = 0;
  let mosaique = 0;
  let densite = 0;
  let bio = 0;
  let nonBati = 0;
  let pinNoir = 0;
  let friche = 0;
  let recup = 0;

  const strategiques = fractionStrategique(etat);
  let stratBoisees = 0;
  let stratSousSeuil = 0;

  for (let i = 0; i < etat.grille.length; i++) {
    const c = etat.grille[i];
    if (c.type === 'bati') {
      batiTotal++;
      if (!c.detruite) { batiDebout++; if (c.conforme) conformes++; }
      continue;
    }
    // Capacité de reconstitution : ce qui rejette de souche ou reste forestier.
    if (c.type === 'chene' || c.type === 'ripisylve' || c.type === 'hetre') recup++;
    if (strategiques.has(i) && TYPES[c.type].arbore) {
      stratBoisees++;
      if (c.densite <= DENSITE.seuil || estGeree(c)) stratSousSeuil++;
    }
    nonBati++;
    bio += TYPES[c.type].bio;
    if (c.type === 'pinNoir') pinNoir++;
    if (c.type === 'friche') friche++;
    if (TYPES[c.type].arbore) {
      boisees++;
      densite += c.densite;
      if (estFermee(c)) fermees++;
      if (c.densite <= DENSITE.seuil || estGeree(c)) sousSeuil++;
      if (estMosaique(c)) mosaique++;
    }
  }

  return {
    batiDebout,
    batiTotal,
    batiPct: pct(batiDebout, batiTotal),
    conformitePct: pct(conformes, batiDebout),
    fermeePct: pct(fermees, boisees),
    sousSeuilPct: pct(sousSeuil, boisees),
    sousSeuilStrategiquePct: pct(stratSousSeuil, stratBoisees),
    mosaiquePct: pct(mosaique, boisees),
    recuperationPct: pct(recup, nonBati),
    frichePct: pct(friche, etat.grille.length),
    densiteMoyenne: boisees ? Math.round(densite / boisees) : 0,
    biodiversite: nonBati ? Math.round(bio / nonBati) : 0,
    pinNoir,
    pinNoirConverti: Math.max(0, etat.pinNoirDepart - pinNoir),
    bruleePct: pct(etat.cumul.parcouruesDistinctes, etat.grille.length),
  };
}
