import type { Decisions, Etat, Ligne } from './types';
import type { Rng } from './rng';
import type { Braise } from './feu';
import { tirerMeteo, processusLents } from './lent';
import { tirerDeparts, appliquerDoctrine, simulerFeu, bilanVide } from './feu';
import { appliquerIssues, regenerer } from './apresFeu';
import { appliquerPolitiques, activer, lever, politiqueParId, applicable } from './politiques';
import { bouclerBudget, suivrePartenaires, BUDGET } from './economie';
import { appliquerPonctuelles } from './ponctuelles';
import { profondeurTraiteeReelle } from './derive';
import { DOCTRINE } from './params';

/**
 * `avancer(état, décisions) → état` : la seule porte d'entrée du noyau (§2).
 *
 * Déterministe à graine fixée, sans aucun appel graphique ni dépendance au
 * navigateur. La couche interface lit l'état et émet des décisions, elle ne
 * calcule rien. La couche d'exécution sans interface appelle exactement la même
 * fonction : c'est la condition pour que la calibration mesure le jeu et non
 * une approximation de celui-ci.
 *
 * L'état est muté en place et renvoyé. La grille est volumineuse, le noyau est
 * le seul à y toucher, et une copie par tour ne ferait que rassurer.
 */
export interface Tour {
  etat: Etat;
  lignes: Ligne[];
  /** Braises du feu de ce tour, pour rejouer l'incendie à l'écran. */
  braises: Braise[];
  feu: boolean;
  termine: boolean;
}

export function avancer(etat: Etat, decisions: Decisions, rng: Rng): Tour {
  const lignes: Ligne[] = [];

  // 1. Décisions. La doctrine est modifiable à tout moment (§7.5) ; les
  //    politiques arrivent à l'étape 4 de l'ordre de travail du §14.
  if (decisions.doctrine && decisions.doctrine !== etat.doctrine) {
    etat.doctrine = decisions.doctrine;
    lignes.push({ texte: `Doctrine de lutte : ${DOCTRINE[etat.doctrine].nom.toLowerCase()}.` });
  }
  const coutDoctrine = DOCTRINE[etat.doctrine].budget;
  etat.moyens.budget -= coutDoctrine;
  etat.cumul.depense += coutDoctrine;
  if (etat.doctrine === 1) etat.cumul.toursCran1++;

  // Politiques levées, puis activées. L'établissement se paie à l'ouverture ;
  // c'est l'entretien, récurrent, qui produira le plafond (patch 2).
  for (const l of decisions.lever ?? []) lever(etat, l.id, l.secteur);
  for (const a of decisions.activer ?? []) {
    const s = etat.secteurs[a.secteur];
    const p = politiqueParId(a.id);
    if (!s || !applicable(p, s)) continue;
    if (etat.politiques.some((x) => x.id === a.id && x.secteur === a.secteur)) continue;
    // Le contrat pastoral demande un éleveur disponible : la ressource rare
    // n'est pas l'argent (§10).
    if (a.id === 'pastoral' && etat.moyens.eleveurs <= 0) {
      lignes.push({ texte: `Aucun éleveur disponible pour un contrat sur ${s.nom}.`, ton: 'chaud' });
      continue;
    }
    if (etat.moyens.budget < p.etablissement) continue;
    etat.moyens.budget -= p.etablissement;
    etat.cumul.depense += p.etablissement;
    if (a.id === 'pastoral') etat.moyens.eleveurs--;
    activer(etat, a.id, a.secteur);
  }

  // Actions ponctuelles (§9.2) : ce qui est local et non répétable.
  lignes.push(...appliquerPonctuelles(etat, decisions.ponctuelles ?? []));

  // Effets des politiques en vigueur, puis bouclage budgétaire.
  lignes.push(...appliquerPolitiques(etat, rng));
  lignes.push(...bouclerBudget(etat));
  etat.toursSansContrat = etat.politiques.some((a) => a.id === 'pastoral') ? 0 : etat.toursSansContrat + 1;
  lignes.push(...suivrePartenaires(etat, etat.toursSansContrat));

  // La profondeur traitée n'est pas déclarée, elle est mesurée sur le terrain :
  // une politique qui ne tient pas le sous-bois ne produit pas de profondeur.
  for (const c of etat.grille) {
    if (c.type === 'bati' && !c.detruite) c.profondeurTraitee = profondeurTraiteeReelle(etat.grille, c, 4);
  }

  // 2. Météo du tour. Exogène : rien de ce que fait le joueur ne la change.
  tirerMeteo(etat, rng);

  // 3. Allumage, doctrine, feu. Un seul bilan traverse les trois étapes, sinon
  //    les départs éteints ne sont comptés nulle part.
  const bilan = bilanVide();
  etat.dernierFeu = bilan;
  let braises: Braise[] = [];
  let feu = false;

  const departs = tirerDeparts(etat, rng);
  if (departs.length) {
    const restants = appliquerDoctrine(etat, departs, rng, bilan);
    if (restants.length) {
      const res = simulerFeu(etat, restants, rng, bilan);
      braises = res.braises;
      feu = true;
      lignes.push(...appliquerIssues(etat, res, rng));
      // Recette 3 : après un feu, des moyens exceptionnels apparaissent pour
      // quelques tours. Un mauvais tour 10 devient un revers, pas une partie
      // perdue.
      if (bilan.parcourues > etat.grille.length * 0.02) {
        etat.moyens.fenetrePostFeu = BUDGET.fenetreTours;
      }
    }
  }

  // 4. Processus lents, puis régénération.
  lignes.push(...processusLents(etat, rng));
  lignes.push(...regenerer(etat, rng));

  etat.tour++;
  return { etat, lignes, braises, feu, termine: etat.tour > etat.toursMax };
}
