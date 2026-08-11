import type { ActionPonctuelle, Etat, Ligne } from './types';
import { TYPES, SOUS_BOIS } from './params';
import { dans, idx } from './util';

/**
 * Actions ponctuelles (§9.2). Trois au plus, pour ce qui est local et non
 * répétable. Le contraste entre les deux registres est instructif en soi :
 * l'action ponctuelle soulage tout de suite, la politique transforme lentement.
 *
 * Aucune n'engendre de charge d'entretien : c'est un geste, pas un programme.
 * En contrepartie, une coupure ouverte et jamais reprise part en friche, comme
 * n'importe quelle surface ouverte (patch 2).
 */

export const COUTS_PONCTUELS = {
  durcirHameau: 5,
  ouvrirCoupure: 3,
  traiterPointNoir: 2,
};

export function appliquerPonctuelles(etat: Etat, actions: ActionPonctuelle[]): Ligne[] {
  const lignes: Ligne[] = [];

  for (const a of actions) {
    const cout = COUTS_PONCTUELS[a.type];
    if (etat.moyens.budget < cout) continue;
    const c = etat.grille[a.cellule];
    if (!c) continue;

    switch (a.type) {
      case 'durcirHameau': {
        // Durcir un hameau précis, tout de suite, sans attendre l'adoption
        // progressive d'un programme d'aide.
        if (c.type !== 'bati' || c.detruite || c.durcissement >= 1) continue;
        c.durcissement = 1;
        lignes.push({ texte: `Logement durci sur-le-champ en (${c.x},${c.y}).`, ton: 'bon' });
        break;
      }
      case 'ouvrirCoupure': {
        // Une coupure sur une crête choisie : le voisinage immédiat, pas plus.
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dans(c.x + dx, c.y + dy)) continue;
            const v = etat.grille[idx(c.x + dx, c.y + dy)];
            if (v.type === 'bati' || v.type === 'rocher') continue;
            v.sousBois = Math.min(v.sousBois, SOUS_BOIS.seuilTraite * 0.5);
            v.ouverture = Math.max(1, v.ouverture);
            n++;
          }
        }
        if (!n) continue;
        lignes.push({ texte: `Coupure ouverte sur ${n} parcelles en (${c.x},${c.y}). Sans reprise, elle partira en friche.` });
        break;
      }
      case 'traiterPointNoir': {
        // Traiter un point noir identifié après un feu.
        if (c.type === 'bati' || c.type === 'rocher') continue;
        c.sousBois = Math.min(c.sousBois, SOUS_BOIS.seuilTraite * 0.5);
        c.ouverture = Math.max(1, c.ouverture);
        if (TYPES[c.type].arbore) c.gestion = 0;
        lignes.push({ texte: `Point noir traité en (${c.x},${c.y}).` });
        break;
      }
    }
    etat.moyens.budget -= cout;
    etat.cumul.depense += cout;
  }

  return lignes;
}
