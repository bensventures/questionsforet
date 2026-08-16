import type { Eleveurs, Etat, Ligne } from './types';

/**
 * Partenaires (§10). La ressource rare n'est pas l'argent, c'est le partenaire
 * compétent : ils se perdent faute de sollicitation, et se reconstituent
 * beaucoup plus lentement qu'ils ne disparaissent.
 *
 * **Trois grandeurs séparées, jamais additionnées.** Le compteur unique de la
 * première écriture ne pouvait pas distinguer un succès d'une perte : le même
 * zéro disait « les deux sont sous contrat, le sous-bois est tenu » et « les
 * deux sont partis, le levier est mort ». C'est un manque de modèle, pas un
 * problème d'affichage, et l'interface n'a pas à recomposer ce que le noyau a
 * agrégé.
 *
 * Deux conséquences que le compteur unique masquait aussi :
 *
 * - **l'engagement était irréversible.** Rien ne rendait l'éleveur au vivier
 *   quand le contrat cessait, si bien que la valeur ne pouvait que descendre.
 *   Mesuré sur six parties : zéro dès le tour 7, et jamais de remontée ;
 * - **le retour n'existait pas.** `toursAvantRetour` était déclaré et lu par
 *   personne, donc l'asymétrie 6 / 18 qui porte l'enseignement n'était pas dans
 *   le modèle, seulement dans le commentaire qui la décrivait.
 *
 * Invariant tenu à chaque tour : `disponibles + engages <= eleveursMax`, et
 * aucune des trois valeurs n'est dérivable des deux autres.
 */

export const PARTENAIRES = {
  /** Plafond de la profession sur le territoire : disponibles et engagés. */
  eleveursMax: 3,
  /** Tours sans aucun contrat au bout desquels un éleveur s'en va (déprise). */
  toursAvantDeprise: 6,
  /** Tours nécessaires pour qu'un éleveur revienne. Bien plus long. */
  toursAvantRetour: 18,
};

/** Vivier de départ : deux installations en activité sur les trois que le
 *  territoire pourrait porter. Le troisième siège est vide et le reste tant
 *  qu'aucun retour ne le remplit. */
export function creerEleveurs(): Eleveurs {
  return { disponibles: 2, engages: 0, perdus: 0, retourAu: null };
}

/** Engage un éleveur sur un contrat. Faux si aucun n'est disponible. */
export function engagerEleveur(e: Eleveurs): boolean {
  if (e.disponibles <= 0) return false;
  e.disponibles--;
  e.engages++;
  return true;
}

/**
 * Rend un éleveur au vivier quand un contrat cesse, qu'il ait été levé par le
 * joueur ou abandonné faute de moyens. Le contrat s'arrête, l'activité ne
 * s'arrête pas : c'est la déprise, six tours plus tard, qui l'emporte.
 */
export function libererEleveur(e: Eleveurs): void {
  if (e.engages <= 0) return;
  e.engages--;
  e.disponibles++;
}

/**
 * Déprise et retour, une fois par tour. La date de retour est **calculée et
 * portée par l'état** (`retourAu`) plutôt que recalculée à l'affichage : c'est
 * elle que l'interface écrit en clair au moment de la perte.
 */
export function suivrePartenaires(etat: Etat, sansContrat: number): Ligne[] {
  const lignes: Ligne[] = [];
  const e = etat.moyens.eleveurs;

  // Déprise. Un éleveur sous contrat ne part pas : c'est le débouché qui le
  // tient. Seul le vivier disponible s'érode.
  if (
    e.engages === 0 &&
    sansContrat > 0 &&
    sansContrat % PARTENAIRES.toursAvantDeprise === 0 &&
    e.disponibles > 0
  ) {
    e.disponibles--;
    e.perdus++;
    if (e.retourAu === null) e.retourAu = etat.tour + PARTENAIRES.toursAvantRetour;
    lignes.push({
      texte:
        "Un·e éleveur·euse a cessé son activité faute de débouché. Il faut bien plus de temps pour retrouver quelqu'un que " +
        `pour perdre une installation : pas avant le tour ${e.retourAu}.`,
      ton: 'chaud',
    });
  }

  // Retour. Beaucoup plus lent que la perte, et un seul à la fois : les départs
  // suivants attendent leur tour dans la file.
  if (e.retourAu !== null && etat.tour >= e.retourAu && e.perdus > 0) {
    if (e.disponibles + e.engages < PARTENAIRES.eleveursMax) {
      e.perdus--;
      e.disponibles++;
      lignes.push({
        texte: 'Une installation pastorale reprend sur le territoire : un contrat redevient possible.',
        ton: 'bon',
      });
    }
    e.retourAu = e.perdus > 0 ? etat.tour + PARTENAIRES.toursAvantRetour : null;
  }

  return lignes;
}
