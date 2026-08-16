/**
 * Jetons du langage de décision (§ 1 du handoff `design_handoff_langage_de_decision`).
 *
 * Source unique : aucune couleur du panneau ne doit être écrite ailleurs.
 * Ce sont les valeurs du handoff à la lettre, non des approximations reprises
 * de la charte de paysage, dont le vocabulaire couvre le terrain et non
 * l'interface.
 *
 * **La réserve chaude ne dit que trois choses** : l'interaction possible,
 * l'irréversible, le subi. Jamais « valeur basse », jamais « attention
 * générale ». Aucun feu tricolore, aucune jauge de danger globale : le risque
 * est local et se lit sur la carte, c'est tout l'objet du calque et du grain.
 */

export const JETONS = {
  parchemin: 'oklch(0.955 0.016 86)',
  parcheminRang: 'oklch(0.935 0.02 84)',
  encre: 'oklch(0.26 0.03 62)',
  encre2: 'oklch(0.42 0.035 64)',
  encre3: 'oklch(0.52 0.03 70)',
  braise: 'oklch(0.55 0.16 44)',
  braiseTexte: 'oklch(0.42 0.12 44)',
  braisePlein: 'oklch(0.48 0.16 44)',
  braiseLeger: 'oklch(0.925 0.035 72)',
  pin: 'oklch(0.44 0.07 150)',
  pinClair: 'oklch(0.62 0.06 148)',
  filet: 'oklch(0.86 0.02 82)',
  filetBloc: 'oklch(0.30 0.025 70)',
  /** Encre du filet d'une politique activable, et du liseré correspondant. */
  activable: 'oklch(0.50 0.03 74)',
  /** Filet d'une politique levée : présent, éteint. */
  levee: 'oklch(0.76 0.015 86)',
  /** Crans d'une politique abandonnée. */
  abandonCrans: 'oklch(0.72 0.09 52)',
  encreInverse: 'oklch(0.96 0.014 88)',
} as const;

/**
 * Hachure braise. **Deux emplois dans toute la couche, pas un de plus** : le
 * refus d'une action ponctuelle, et le dépassement du plafond d'entretien. La
 * planche du panneau vérifie ce compte.
 */
export const HACHURE_BRAISE =
  `repeating-linear-gradient(135deg, oklch(0.72 0.11 46) 0 1px, transparent 1px 7px)`;

/**
 * Deux familles, pas trois. Fraunces porte les noms et les **nombres de
 * constat** ; Hanken Grotesk tout le reste de l'interface. Le chrome des
 * planches (Spectral, IBM Plex Mono) est le registre du document de
 * spécification et ne s'implémente pas.
 */
export const POLICES = {
  titre: '"Fraunces Variable", Fraunces, ui-serif, Georgia, serif',
  interface: '"Hanken Grotesk Variable", "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif',
} as const;

/** Largeur du panneau latéral (§ 9 du handoff, écran complet). */
export const LARGEUR_PANNEAU = 536;
