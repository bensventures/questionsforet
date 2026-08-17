import type { Decisions, Doctrine, Etat, Ligne, PolitiqueCoupee } from './types';
import type { Rng } from './rng';
import type { Braise } from './feu';
import { tirerMeteo, processusLents } from './lent';
import { tirerDeparts, appliquerDoctrine, simulerFeu, bilanVide } from './feu';
import { appliquerIssues, regenerer } from './apresFeu';
import { appliquerPolitiques, activer, lever, politiqueParId, applicable } from './politiques';
import { bouclerBudget, BUDGET, nombreDeCompte, signeDeCompte } from './economie';
import { engagerEleveur, suivrePartenaires } from './partenaires';
import { appliquerPonctuelles } from './ponctuelles';
import { profondeurTraiteeReelle } from './derive';
import { DOCTRINE, REFORME } from './params';

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
  /**
   * Politiques coupées par le bouclage budgétaire ce tour-ci. Le noyau renvoie
   * l'événement, pas seulement sa phrase : la bande de coupe écrit des
   * conséquences datées, et les tirer du texte serait fragile.
   */
  coupees: PolitiqueCoupee[];
  /**
   * Pas de temps d'arrivée du front par cellule, `null` s'il n'y a pas eu de
   * feu. Avec `braises`, c'est tout ce dont la couche de rendu a besoin pour
   * rejouer l'incendie **tel qu'il a eu lieu**. Le noyau ne l'anime pas : il
   * livre la chronologie, le rendu en fait ce qu'il veut.
   */
  arrivee: Uint16Array | null;
  feu: boolean;
  termine: boolean;
}

/**
 * Engage une réforme de doctrine (patch « posture héritée, réforme fenêtrée »).
 *
 * Trois cas, et un seul est gratuit : **le premier été**, où le territoire
 * confirme ou réforme la posture dont il hérite. Ce n'est pas un trou, c'est le
 * choix fondateur, et il doit rester ouvert au joueur informé sous peine de
 * transformer le piège en fatalité.
 *
 * Ensuite, réformer coûte et prend du temps, sauf dans la **fenêtre
 * post-incendie**, où c'est rapide et bon marché : la réforme doctrinale suit
 * historiquement la catastrophe. Et tant qu'une réforme court, aucune autre ne
 * s'engage : c'est ce qui interdit de lire la météo et de basculer.
 */
function engagerReforme(etat: Etat, vers: Doctrine): Ligne[] {
  if (etat.reforme) {
    return [{ texte: 'Une réforme de doctrine est déjà engagée : elle suit son cours.', ton: 'chaud' }];
  }
  if (etat.tour === 1) {
    etat.doctrine = vers;
    return [{ texte: `Doctrine retenue pour le territoire : ${DOCTRINE[vers].nom.toLowerCase()}.` }];
  }

  const fenetre = etat.moyens.fenetrePostFeu > 0;
  const cout = fenetre ? REFORME.coutFenetre : REFORME.cout;
  if (etat.moyens.budget < cout) {
    return [
      {
        texte: `Réformer la doctrine coûte ${cout} : la collectivité ne les a pas.`,
        ton: 'chaud',
      },
    ];
  }
  etat.moyens.budget -= cout;
  etat.cumul.depense += cout;
  const dans = fenetre ? REFORME.delaiFenetre : REFORME.delai;
  etat.reforme = { vers, dans };
  return [
    {
      texte: fenetre
        ? `Réforme engagée dans la fenêtre ouverte par l'incendie : ${DOCTRINE[vers].nom.toLowerCase()} dans ${dans} été${dans > 1 ? 's' : ''}, pour ${cout}.`
        : `Réforme engagée : ${DOCTRINE[vers].nom.toLowerCase()} dans ${dans} étés, pour ${cout}.`,
      ton: fenetre ? 'bon' : undefined,
    },
  ];
}

export function avancer(etat: Etat, decisions: Decisions, rng: Rng): Tour {
  const lignes: Ligne[] = [];

  // 1. Réforme arrivée à échéance, **avant** toute décision : la posture qui
  //    entre en vigueur vaut pour l'été qui commence, feu compris.
  if (etat.reforme) {
    etat.reforme.dans--;
    if (etat.reforme.dans <= 0) {
      etat.doctrine = etat.reforme.vers;
      etat.reforme = null;
      lignes.push({
        texte: `La réforme est entrée en vigueur : ${DOCTRINE[etat.doctrine].nom.toLowerCase()}.`,
        ton: 'bon',
      });
    }
  }

  // 2. Le choix fondateur du premier été, **avant le bouclage** : il est gratuit
  //    et immédiat, donc c'est la posture retenue que la collectivité paie dès
  //    cette année-là. Les réformes ultérieures s'achètent après le bouclage, sur
  //    un budget qui a reçu sa recette.
  if (etat.tour === 1 && decisions.doctrine && decisions.doctrine !== etat.doctrine) {
    lignes.push(...engagerReforme(etat, decisions.doctrine));
  }

  // 3. Bouclage budgétaire, **en tête d'été et avant les décisions**. La recette
  //    de l'année arrivait à la clôture, après les dépenses : on dépensait donc
  //    une caisse et non un budget, et « j'ai 12 de recette, 3 de charges, donc
  //    9 à engager », le raisonnement que tout joueur fait, était faux d'une
  //    année. Une collectivité vote son budget, puis l'exécute. Les charges
  //    d'entretien portent sur les politiques de l'an dernier : celles qu'on
  //    établit ce tour-ci paieront à partir du suivant.
  const bouclage = bouclerBudget(etat);
  // La ligne de comptes se compose **après** les décisions, mais se lit ici :
  // son rang est celui du bouclage, qu'elle explique et qui explique les
  // coupures, et son « il reste » doit être le budget de fin d'été, celui que le
  // joueur retrouvera. Écrite au bouclage, elle annonçait 19 quand la caisse en
  // porterait 5 une fois les établissements payés.
  const rangDesComptes = lignes.length;
  const avantDecisions = etat.moyens.budget;
  lignes.push(...bouclage.lignes);

  // 4. Décisions. La doctrine n'est plus un interrupteur : **l'effet** de la
  //    posture reste immédiat, c'est son **changement** qui est lent et coûteux,
  //    sauf dans la fenêtre ouverte par un incendie.
  if (etat.tour > 1 && decisions.doctrine && decisions.doctrine !== etat.doctrine) {
    lignes.push(...engagerReforme(etat, decisions.doctrine));
  }
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
    if (a.id === 'pastoral' && etat.moyens.eleveurs.disponibles <= 0) {
      lignes.push({ texte: `Pas d'éleveur·euse disponible pour un contrat sur ${s.nom}.`, ton: 'chaud' });
      continue;
    }
    if (etat.moyens.budget < p.etablissement) {
      // Une décision prise puis silencieusement écartée est la pire des
      // réponses : le joueur croit avoir engagé, et rien ne s'est passé.
      lignes.push({
        texte: `${p.nom} sur ${s.nom} : l'établissement coûte ${p.etablissement}, la collectivité n'a que ${Math.floor(etat.moyens.budget)}.`,
        ton: 'chaud',
      });
      continue;
    }
    etat.moyens.budget -= p.etablissement;
    etat.cumul.depense += p.etablissement;
    // L'éleveur passe de disponible à engagé : il n'est pas consommé, et le
    // contrat le rendra au vivier quand il cessera.
    if (a.id === 'pastoral') engagerEleveur(etat.moyens.eleveurs);
    activer(etat, a.id, a.secteur);
  }

  // Actions ponctuelles (§9.2) : ce qui est local et non répétable.
  lignes.push(...appliquerPonctuelles(etat, decisions.ponctuelles ?? []));

  // Plus rien ne touche au budget après ce point : la ligne de comptes peut
  // s'écrire, avec ce que les décisions ont coûté et ce qui reste vraiment.
  const engage = avantDecisions - etat.moyens.budget;
  lignes.splice(rangDesComptes, 0, {
    texte: `Comptes de l'été : ${[...bouclage.postes, engage ? `engagements ${signeDeCompte(-engage)}` : '']
      .filter(Boolean)
      .join(', ')}. Il reste ${nombreDeCompte(etat.moyens.budget)}.`,
  });

  // Effets des politiques en vigueur.
  lignes.push(...appliquerPolitiques(etat, rng));
  // La fenêtre post-incendie s'use ici et non au bouclage, qui est passé en tête
  // d'été : décomptée en même temps que la recette exceptionnelle, elle se
  // fermerait un été trop tôt du point de vue de la décision, et réformer dans
  // la fenêtre coûterait 8 au lieu de 2 au dernier été utile.
  if (etat.moyens.fenetrePostFeu > 0) etat.moyens.fenetrePostFeu--;
  etat.toursSansContrat = etat.politiques.some((a) => a.id === 'pastoral') ? 0 : etat.toursSansContrat + 1;
  lignes.push(...suivrePartenaires(etat, etat.toursSansContrat));

  // La profondeur traitée n'est pas déclarée, elle est mesurée sur le terrain :
  // une politique qui ne tient pas le sous-bois ne produit pas de profondeur.
  for (const c of etat.grille) {
    if (c.type === 'bati' && !c.detruite) c.profondeurTraitee = profondeurTraiteeReelle(etat.grille, c, 4);
  }

  // 2. Météo du tour. Exogène : rien de ce que fait le joueur ne la change.
  tirerMeteo(etat, rng);

  // Vieillissement des traces, **avant** l'allumage : une parcelle parcourue ce
  // tour-ci doit finir le tour à zéro, sinon la couche de rendu ne peut pas
  // distinguer le front de l'année d'une cicatrice de l'an dernier. Observation
  // pure, qu'aucune règle ne lit (voir `Cellule.saisonsDepuisFeu`).
  for (const c of etat.grille) {
    if (c.saisonsDepuisFeu < Number.MAX_SAFE_INTEGER) c.saisonsDepuisFeu++;
  }

  // 3. Allumage, doctrine, feu. Un seul bilan traverse les trois étapes, sinon
  //    les départs éteints ne sont comptés nulle part.
  const bilan = bilanVide();
  etat.dernierFeu = bilan;
  let braises: Braise[] = [];
  let arrivee: Uint16Array | null = null;
  let feu = false;

  const departs = tirerDeparts(etat, rng);
  etat.cumul.departs += departs.length;
  if (departs.length) {
    const restants = appliquerDoctrine(etat, departs, rng, bilan);
    if (restants.length) {
      const res = simulerFeu(etat, restants, rng, bilan);
      braises = res.braises;
      arrivee = res.arrivee;
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
  return { etat, lignes, braises, arrivee, coupees: bouclage.coupees, feu, termine: etat.tour > etat.toursMax };
}
