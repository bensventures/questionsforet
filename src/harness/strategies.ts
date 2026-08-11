import type { ActionPonctuelle, Decisions, Etat, IdPolitique } from '../model/types';
import type { Strategie } from './jouer';
import { politiqueParId, applicable } from '../model/politiques';
import { COUTS_PONCTUELS } from '../model/ponctuelles';

/**
 * Les cinq stratégies scriptées du §12. Les quatre premières doivent produire
 * des défaites **distinguables** ; la cinquième est le joueur compétent, dont
 * les cibles chiffrées servent de calibration.
 */

/** Secteurs où une politique peut encore être ouverte, du plus petit au plus grand. */
function ouvrables(etat: Etat, id: IdPolitique): number[] {
  const p = politiqueParId(id);
  const habitants = (s: { cellules: number[] }) =>
    s.cellules.reduce((t, i) => t + (etat.grille[i].type === 'bati' ? etat.grille[i].habitants : 0), 0);
  return etat.secteurs
    .filter((s) => applicable(p, s) && !etat.politiques.some((a) => a.id === id && a.secteur === s.id))
    // Un joueur sensé protège d'abord là où l'on habite, pas le plus petit
    // périmètre disponible.
    .sort((a, b) => habitants(b) - habitants(a) || a.cellules.length - b.cellules.length)
    .map((s) => s.id);
}

/**
 * Secteurs où l'éclaircie est exploitable : desservis et peu pentus d'abord.
 * C'est le dilemme du §10, recette 1 — près d'une route et en pente douce
 * l'opération est proche de l'équilibre, en terrain raide et éloigné c'est une
 * perte sèche, et un joueur compétent ne s'y engage pas.
 */
function exploitables(etat: Etat): number[] {
  const p = politiqueParId('eclaircie');
  return etat.secteurs
    .filter((s) => applicable(p, s) && !etat.politiques.some((a) => a.id === 'eclaircie' && a.secteur === s.id))
    .map((s) => {
      let acces = 0;
      let pente = 0;
      for (const i of s.cellules) { acces += etat.grille[i].accessibilite; pente += etat.grille[i].pente; }
      return { id: s.id, note: acces / s.cellules.length - (pente / s.cellules.length) * 1.5 };
    })
    .filter((x) => x.note > 0.25) // en dessous, l'opération est déficitaire
    .sort((a, b) => b.note - a.note)
    .map((x) => x.id);
}

/** Secteurs abritant du bâti, les plus habités d'abord. */
function secteursBatis(etat: Etat): number[] {
  return etat.secteurs
    .map((s) => ({
      id: s.id,
      hab: s.cellules.reduce((t, i) => t + (etat.grille[i].type === 'bati' ? etat.grille[i].habitants : 0), 0),
    }))
    .filter((x) => x.hab > 0)
    .sort((a, b) => b.hab - a.hab)
    .map((x) => x.id);
}

/** 1. Extinction systématique maintenue, et rien d'autre. */
export const extinctionSystematique: Strategie = {
  nom: 'extinction systématique',
  decider: () => ({ doctrine: 1 }),
};

/**
 * 2. Tout débroussailler. Elle **tente d'entretenir ce qu'elle ouvre** : c'est
 * la note d'implémentation du patch 2. Si elle y parvient financièrement,
 * l'économie est trop généreuse ; si elle n'y parvient pas, ses parcelles
 * doivent basculer en friche et la sanctionner.
 */
export const toutDebroussailler: Strategie = {
  nom: 'tout débroussailler',
  decider: (etat) => {
    // Le contrôle ne coûte que le contrôle : on l'ouvre partout où c'est
    // possible, et on ouvre en plus des coupures forestières pour raser large.
    const activer: { id: IdPolitique; secteur: number }[] = ouvrables(etat, 'old').map((s) => ({ id: 'old', secteur: s }));
    for (const s of ouvrables(etat, 'pastoral').slice(0, 2)) activer.push({ id: 'pastoral', secteur: s });
    return { doctrine: 2, activer };
  },
};

/** 3. Ne rien faire. */
export const neRienFaire: Strategie = {
  nom: 'ne rien faire',
  decider: () => ({ doctrine: 2 }),
};

/** 4. Coupures uniquement : on compartimente le paysage, on ne touche pas au bâti. */
export const coupuresSeules: Strategie = {
  nom: 'coupures uniquement',
  decider: (etat) => {
    const activer: { id: IdPolitique; secteur: number }[] = [];
    for (const s of ouvrables(etat, 'pastoral').slice(0, 1)) activer.push({ id: 'pastoral', secteur: s });
    for (const s of ouvrables(etat, 'eclaircie').slice(0, 1)) activer.push({ id: 'eclaircie', secteur: s });
    return { doctrine: 2, activer };
  },
};

/**
 * 5. Stratégie mixte compétente : durcir tôt (le seul levier qui agit partout
 * à la fois et ne consomme rien au moment du feu), tenir les OLD sur la
 * couronne la plus habitée, puis entretenir le paysage sans s'étendre.
 */
/**
 * 5. Stratégie mixte compétente. Ordre imposé par la mesure : durcir d'abord et
 * complètement, contrôler ensuite, entretenir le paysage en dernier.
 */
export const mixteCompetente: Strategie = {
  decider: (etat, tour) => {
    const activer: { id: IdPolitique; secteur: number }[] = [];
    const ponctuelles: ActionPonctuelle[] = [];

    const aDurcir = etat.grille
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c.type === 'bati' && !x.c.detruite && x.c.durcissement < 1)
      .sort((a, b) => b.c.habitants - a.c.habitants);

    // Phase 1 : durcir, et rien d'autre tant que ce n'est pas fait. Le harnais
    // montre qu'à budget égal c'est de loin le meilleur rendement sur le bâti,
    // qu'il agit partout à la fois et ne consomme rien au moment du feu. Tout
    // ce qu'on dépense ailleurs avant d'avoir fini coûte des maisons.
    for (const s of secteursBatis(etat)) {
      if (!etat.politiques.some((a) => a.id === 'durcissement' && a.secteur === s)) {
        activer.push({ id: 'durcissement', secteur: s });
        break;
      }
    }
    const reserve = aDurcir.length ? 4 : 10;
    const possibles = Math.max(0, Math.floor((etat.moyens.budget - reserve) / COUTS_PONCTUELS.durcirHameau));
    for (const x of aDurcir.slice(0, possibles)) ponctuelles.push({ type: 'durcirHameau', cellule: x.i });

    // Phase 2 : le contrôle des OLD, qui ne coûte que le contrôle et rend les
    // secours capables d'approcher.
    if (tour > 2) {
      const c = ouvrables(etat, 'old')[0];
      if (c !== undefined) activer.push({ id: 'old', secteur: c });
    }

    // Phase 3 : le paysage, une fois le bâti tenu. Pâturage d'abord (il
    // s'autofinance une fois établi), puis éclaircie là où elle est exploitable.
    // Le durcissement sature vers le milieu de partie ; attendre davantage ne
    // gagne plus de bâti et coûte du paysage.
    if (tour > 6 && aDurcir.length <= 6) {
      const p = ouvrables(etat, 'pastoral')[0];
      if (p !== undefined && etat.moyens.eleveurs > 0) activer.push({ id: 'pastoral', secteur: p });
      const e = exploitables(etat)[0];
      if (e !== undefined && etat.moyens.budget > 14) activer.push({ id: 'eclaircie', secteur: e });
    }

    return { doctrine: 2, activer, ponctuelles };
  },
  nom: 'mixte compétente',
};

/**
 * Stratégie de diagnostic, hors des cinq du §12 : monomaniaque du durcissement.
 * Elle n'achète presque que cela — le programme d'aide sur tous les secteurs
 * habités, et chaque tour autant de durcissements immédiats que le budget
 * permet. Aucun contrôle des OLD, aucun traitement forestier.
 *
 * Elle teste directement une thèse que le brief affirme et que le harnais
 * n'avait jamais vérifiée : le durcissement est-il **réellement** le meilleur
 * investissement du jeu ? Si elle bat la mixte sur l'axe bâti, le modèle est
 * fidèle et c'est le proxy mixte qui est mal réglé. Si elle perd, la
 * sensibilité du durcissement aux braises est trop faible, et c'est un défaut
 * de modèle qu'aucun ajustement du proxy ne rattrapera.
 */
export const durcissementSeul: Strategie = {
  nom: 'durcissement seul',
  decider: (etat) => {
    const activer: { id: IdPolitique; secteur: number }[] = [];
    for (const s of secteursBatis(etat)) {
      if (!etat.politiques.some((a) => a.id === 'durcissement' && a.secteur === s)) {
        activer.push({ id: 'durcissement', secteur: s });
        break;
      }
    }
    // Tout le budget restant part en durcissements immédiats, les logements les
    // plus habités d'abord.
    const ponctuelles: ActionPonctuelle[] = [];
    const cibles = etat.grille
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c.type === 'bati' && !x.c.detruite && x.c.durcissement < 1)
      .sort((a, b) => b.c.habitants - a.c.habitants);
    const possibles = Math.max(0, Math.floor((etat.moyens.budget - 6) / COUTS_PONCTUELS.durcirHameau));
    for (const x of cibles.slice(0, possibles)) ponctuelles.push({ type: 'durcirHameau', cellule: x.i });
    return { doctrine: 2, activer, ponctuelles };
  },
};

export const CINQ: Strategie[] = [
  extinctionSystematique,
  toutDebroussailler,
  neRienFaire,
  coupuresSeules,
  mixteCompetente,
];
