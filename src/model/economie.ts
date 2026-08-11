import type { Cellule, Etat, Ligne } from './types';
import { TYPES, DENSITE } from './params';
import { politiqueParId } from './politiques';
import { borne } from './util';

/**
 * Économie (§10 et patch 2).
 *
 * Le symptôme rapporté en v2 était : deux ou trois politiques activées, puis
 * blocage à zéro pour le reste de la partie. La cause était que les briefs
 * donnaient des coûts sans jamais donner de recettes.
 *
 * Le point structurant du patch 2 : distinguer le **coût d'établissement**,
 * ponctuel et payable par un joueur riche, de la **charge d'entretien**,
 * récurrente et proportionnelle à la surface maintenue. Il en résulte un
 * plafond dur de surface tenable dont aucun enrichissement ne permet de sortir,
 * puisque la charge croît avec la surface. Les grandes étendues non traitées
 * deviennent **émergentes** : aucune ligne du modèle ne dit qu'on ne
 * débroussaille pas le massif, c'est la géométrie des coûts qui le produit.
 */

/** Coût annuel du contrôle d'une construction. Le propriétaire paie l'exécution. */
export const COUT_CONTROLE = 0.12;

export const BUDGET = {
  /** Recette récurrente de la collectivité, par tour. */
  parTour: 12,
  /** Moyens exceptionnels après un feu, et leur durée (recette 3). */
  fenetreMontant: 9,
  fenetreTours: 3,
  /** Un mauvais tour doit être un revers, pas une partie perdue. */
  plancher: -6,
};

/**
 * Coût d'entretien d'une cellule et par tour, **modulé par l'accessibilité** :
 * distance à une route et pente, deux variables déjà présentes dans le modèle.
 * Une couronne de hameau bordée de routes coûte peu à tenir ; un versant
 * éloigné et raide coûte beaucoup, et le plafond s'y effondre.
 */
export function coutEntretien(c: Cellule): number {
  const eloignement = 1 - c.accessibilite;
  return 0.055 * (1 + eloignement * 2.2 + c.pente * 1.8);
}

/**
 * Recette de l'éclaircie (recette 1). Près d'une route et en pente douce, elle
 * est proche de l'équilibre ou bénéficiaire ; en terrain pentu et éloigné,
 * c'est une perte sèche. Et les peuplements dont la densité pose le plus
 * problème sont souvent du second type : c'est le dilemme réel de la forêt de
 * montagne française, et ce qui explique qu'environ la moitié des placettes ne
 * montre aucune trace de gestion.
 */
export function recetteEclaircie(c: Cellule): number {
  const volume = borne((c.densite - DENSITE.apresEclaircie) / DENSITE.plafond, 0, 1);
  const valeur = volume * 2.6 * c.accessibilite;
  const chantier = 0.5 * (1 + c.pente * 2.4 + (1 - c.accessibilite) * 1.6);
  return valeur - chantier;
}

export interface Comptes {
  /** Charge d'entretien du tour, toutes politiques confondues. */
  entretien: number;
  /** Recettes de l'exploitation. */
  recettes: number;
  /**
   * Surface **forestière** effectivement entretenue, en cellules. C'est elle
   * que plafonne le patch 2 : l'apron des constructions n'en fait pas partie,
   * puisque le joueur ne le finance pas (amendement 2, B.1).
   */
  surfaceTenue: number;
}

/** Ce que coûtent et rapportent les politiques en vigueur, ce tour. */
export function comptes(etat: Etat): Comptes {
  let entretien = 0;
  let recettes = 0;
  let surfaceTenue = 0;

  for (const a of etat.politiques) {
    const p = politiqueParId(a.id);
    const s = etat.secteurs[a.secteur];
    if (!s) continue;
    const emprise = p.emprise(etat, s);

    if (a.id === 'durcissement') {
      // Le durcissement est un investissement, pas une charge : une fois posé,
      // il ne consomme plus rien et agit partout à la fois. C'est l'asymétrie
      // à préserver du patch 1, et la raison pour laquelle il doit ressortir
      // comme le meilleur investissement du jeu.
      continue;
    }

    if (a.id === 'pastoral') {
      // Recette 2 : une fois établi, le contrat s'autofinance. Son coût réel
      // est le débroussaillement mécanique initial et la disponibilité de
      // l'éleveur, pas une ponction perpétuelle.
      if (a.adoption < 1) entretien += emprise.length * 0.02;
      surfaceTenue += Math.round(emprise.length * a.adoption);
      continue;
    }

    if (a.id === 'eclaircie') {
      const n = Math.max(1, Math.round(emprise.length * 0.45 * a.adoption));
      const tries = [...emprise].sort((x, y) => y.densite - x.densite).slice(0, n);
      for (const c of tries) recettes += recetteEclaircie(c);
      continue;
    }

    // OLD : le joueur contrôle, il n'exécute pas. La charge est celle d'un
    // service de contrôle, proportionnelle au nombre de constructions et non à
    // une surface forestière. Elle n'entre donc **pas** dans le plafond
    // d'entretien du patch 2, qui ne vise que le traitement forestier
    // (amendement 2, B.1).
    entretien += emprise.length * COUT_CONTROLE;
  }

  return { entretien, recettes, surfaceTenue };
}

/**
 * Boucle budgétaire du tour. Renvoie les lignes de compte rendu, et laisse le
 * budget dans `etat.moyens`.
 */
export function bouclerBudget(etat: Etat): Ligne[] {
  const lignes: Ligne[] = [];
  const c = comptes(etat);

  etat.moyens.budget += BUDGET.parTour + c.recettes - c.entretien;
  etat.cumul.depense += c.entretien;
  etat.cumul.recettes += c.recettes;

  if (etat.moyens.fenetrePostFeu > 0) {
    etat.moyens.budget += BUDGET.fenetreMontant;
    etat.moyens.fenetrePostFeu--;
  }

  // Budget négatif : on ne peut plus tout tenir. Les politiques les plus
  // coûteuses à entretenir lâchent, et les surfaces qu'elles tenaient partent
  // en déshérence — c'est le piège du renoncement, sans avertissement préalable.
  while (etat.moyens.budget < BUDGET.plancher) {
    const candidates = etat.politiques
      .map((a) => ({ a, cout: coutPolitique(etat, a.id, a.secteur) }))
      .filter((x) => x.cout > 0)
      .sort((x, y) => y.cout - x.cout);
    if (!candidates.length) break;
    const perdue = candidates[0];
    etat.politiques = etat.politiques.filter((a) => a !== perdue.a);
    etat.moyens.budget += perdue.cout;
    const s = etat.secteurs[perdue.a.secteur];
    lignes.push({
      texte: `${politiqueParId(perdue.a.id).nom} interrompue sur ${s?.nom ?? 'ce secteur'} : la collectivité ne peut plus en assurer l'entretien.`,
      ton: 'chaud',
    });
  }

  if (etat.moyens.budget < 0) etat.moyens.budget = 0;
  return lignes;
}

/**
 * Charge récurrente nette d'une politique, pour arbitrer ce qu'on lâche quand
 * le budget ne suit plus. On abandonne d'abord ce qui coûte le plus cher, ce
 * qui n'est plus le contrôle des OLD depuis qu'il est financé au contrôle seul.
 *
 * Un programme d'éclaircie déficitaire — versant raide et éloigné — est le
 * premier candidat, et c'est le dilemme réel de la forêt de montagne : les
 * peuplements dont la densité pose le plus problème sont ceux qu'on ne peut pas
 * exploiter à l'équilibre.
 */
export function coutPolitique(etat: Etat, id: Etat['politiques'][number]['id'], secteur: number): number {
  const s = etat.secteurs[secteur];
  if (!s) return 0;
  const p = politiqueParId(id);
  if (id === 'durcissement') return 0; // investissement acquis, jamais une charge
  if (id === 'pastoral') return 0; // s'autofinance une fois établi (recette 2)
  if (id === 'eclaircie') {
    const a = etat.politiques.find((x) => x.id === id && x.secteur === secteur);
    const emprise = p.emprise(etat, s);
    const n = Math.max(1, Math.round(emprise.length * 0.45 * (a?.adoption ?? 1)));
    let net = 0;
    for (const c of [...emprise].sort((x, y) => y.densite - x.densite).slice(0, n)) net += recetteEclaircie(c);
    return Math.max(0, -net); // seule une opération déficitaire est une charge
  }
  return p.emprise(etat, s).length * COUT_CONTROLE;
}

/**
 * Partenaires finis (§10). La ressource rare n'est pas l'argent, c'est le
 * partenaire compétent : ils se perdent faute de sollicitation, et se
 * reconstituent beaucoup plus lentement qu'ils ne disparaissent.
 */
export const PARTENAIRES = {
  eleveursMax: 3,
  /** Tours sans aucun contrat au bout desquels un éleveur s'en va (déprise). */
  toursAvantDeprise: 6,
  /** Tours nécessaires pour qu'un éleveur revienne. Bien plus long. */
  toursAvantRetour: 18,
};

export function suivrePartenaires(etat: Etat, sansContrat: number): Ligne[] {
  const lignes: Ligne[] = [];
  const contrats = etat.politiques.filter((a) => a.id === 'pastoral').length;
  if (contrats === 0 && sansContrat > 0 && sansContrat % PARTENAIRES.toursAvantDeprise === 0) {
    if (etat.moyens.eleveurs > 0) {
      etat.moyens.eleveurs--;
      lignes.push({
        texte: "Un éleveur a cessé son activité faute de débouché. Il faudra bien plus longtemps pour en retrouver un que pour le perdre.",
        ton: 'chaud',
      });
    }
  }
  return lignes;
}
