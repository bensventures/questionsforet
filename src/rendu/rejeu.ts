import type { Braise } from '../model/feu';
import { S } from './cellule';
import { FEU } from './palette';

/**
 * Rejeu de la propagation (planche 6) : **la seule animation admise** de toute
 * la couche décision, et le seul lien du compte rendu.
 *
 * Il rejoue l'incendie **tel qu'il a eu lieu**, à partir de la chronologie que
 * le noyau livre : `arrivee` donne le pas de temps où chaque parcelle a pris
 * feu, `braises` l'instant où chaque brandon s'est posé. Rien n'est fabriqué,
 * et c'est tout l'intérêt : une propagation plausible mais inventée dirait le
 * contraire de ce que la partie a produit, et le joueur y chercherait des
 * causes qui n'existent pas.
 *
 * **Tout est en CSS.** Les parcelles sont groupées par pas d'arrivée et le
 * groupe porte le délai ; le navigateur anime, aucun script ne pilote d'image
 * par image. Le noyau calcule, le rendu compose, personne n'anime à la main.
 */

/** Durée totale du rejeu. Assez pour lire l'ordre, assez court pour être rejoué. */
export const DUREE_REJEU = 4200;
/** Ce que dure l'embrasement d'une parcelle, puis sa retombée. */
const DUREE_PARCELLE = 1100;
/** Vol d'un brandon, du départ à la pose. */
const DUREE_BRAISE = 700;

/**
 * Couche de rejeu, à insérer au-dessus de la carte. Elle ne remplace rien :
 * le paysage d'après-feu reste dessous, et c'est sur lui que la trace s'allume
 * puis s'efface.
 */
export function rendreRejeu(arrivee: Uint16Array, braises: Braise[], largeur: number): string {
  let dernier = 0;
  for (const a of arrivee) if (a > dernier) dernier = a;
  for (const b of braises) if (b.t > dernier) dernier = b.t;
  if (!dernier) return '';

  // Le pas de temps du modèle n'a pas de durée propre : on étale l'incendie sur
  // la fenêtre du rejeu, ce qui garde l'ordre et les écarts sans prétendre à
  // une vitesse réelle.
  const quand = (pas: number) => ((pas / dernier) * (DUREE_REJEU - DUREE_PARCELLE)).toFixed(0);

  // **Un groupe par pas de temps**, et non un délai par parcelle : la trace
  // d'un grand feu compte sept cents parcelles et six cents brandons, soit
  // autant d'attributs de style répétés. Le délai se pose une fois sur le
  // groupe, les enfants en héritent, et la couche perd les trois quarts de son
  // poids sans rien changer à ce qu'on voit.
  const parPas = new Map<number, string[]>();
  const ajouter = (pas: number, forme: string) => {
    const l = parPas.get(pas);
    if (l) l.push(forme);
    else parPas.set(pas, [forme]);
  };

  for (let i = 0; i < arrivee.length; i++) {
    const pas = arrivee[i];
    if (!pas) continue;
    const x = (i % largeur) * S;
    const y = Math.floor(i / largeur) * S;
    ajouter(pas, `<rect x="${x}" y="${y}" width="${S}" height="${S}"/>`);
  }

  const volsParPas = new Map<number, string[]>();
  for (const b of braises) {
    const x0 = (b.x0 + 0.5) * S;
    const y0 = (b.y0 + 0.5) * S;
    const x1 = (b.x1 + 0.5) * S;
    const y1 = (b.y1 + 0.5) * S;
    // Une courbe, pas un segment : un brandon monte avant de retomber.
    const cx = (x0 + x1) / 2;
    const cy = Math.min(y0, y1) - Math.hypot(x1 - x0, y1 - y0) * 0.28;
    const d = `M${x0.toFixed(0)} ${y0.toFixed(0)}Q${cx.toFixed(0)} ${cy.toFixed(0)} ${x1.toFixed(0)} ${y1.toFixed(0)}`;
    const pas = Math.max(1, b.t - 3);
    const l = volsParPas.get(pas);
    if (l) l.push(`<path d="${d}" pathLength="100"/>`);
    else volsParPas.set(pas, [`<path d="${d}" pathLength="100"/>`]);
  }

  const groupes = (m: Map<number, string[]>) =>
    [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pas, formes]) => `<g style="animation-delay:${quand(pas)}ms">${formes.join('')}</g>`)
      .join('');

  return (
    `<g class="rejeu" pointer-events="none" fill="${FEU.actif}" stroke="${FEU.actif}">` +
    `<g class="rejeu__parcelles">${groupes(parPas)}</g>` +
    `<g class="rejeu__braises">${groupes(volsParPas)}</g>` +
    `</g>`
  );
}

/**
 * Feuille du rejeu. Sous `prefers-reduced-motion`, rien ne bouge : la trace
 * s'affiche d'un coup et s'efface, ce qui montre l'étendue parcourue sans
 * imposer le mouvement. C'est la règle du site, et elle vaut aussi pour la
 * seule animation qu'on s'autorise.
 */
export const STYLES_REJEU = `
.rejeu__parcelles > g, .rejeu__braises > g { opacity: 0; }
.rejeu path { fill: none; stroke-width: 4; stroke-linecap: round; opacity: 0.6; }
@media (prefers-reduced-motion: no-preference) {
  .rejeu__parcelles > g { animation: rejeu-parcelle ${DUREE_PARCELLE}ms ease-out both; }
  .rejeu__braises > g { animation: rejeu-braise ${DUREE_BRAISE}ms linear both; }
  /* Le délai est posé sur le groupe ; le tracé du brandon en hérite pour
     partir au même instant que sa lueur. */
  .rejeu__braises path {
    stroke-dasharray: 100;
    animation: rejeu-vol ${DUREE_BRAISE}ms linear both;
    animation-delay: inherit;
  }
}
@media (prefers-reduced-motion: reduce) {
  .rejeu__parcelles > g { opacity: 0.5; }
}
@keyframes rejeu-parcelle {
  0% { opacity: 0 }
  12% { opacity: 0.85 }
  100% { opacity: 0 }
}
@keyframes rejeu-braise {
  0% { opacity: 0.9 }
  70% { opacity: 0.9 }
  100% { opacity: 0 }
}
@keyframes rejeu-vol {
  0% { stroke-dashoffset: 100 }
  70%, 100% { stroke-dashoffset: 0 }
}
`;
