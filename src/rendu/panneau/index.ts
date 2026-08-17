import type { GesteVue, VuePanneau } from './vue';
import type { Onglet } from './blocs';
import {
  bandeauRessources,
  blocSecteur,
  compteRendu,
  ongletsDesRegistres,
  piedTour,
  selecteurDoctrine,
} from './blocs';

export { STYLES_PANNEAU } from './styles';

/**
 * Classe à poser sur tout fragment de la couche décision rendu **hors** du
 * panneau : elle porte les jetons, sans lesquels les aplats sortent en
 * transparent et les crans d'adoption disparaissent sans erreur.
 */
export const CLASSE_JETONS = 'decision';
export { JETONS, LARGEUR_PANNEAU, POLICES } from './jetons';
export * from './vue';
export * from './fin';
export * from './ecran';
export * from './ouverture';
export { fichePolitique } from './blocs';
export type { Onglet } from './blocs';

/**
 * Assemblage du panneau de décision.
 *
 * **L'ordre descend du durable vers l'immédiat** : moyens, doctrine, puis les
 * deux registres de dépense en onglets, politiques d'un côté et gestes de
 * l'autre. La doctrine reste au-dessus des onglets : le budget a trois emplois
 * et non deux, et celui-là est une posture qu'on tient, pas un achat qu'on fait.
 *
 * **Le compte rendu a quitté la pile pour le bas fixe de la colonne.** C'est là
 * que le jeu explique, faute de score agrégé, et il ne peut pas dépendre du
 * défilement d'une pile que la liste des quatorze secteurs allonge à elle
 * seule ; ni disparaître sous le tiroir au moment précis où l'on ouvre la fiche
 * dont il vient de raconter l'effet. Il est donc borné en hauteur et défile
 * chez lui, comme la carte défile dans son cadre.
 */
export function rendrePanneau(
  v: VuePanneau,
  options: {
    geste?: GesteVue['type'] | null;
    onglet?: Onglet;
    /** Le tiroir vient de s'ouvrir : il glisse. Faux au simple réengendrement. */
    tiroirNeuf?: boolean;
    /** Rang de la décision qui vient d'être engagée, à signaler dans le pied. */
    signale?: number;
  } = {},
): string {
  // Le bandeau, le compte rendu et le pied ne bougent jamais : l'état des
  // moyens, ce qu'a fait l'été et le passage au suivant valent quoi qu'on
  // regarde. Entre eux, le corps porte la pile courante (doctrine, secteurs,
  // gestes) et le **tiroir** du secteur choisi vient la couvrir. C'est ce qui
  // rend la sélection évidente : elle ne change pas un bloc au milieu d'une
  // colonne, elle occupe la colonne, et on la referme pour revenir.
  // Le compte vient du récapitulatif lui-même. Le calculer à part comptait les
  // fiches du **secteur ouvert**, donc oubliait une politique engagée ailleurs :
  // le pied annonçait deux décisions et en listait trois.
  const enAttente = v.enAttente?.length ?? 0;
  return `<aside class="pan">
${bandeauRessources(v)}
<div class="pan__corps">
  <div class="pan__pile">
${selecteurDoctrine(v)}
${ongletsDesRegistres(v, options.geste ?? null, options.onglet ?? 'politiques')}
  </div>
${blocSecteur(v, options.tiroirNeuf ?? true)}
</div>
${compteRendu(v)}
${piedTour(v, enAttente, options.signale)}
</aside>`;
}
