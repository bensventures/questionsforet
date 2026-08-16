import type { IdPolitique } from '../model/types';

/**
 * Ce sur quoi le simulateur s'appuie, mécanisme par mécanisme.
 *
 * La colonne vertébrale du projet est que **les sources sont des données** et
 * que la rigueur doit être visible du lecteur. L'objet le plus argumenté du
 * site ne peut pas être le seul sans traçabilité : chaque levier renvoie donc
 * aux références dont sa règle est tirée, et les mécaniques que personne ne
 * décide (braises, paradoxe de la suppression) aux leurs.
 *
 * **Rien n'est inventé ici.** Ces rattachements sont ceux que portait la v2
 * (`src/sim/`, supprimée depuis, à retrouver dans l'historique git), reportés
 * sur les leviers v3 qui leur correspondent un pour un. Les trois politiques que la v2 avait et
 * que la v3.0 n'implémente pas (brûlage dirigé, hydrologie, encadrement de la
 * reconstruction) ne figurent pas : on ne cite pas une règle qui n'existe pas.
 *
 * Tout identifiant cité doit être déclaré dans le frontmatter de l'outil, sans
 * quoi `reference()` fait échouer le build : c'est le garde-fou voulu.
 */

export interface MecanismeSource {
  /** Nom affiché, repris du modèle quand il en a un. */
  nom: string;
  /** Ce que la règle fait, en une ligne. */
  regle: string;
  ids: string[];
}

/** Les quatre politiques de la v3.0, dans l'ordre du panneau. */
export const SOURCES_POLITIQUES: Record<IdPolitique, MecanismeSource> = {
  old: {
    nom: 'Contrôle des obligations de débroussaillement',
    regle: "Le contrôle fait monter la conformité sans jamais l'atteindre, et l'apron traité rend les secours capables d'approcher.",
    ids: ['pimont-2019-debroussaillement', 'revertegat-2025-vulnefeu', 'csfs-grasslands', 'wragg-2018'],
  },
  durcissement: {
    nom: 'Aide au durcissement du bâti',
    regle: 'Le durcissement est la seule protection réelle contre les braises, et il ne réduit pas la surface brûlée.',
    ids: ['cohen-home-ignition-zone', 'calfire-defensible-space', 'syphard-2014', 'syphard-2019'],
  },
  pastoral: {
    nom: 'Contrat pastoral',
    regle: "Le pâturage maintient le sous-bois bas tant qu'il dure, et l'état mosaïque se défait dès qu'il cesse.",
    ids: ['sardaigne-grazing-2024', 'ruiz-mirazo-2011'],
  },
  eclaircie: {
    nom: 'Programme d’éclaircie',
    regle: "La densité et le statut « géré » gouvernent la continuité verticale ; l'opération est déficitaire en terrain raide et éloigné.",
    ids: ['gilloz-2026-ifn-diois', 'repeto-deudero-2025', 'banerjee-2020', 'bigelow-north-2012', 'millikin-2024'],
  },
};

/**
 * Ce que personne ne décide et qui décide de tout : les mécaniques que le
 * modèle applique seul. Ce sont elles qui portent la thèse du dossier, et elles
 * doivent être sourcées au même titre que les leviers.
 */
export const SOURCES_MECANIQUES: MecanismeSource[] = [
  {
    nom: 'Les braises, et non le front',
    regle: "Une cellule intense émet une averse de brandons à queue longue, indépendante du terrain traversé : c'est la première cause de perte chez les constructions conformes.",
    ids: ['pybrands-2023', 'biology-insights-braises-2025', 'cohen-home-ignition-zone'],
  },
  {
    nom: 'Le paradoxe de la suppression',
    regle: "Éteindre tout départ laisse le combustible en place : la tranquillité s'accumule en dette, et le grand feu la solde.",
    ids: ['kreider-2024', 'alexandrian-rigolot-1992'],
  },
  {
    nom: 'Après le feu, la régénération différenciée',
    regle: "Les feuillus rejettent de souche, le pin noir n'a pas de cônes sérotineux : après un feu sévère il ne revient pas, et la parcelle bascule en lande.",
    ids: ['fady-perret-2020-pin-noir', 'baeza-santana', 'canopee-arbres-sensibles', 'repeto-deudero-2025'],
  },
  {
    nom: 'Raser n’est pas réduire',
    regle: 'Une surface ouverte et laissée sans entretien bascule en friche à graminées, où le feu court plus vite que dans la forêt qu’elle a remplacée.',
    ids: ['csfs-grasslands', 'wragg-2018', 'revertegat-2025-vulnefeu'],
  },
  {
    nom: 'Reconstruire autrement',
    regle: 'Un couvert mélangé retient l’humidité et brûle moins qu’une pinède homogène : c’est ce que la régénération peut donner si on ne replante pas à l’identique.',
    ids: ['mixed-forests-flammability-2018', 'canopee-forets-melangees'],
  },
];
