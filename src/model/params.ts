import type { TypeVeg, PositionTopo } from './types';

/**
 * Table de paramètres du modèle v3.
 *
 * Le §13 du brief est explicite : du prototype on récupère des données, pas du
 * code. Les valeurs de combustible et d'inflammabilité, le comportement de
 * l'indice de sécheresse, la transition vers la friche et les coûts d'action
 * viennent de la v2, où ils ont été éprouvés. Le reste est nouveau et documenté
 * ici avec la raison de sa présence.
 *
 * Ce sont des ordres de grandeur de jeu, calibrés pour produire des dynamiques
 * justes, pas des mesures transposables à une parcelle réelle.
 */

/** Géométrie de la grille de simulation. Fine, car le feu est un processus de
 *  cellule à cellule et les braises ont besoin de distance (§3). */
export const W = 40;
export const H = 26;

/**
 * Une cellule vaut 50 m de côté. Ce n'est pas un détail d'échelle : le §7.4
 * demande « une cinquantaine de mètres traités » pour qu'une construction soit
 * défendable, et le patch 2 impose un plafond dur de surface entretenue. Avec
 * des cellules de 25 m, être défendable réclamait deux anneaux complets, soit
 * vingt-quatre cellules par maison, que le plafond rendait inatteignables : la
 * défendabilité n'était jamais acquise et toute la mécanique du patch 1 restait
 * lettre morte (mesuré : 3 % du bâti défendable). À 50 m, un anneau traité
 * suffit, et les deux exigences deviennent compatibles.
 *
 * La carte couvre alors 2 km sur 1,3 km, et la queue de projection des braises
 * porte à environ 1,5 km, ce qui correspond aux ordres de grandeur du dossier.
 */
export const METRES_PAR_CELLULE = 50;

export interface ParamsType {
  nom: string;
  /** Charge de combustible de base, 0–1 (v2). */
  combustible: number;
  /** Inflammabilité intrinsèque, 0–1 (v2). */
  inflammabilite: number;
  /**
   * Vitesse de propagation relative. L'herbe brûle vite : l'assertion 4 du
   * patch 3 exige que le feu coure PLUS VITE en friche qu'en forêt, sans quoi
   * le joueur vit le rasage comme sûr. C'est l'inverse du message.
   */
  vitesse: number;
  /**
   * Couvert nécessaire pour porter le feu. Une pelouse sèche propage à ~30 %
   * de couvert, des ligneux à ~80 % (§4.4). Plus le seuil est bas, plus une
   * parcelle dégradée reste dangereuse.
   */
  seuilCouvert: number;
  /** Y a-t-il un étage arboré ? `densite` n'a de sens que là. */
  arbore: boolean;
  /** Le couvert tamponne le microclimat (§4.4). 0–1. */
  couvert: number;
  /**
   * Épaisseur d'écorce gagnée par tour, en cm. Nourrit la règle de survie du
   * §8.1. Le pin noir a une écorce épaisse : c'est pourquoi le brief dit qu'il
   * « se défend mieux qu'annoncé ». Le hêtre a une écorce très fine, et c'est
   * l'essence la plus sensible au feu de la table.
   */
  ecorceParTour: number;
  /** Valeur de biodiversité, 0–100 (v2). */
  bio: number;
}

export const TYPES: Record<TypeVeg, ParamsType> = {
  chene: {
    nom: 'Chênaie', combustible: 0.5, inflammabilite: 0.55, vitesse: 0.75,
    seuilCouvert: 0.8, arbore: true, couvert: 0.85, ecorceParTour: 0.06, bio: 72,
  },
  hetre: {
    nom: 'Hêtraie', combustible: 0.42, inflammabilite: 0.4, vitesse: 0.6,
    seuilCouvert: 0.8, arbore: true, couvert: 0.9, ecorceParTour: 0.02, bio: 76,
  },
  pinNoir: {
    nom: 'Pinède de pin noir', combustible: 0.85, inflammabilite: 1.0, vitesse: 0.9,
    seuilCouvert: 0.8, arbore: true, couvert: 0.9, ecorceParTour: 0.075, bio: 35,
  },
  pinSylvestre: {
    nom: 'Pinède de pin sylvestre', combustible: 0.78, inflammabilite: 0.95, vitesse: 0.88,
    seuilCouvert: 0.8, arbore: true, couvert: 0.8, ecorceParTour: 0.055, bio: 45,
  },
  garrigue: {
    nom: 'Garrigue', combustible: 0.8, inflammabilite: 0.95, vitesse: 1.15,
    seuilCouvert: 0.45, arbore: false, couvert: 0.15, ecorceParTour: 0, bio: 56,
  },
  pelouse: {
    nom: 'Pelouse sèche', combustible: 0.42, inflammabilite: 0.92, vitesse: 1.5,
    seuilCouvert: 0.3, arbore: false, couvert: 0, ecorceParTour: 0, bio: 52,
  },
  friche: {
    // Plus inflammable ET plus rapide que la forêt qu'elle a remplacée.
    nom: 'Friche à graminées', combustible: 0.48, inflammabilite: 1.1, vitesse: 1.8,
    seuilCouvert: 0.3, arbore: false, couvert: 0, ecorceParTour: 0, bio: 22,
  },
  ripisylve: {
    nom: 'Ripisylve', combustible: 0.5, inflammabilite: 0.3, vitesse: 0.5,
    seuilCouvert: 0.85, arbore: true, couvert: 0.8, ecorceParTour: 0.03, bio: 92,
  },
  rocher: {
    nom: 'Rocher', combustible: 0.04, inflammabilite: 0.05, vitesse: 0.3,
    seuilCouvert: 0.95, arbore: false, couvert: 0, ecorceParTour: 0, bio: 24,
  },
  bati: {
    nom: 'Bâti', combustible: 0.35, inflammabilite: 0.55, vitesse: 0.6,
    seuilCouvert: 0.5, arbore: false, couvert: 0, ecorceParTour: 0, bio: 6,
  },
};

/** Densité de tiges (v2, conservée : le seuil vient de Repeto-Deudero 2025). */
export const DENSITE = {
  seuil: 440, // tiges/ha ; au-dessus et sans gestion, la sévérité grimpe
  plafond: 1000,
  croissance: 21, // tiges/ha par tour, fermeture spontanée du paysage
  apresEclaircie: 360,
  reductionEclaircie: 300,
  /** Tours au-delà desquels une parcelle repasse « non gérée » (§4.2). */
  memoireGestion: 10,
};

/** Sous-bois (§6). La croissance accélère sous couvert ouvert : c'est ce qui
 *  punit l'éclaircie brutale et donne sa valeur au couvert fermé. */
export const SOUS_BOIS = {
  croissanceBase: 0.07,
  /** Multiplicateur quand le couvert est ouvert (1 - couvert). */
  bonusOuverture: 0.16,
  /** Niveau au-dessous duquel une surface est considérée traitée. */
  seuilTraite: 0.2,
  /** Niveau maintenu par un pâturage actif. */
  niveauPature: 0.15,
};

/** Entretien et piège du renoncement (patch 2). */
export const ENTRETIEN = {
  /** Tours sans entretien après lesquels une surface ouverte bascule en friche. */
  toursAvantFriche: 3,
  /** Tours de pâturage consécutifs pour que l'état mosaïque émerge (§1, règle 1). */
  toursMosaique: 4,
};

/** Sécheresse régionale (§5). Exogène, corrélée, avec dérive climatique. */
export const CLIMAT = {
  base: 0.34,
  /** Poids de l'année précédente : produit des séquences sèches. */
  correlation: 0.55,
  bruit: 0.22,
  /** Dérive climatique lente sur la partie. */
  derivePart: 0.16,
};

/** Humidité locale (§4.4, §5). Endogène, dérivée, jamais stockée. */
export const HUMIDITE = {
  base: 0.34,
  /** Un couvert fermé tamponne, un couvert ouvert assèche. */
  poidsCouvert: 0.2,
  poidsSecheresse: 0.52,
  poidsExpositionSud: 0.16,
  /** Ce que la position topographique retient. */
  topo: { talweg: 0.26, basVersant: 0.15, versant: 0.03, crete: 0 } as Record<PositionTopo, number>,
};

/**
 * Survie individuelle au feu (§8.1). Un arbre survit si la durée d'exposition
 * reste inférieure à environ trois fois le carré de l'épaisseur d'écorce en
 * centimètres. `residence` ci-dessous est la durée d'exposition produite par la
 * cellule, dans les mêmes unités.
 */
export const SURVIE = {
  facteurEcorce: 3,
  /** Durée d'exposition d'un feu de surface léger, unités de jeu. */
  residenceBase: 2.5,
  /** Ce que le sous-bois ajoute à la durée d'exposition. */
  residenceParSousBois: 14,
  /** Tours de mortalité différée après un houppier roussi. */
  mortaliteDiffereeTours: 3,
};

/** Seuils d'issue de feu (§8.1), sur l'intensité normalisée 0–1. */
export const ISSUE = {
  /** Au-dessus : le houppier est consommé, mortalité sans recours. */
  houppierConsomme: 0.62,
  /** Entre les deux : houppier roussi, bourgeons épargnés. */
  houppierRoussi: 0.4,
};

/** Régénération différenciée (§8.3). Tours avant qu'un état se fixe. */
export const REGEN = {
  tours: 3,
  /** Probabilité que le hêtre, qui rejette, meure malgré tout dans les 3 tours. */
  echecHetre: 0.7,
  /** Probabilité que le pin sylvestre parvienne à se réinstaller. */
  reussitePinSylvestre: 0.25,
};

/** Braises (§7.3). Non négociable : interdit la stratégie de périmètre. */
export const BRAISES = {
  /**
   * Probabilité d'émission par cellule en feu. L'écart entre feu de surface et
   * feu de cime est volontairement large : c'est la cime qui produit l'averse
   * de brandons. Le joueur qui tient la densité et le sous-bois évite le
   * passage en cime, donc l'averse, donc les allumages de toitures. La chaîne
   * est longue mais chacun de ses maillons est affichable (règle 2).
   */
  emissionBase: 0.3,
  emissionCime: 1.0,
  /** Tirages d'émission par cellule en feu de cime : une averse de brandons. */
  tiragesCime: 2,
  /** Portée courte, la majorité des braises. */
  porteeCourte: [2, 9] as [number, number],
  /** Queue longue : franchit toute coupure, indépendante du terrain traversé. */
  partLongue: 0.3,
  facteurLong: [1.9, 3.6] as [number, number],
  /** Probabilité d'allumer une construction NON durcie. C'est le seul endroit
   *  où le durcissement agit, et ce qui en fait le meilleur investissement. */
  allumageBatiNu: 0.72,
  /**
   * Ce qui reste quand le durcissement est complet. L'écart avec le bâti nu est
   * volontairement fort : le brief fait du durcissement « le meilleur
   * investissement du jeu » et « la seule protection réelle » contre les
   * braises. Un écart timide contredirait cette thèse au lieu de la démontrer.
   */
  allumageBatiDurci: 0.05,
};

/** Défendabilité et moyens de lutte (patch 1). */
export const LUTTE = {
  /**
   * Profondeur traitée nécessaire, en paliers alignés sur le grain de 50 m.
   * En pente douce, les cinquante mètres de l'obligation légale suffisent ; en
   * pente moyenne il en faut le double, ce qu'un propriétaire seul ne fait pas,
   * si bien qu'une construction conforme peut rester indéfendable. C'est un
   * fait de terrain, pas une punition.
   */
  profondeurBase: 50,
  penteMoyenne: 0.35,
  profondeurEnPente: 100,
  /** Au-delà de cette pente, aucune profondeur ne suffit. */
  penteImpossible: 0.72,
  /** Équipes disponibles par tour. Finies, et elles ne se dupliquent pas. */
  equipesParTour: 2,
  /** Probabilité de sauver une construction défendable, à intensité nulle. */
  succesBase: 0.92,
  /** Ce que l'intensité du front retire à cette probabilité. */
  succesParIntensite: 0.75,
};

/**
 * Normalisation de la pente.
 *
 * `Cellule.pente` est déclarée « 0–1 normalisé » et tous les seuils du modèle
 * sont écrits sur cette échelle. Elle recevait pourtant le gradient d'altitude
 * brut, dont 97 % des valeurs tombaient sous 0,2 : `penteMoyenne` (0,35) et
 * `penteImpossible` (0,72) n'étaient jamais franchis, la pénalité de pente sur
 * la défendabilité était donc lettre morte, la conversion en garrigue après feu
 * inatteignable, et « le feu monte » n'avait presque aucune assise mécanique.
 *
 * On normalise sur le relief effectivement engendré, comme le fait déjà
 * l'exposition juste à côté, et on l'ancre sur un énoncé plutôt que sur une
 * constante muette : **les 5 % les plus raides d'une carte sont franchement
 * au-delà du seuil où la lutte est gênée, sans être pour autant hors de
 * portée** ; l'impossibilité reste l'exception. Le reste de la distribution
 * suit.
 *
 * L'ancrage a été choisi au harnais, pas au jugé, parce qu'il porte à
 * conséquence : `economie.ts` multiplie le coût des travaux par la pente
 * (`× 1,8` pour l'entretien, `× 2,4` pour l'éclaircie), coefficients écrits
 * pour une plage 0–1 qui n'était jamais atteinte. Les réveiller renchérit tout
 * le travail forestier. Ancré à `penteImpossible` (0,72), l'éclaircie devient
 * déficitaire presque partout et la fraction stratégique sous le seuil de
 * densité tombe à 34 %, contre les 50 % attendus au §12 ; à 0,55 elle reste à
 * 49 %, encore sous la cible. À 0,50 la calibration est tenue (53 %), et c'est
 * le réglage le plus engageant qui la tienne.
 *
 * Reste un manque assumé : à cette échelle, `penteImpossible` n'est franchi
 * que par une cellule sur mille. Le rendre vraiment praticable demanderait de
 * revoir les coefficients de coût, ce qui est une autre décision.
 */
export const RELIEF = {
  quantile: 0.95,
  valeur: 0.5,
};

/**
 * Conformité aux OLD (amendement 2, B.1). Le contrôle fait monter le taux, mais
 * il plafonne : une part des propriétaires n'exécute pas, et le joueur n'y peut
 * rien directement. Sans contrôle, la conformité se relâche.
 */
export const CONFORMITE = {
  /** Probabilité qu'une construction non conforme se mette en règle, par tour. */
  miseEnConformite: 0.4,
  /** Plafond de conformité atteignable par le seul contrôle. */
  plafond: 0.78,
  /** Relâchement annuel, même sous contrôle. */
  relachement: 0.07,
  /** Relâchement quand plus aucun contrôle n'est exercé. */
  relachementSansControle: 0.18,
};

/** Doctrine de lutte (§7.5). Cran 3 ne coûte pas d'argent : il coûte du risque. */
export const DOCTRINE = {
  1: { nom: 'Extinction systématique', budget: 3, secheresseMax: 0, distanceMin: 0 },
  2: { nom: 'Extinction sauf conditions favorables', budget: 2, secheresseMax: 0.55, distanceMin: 5 },
  3: { nom: 'Feu géré', budget: 1, secheresseMax: 0.78, distanceMin: 3 },
} as const;

/** Allumages (§7.1). Causes humaines dominantes : routes et habitat. */
export const ALLUMAGE = {
  base: 0.09,
  parSecheresse: 0.62,
  /** Poids de la proximité des routes et du bâti dans le choix du point de départ. */
  poidsAcces: 0.6,
};

/** Horizon de partie. Le paradoxe de la suppression a besoin de longueur : il
 *  demande quinze tours de réussite apparente, puis la catastrophe (§8.2). */
export const HORIZON = { long: 40, court: 15 };
