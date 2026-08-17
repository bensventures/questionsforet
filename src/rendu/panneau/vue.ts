import type { Doctrine, Eleveurs, Etat, IdPolitique, Ligne, PolitiqueCoupee, Secteur } from '../../model/types';
import { CONFORMITE, DENSITE, DOCTRINE, ENTRETIEN, REFORME } from '../../model/params';
import { POLITIQUES, applicable, politiqueParId } from '../../model/politiques';
import { BUDGET, COUT_CONTROLE, comptes, coutEntretien, coutPolitique } from '../../model/economie';
import type { DonneesSecteur } from '../carte';
import { PARTENAIRES } from '../../model/partenaires';
import { COUTS_PONCTUELS } from '../../model/ponctuelles';
import { NATURE_SECTEUR } from '../../model/secteurs';

/**
 * Ce que le panneau lit dans l'état, et rien de plus.
 *
 * La séparation du § 2 du brief tient ici : **l'interface lit un état et émet
 * des `Decisions`, elle ne calcule rien**. Ce module ne fait que traduire des
 * champs et des fonctions déjà écrites du noyau en valeurs affichables. Toute
 * règle qu'on serait tenté d'écrire ici appartient à `src/model/`.
 */

export type EtatFiche = 'activable' | 'montee' | 'vigueur' | 'levee' | 'abandon';

export interface FicheVue {
  id: IdPolitique;
  nom: string;
  /** Champ `chaine` du modèle, **affiché tel quel** (règle 2). */
  chaine: string;
  portee: string;
  delai: number;
  etablissement: number;
  /** « aucune », « 0,12 par construction », « le déficit ». */
  charge: string;
  etat: EtatFiche;
  /** Crans d'adoption : un par tour de délai, jamais un pourcentage. */
  crans: { pleins: number; total: number };
  /** Emprise réelle, **en français** : « le troupeau couvre un tiers du secteur ». */
  emprise: string;
  /** Condition non monétaire, seul cas aujourd'hui : l'éleveur·euse. */
  condition?: string;
  /** Ce qui se défait, pour une politique levée ou abandonnée. */
  defait?: string;
  /** Coût d'engagement à afficher sur l'appel, quand elle est activable. */
  engager?: number;
  /** Motif chiffré si l'engagement est hors de portée. */
  refus?: string;
  /**
   * Engagée pendant ce tour, pas encore appliquée. Le noyau n'a qu'une porte,
   * `avancer` : une décision prise se garde donc jusqu'à l'été suivant, et la
   * fiche doit le dire plutôt que de faire comme si rien n'avait été décidé.
   */
  enAttente?: boolean;
}

export interface GesteVue {
  type: 'durcirHameau' | 'ouvrirCoupure' | 'debroussailler';
  nom: string;
  cout: number;
  emprise: string;
  /** Le geste est-il finançable ce tour ? Sinon, la raison est chiffrée. */
  refus?: string;
}

export interface LigneVue extends Ligne {
  /** Secteur, étape du tour, valeur du modèle en cause. C'est elle qui répond
   *  à « pourquoi celle-là et pas sa voisine ». */
  attache?: string;
  /** Seule ligne cliquable de tout le bloc : le rejeu de propagation. */
  rejeu?: boolean;
  /**
   * Renoncement subi (planche 8). La ligne devient une bande, **à son rang
   * chronologique dans le fil** : l'événement appartient au tour, pas au-dessus
   * de lui, et aucune fenêtre ne s'ouvre.
   */
  coupe?: { titre: string; consequences: string[] };
}

export interface VuePanneau {
  tour: number;
  toursMax: number;
  /** Gestes désignés et pas encore appliqués : ils partent au prochain été. */
  gestesEnAttente?: number;
  /**
   * **Tout ce qui est engagé et pas encore appliqué**, dans l'ordre où l'été
   * l'appliquera. Le pied du panneau le récapitule : une politique engagée
   * n'apparaissait que sur sa fiche, donc dans le tiroir de son secteur, et
   * disparaissait de la vue dès qu'on en ouvrait un autre. Le pied, lui, n'est
   * jamais couvert.
   */
  enAttente?: { nom: string; ou?: string; cout: number }[];
  /**
   * Ce que les décisions en attente engageront à l'été suivant. Rien n'est
   * débité pendant le tour — le noyau n'a qu'une porte — et le budget affiché
   * ne bougeait donc pas d'un clic, ce qui laissait croire que les
   * engagements étaient gratuits.
   */
  coutEnAttente?: number;
  ressources: {
    surfaceTenue: number;
    plafond: number;
    charge: number;
    recette: number;
    budget: number;
    /**
     * Ce qu'il restera à engager quand l'été s'ouvrira : la réserve, plus le
     * solde de l'année, moins les décisions déjà prises. C'est un pré-débit
     * d'affichage, le modèle ne prélève qu'au passage de l'été ; mais un budget
     * qui ne bouge pas d'un clic laissait croire que décider était gratuit.
     *
     * **Le solde de l'année en fait partie** depuis que le bouclage est passé en
     * tête d'été : recette, exploitation, entretien et doctrine sont acquis
     * avant que les décisions s'appliquent, donc c'est bien sur eux qu'on
     * engage.
     */
    budgetProjete: number;
    /** Ce que l'été apporte et prélève de lui-même, avant toute décision. */
    soldeDeLEte: number;
    /** Ce qu'il faut retirer pour que l'été passe, 0 si rien ne dépasse. Un
     *  solde d'année négatif n'en est pas un : voir `depassement`. */
    trop: number;
    /** Coût annuel de la posture en vigueur, prélevé quoi qu'on décide. Il est
     *  compté dans `charge` : la jauge est le seul endroit où l'économie de
     *  l'été se lit d'un coup. */
    chargeDoctrine: number;
    plancher: number;
    fenetrePostFeu: number;
    eleveurs: Eleveurs;
    toursSansContrat: number;
    equipes: number;
  };
  /**
   * La doctrine est une **posture debout**, pas une action de tour. La vue
   * porte donc ce qui est en vigueur, ce qui est engagé, et ce que réformer
   * coûterait *maintenant* : hors fenêtre c'est cher et lent, dans la fenêtre
   * ouverte par un incendie c'est rapide et bon marché, et au premier été le
   * territoire confirme ou réforme son héritage sans rien payer.
   */
  doctrine: {
    cran: Doctrine;
    toursCran1: number;
    reforme: { vers: Doctrine; dans: number } | null;
    /** Étés restants de fenêtre post-incendie, 0 si elle est fermée. */
    fenetre: number;
    /** Premier été : le choix fondateur, sans délai ni coût. */
    ouverture: boolean;
    /** Ce que coûterait et prendrait une réforme décidée maintenant. */
    cout: number;
    delai: number;
    /** Cran demandé ce tour, pas encore engagé. */
    demande?: Doctrine;
  };
  secteur: { id: number; nom: string; sous: string; fiches: FicheVue[] } | null;
  /** Tous les secteurs, pour la liste : c'est le chemin clavier vers la
   *  sélection, et le seul sommaire du versant depuis que les étiquettes de la
   *  carte ne s'affichent qu'au survol. */
  secteurs: { id: number; nom: string; porte: string }[];
  lignes: LigneVue[];
  gestes: GesteVue[];
}

/**
 * Surface qu'une recette entière paierait au coût moyen du terrain, mesurée
 * sur la carte. **Ce n'est pas ce que la jauge du bandeau borne**, et il faut
 * dire pourquoi.
 *
 * Le handoff définit le plafond comme le point où la charge d'entretien égale
 * la recette, et fait de la surface tenue la grandeur bornée. Cela suppose une
 * charge proportionnelle à la surface. Dans l'économie implémentée, elle ne
 * l'est pas : le contrôle des OLD se paie **par construction** et non par
 * parcelle, et le contrat pastoral s'autofinance une fois établi. La surface
 * tenue peut donc dépasser cette valeur sans qu'aucun plafond ne soit franchi,
 * et la jauge afficherait une hachure braise pour une fausse alerte, alors que
 * la réserve chaude ne dit que trois choses.
 *
 * En v3.0 la surface est bornée par les **partenaires** (trois éleveur·euses au
 * plus, un contrat chacun·e), pas par la charge. La jauge borne donc ce que le
 * handoff borne réellement, la charge par rapport à la recette, et la surface
 * tenue reste affichée comme une observation. Écart assumé, à ne pas défaire
 * sans reprendre l'économie.
 */
export function surfacePourUneRecette(etat: Etat): number {
  const traitables = etat.grille.filter((c) => c.type !== 'bati' && c.type !== 'rocher');
  if (!traitables.length) return 0;
  const moyen = traitables.reduce((s, c) => s + coutEntretien(c), 0) / traitables.length;
  return Math.round(BUDGET.parTour / moyen);
}

/**
 * Ce que l'été apporte et prélève **de lui-même**, avant toute décision :
 * recette de l'année, résultat de l'exploitation, entretien, coût de la posture,
 * et les moyens exceptionnels tant que la fenêtre d'après-feu est ouverte.
 *
 * Le bouclage passe en tête d'été, donc ce solde est **acquis** au moment où les
 * décisions s'appliquent : c'est bien sur lui qu'on engage. Il vaut le
 * `bouclerBudget` du noyau, à ceci près qu'il ne peut pas anticiper une coupure
 * de politique, laquelle ne survient qu'au-dessous du plancher.
 */
export function soldeDeLEte(etat: Etat): number {
  const c = comptes(etat);
  return (
    BUDGET.parTour +
    c.recettes -
    c.entretien -
    DOCTRINE[etat.doctrine].budget +
    (etat.moyens.fenetrePostFeu > 0 ? BUDGET.fenetreMontant : 0)
  );
}

/** Ce qui reste à engager cet été : la réserve, plus le solde de l'année, moins
 *  ce qui est déjà décidé. Une seule formule, lue par le panneau **et** par le
 *  calque de visée : deux copies divergeraient au premier changement. */
export function disponibleAEngager(etat: Etat, coutEnAttente = 0): number {
  return etat.moyens.budget + soldeDeLEte(etat) - coutEnAttente;
}

/**
 * De combien les décisions dépassent ce que la collectivité peut engager, donc
 * ce qu'il faut retirer pour que l'été passe. Zéro quand rien ne dépasse.
 *
 * **Un solde d'année négatif n'est pas un dépassement.** L'année d'après une
 * grosse installation, les charges peuvent excéder la recette avant que le
 * joueur ait rien décidé : refuser l'été dans ce cas l'enfermait sans issue,
 * puisqu'il n'avait rien à retirer. Ce découvert-là appartient au modèle, qui
 * puise dans la réserve et, sous le plancher, coupe une politique. Ce qui se
 * refuse ici, c'est seulement d'engager plus qu'on ne peut.
 */
export function depassement(etat: Etat, coutEnAttente = 0): number {
  const capacite = Math.max(0, disponibleAEngager(etat));
  return Math.max(0, coutEnAttente - capacite);
}

/** Part d'un ensemble, dite en français. Le handoff interdit le pourcentage :
 *  « le troupeau couvre un tiers du secteur », pas « adoption 0,33 ». */
export function enFrancais(part: number): string {
  if (part <= 0) return 'rien encore';
  if (part < 0.2) return 'une frange';
  if (part < 0.4) return 'un tiers';
  if (part < 0.6) return 'la moitié';
  if (part < 0.85) return 'les deux tiers';
  return 'tout';
}

const PORTEE_TOUTES = 'toutes natures';

function porteeDe(id: IdPolitique): string {
  const p = politiqueParId(id);
  if (p.portee.length >= 5) return PORTEE_TOUTES;
  if (p.portee.length === 1) return NATURE_SECTEUR[p.portee[0]].toLowerCase();
  return 'hors couronne';
}

/** Charge récurrente, dite comme la fiche l'exige : parité visuelle avec
 *  l'établissement, et l'asymétrie assumée plutôt que masquée. */
function chargeDe(id: IdPolitique): string {
  if (id === 'durcissement') return 'aucune';
  if (id === 'pastoral') return 'aucune une fois établi';
  if (id === 'eclaircie') return 'le déficit';
  return `${COUT_CONTROLE.toString().replace('.', ',')} par construction`;
}

/** Ce qui se défait quand la politique cesse, avec son délai : sans ces
 *  précisions, l'abandon n'est qu'une punition. */
function defaitDe(id: IdPolitique): string {
  switch (id) {
    case 'old':
      return 'la conformité se relâche, plus vite encore sans contrôle ; les secours perdent leur accès à mesure que l’apron se referme';
    case 'pastoral':
      return 'le pâturage cesse dès l’été suivant, et la mosaïque avec lui : elle demande quatre étés de pâturage continu';
    case 'eclaircie':
      return `les tiges repartent, et le statut « géré » se perd au bout de ${DENSITE.memoireGestion} étés`;
    default:
      return 'le durcissement acquis reste acquis, mais plus aucun foyer ne s’équipe';
  }
}

/** Genre des quatre noms de politiques, pour les accorder sans les réécrire. */
const GENRE: Record<IdPolitique, 'm' | 'f'> = {
  old: 'm',
  durcissement: 'f', // « l'aide au durcissement »
  pastoral: 'm',
  eclaircie: 'm',
};

/**
 * Titre de la bande de coupe. Le nom vient du modèle ; l'interface ne fait
 * qu'y poser l'article et l'accord, faute de quoi on lit « faute de moyens,
 * programme d'éclaircie est coupé ».
 */
export function titreDeLaCoupe(etat: Etat, coupee: PolitiqueCoupee): string {
  const nom = politiqueParId(coupee.id).nom.toLowerCase();
  const article = /^[aeiouéè]/.test(nom) ? 'l’' : GENRE[coupee.id] === 'f' ? 'la ' : 'le ';
  const accord = GENRE[coupee.id] === 'f' ? 'coupée' : 'coupé';
  const secteur = etat.secteurs[coupee.secteur]?.nom ?? 'ce secteur';
  return `Faute de moyens, ${article}${nom} est ${accord} sur ${secteur}.`;
}

/**
 * Conséquences **datées** d'une coupe budgétaire, pour la bande du renoncement
 * subi (planche 8) : ce qui se défait, sur quelle emprise, en combien d'étés.
 * Sans ces trois précisions, la bande n'est qu'une punition ; avec elles, elle
 * répond à « qu'est-ce qui va se défaire si j'arrête ».
 *
 * Toutes les valeurs viennent du modèle, aucune n'est écrite au jugé.
 */
export function consequencesDeLaCoupe(etat: Etat, coupee: PolitiqueCoupee): string[] {
  const s = etat.secteurs[coupee.secteur];
  const p = politiqueParId(coupee.id);
  if (!s) return [];
  const n = p.emprise(etat, s).length;
  const phrases: string[] = [];

  switch (coupee.id) {
    case 'pastoral': {
      phrases.push(
        `Le troupeau quitte ${n} parcelle${n > 1 ? 's' : ''}. Dès l’été prochain le sous-bois n’est plus tenu, et la mosaïque se dénoue : elle demande ${ENTRETIEN.toursMosaique} étés de pâturage continu, elle n’est jamais acquise.`,
      );
      phrases.push(
        `L’éleveur·euse revient au vivier. Sans nouveau contrat, la déprise emporte une installation dans ${PARTENAIRES.toursAvantDeprise} étés, et il en faudra ${PARTENAIRES.toursAvantRetour} pour en retrouver une.`,
      );
      break;
    }
    case 'old': {
      const fois = (CONFORMITE.relachementSansControle / CONFORMITE.relachement).toFixed(1).replace('.', ',');
      phrases.push(
        `${n} construction${n > 1 ? 's ne sont' : ' n’est'} plus contrôlée${n > 1 ? 's' : ''}. La conformité se relâche ${fois} fois plus vite sans contrôle, et l’apron se referme parcelle après parcelle.`,
      );
      phrases.push(
        'Les secours ne pourront plus approcher des constructions dont la profondeur traitée sera retombée : elle est mesurée sur le terrain, jamais déclarée.',
      );
      break;
    }
    case 'eclaircie': {
      phrases.push(
        `${n} parcelle${n > 1 ? 's' : ''} au-dessus du seuil ${n > 1 ? 'restent' : 'reste'} sans éclaircie. Les tiges repartent, et le statut « géré » se perd au bout de ${DENSITE.memoireGestion} étés : la continuité verticale remonte avec lui.`,
      );
      break;
    }
    default:
      phrases.push('Le durcissement déjà posé reste acquis, mais plus aucun foyer ne s’équipe.');
  }
  return phrases;
}

/**
 * Emprise réelle d'une politique en vigueur, dite en français. Chaque politique
 * a la sienne : le durcissement compte des logements équipés, l'éclaircie des
 * parcelles traitées dans le tour, le contrat un couvert de troupeau. Une
 * formule commune dirait « parcelles » d'une aide au bâti, ce qui est faux.
 */
function empriseEnFrancais(
  id: IdPolitique,
  emprise: { durcissement: number }[],
  adoption: number,
  couvert: string,
): string {
  const n = emprise.length;
  switch (id) {
    case 'pastoral':
      return `le troupeau couvre ${couvert} du secteur`;
    case 'old':
      return `${n} construction${n > 1 ? 's' : ''} contrôlée${n > 1 ? 's' : ''}`;
    case 'durcissement': {
      const equipes = emprise.filter((c) => c.durcissement >= 1).length;
      return `${equipes} logement${equipes > 1 ? 's' : ''} entièrement équipé${equipes > 1 ? 's' : ''} sur ${n}`;
    }
    default: {
      const traitees = Math.max(1, Math.round(n * 0.45 * adoption));
      return `${traitees} parcelle${traitees > 1 ? 's' : ''} éclaircie${traitees > 1 ? 's' : ''} cet été, sur ${n} au-dessus du seuil`;
    }
  }
}

/**
 * Emprise d'une politique **pas encore engagée**, dans ses propres termes. Le
 * durcissement et le contrôle portent sur des constructions, les traitements
 * sur des parcelles ; et une emprise vide se dit, plutôt que de laisser lire
 * « 0 parcelle concernée » là où le secteur n'a simplement pas de bâti.
 */
function empriseDormante(id: IdPolitique, n: number): string {
  const batie = id === 'old' || id === 'durcissement';
  if (!n) return batie ? 'aucune construction dans ce secteur' : 'aucune parcelle concernée';
  if (id === 'old') return `${n} construction${n > 1 ? 's' : ''} à contrôler`;
  if (id === 'durcissement') return `${n} construction${n > 1 ? 's' : ''} à équiper`;
  if (id === 'eclaircie') return `${n} parcelle${n > 1 ? 's' : ''} au-dessus du seuil`;
  return `${n} parcelle${n > 1 ? 's' : ''} à faire pâturer`;
}

function ficheDe(etat: Etat, s: Secteur, id: IdPolitique, disponible: number): FicheVue | null {
  const p = politiqueParId(id);
  if (!applicable(p, s)) return null;
  const active = etat.politiques.find((a) => a.id === id && a.secteur === s.id);
  const emprise = p.emprise(etat, s);
  const partSecteur = s.cellules.length ? emprise.length / s.cellules.length : 0;

  const base: FicheVue = {
    id,
    nom: p.nom,
    chaine: p.chaine,
    portee: porteeDe(id),
    delai: p.delai,
    etablissement: p.etablissement,
    charge: chargeDe(id),
    etat: 'activable',
    crans: { pleins: 0, total: p.delai },
    emprise: '',
    defait: defaitDe(id),
  };

  if (!active) {
    const manqueEleveur = id === 'pastoral' && etat.moyens.eleveurs.disponibles <= 0;
    // Sur le disponible, jamais sur la seule réserve : le budget de l'exercice
    // est acquis quand l'été s'ouvre, et ce qui est déjà engagé ne l'est plus.
    const manqueArgent = disponible < p.etablissement;
    return {
      ...base,
      emprise: empriseDormante(id, emprise.length),
      condition:
        id === 'pastoral'
          ? `Demande un·e éleveur·euse disponible — il en reste ${etat.moyens.eleveurs.disponibles}`
          : undefined,
      engager: p.etablissement,
      refus: manqueEleveur
        ? 'aucun·e éleveur·euse disponible'
        : manqueArgent
          ? `budget ${Math.round(disponible)}, manque ${Math.ceil(p.etablissement - disponible)}`
          : undefined,
    };
  }

  const pleins = Math.min(p.delai, active.tours);
  const couvert = enFrancais(active.adoption * (id === 'pastoral' ? 1 : partSecteur || 1));
  return {
    ...base,
    etat: active.adoption >= 1 ? 'vigueur' : 'montee',
    crans: { pleins, total: p.delai },
    emprise: empriseEnFrancais(id, emprise, active.adoption, couvert),
  };
}

export function vueDuPanneau(
  etat: Etat,
  options: {
    secteur?: number | null;
    lignes?: LigneVue[];
    /** Politiques engagées ce tour, en attente du prochain `avancer`. */
    attente?: { id: IdPolitique; secteur: number }[];
    /** Gestes désignés ce tour, en attente eux aussi. */
    gestesEnAttente?: number;
    /** Récapitulatif des décisions en attente, pour le pied. */
    enAttente?: { nom: string; ou?: string; cout: number }[];
    /** Cran de doctrine demandé ce tour et pas encore engagé. */
    doctrineDemandee?: Doctrine;
    /** Ce que ces décisions coûteront quand l'été passera. */
    coutEnAttente?: number;
  } = {},
): VuePanneau {
  const c = comptes(etat);
  const s = options.secteur != null ? etat.secteurs[options.secteur] : null;
  const solde = soldeDeLEte(etat);
  const disponible = disponibleAEngager(etat, options.coutEnAttente ?? 0);
  const donnees = etatsDesSecteurs(etat, disponible);

  const gestes: GesteVue[] = [
    { type: 'durcirHameau', nom: 'Durcir un hameau', cout: COUTS_PONCTUELS.durcirHameau, emprise: 'une construction' },
    { type: 'ouvrirCoupure', nom: 'Ouvrir une coupure', cout: COUTS_PONCTUELS.ouvrirCoupure, emprise: '9 parcelles' },
    { type: 'debroussailler', nom: 'Débroussailler', cout: COUTS_PONCTUELS.debroussailler, emprise: 'une parcelle' },
  ].map((g) => ({
    ...g,
    // Ce qui reste **vraiment** : le budget moins ce qui est déjà engagé et
    // moins la doctrine, que l'été prélève avant tout geste. Comparer au budget
    // brut laissait proposer un geste que l'été refuserait ensuite.
    refus:
      disponible < g.cout
        ? `budget ${Math.round(disponible)}, manque ${Math.ceil(g.cout - disponible)}`
        : undefined,
  }));

  return {
    tour: etat.tour,
    toursMax: etat.toursMax,
    gestesEnAttente: options.gestesEnAttente ?? 0,
    enAttente: options.enAttente ?? [],
    coutEnAttente: options.coutEnAttente ?? 0,
    ressources: {
      surfaceTenue: c.surfaceTenue,
      plafond: surfacePourUneRecette(etat),
      // **Toutes les charges récurrentes, pas seulement l'entretien.** La jauge
      // est le seul endroit où l'économie de l'été se lit d'un coup ; y omettre
      // la doctrine, prélevée quoi qu'on décide, et l'exploitation, qui peut
      // coûter en un été plus que tout ce que le joueur engage, en faisait un
      // instrument qui rassure à tort. Une éclaircie bénéficiaire, elle,
      // grossit la recette.
      charge: c.entretien + DOCTRINE[etat.doctrine].budget + Math.max(0, -c.recettes),
      recette:
        BUDGET.parTour +
        Math.max(0, c.recettes) +
        (etat.moyens.fenetrePostFeu > 0 ? BUDGET.fenetreMontant : 0),
      budget: etat.moyens.budget,
      budgetProjete: disponible,
      soldeDeLEte: solde,
      trop: depassement(etat, options.coutEnAttente ?? 0),
      chargeDoctrine: DOCTRINE[etat.doctrine].budget,
      plancher: BUDGET.plancher,
      fenetrePostFeu: etat.moyens.fenetrePostFeu,
      // Copie, jamais la référence : une vue est une valeur. Sans cela, trois
      // instantanés d'une même partie affichent tous le vivier du dernier tour,
      // le noyau mutant son état en place.
      eleveurs: { ...etat.moyens.eleveurs },
      toursSansContrat: etat.toursSansContrat,
      equipes: etat.moyens.equipes,
    },
    secteurs: etat.secteurs.map((sec) => {
      const d = donnees.find((x) => x.id === sec.id);
      return { id: sec.id, nom: sec.nom, porte: d?.porte ?? 'aucune' };
    }),
    doctrine: {
      cran: etat.doctrine,
      toursCran1: etat.cumul.toursCran1,
      reforme: etat.reforme ? { ...etat.reforme } : null,
      fenetre: etat.moyens.fenetrePostFeu,
      ouverture: etat.tour === 1,
      cout: etat.tour === 1 ? 0 : etat.moyens.fenetrePostFeu > 0 ? REFORME.coutFenetre : REFORME.cout,
      delai: etat.tour === 1 ? 0 : etat.moyens.fenetrePostFeu > 0 ? REFORME.delaiFenetre : REFORME.delai,
      demande: options.doctrineDemandee,
    },
    secteur: s
      ? {
          id: s.id,
          nom: s.nom,
          sous: `${NATURE_SECTEUR[s.nature].toLowerCase()} · ${s.cellules.length} cellules`,
          fiches: POLITIQUES.map((p) => ficheDe(etat, s, p.id, disponible))
            .filter((x): x is FicheVue => !!x)
            .map((f) => ({
              ...f,
              enAttente: (options.attente ?? []).some((a) => a.id === f.id && a.secteur === s.id),
            })),
        }
      : null,
    lignes: options.lignes ?? [],
    gestes,
  };
}

/**
 * État de chaque secteur pour le calque de la carte (planche 4).
 *
 * Un secteur qui porte plusieurs politiques affiche **la moins avancée** : le
 * calque sert à repérer ce qui n'est pas encore acquis, pas à féliciter.
 *
 * Le péril budgétaire nomme sa cible **avant** la coupe : sous trois unités du
 * plancher, le secteur marqué est celui dont le modèle couperait la politique
 * la plus coûteuse, exactement celle que `bouclerBudget` choisirait.
 */
export function etatsDesSecteurs(etat: Etat, disponible = disponibleAEngager(etat)): DonneesSecteur[] {
  let menace: number | null = null;
  // Le péril se juge sur le budget **d'après bouclage**, puisque c'est là que la
  // coupure tombe, et non sur la réserve d'avant : depuis que la recette arrive
  // en tête d'été, les deux diffèrent d'une année entière.
  if (etat.moyens.budget + soldeDeLEte(etat) - BUDGET.plancher <= 3) {
    const candidates = etat.politiques
      .map((a) => ({ a, cout: coutPolitique(etat, a.id, a.secteur) }))
      .filter((x) => x.cout > 0)
      .sort((x, y) => y.cout - x.cout);
    menace = candidates[0]?.a.secteur ?? null;
  }

  return etat.secteurs.map((s) => {
    const actives = etat.politiques.filter((a) => a.secteur === s.id);
    const batis = s.cellules.filter((i) => etat.grille[i].type === 'bati' && !etat.grille[i].detruite).length;
    const porte = actives.length
      ? `${actives.length} politique${actives.length > 1 ? 's' : ''}`
      : batis
        ? `${batis} constr.`
        : 'aucune';

    let etatSecteur: DonneesSecteur['etat'] = 'aucun';
    if (s.id === menace) etatSecteur = 'peril';
    else if (actives.length) etatSecteur = actives.some((a) => a.adoption < 1) ? 'montee' : 'vigueur';
    else if (
      POLITIQUES.some(
        (p) =>
          applicable(p, s) &&
          disponible >= p.etablissement &&
          (p.id !== 'pastoral' || etat.moyens.eleveurs.disponibles > 0),
      )
    ) {
      etatSecteur = 'activable';
    }

    const enCharge = actives.find((a) => a.adoption < 1);
    return {
      id: s.id,
      etat: etatSecteur,
      porte,
      crans: enCharge
        ? { pleins: Math.min(politiqueParId(enCharge.id).delai, enCharge.tours), total: politiqueParId(enCharge.id).delai }
        : undefined,
      // Le budget d'après bouclage, celui sur lequel la coupure se décide : la
      // réserve d'avant en diffère désormais d'une année entière.
      ecartPlancher:
        s.id === menace
          ? `budget ${Math.round(etat.moyens.budget + soldeDeLEte(etat))} · plancher ${BUDGET.plancher}`
          : undefined,
    };
  });
}

/** Seuils de la doctrine, écrits en clair : jamais derrière un survol. */
export const CRANS_DOCTRINE = ([1, 2, 3] as const).map((cran) => ({
  cran,
  nom: DOCTRINE[cran].nom,
  cout: DOCTRINE[cran].budget,
  seuils:
    cran === 1
      ? 'aucun, tout départ est attaqué'
      : `sécheresse ≤ ${DOCTRINE[cran].secheresseMax.toString().replace('.', ',')}, vent ≤ 0,75, départ à ≥ ${DOCTRINE[cran].distanceMin} cellules du bâti`,
}));

/** Étés sans contrat avant qu'une installation cesse : le bandeau en fait des
 *  crans, pour que la déprise se voie venir. */
export const DEPRISE = PARTENAIRES.toursAvantDeprise;
