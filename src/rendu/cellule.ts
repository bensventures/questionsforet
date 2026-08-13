import type { Cellule, Meteo } from '../model/types';
import { humiditeLocale } from '../model/derive';
import {
  couleurSol,
  couleurVegetation,
  effectifTapis,
  estPeuplement,
  estTapis,
  glyphe,
  largeurGlyphe,
  motifSousBois,
  nombreInstances,
  palierDensite,
  palierHumidite,
  palierSousBois,
  ENCRE,
  FEU,
  type EtatFeu,
  type Palier,
} from './palette';

/**
 * Composition d'une cellule : `état → descriptions de couches`.
 *
 * Cette couche **ne rend pas de SVG final** : elle décrit ce qu'il y a à
 * dessiner, et `carte.ts` assemble. La raison est le § 5 de la carte de
 * référence, qui trie tous les glyphes de la carte par ordonnée de pied pour
 * la profondeur : un arbre planté bas doit passer devant celui d'à côté, y
 * compris par-dessus la limite de cellule. Une cellule qui rendrait son SVG
 * toute seule ne pourrait pas s'insérer dans ce tri.
 *
 * Une cellule est une parcelle : le regroupement d'affichage du § 5.1 du
 * premier handoff est abandonné, la grille du modèle étant déjà à la maille de
 * 50 m (voir la note de `carte.ts`).
 *
 * **Le débord est assumé** (§ 8.2). Un houppier semé haut dépasse le bord
 * supérieur de sa cellule et couvre une part du sol de sa voisine d'amont :
 * c'est ce qui donne au couvert son continu, et le tri global par pied le rend
 * cohérent. Ne pas écrêter les glyphes à la cellule.
 */

/** Côté d'une cellule dans le repère de la carte (§ 1 de la carte de référence). */
export const S = 180;

export interface Glyphe {
  href: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Teinte de la masse de feuillage, posée en `color` (§ 8.1). */
  couleur: string | null;
  /** Ordonnée de pied, clé du tri de profondeur. */
  pied: number;
}

export interface CelluleComposee {
  humidite: Palier;
  sousBois: 0 | 1 | 2 | 3 | 4;
  etatFeu: EtatFeu;
  /** Couche 1 : teinte du sol. */
  couleurSol: string;
  /** Couche 3 : identifiant du motif, ou `null`. */
  motif: string | null;
  /** Couche 4 : marques de gestion, en encre neutre. */
  gestion: string[];
  /** Couche 5 : glyphes, à trier avec ceux des autres cellules. */
  glyphes: Glyphe[];
}

/**
 * Générateur pseudo-aléatoire ensemencé par cellule (§ 3.5), consommé dans un
 * ordre fixe. À paramètres égaux, deux rendus successifs sont identiques : c'est
 * la condition anti-scintillement. Il ne passe surtout pas par le générateur du
 * modèle, dont l'état avance à chaque appel.
 */
function alea(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Âge du peuplement (tours) ramené aux trois tailles de glyphe (§ 8.2). */
export const palierAge = (age: number): 1 | 2 | 3 => (age < 20 ? 1 : age < 45 ? 2 : 3);

/**
 * État de feu, lu sur le modèle et non redéclaré. `regenDans > 0` signale un
 * peuplement détruit dont la parcelle attend sa régénération ;
 * `mortaliteDifferee > 0` un houppier roussi dont l'arbre est encore debout.
 */
export function etatFeuDe(c: Cellule): EtatFeu {
  if (c.regenDans > 0) return 'consomme';
  if (c.mortaliteDifferee > 0) return 'roussi';
  return 'sain';
}

const attrs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');

export interface OptionsComposition {
  /**
   * Étale aussi les couvertures basses sur la bande de semis, au lieu de les
   * aligner sur la ligne de pied.
   *
   * **Écart au handoff**, qui réserve le semis aux peuplements : garrigue,
   * friche, pelouse, rocher et ripisylve y gardent la ligne de pied au motif
   * que ce ne sont pas des peuplements à compter. L'argument se défend pour la
   * ripisylve, cordon rivulaire plutôt que population, moins pour une garrigue
   * qui couvre sa parcelle. À juger sur pièce, d'où l'option plutôt qu'un
   * changement d'office.
   *
   * La position change, et l'effectif avec elle pour les tapis : garrigue,
   * friche et pelouse passent de trois à six, faute de quoi la bande reste
   * nue là où la ligne était fournie. Rocher et ripisylve gardent leurs deux
   * instances. Le bâti est exclu dans tous les cas — une construction n'est
   * pas un semis.
   *
   * **Actif par défaut** depuis l'épreuve sur carte : mettre à `false` rend le
   * comportement du handoff, ce que fait la planche de comparaison.
   */
  semisNonForestier?: boolean;

  /**
   * Sur les couvertures sans arbres, porte la charge de sous-bois par le
   * **nombre de touffes** et retire le motif de sol correspondant.
   *
   * Justification : là où rien ne pousse au-dessus, le sous-bois *est* la
   * végétation. Le motif et les touffes décrivent alors la même strate, et la
   * dire deux fois la rend illisible — une garrigue dense se noie dans le semis
   * de points qui la recouvre. Le canal du nombre, lui, est libre : la densité
   * de tiges ne quitte jamais son premier palier sur ces parcelles, faute d'un
   * processus qui la fasse croître. On y transporte donc le sous-bois, sur la
   * même échelle à compter que les peuplements.
   *
   * **Le sward reste dessiné.** SB 1 n'est pas une charge mais une signature
   * d'entretien, pâturage ou débroussaillement, et sa régularité *est*
   * l'information (§ 7). Aucun effectif de touffes ne sait dire « tenu ras ».
   *
   * **Actif par défaut**, même remarque.
   */
  sousBoisAuGlyphe?: boolean;
}

export function composerCellule(
  c: Cellule,
  meteo: Meteo,
  options: OptionsComposition = {},
): CelluleComposee {
  const R = alea(c.y * 97 + c.x * 7919 + 13);
  const etatFeu = etatFeuDe(c);
  const humidite = palierHumidite(humiditeLocale(c, meteo));
  const age = palierAge(c.age);
  const densite = palierDensite(c.densite);

  // Le sol brûlé tient trois saisons avant de revenir à la litière (§ 4.4 du
  // premier handoff) ; toute cellule atteinte passe à SB 0, le sous-bois a brûlé.
  const brule = c.saisonsDepuisFeu < 3 || etatFeu !== 'sain';
  const sousBois = palierSousBois(c.sousBois, {
    paturage: c.paturage > 0,
    debroussaille: c.ouverture > 0 && c.sansEntretien === 0,
    brule,
  });

  const x = c.x * S;
  const y = c.y * S;

  // ---- couche 5 : semis de glyphes (§ 8.2, deux régimes) ------------------
  const glyphes: Glyphe[] = [];
  const href = glyphe(c.type, age, etatFeu);
  if (href) {
    const tapis = (options.sousBoisAuGlyphe ?? true) && estTapis(c.type);
    const etalee =
      ((options.semisNonForestier ?? true) || tapis) && !estPeuplement(c.type) && c.type !== 'bati';
    const n = tapis ? effectifTapis(sousBois) : nombreInstances(c.type, densite, etalee);
    const w = largeurGlyphe(c.type, age);
    const couleur = couleurVegetation(c.type, humidite);
    const peuplement = estPeuplement(c.type) || etalee;

    // Un peuplement se sème sur la bande basse de la cellule, par **grille
    // stratifiée avec gigue** : un tirage libre ferait des paquets et des
    // trous, là où la stratification garantit une couverture régulière que la
    // gigue suffit à dénaturaliser. Une couverture non forestière garde la
    // ligne de pied : ce n'est pas un peuplement.
    const ncol = peuplement ? Math.round(Math.sqrt(n * 1.6)) : n;
    const nrow = peuplement ? Math.ceil(n / ncol) : 1;
    const cw = S / ncol;
    const rh = (0.62 * S) / nrow;

    for (let i = 0; i < n; i++) {
      const col = i % ncol;
      const row = Math.floor(i / ncol);
      const px = peuplement
        ? x + (col + 0.5) * cw + (R() - 0.5) * cw * 0.6
        : x + (i + 0.5) * cw + (R() - 0.5) * cw * 0.3;
      const pied = peuplement
        ? y + 0.3 * S + (row + 0.5) * rh + (R() - 0.5) * rh * 0.55
        : y + S - 6 + (R() - 0.5) * 30 * 0.5;
      // Invariant de non-recouvrement : la largeur est bridée par le pas de la
      // sous-grille. Sans lui, le palier de couvert fermé devient une masse.
      const ww = (peuplement ? Math.min(w * 0.7, cw * 1.7) : Math.min(w, cw * 1.35)) * (0.94 + R() * 0.12);
      const hh = ww * 1.5;
      glyphes.push({
        href,
        x: Math.round(px - ww / 2),
        y: Math.round(pied - hh),
        w: Math.round(ww),
        h: Math.round(hh),
        couleur,
        pied,
      });
    }
  }

  // Le mouton dit qui assure l'entretien : le sward au sol dit qu'il a lieu,
  // le troupeau dit que c'est continu et non ponctuel (§ 8.2).
  if (c.paturage > 0 && sousBois === 1 && c.type !== 'bati' && c.type !== 'ripisylve' && R() < 0.6) {
    glyphes.push({ href: 'm-mouton', x: x + 96, y: y + 128, w: 54, h: 34, couleur: null, pied: y + 162 });
  }

  return {
    humidite,
    sousBois,
    etatFeu,
    couleurSol: couleurSol(humidite, brule),
    // Sur un tapis, le motif cède la place aux touffes, sauf le sward.
    motif:
      (options.sousBoisAuGlyphe ?? true) && estTapis(c.type) && sousBois >= 2
        ? null
        : motifSousBois(sousBois, c.type),
    gestion: marquesDeGestion(c, x, y),
    glyphes,
  };
}

/**
 * § 9, marques de gestion. Encre neutre : ce que fait le joueur ne doit jamais
 * emprunter la teinte de ce que fait le feu. Le brûlage dirigé est la seule
 * exception assumée, bornée par une géométrie rectiligne qui dit que c'est voulu.
 *
 * La coupure de combustible du handoff n'est pas reprise : elle y est une bande
 * posée à un endroit choisi de la planche, alors que le modèle ne porte pas
 * d'état de coupure persistant sur ses cellules. La poser ici reviendrait à
 * dessiner un aménagement que la simulation ignore.
 */
function marquesDeGestion(c: Cellule, x: number, y: number): string[] {
  const out: string[] = [];

  if (c.ouverture > 0 && c.ouverture < 8) {
    out.push(
      `<path ${attrs({ d: `M${x} ${y + 168}H${x + S}`, stroke: ENCRE.gestion, 'stroke-width': 2.2, 'stroke-dasharray': '14 9', fill: 'none', opacity: 0.9 })}/>`,
    );
    let d = '';
    for (let i = 0; i < 5; i++) {
      const px = x + 22 + i * 34;
      d += `M${px} ${y + 156}L${px + 11} ${y + 144}`;
    }
    out.push(`<path ${attrs({ d, stroke: ENCRE.gestion, 'stroke-width': 2.4, fill: 'none', opacity: 0.9 })}/>`);
  }

  if (c.effetBrulage > 0) {
    out.push(
      `<path ${attrs({ d: `M${x + 14} ${y + 106}h${S - 28}v58h-${S - 28}Z`, fill: FEU.actif, stroke: 'oklch(0.55 0.13 50)', 'stroke-width': 2.4, 'stroke-dasharray': '9 7', opacity: 0.34 })}/>`,
    );
    let d = '';
    for (let i = 0; i < 6; i++) {
      const px = x + 26 + i * 26;
      d += `M${px} ${y + 162}L${px + 9} ${y + 138}`;
    }
    out.push(`<path ${attrs({ d, stroke: 'oklch(0.62 0.16 50)', 'stroke-width': 2.8, fill: 'none', opacity: 0.95 })}/>`);
  }

  // Souches annelées là où des tiges ont été retirées, douze saisons durant.
  if (c.gestion < 12 && c.densite > 0 && c.type !== 'bati' && c.type !== 'rocher') {
    let d = '';
    for (const [a, b] of [[52, 128], [104, 148], [138, 112]] as const) {
      d += `M${x + a + 9} ${y + b}a9 9 0 1 1 -18 0a9 9 0 1 1 18 0`;
      d += `M${x + a + 3} ${y + b}a3 3 0 1 1 -6 0a3 3 0 1 1 6 0`;
    }
    out.push(`<path ${attrs({ d, stroke: ENCRE.gestion, 'stroke-width': 2.4, fill: 'none', opacity: 0.95 })}/>`);
  }

  return out;
}
