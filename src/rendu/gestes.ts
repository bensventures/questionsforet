import type { ActionPonctuelle, Etat } from '../model/types';
import { COUTS_PONCTUELS } from '../model/ponctuelles';
import { S } from './cellule';

/**
 * Calque des gestes (planche 3) : **ce qui va être touché**, à la visée comme
 * une fois désigné.
 *
 * Un geste se désigne à la parcelle et n'agissait jusqu'ici que dans le compte
 * rendu, un tour plus tard : on cliquait dans le vide, sans savoir où ni sur
 * combien de parcelles. La planche demande une empreinte au moment de viser,
 * une étiquette hors de l'empreinte donnant **le compte réel de cellules et la
 * dépense**, et une visée refusée hachurée avec sa **raison chiffrée** — jamais
 * de grisé muet.
 *
 * L'empreinte montre l'état **après** le geste, pas une surbrillance : c'est le
 * motif de sous-bois traité (SB 1) qui la remplit, celui-là même que la carte
 * dessinera si le geste est exécuté. Aux bords de grille elle se tronque, et le
 * coût ne baisse pas.
 */

const BRAISE = 'oklch(0.55 0.16 44)';
const HACHURE = 'gestes-hachure';

export interface OptionsGestes {
  /** Gestes déjà désignés, en attente de l'été. */
  designes: ActionPonctuelle[];
  /** Geste armé et cellule visée, s'il y en a. */
  arme?: ActionPonctuelle['type'] | null;
  cible?: number | null;
  /** Budget restant après les décisions déjà prises : le refus est chiffré. */
  budget?: number;
  /** Diviseur d'échelle : le calque est du chrome, ses textes suivent. */
  echelle?: number;
}

const NOM: Record<ActionPonctuelle['type'], string> = {
  durcirHameau: 'Durcir un hameau',
  ouvrirCoupure: 'Ouvrir une coupure',
  debroussailler: 'Débroussailler',
};

/**
 * Cellules qu'un geste touche réellement, telles que le modèle les choisira.
 * Le compte affiché doit être celui-là, sans quoi l'étiquette ment.
 */
export function empriseDuGeste(etat: Etat, type: ActionPonctuelle['type'], cellule: number): number[] {
  const c = etat.grille[cellule];
  if (!c) return [];
  if (type === 'durcirHameau') {
    return c.type === 'bati' && !c.detruite && c.durcissement < 1 ? [cellule] : [];
  }
  if (type === 'debroussailler') {
    return c.type !== 'bati' && c.type !== 'rocher' ? [cellule] : [];
  }
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (x < 0 || y < 0 || x >= etat.largeur || y >= etat.hauteur) continue;
      const v = etat.grille[y * etat.largeur + x];
      if (v.type === 'bati' || v.type === 'rocher') continue;
      out.push(y * etat.largeur + x);
    }
  }
  return out;
}

/** Pourquoi une visée est refusée, en une phrase chiffrée. */
function refus(etat: Etat, type: ActionPonctuelle['type'], cellules: number[], budget: number): string | null {
  const cout = COUTS_PONCTUELS[type];
  if (budget < cout) return `budget ${Math.floor(budget)}, manque ${Math.ceil(cout - budget)}`;
  if (!cellules.length) {
    if (type === 'durcirHameau') return 'ici, aucune construction à équiper';
    if (type === 'debroussailler') return 'ici, rien à débroussailler';
    return 'ici, aucune parcelle à ouvrir';
  }
  return null;
}

const rect = (i: number, largeur: number, attrs: string) =>
  `<rect x="${(i % largeur) * S}" y="${Math.floor(i / largeur) * S}" width="${S}" height="${S}" ${attrs}/>`;

export function rendreCalqueGestes(etat: Etat, o: OptionsGestes): string {
  const k = o.echelle ?? 1;
  const morceaux: string[] = [];

  // Ce qui est déjà désigné : la parcelle porte sa marque jusqu'à l'été, sinon
  // le joueur ne sait plus où il a cliqué.
  for (const g of o.designes) {
    for (const i of empriseDuGeste(etat, g.type, g.cellule)) {
      morceaux.push(
        rect(i, etat.largeur, `fill="url(#m-sb1)" stroke="${BRAISE}" stroke-width="2" stroke-dasharray="7 5" vector-effect="non-scaling-stroke"`),
      );
    }
  }

  // La visée : l'empreinte de ce qui serait touché, et son prix.
  if (o.arme && o.cible != null) {
    const cellules = empriseDuGeste(etat, o.arme, o.cible);
    const pourquoi = refus(etat, o.arme, cellules, o.budget ?? Infinity);
    const cases = cellules.length ? cellules : [o.cible];
    for (const i of cases) {
      morceaux.push(
        rect(
          i,
          etat.largeur,
          pourquoi
            ? `fill="url(#${HACHURE})" stroke="${BRAISE}" stroke-width="2.5" vector-effect="non-scaling-stroke"`
            : `fill="url(#m-sb1)" stroke="${BRAISE}" stroke-width="2.5" vector-effect="non-scaling-stroke"`,
        ),
      );
    }
    // L'étiquette se pose **hors de l'empreinte**, au-dessus, pour ne pas
    // recouvrir ce qu'elle décrit.
    const x = ((o.cible % etat.largeur) + 0.5) * S;
    const y = Math.floor(o.cible / etat.largeur) * S - 14 * k;
    const texte = pourquoi
      ? `${NOM[o.arme]} : ${pourquoi}`
      : `${NOM[o.arme]} · ${cellules.length} parcelle${cellules.length > 1 ? 's' : ''} · ${COUTS_PONCTUELS[o.arme]}`;
    morceaux.push(
      `<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" fill="${BRAISE}" font-family="ui-sans-serif, system-ui, sans-serif" ` +
        `font-size="${13 * k}" text-anchor="middle" stroke="oklch(0.90 0.03 78)" stroke-width="${5 * k}" ` +
        `paint-order="stroke" stroke-linejoin="round">${texte}</text>`,
    );
  }

  if (!morceaux.length) return '';
  // La hachure braise, à son second emploi autorisé : le refus d'un geste.
  const motif =
    `<defs><pattern id="${HACHURE}" width="26" height="26" patternTransform="rotate(135)" patternUnits="userSpaceOnUse">` +
    `<line x1="0" y1="0" x2="0" y2="26" stroke="oklch(0.72 0.11 46)" stroke-width="4"/></pattern></defs>`;
  return motif + morceaux.join('');
}
