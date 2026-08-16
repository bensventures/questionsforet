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
  type: 'durcirHameau' | 'ouvrirCoupure' | 'traiterPointNoir';
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
  ressources: {
    surfaceTenue: number;
    plafond: number;
    charge: number;
    recette: number;
    budget: number;
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
      return `${traitees} parcelle${traitees > 1 ? 's' : ''} éclaircie${traitees > 1 ? 's' : ''} ce tour, sur ${n} au-dessus du seuil`;
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

function ficheDe(etat: Etat, s: Secteur, id: IdPolitique): FicheVue | null {
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
    const manqueArgent = etat.moyens.budget < p.etablissement;
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
          ? `budget ${Math.round(etat.moyens.budget)}, manque ${Math.ceil(p.etablissement - etat.moyens.budget)}`
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
    /** Cran de doctrine demandé ce tour et pas encore engagé. */
    doctrineDemandee?: Doctrine;
  } = {},
): VuePanneau {
  const c = comptes(etat);
  const s = options.secteur != null ? etat.secteurs[options.secteur] : null;
  const donnees = etatsDesSecteurs(etat);

  const gestes: GesteVue[] = [
    { type: 'durcirHameau', nom: 'Durcir un hameau', cout: COUTS_PONCTUELS.durcirHameau, emprise: 'une construction' },
    { type: 'ouvrirCoupure', nom: 'Ouvrir une coupure', cout: COUTS_PONCTUELS.ouvrirCoupure, emprise: '9 parcelles' },
    { type: 'traiterPointNoir', nom: 'Traiter un point noir', cout: COUTS_PONCTUELS.traiterPointNoir, emprise: 'une parcelle' },
  ].map((g) => ({
    ...g,
    refus:
      etat.moyens.budget < g.cout
        ? `budget ${Math.round(etat.moyens.budget)}, manque ${Math.ceil(g.cout - etat.moyens.budget)}`
        : undefined,
  }));

  return {
    tour: etat.tour,
    toursMax: etat.toursMax,
    gestesEnAttente: options.gestesEnAttente ?? 0,
    ressources: {
      surfaceTenue: c.surfaceTenue,
      plafond: surfacePourUneRecette(etat),
      charge: c.entretien,
      recette: BUDGET.parTour,
      budget: etat.moyens.budget,
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
          fiches: POLITIQUES.map((p) => ficheDe(etat, s, p.id))
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
export function etatsDesSecteurs(etat: Etat): DonneesSecteur[] {
  let menace: number | null = null;
  if (etat.moyens.budget - BUDGET.plancher <= 3) {
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
          etat.moyens.budget >= p.etablissement &&
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
      ecartPlancher:
        s.id === menace
          ? `budget ${Math.round(etat.moyens.budget)} · plancher ${BUDGET.plancher}`
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
