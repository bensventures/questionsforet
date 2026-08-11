import type { Cellule, Etat, Ligne, TypeVeg } from './types';
import type { Rng } from './rng';
import type { ResultatFeu } from './feu';
import { TYPES, ISSUE, SURVIE, REGEN, DENSITE } from './params';
import { severite as severiteDe, survitAuFeuDeSurface } from './derive';

/**
 * Après le feu (§8).
 *
 * Correction d'une faute des briefs précédents : le feu de cime n'est pas une
 * sentence uniforme. Il y a **trois issues, pas deux**, et le pin noir se
 * défend mieux qu'annoncé grâce à son écorce.
 */

/** Applique à chaque cellule parcourue l'issue qu'elle a subie. */
export function appliquerIssues(etat: Etat, res: ResultatFeu, rng: Rng): Ligne[] {
  const lignes: Ligne[] = [];
  const { grille } = etat;
  let convertiPinNoir = 0;
  let beneficeSurface = 0;

  for (let i = 0; i < grille.length; i++) {
    if (res.touchee[i] === 0) continue;
    const c = grille[i];
    if (c.type === 'bati' || c.type === 'rocher') continue;

    const severite = severiteDe(res.subie[i], c);
    const T = TYPES[c.type];

    if (severite >= ISSUE.houppierConsomme) {
      // Houppier consommé : mortalité sans recours, les pins ne rejettent pas.
      etat.dernierFeu!.houppierConsomme++;
      c.typeAvantFeu = c.type;
      c.regenDans = REGEN.tours;
      c.densite = 0;
      c.sousBois = 0.05;
      c.age = 0;
      c.gestion = DENSITE.memoireGestion + 5;
      c.paturage = 0;
      if (c.type === 'pinNoir') convertiPinNoir++;
      continue;
    }

    if (severite >= ISSUE.houppierRoussi) {
      // Houppier roussi, bourgeons épargnés : survie partielle, croissance
      // ralentie, et une mortalité différée sur deux à trois tours (ravageurs
      // et pathogènes sur arbres affaiblis).
      etat.dernierFeu!.houppierRoussi++;
      c.sousBois = 0.06;
      if (T.arbore) {
        c.densite = Math.max(60, c.densite * 0.55);
        c.mortaliteDifferee = SURVIE.mortaliteDiffereeTours;
      }
      continue;
    }

    // Feu de surface. Les sujets âgés survivent grâce à l'écorce et au
    // houppier haut ; les jeunes tiges meurent. Bénéfice net : le combustible
    // a été traité, et c'est exactement le travail que la suppression
    // systématique empêche de se faire.
    etat.dernierFeu!.surface++;
    c.sousBois = 0.05;
    if (T.arbore) {
      if (survitAuFeuDeSurface(c)) {
        c.densite = Math.max(120, c.densite * 0.72);
        c.gestion = 0; // le feu a fait le travail d'entretien
        beneficeSurface++;
      } else {
        // Peuplement trop jeune : l'écorce n'a pas tenu.
        c.typeAvantFeu = c.type;
        c.regenDans = REGEN.tours;
        c.densite = 0;
        c.age = 0;
        if (c.type === 'pinNoir') convertiPinNoir++;
      }
    }
  }

  if (beneficeSurface > 0) {
    lignes.push({
      texte: `${beneficeSurface} peuplement${beneficeSurface > 1 ? 's' : ''} a subi un feu de surface sans mourir : l'écorce a tenu, le sous-bois a été consommé. Ce feu-là a fait le travail d'entretien.`,
      ton: 'bon',
    });
  }
  if (convertiPinNoir > 0) {
    lignes.push({
      texte: `${convertiPinNoir} parcelle${convertiPinNoir > 1 ? 's' : ''} de pin noir ne repartira pas : pas de sérotinie, aucun semencier survivant.`,
      ton: 'chaud',
    });
  }
  return lignes;
}

/**
 * Régénération différenciée (§8.3), le cœur pédagogique du modèle. Exécutée
 * chaque tour sur les parcelles dont le compte à rebours arrive à terme.
 *
 * La conversion du pin noir est irréversible sans intervention. C'est la leçon
 * centrale du dossier : le problème du pin noir n'est pas qu'il brûle, c'est
 * qu'il ne revient pas.
 */
export function regenerer(etat: Etat, rng: Rng): Ligne[] {
  const lignes: Ligne[] = [];
  let rejets = 0;
  let echecsHetre = 0;
  let conversions = 0;

  for (const c of etat.grille) {
    // Mortalité différée après un houppier roussi.
    if (c.mortaliteDifferee > 0) {
      c.mortaliteDifferee--;
      if (c.mortaliteDifferee === 0 && TYPES[c.type].arbore && rng.chance(0.35)) {
        c.typeAvantFeu = c.type;
        c.regenDans = REGEN.tours;
        c.densite = 0;
        c.age = 0;
      }
      continue;
    }

    if (c.regenDans <= 0) continue;
    c.regenDans--;
    if (c.regenDans > 0) continue;

    const avant = c.typeAvantFeu;
    c.typeAvantFeu = undefined;
    if (!avant) continue;

    const devenir = (t: TypeVeg, densite: number, age: number) => {
      c.type = t;
      c.densite = densite;
      c.age = age;
      c.sousBois = 0.35;
      c.gestion = DENSITE.memoireGestion + 5;
    };

    switch (avant) {
      case 'chene':
        // Rejette de souche vigoureusement.
        devenir('chene', 320, 4);
        rejets++;
        break;
      case 'hetre':
        // Rejette, mais meurt le plus souvent dans les trois tours suivants.
        if (rng.chance(REGEN.echecHetre)) {
          devenir(rng.chance(0.6) ? 'garrigue' : 'pelouse', 0, 0);
          echecsHetre++;
        } else {
          devenir('hetre', 280, 4);
          rejets++;
        }
        break;
      case 'pinSylvestre':
        if (rng.chance(REGEN.reussitePinSylvestre)) devenir('pinSylvestre', 300, 3);
        else { devenir(rng.chance(0.6) ? 'garrigue' : 'pelouse', 0, 0); conversions++; }
        break;
      case 'pinNoir':
        // Ne revient pas. Conversion selon la station.
        devenir(c.pente > 0.4 || c.expositionSud > 0.6 ? 'garrigue' : 'pelouse', 0, 0);
        conversions++;
        break;
      case 'ripisylve':
        devenir(c.positionTopo === 'talweg' ? 'ripisylve' : 'garrigue', 260, 4);
        break;
      default:
        // Garrigue, pelouse, friche : repousse rapide, forte inflammabilité.
        devenir(avant, 0, 0);
        c.sousBois = 0.45;
        break;
    }
  }

  if (rejets > 0) lignes.push({ texte: `${rejets} parcelle${rejets > 1 ? 's' : ''} a rejeté de souche : le couvert repart.`, ton: 'bon' });
  if (echecsHetre > 0) lignes.push({ texte: `${echecsHetre} hêtraie${echecsHetre > 1 ? 's' : ''} a rejeté puis dépéri : le hêtre supporte mal le feu, son écorce est trop fine.`, ton: 'chaud' });
  if (conversions > 0) lignes.push({ texte: `${conversions} parcelle${conversions > 1 ? 's' : ''} de pin est passée en lande ou pelouse, sans retour spontané possible.`, ton: 'chaud' });
  return lignes;
}
