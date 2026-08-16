import type { GesteVue, VuePanneau } from './vue';
import { bandeauRessources, blocSecteur, compteRendu, piedTour, registreGestes, selecteurDoctrine } from './blocs';

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
export { fichePolitique } from './blocs';

/**
 * Assemblage du panneau de décision.
 *
 * **L'ordre descend du durable vers l'immédiat** : moyens, doctrine, secteur et
 * ses politiques, compte rendu, gestes contre le bord bas. La place des gestes
 * dans l'ordre de lecture dit ce qu'ils sont : ils soulagent sans transformer.
 *
 * Le compte rendu est le seul bloc qui défile ; les fiches du secteur restent
 * en place, sans quoi la lecture d'une chaîne causale se ferait en poursuivant
 * la fiche à l'écran.
 */
export function rendrePanneau(v: VuePanneau, options: { geste?: GesteVue['type'] | null } = {}): string {
  return `<aside class="pan">
${bandeauRessources(v)}
${selecteurDoctrine(v)}
${blocSecteur(v)}
${compteRendu(v)}
${registreGestes(v, options.geste ?? null)}
${piedTour(v)}
</aside>`;
}
