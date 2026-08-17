/**
 * États du modèle v3 (brief §4).
 *
 * Règle 1 du brief : aucun état sans processus. Chaque champ ci-dessous est
 * produit, maintenu et détruit par un processus explicite du noyau. Si un champ
 * ne peut pas être rattaché à un processus, il n'a rien à faire ici.
 *
 * Ce fichier ne contient aucune référence au rendu, et le noyau entier
 * (`src/model/`) n'importe rien du navigateur.
 */

/**
 * Types de couvert. `mixte` de la v2 a disparu : la mosaïque sylvopastorale
 * n'est plus un type mais un état émergent (voir `estMosaique`), atteint quand
 * une parcelle boisée est pâturée depuis plusieurs tours et que sa densité
 * reste sous le seuil.
 */
export type TypeVeg =
  | 'chene'
  | 'hetre'
  | 'pinNoir'
  | 'pinSylvestre'
  | 'garrigue'
  | 'pelouse'
  | 'friche'
  | 'ripisylve'
  | 'rocher'
  | 'bati';

/** Position topographique : détermine si l'humidité peut persister (§4.1). */
export type PositionTopo = 'talweg' | 'basVersant' | 'versant' | 'crete';

/** Doctrine de lutte, trois crans (§7.5, §9.1). */
export type Doctrine = 1 | 2 | 3;

/** Issue subie par une parcelle lors d'un feu (§8.1) : trois, pas deux. */
export type IssueFeu = 'surface' | 'houppierRoussi' | 'houppierConsomme';

/** Cause de perte d'une construction. Tracée pour l'assertion 1 du patch 3. */
export type CausePerte = 'braise' | 'front' | 'secoursDebordes';

export interface Cellule {
  x: number;
  y: number;

  // ---- statique, posé à la génération, jamais modifié (§4.1) ----
  /** 0–1 normalisé. Accélère la propagation vers le haut, dégrade la
   *  défendabilité, pénalise l'accès. */
  pente: number;
  /** 0–1. Module l'humidité locale. */
  expositionSud: number;
  /**
   * Altitude normalisée 0–1. Observation pure, comme `saisonsDepuisFeu` :
   * aucune règle ne la lit. Elle est conservée pour la couche de rendu, dont le
   * §1.6 tire les courbes de niveau ; `positionTopo` en dérive déjà, mais une
   * classe en quatre valeurs ne permet pas de tracer une isoligne.
   */
  altitude: number;
  positionTopo: PositionTopo;
  /** 0–1, 1 = au bord d'une route. Détermine le coût des travaux (§10). */
  accessibilite: number;
  /** Distance en cellules à la construction la plus proche. Détermine le zonage. */
  distanceBati: number;
  /** Secteur d'appartenance (§3). Découpage figé pour la partie. */
  secteur: number;

  // ---- dynamique (§4.2) ----
  type: TypeVeg;
  /** Densité de tiges de l'étage dominant, tiges/ha. Au-dessus du seuil et sans
   *  gestion, la sévérité augmente fortement. */
  densite: number;
  /** 0–1. Charge de la strate basse : l'échelle qui fait passer du feu de
   *  surface au feu de cime. À ne jamais fusionner avec `densite`. */
  sousBois: number;
  /** Tours. Épaisseur d'écorce et hauteur de houppier, donc survie individuelle. */
  age: number;
  /** Tours depuis la dernière intervention. Au-delà d'un délai, « non gérée ». */
  gestion: number;
  /** Tours consécutifs pâturés. Entretient `sousBois` à la baisse. */
  paturage: number;
  /** Tours restants d'effet du brûlage dirigé (v3.1, champ déjà porté). */
  effetBrulage: number;

  // ---- surfaces ouvertes et leur entretien (patch 2) ----
  /** Tours écoulés depuis l'ouverture d'une surface par débroussaillement.
   *  0 = parcelle jamais ouverte. */
  ouverture: number;
  /** Tours écoulés depuis le dernier entretien d'une surface ouverte. Au-delà
   *  du délai, la surface bascule en friche : c'est le piège du renoncement. */
  sansEntretien: number;

  // ---- cellules bâties (§4.3) ----
  /** 0–1. Résistance aux braises. Seule protection réelle du bâti. */
  durcissement: number;
  /**
   * Mètres. Alimente la défendabilité par les secours. Avec des cellules de
   * 50 m, ni la zone 0 ni la plage efficace de 5 à 20 m ne sont représentables
   * spatialement : ces distances sont des **attributs de la construction**,
   * portés par `durcissement` et par ce champ, et non des propriétés de
   * cellules. Ne pas tenter de les remettre dans la grille (amendement 2, B.2).
   */
  profondeurTraitee: number;
  /**
   * La construction respecte-t-elle son obligation légale de débroussaillement ?
   * C'est le propriétaire qui exécute et qui paie ; la collectivité ne finance
   * que le contrôle. Le taux de conformité plafonne donc sous 100 % et échappe
   * au joueur (amendement 2, B.1).
   */
  conforme: boolean;
  /** Foyers logés, pour la priorité d'allocation des équipes (patch 1). */
  habitants: number;
  detruite: boolean;
  causePerte?: CausePerte;

  // ---- mémoire post-feu, pour la régénération différenciée (§8.3) ----
  /** Type avant le feu, tant que la parcelle n'a pas retrouvé un état stable. */
  typeAvantFeu?: TypeVeg;
  /** Tours restants avant que la parcelle brûlée ne se fixe dans un nouvel état. */
  regenDans: number;
  /** Tours restants de mortalité différée (houppier roussi, §8.1). */
  mortaliteDifferee: number;
  /** La parcelle a-t-elle brûlé au moins une fois ? Sert au « % brûlé » du
   *  bilan : un cumul de passages dépasse 100 % et ne veut plus rien dire. */
  dejaBrulee: boolean;
  /**
   * Tours écoulés depuis le dernier passage du feu, `Infinity` si la parcelle
   * n'a jamais brûlé. Observation pure : **rien dans le modèle ne la lit**, et
   * elle ne doit rien piloter. Elle existe pour la couche de rendu, dont le
   * §4.4 du langage de paysage fait s'effacer chaque trace à son propre rythme
   * (sol brûlé 3 saisons, houppier roussi 6, chicot 30) : c'est ce décalage qui
   * donne à lire le paysage comme une histoire.
   */
  saisonsDepuisFeu: number;
}

/** Météo du tour. Exogène : le joueur ne peut rien dessus (§5). */
export interface Meteo {
  /** Sécheresse régionale 0–1, corrélée d'une année sur l'autre. */
  secheresse: number;
  /** Direction du vent, radians. */
  ventAngle: number;
  /** Force du vent, 0–1.4. */
  ventForce: number;
}

/** Compteurs d'un incendie, pour le compte rendu et les assertions. */
export interface BilanFeu {
  /** Cellules parcourues. */
  parcourues: number;
  /** Cellules ayant subi chaque issue (§8.1). */
  surface: number;
  houppierRoussi: number;
  houppierConsomme: number;
  /** Projections de braises émises. */
  braises: number;
  /** Constructions perdues, par cause (patch 3, assertion 1). */
  pertesBraise: number;
  pertesFront: number;
  pertesSecoursDebordes: number;
  /**
   * Les mêmes, ventilées selon que la construction respectait ou non son
   * obligation de débroussaillement. L'assertion 1 ne porte que sur les
   * conformes : une maison sans espace défendable, au contact d'un feu de cime,
   * brûle bel et bien par le front, et ce n'est pas un échec du modèle
   * (amendement 2, C).
   */
  braiseConforme: number;
  frontConforme: number;
  braiseNonConforme: number;
  frontNonConforme: number;
  /** Constructions défendables et nombre d'équipes disponibles (assertion 5). */
  defendables: number;
  equipes: number;
  /** Constructions sauvées par une équipe. */
  sauvees: number;
  /** Départs éteints par la doctrine. */
  eteints: number;
  /** Départs laissés courir. */
  laissesCourir: number;
}

/**
 * Éleveurs, en **trois grandeurs séparées et jamais additionnées** (§10).
 *
 * Un compteur unique ne peut pas distinguer un succès d'une perte : le même
 * zéro dit « les deux sont sous contrat, le sous-bois est tenu » et « les deux
 * sont partis, le levier est mort ». Le noyau expose donc les trois, et le
 * bandeau de ressources leur donne trois formes distinctes.
 */
export interface Eleveurs {
  /** Mobilisables, sans contrat en cours. */
  disponibles: number;
  /** Sous contrat pastoral : un contrat, un éleveur. */
  engages: number;
  /** Partis faute de débouché. Se comptent, ne se remplacent pas vite. */
  perdus: number;
  /** Tour auquel le prochain retour peut avoir lieu, `null` si aucun perdu. */
  retourAu: number | null;
}

/** Ressources et partenaires (§10). Une seule monnaie en v3.0. */
export interface Moyens {
  /** Budget disponible ce tour. */
  budget: number;
  /** Vivier d'éleveurs mobilisables pour un contrat pastoral. */
  eleveurs: Eleveurs;
  /** Équipes de lutte disponibles à chaque incendie. Finies, non duplicables :
   *  ce qui protège un hameau ne protège pas l'autre (patch 1). */
  equipes: number;
  /** Tours restants de moyens exceptionnels post-incendie (recette 3). */
  fenetrePostFeu: number;
}

export interface Etat {
  largeur: number;
  hauteur: number;
  grille: Cellule[];
  secteurs: Secteur[];
  tour: number;
  toursMax: number;
  meteo: Meteo;
  /** Météo du tour précédent, pour la corrélation interannuelle. */
  secheressePrecedente: number;
  /**
   * Doctrine **en vigueur**. Le territoire en pratique déjà une au premier été
   * (l'extinction systématique, héritée) : l'ouverture ne propose pas un choix
   * neutre mais un héritage à confirmer ou à réformer.
   */
  doctrine: Doctrine;
  /**
   * Réforme engagée et pas encore en vigueur. Tant qu'elle court, la posture
   * actuelle continue de s'appliquer et aucune autre réforme ne peut être
   * engagée : c'est ce qui interdit le flip-flop d'une année sur l'autre.
   */
  reforme: { vers: Doctrine; dans: number } | null;
  moyens: Moyens;
  /** Politiques en vigueur, chacune sur son secteur. */
  politiques: PolitiqueActive[];
  /** Tours consécutifs sans aucun contrat pastoral : au-delà, la déprise
   *  emporte un éleveur, et il revient bien plus lentement (§10). */
  toursSansContrat: number;
  /** Cumuls de partie, pour le bilan et les assertions. */
  cumul: {
    parcourues: number;
    parcouruesDistinctes: number;
    pertesBraise: number;
    pertesFront: number;
    pertesSecoursDebordes: number;
    braiseConforme: number;
    frontConforme: number;
    braiseNonConforme: number;
    frontNonConforme: number;
    departsEteints: number;
    /** Départs de feu, toutes causes. Sans lui, « 19 départs éteints » n'a pas
     *  de dénominateur, et le paradoxe de la suppression ne se lit plus. */
    departs: number;
    /**
     * Constructions perdues qui étaient durcies, et qui étaient conformes.
     * Comptées **au moment de la perte**, jamais relues sur la grille : une
     * construction détruite continue de voir sa conformité se relâcher, ce
     * qu'aucune règle ne lit mais qui fausserait une lecture d'après-coup.
     */
    pertesDurcies: number;
    pertesConformes: number;
    /** Politiques coupées par le bouclage budgétaire : le joueur n'a pas
     *  décidé, il a subi. La cible du §12 porte sur ce compteur. */
    renoncements: number;
    toursCran1: number;
    depense: number;
    recettes: number;
  };
  /**
   * Parcelles de pin noir à la génération. La conversion irréversible en lande
   * se mesure par différence, et l'écran de fin la donne en hectares : sans
   * cette valeur de départ, il n'y a rien à soustraire.
   */
  pinNoirDepart: number;
  /** Dernier incendie, pour le compte rendu. */
  dernierFeu: BilanFeu | null;
}

/** Secteur : l'unité de décision et d'affichage (§3). */
export interface Secteur {
  id: number;
  nature: NatureSecteur;
  nom: string;
  cellules: number[];
  /** Cellule la plus « intérieure », pour poser une étiquette. */
  ax: number;
  ay: number;
}

export type NatureSecteur = 'couronne' | 'vallon' | 'adret' | 'ubac' | 'massif';

export type IdPolitique = 'old' | 'durcissement' | 'pastoral' | 'eclaircie';

/**
 * Politique coupée par le bouclage budgétaire. Le noyau renvoie l'événement,
 * pas seulement sa phrase : la bande de coupe doit écrire ses conséquences
 * datées (quelle emprise, en combien d'étés), et les tirer d'une chaîne de
 * caractères serait à la fois fragile et contraire à la séparation des couches.
 */
export interface PolitiqueCoupee {
  id: IdPolitique;
  secteur: number;
}

export interface PolitiqueActive {
  id: IdPolitique;
  secteur: number;
  /** Tours en vigueur. */
  tours: number;
  /** Montée en charge 0–1 (adoption progressive). */
  adoption: number;
}

/** Décisions émises par la couche interface pour un tour. */
export interface Decisions {
  doctrine?: Doctrine;
  activer?: { id: IdPolitique; secteur: number }[];
  lever?: { id: IdPolitique; secteur: number }[];
  ponctuelles?: ActionPonctuelle[];
}

export type ActionPonctuelle =
  | { type: 'durcirHameau'; cellule: number }
  | { type: 'ouvrirCoupure'; cellule: number }
  | { type: 'debroussailler'; cellule: number };

/** Une ligne de compte rendu. Le noyau produit du texte, pas du DOM. */
export interface Ligne {
  texte: string;
  ton?: 'chaud' | 'bon';
}
