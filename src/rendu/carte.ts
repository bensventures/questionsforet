import type { Cellule, Etat } from '../model/types';
import { NATURE_SECTEUR } from '../model/secteurs';
import { composerCellule, etatFeuDe, palierAge, S, type CelluleComposee, type Glyphe } from './cellule';
import { ENCRE, FEU, palierDensite } from './palette';

/**
 * Assemblage de la carte, d'après la carte de référence
 * (`research/simulation/v3/design_handoff_carte_de_reference_v2/`), qui en est la
 * cible d'implémentation et le test d'acceptation visuel.
 *
 * **Ce que le handoff suppose et que nous n'avons pas.** Sa carte fabrique son
 * relief par une formule analytique en mètres, et en déduit humidité, pente,
 * essences et zone brûlée. Ici tout cela vient de la simulation : on ne garde
 * donc de sa section 3 (attribution des paramètres) rien du tout, et de sa
 * section 2 (champ d'altitude) seulement le principe — un champ continu,
 * échantillonné, dont dérivent les courbes. Les sections 4 à 11, elles,
 * décrivent le rendu et sont suivies à la valeur près.
 *
 * **La pente n'a plus de signe graphique** depuis la v2 : elle reste dans le
 * modèle, où elle gouverne la propagation et l'apparition du rocher, mais la
 * raideur se lit au serrage des courbes, et le sens de la descente au talweg
 * bleu et à la crête barbulée, tous deux nommés. Ne pas réintroduire les
 * hachures sans reprendre la comparaison : elles forment une troisième famille
 * de traits courts, en concurrence avec les courbes qu'elles appuyaient.
 *
 * **Une cellule est une parcelle.** Le regroupement d'affichage du premier
 * handoff est abandonné : la grille du modèle est déjà à la maille de 50 m, et
 * prendre la valeur dominante d'un groupe effacerait `distanceBati`, le
 * durcissement et la conformité de chaque construction.
 */

/**
 * Relief en mètres. Le modèle ne connaît qu'une altitude normalisée 0–1 ; les
 * courbes de niveau, elles, n'ont de sens qu'en mètres. On pose donc une
 * amplitude de relief.
 *
 * En v2, c'est **le serrage des courbes** qui porte la raideur, les hachures de
 * versant ayant été retirées : l'amplitude décide donc de la lisibilité de la
 * pente, et plus seulement du nombre de courbes. À 240 m sur ce terrain, une
 * équidistance de 20 m espace les courbes d'environ 90 m au sol sur une pente
 * médiane (12°), 47 m à 23° et 35 m à 30° : de deux cellules à moins d'une, un
 * rapport qui se voit. Une amplitude plus faible aplatirait ce contraste,
 * une plus forte saturerait les versants raides de courbes confondues.
 */
const ALTITUDE = { plancher: 400, amplitude: 240 };
/** § 6.1 : équidistance 20 m, maîtresse tous les 100 m. */
const PAS_COURBE = 20;
/** Pas d'échantillonnage du champ pour le marching squares (§ 6.1). */
const PAS_ECHANTILLON = 20;

export interface Fenetre {
  x0: number;
  y0: number;
  largeur: number;
  hauteur: number;
}

export interface OptionsCarte {
  fenetre?: Fenetre;
  /** Étale les couvertures basses au lieu de les aligner. Vrai par défaut. */
  semisNonForestier?: boolean;
  /** Porte le sous-bois des tapis par le nombre de touffes. Vrai par défaut. */
  sousBoisAuGlyphe?: boolean;
  /** Courbes, talweg, crête. Pas de hachures : retirées en v2 (§ 6.4). */
  relief?: boolean;
  /** Grille pointillée et limites de parcelles (§ 4). Structure, pas paysage. */
  structure?: boolean;
  /** Étiquettes des cotes et des deux lignes nommées. */
  etiquettes?: boolean;
  /** Calque secteur (planche 4). Absent : pas de calque. */
  secteurs?: OptionsSecteurs;
}

const attrs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');

const dansFenetre = (c: { x: number; y: number }, f: Fenetre) =>
  c.x >= f.x0 && c.x < f.x0 + f.largeur && c.y >= f.y0 && c.y < f.y0 + f.hauteur;

/**
 * Champ d'altitude continu, interpolé bilinéairement entre les centres de
 * cellules. Le modèle ne donne qu'une valeur par cellule : sans interpolation,
 * les isolignes suivraient la maille en escalier au lieu de la traverser, ce qui
 * est précisément le premier critère d'acceptation du § 13.
 */
function champ(etat: Etat) {
  const { largeur, hauteur, grille } = etat;
  const brut = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(largeur - 1, x));
    const cy = Math.max(0, Math.min(hauteur - 1, y));
    return ALTITUDE.plancher + grille[cy * largeur + cx].altitude * ALTITUDE.amplitude;
  };
  /** Altitude en mètres en un point quelconque du repère de la carte. */
  const z = (X: number, Y: number) => {
    const fx = X / S - 0.5;
    const fy = Y / S - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = brut(x0, y0);
    const b = brut(x0 + 1, y0);
    const c = brut(x0, y0 + 1);
    const d = brut(x0 + 1, y0 + 1);
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  };
  /** Gradient en mètres par unité de carte, par différences centrées (§ 2). */
  const gradient = (X: number, Y: number): [number, number] => {
    const h = 6;
    return [(z(X + h, Y) - z(X - h, Y)) / (2 * h), (z(X, Y + h) - z(X, Y - h)) / (2 * h)];
  };
  return { z, gradient };
}

/**
 * § 6.1, courbes de niveau par marching squares sur une grille d'échantillonnage
 * régulière. Toute autre méthode produit des courbes qui se croisent ou flottent.
 *
 * Règle de dégagement : sur une cellule de sous-bois dense (SB ≥ 3), les niveaux
 * *intermédiaires* sont supprimés, les maîtresses subsistent. Le sous-bois
 * sature dans ce modèle, si bien que les courbes fines n'apparaissent guère
 * qu'aux endroits ouverts : c'est le comportement voulu par le handoff, et non
 * un accident, mais il rend les maîtresses d'autant plus importantes.
 */
function courbesDeNiveau(
  etat: Etat,
  f: Fenetre,
  composees: Map<number, CelluleComposee>,
  z: (x: number, y: number) => number,
): { traces: string; cotes: Array<{ x: number; y: number; texte: string }> } {
  const X0 = f.x0 * S;
  const Y0 = f.y0 * S;
  const X1 = (f.x0 + f.largeur) * S;
  const Y1 = (f.y0 + f.hauteur) * S;
  const nx = Math.ceil((X1 - X0) / PAS_ECHANTILLON);
  const ny = Math.ceil((Y1 - Y0) / PAS_ECHANTILLON);

  const ech: number[][] = [];
  for (let j = 0; j <= ny; j++) {
    const ligne: number[] = [];
    for (let i = 0; i <= nx; i++) ligne.push(z(X0 + i * PAS_ECHANTILLON, Y0 + j * PAS_ECHANTILLON));
    ech.push(ligne);
  }

  const dense = (X: number, Y: number) => {
    const cx = Math.floor(X / S);
    const cy = Math.floor(Y / S);
    const comp = composees.get(cy * etat.largeur + cx);
    return !!comp && comp.sousBois >= 3;
  };

  let min = Infinity;
  let max = -Infinity;
  for (const l of ech) for (const v of l) { if (v < min) min = v; if (v > max) max = v; }

  const fines: string[] = [];
  const maitresses: string[] = [];
  const cotes: Array<{ x: number; y: number; texte: string }> = [];
  const ip = (a: number, b: number, L: number) => (L - a) / (b - a);

  const premier = Math.ceil(min / PAS_COURBE) * PAS_COURBE;
  for (let L = premier; L <= max; L += PAS_COURBE) {
    const maitresse = L % 100 === 0;
    let d = '';
    let cotePosee = false;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x0 = X0 + i * PAS_ECHANTILLON;
        const y0 = Y0 + j * PAS_ECHANTILLON;
        const x1 = x0 + PAS_ECHANTILLON;
        const y1 = y0 + PAS_ECHANTILLON;
        if (!maitresse && dense((x0 + x1) / 2, (y0 + y1) / 2)) continue;
        const a = ech[j][i];
        const b = ech[j][i + 1];
        const c = ech[j + 1][i + 1];
        const e = ech[j + 1][i];
        const pts: Array<[number, number]> = [];
        if (a < L !== b < L) pts.push([x0 + PAS_ECHANTILLON * ip(a, b, L), y0]);
        if (b < L !== c < L) pts.push([x1, y0 + PAS_ECHANTILLON * ip(b, c, L)]);
        if (e < L !== c < L) pts.push([x0 + PAS_ECHANTILLON * ip(e, c, L), y1]);
        if (a < L !== e < L) pts.push([x0, y0 + PAS_ECHANTILLON * ip(a, e, L)]);
        if (pts.length === 2) {
          d += `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}L${pts[1][0].toFixed(1)} ${pts[1][1].toFixed(1)}`;
          if (maitresse && !cotePosee && i > 2 && i < nx - 2) {
            cotes.push({ x: pts[0][0], y: pts[0][1], texte: `${L}` });
            cotePosee = true;
          }
        } else if (pts.length === 4) {
          d += `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}L${pts[1][0].toFixed(1)} ${pts[1][1].toFixed(1)}`;
          d += `M${pts[2][0].toFixed(1)} ${pts[2][1].toFixed(1)}L${pts[3][0].toFixed(1)} ${pts[3][1].toFixed(1)}`;
        }
      }
    }
    if (!d) continue;
    (maitresse ? maitresses : fines).push(d);
  }

  return {
    traces:
      (fines.length
        ? `<path ${attrs({ d: fines.join(''), stroke: ENCRE.courbe, 'stroke-width': 1.1, fill: 'none', opacity: 0.6 })}/>`
        : '') +
      (maitresses.length
        ? `<path ${attrs({ d: maitresses.join(''), stroke: ENCRE.maitresse, 'stroke-width': 2.6, fill: 'none', opacity: 0.95 })}/>`
        : ''),
    cotes,
  };
}

/**
 * § 6.2, talweg. La carte de référence suit un axe analytique ; ici on suit le
 * point le plus bas de chaque colonne, c'est-à-dire la ligne d'écoulement réelle
 * du relief engendré, celle-là même que `terrain.ts` fait emprunter à la route
 * de fond de vallée. Le trait s'interrompt là où le creux cesse d'en être un,
 * faute de quoi on dessinerait un cours d'eau en travers d'un versant.
 */
function talweg(etat: Etat): { trace: string; milieu: [number, number] | null } {
  const { largeur, hauteur, grille } = etat;
  const triees = grille.map((c) => c.altitude).sort((a, b) => a - b);
  const seuil = triees[Math.floor(triees.length * 0.25)];

  const morceaux: string[] = [];
  let courant: Array<[number, number]> = [];
  let plusLong: Array<[number, number]> = [];
  const fermer = () => {
    if (courant.length > 1) {
      morceaux.push(courant.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(0)} ${p[1].toFixed(0)}`).join(''));
      if (courant.length > plusLong.length) plusLong = courant;
    }
    courant = [];
  };
  for (let x = 0; x < largeur; x++) {
    let basse = Infinity;
    let yBas = -1;
    for (let y = 0; y < hauteur; y++) {
      const a = grille[y * largeur + x].altitude;
      if (a < basse) { basse = a; yBas = y; }
    }
    if (yBas < 0 || basse > seuil) { fermer(); continue; }
    courant.push([(x + 0.5) * S, (yBas + 0.5) * S]);
  }
  fermer();
  if (!morceaux.length) return { trace: '', milieu: null };
  return {
    trace: `<path ${attrs({ d: morceaux.join(''), stroke: ENCRE.talweg, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' })}/>`,
    milieu: plusLong.length ? plusLong[Math.floor(plusLong.length / 2)] : null,
  };
}

/**
 * § 6.3, crête. On cherche le maximum d'altitude par colonne et on **coupe** le
 * tracé dès que le sommet s'affaisse ou saute : une crête discontinue est
 * correcte, une crête forcée est fausse. Les barbules, une sur deux, sont
 * tournées vers le haut du relief.
 */
function crete(etat: Etat): { trace: string; milieu: [number, number] | null } {
  const { largeur, hauteur, grille } = etat;
  const triees = grille.map((c) => c.altitude).sort((a, b) => a - b);
  const seuilHaut = triees[Math.floor(triees.length * 0.75)];

  const points: Array<[number, number, number]> = [];
  for (let x = 0; x < largeur; x++) {
    let haute = -Infinity;
    let yHaut = -1;
    for (let y = 0; y < hauteur; y++) {
      const a = grille[y * largeur + x].altitude;
      if (a > haute) { haute = a; yHaut = y; }
    }
    points.push([(x + 0.5) * S, (yHaut + 0.5) * S, haute]);
  }

  const traces: string[] = [];
  let segment: Array<[number, number, number]> = [];
  let plusLong: Array<[number, number, number]> = [];
  const fermer = () => {
    if (segment.length > 2) {
      traces.push(
        `<path ${attrs({ d: segment.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(0)} ${p[1].toFixed(0)}`).join(''), stroke: ENCRE.crete, 'stroke-width': 3.2, 'stroke-dasharray': '13 7', fill: 'none' })}/>`,
      );
      let barbules = '';
      for (let i = 1; i < segment.length - 1; i += 2) {
        barbules += `M${segment[i][0].toFixed(0)} ${(segment[i][1] - 3).toFixed(0)}L${segment[i][0].toFixed(0)} ${(segment[i][1] - 21).toFixed(0)}`;
      }
      if (barbules) traces.push(`<path ${attrs({ d: barbules, stroke: ENCRE.crete, 'stroke-width': 2.6, fill: 'none' })}/>`);
      if (segment.length > plusLong.length) plusLong = segment;
    }
    segment = [];
  };
  for (const p of points) {
    const precedent = segment[segment.length - 1];
    if (p[2] < seuilHaut || (precedent && Math.abs(p[1] - precedent[1]) > 1.6 * S)) fermer();
    else segment.push(p);
  }
  fermer();
  return {
    trace: traces.join(''),
    milieu: plusLong.length ? [plusLong[Math.floor(plusLong.length / 2)][0], plusLong[Math.floor(plusLong.length / 2)][1]] : null,
  };
}

/**
 * § 4, parcelles par remplissage par diffusion sur la signature de cellule. Les
 * limites de parcelles sont les arêtes entre composantes différentes : elles
 * disent au joueur ce qui forme un ensemble homogène, là où la grille dit
 * seulement la maille de simulation.
 */
function structure(etat: Etat, f: Fenetre, composees: Map<number, CelluleComposee>): string {
  const { largeur } = etat;
  const cellules = etat.grille.filter((c) => dansFenetre(c, f));
  const signature = (c: Cellule) => {
    const comp = composees.get(c.y * largeur + c.x)!;
    return `${c.type}|${comp.humidite}|${palierDensite(c.densite)}|${comp.sousBois}|${comp.etatFeu}`;
  };
  const parcelle = new Map<number, number>();
  let pid = 0;
  const index = (c: { x: number; y: number }) => c.y * largeur + c.x;
  const dedans = new Set(cellules.map(index));
  const grilleParIndex = new Map(cellules.map((c) => [index(c), c]));

  for (const depart of cellules) {
    if (parcelle.has(index(depart))) continue;
    const sig = signature(depart);
    const pile = [depart];
    parcelle.set(index(depart), pid);
    while (pile.length) {
      const q = pile.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const j = (q.y + dy) * largeur + (q.x + dx);
        if (!dedans.has(j) || parcelle.has(j)) continue;
        const voisin = grilleParIndex.get(j)!;
        if (signature(voisin) !== sig) continue;
        parcelle.set(j, pid);
        pile.push(voisin);
      }
    }
    pid++;
  }

  let grille = '';
  for (let c = f.x0 + 1; c < f.x0 + f.largeur; c++) grille += `M${c * S} ${f.y0 * S}L${c * S} ${(f.y0 + f.hauteur) * S}`;
  for (let r = f.y0 + 1; r < f.y0 + f.hauteur; r++) grille += `M${f.x0 * S} ${r * S}L${(f.x0 + f.largeur) * S} ${r * S}`;

  let limites = '';
  for (const c of cellules) {
    const moi = parcelle.get(index(c));
    const droite = parcelle.get(index({ x: c.x + 1, y: c.y }));
    const bas = parcelle.get(index({ x: c.x, y: c.y + 1 }));
    if (droite !== moi) limites += `M${(c.x + 1) * S} ${c.y * S}L${(c.x + 1) * S} ${(c.y + 1) * S}`;
    if (bas !== moi) limites += `M${c.x * S} ${(c.y + 1) * S}L${(c.x + 1) * S} ${(c.y + 1) * S}`;
  }

  return (
    `<path ${attrs({ d: grille, stroke: ENCRE.grille, 'stroke-width': 1, 'stroke-dasharray': '3 7', fill: 'none', opacity: 0.42 })}/>` +
    `<path ${attrs({ d: limites, stroke: ENCRE.parcelle, 'stroke-width': 2.4, fill: 'none', opacity: 0.8 })}/>` +
    `<path ${attrs({ d: `M${f.x0 * S} ${f.y0 * S}H${(f.x0 + f.largeur) * S}V${(f.y0 + f.hauteur) * S}H${f.x0 * S}Z`, stroke: ENCRE.cadre, 'stroke-width': 3, fill: 'none' })}/>`
  );
}

/**
 * § 10, front de feu : le bord **amont** de la zone parcourue cette saison. Une
 * langue dentelée par cellule de front, tournée vers l'amont.
 *
 * La carte de référence prend « amont » au sens du nord de sa planche, son
 * relief descendant vers le sud. Ici le versant peut regarder n'importe où : on
 * prend donc l'amont réel, la direction du gradient, et l'on fait pivoter la
 * langue en conséquence. C'est la même leçon — **le feu monte** — appliquée à un
 * terrain qui n'a pas d'orientation privilégiée.
 */
function front(etat: Etat, f: Fenetre, gradient: (x: number, y: number) => [number, number]): string {
  const { largeur, hauteur, grille } = etat;
  const brulee = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < largeur && y < hauteur && grille[y * largeur + x].saisonsDepuisFeu === 0;

  const langues: string[] = [];
  const flammeches: string[] = [];
  for (const c of grille) {
    if (!dansFenetre(c, f) || c.saisonsDepuisFeu !== 0) continue;
    const x = c.x * S;
    const y = c.y * S;
    const [gx, gy] = gradient(x + S / 2, y + S / 2);
    const n = Math.hypot(gx, gy);
    if (!n) continue;
    // Voisine située vers l'amont : si elle a brûlé, cette cellule n'est pas au front.
    const ax = Math.abs(gx) > Math.abs(gy) ? Math.sign(gx) : 0;
    const ay = ax === 0 ? Math.sign(gy) : 0;
    if (brulee(c.x + ax, c.y + ay)) continue;

    let d = `M${x} ${y + 74}`;
    for (let i = 0; i <= 6; i++) d += `L${(x + (i * S) / 6).toFixed(0)} ${y + (i % 2 ? 32 : 56)}`;
    d += `L${x + S} ${y + 74}Z`;
    let fl = '';
    for (let i = 1; i < 6; i += 2) {
      const px = x + (i * S) / 6;
      fl += `M${px.toFixed(0)} ${y + 30}L${(px + 8).toFixed(0)} ${y + 6}`;
    }
    // Rotation de la langue vers l'amont réel : 0° = vers le haut de l'écran.
    const angle = (Math.atan2(gy, gx) * 180) / Math.PI + 90;
    const pivot = `rotate(${angle.toFixed(1)} ${x + S / 2} ${y + S / 2})`;
    langues.push(`<path ${attrs({ d, fill: FEU.actif, transform: pivot })}/>`);
    if (fl) flammeches.push(`<path ${attrs({ d: fl, stroke: FEU.actif, 'stroke-width': 6, fill: 'none', opacity: 0.7, transform: pivot })}/>`);
  }
  return langues.join('') + flammeches.join('');
}

/* ==========================================================================
 * Calque secteur (langage de décision, planche 4)
 *
 * Le secteur est l'unité de décision et n'avait aucune existence graphique.
 * La contrainte dominante de ce lot : le calque **ajoute des traits, il ne
 * pose aucun aplat**, même à 8 %. Le grain de sous-bois et les paliers de
 * densité sont ce qui justifie la décision ; les recouvrir reviendrait à
 * masquer la raison pour cacher le choix.
 * ========================================================================== */

export type EtatSecteur = 'aucun' | 'activable' | 'montee' | 'vigueur' | 'peril';

/** Ce que l'interface sait d'un secteur et que le modèle ne dit pas seul. */
export interface DonneesSecteur {
  id: number;
  /** Un secteur portant plusieurs politiques affiche **la moins avancée** :
   *  le calque sert à repérer ce qui n'est pas encore acquis. */
  etat: EtatSecteur;
  /** Crans d'adoption, seule valeur chiffrée du calque avec l'écart au
   *  plancher. Affichés uniquement en montée en charge. */
  crans?: { pleins: number; total: number };
  /** Écart au plancher, écrit en clair pour un secteur en péril budgétaire. */
  ecartPlancher?: string;
  /** Ce que le secteur porte, en français : « 2 politiques », « 9 constr. ». */
  porte?: string;
}

export interface OptionsSecteurs {
  /** Par identifiant de secteur. Absent = aucun liseré. */
  donnees?: DonneesSecteur[];
  survole?: number | null;
  selectionne?: number | null;
  /** Noms et sous-lignes. Vrai par défaut. */
  etiquettes?: boolean;
  /**
   * Diviseur d'échelle d'affichage (1 = natif, 3 = un tiers). Le calque est du
   * **chrome, pas du paysage** : ses traits gardent leur épaisseur à l'écran
   * par `vector-effect`, mais sa géométrie — équerres, retrait du liseré, cerne
   * du bâti — est en unités de carte et fondait avec la réduction. À 1:3, une
   * équerre de 20 unités mesurait 7 px : la sélection était invisible.
   */
  echelle?: number;
}

/**
 * Traits du calque. La limite est **plus épaisse que les courbes de niveau et
 * plus fine que le contour du bâti** : la hiérarchie d'épaisseur suffit à
 * séparer les trois familles, sans troisième couleur.
 */
const SECTEUR = {
  /** Limite au repos : un trait clair, qui se lit comme une coupure du
   *  paysage sans y ajouter d'encre. */
  limite: 'oklch(0.97 0.01 90)',
  trait: 2.5,
  traitSurvol: 4,
  /** Voile posé sur les secteurs **qu'on ne regarde pas** pendant une
   *  sélection. Voir `rendreCalqueSecteurs` pour l'écart assumé à la règle. */
  voile: 'oklch(0.26 0.03 62)',
  opaciteVoile: 0.25,
  braise: 'oklch(0.55 0.16 44)',
  vertPin: 'oklch(0.44 0.07 150)',
  vertClair: 'oklch(0.62 0.06 148)',
} as const;

/**
 * Emprise dessinée de la maison dans le gabarit 64 × 96 des glyphes de bâti,
 * en fractions. Les quatre états la partagent, ruine comprise : le cerne du
 * bâti orphelin se pose donc sur la construction et non sur la boîte du
 * glyphe, qui est presque aussi haute que la cellule.
 */
const EMPRISE_MAISON = { x: 14 / 64, y: 46 / 96, w: 36 / 64, h: 44 / 96 };

interface Pt {
  x: number;
  y: number;
}

/**
 * Contour rectilinéaire d'un ensemble de cellules, en unités de carte.
 *
 * Chaque côté de cellule dont la voisine est dehors devient une arête
 * **orientée**, l'intérieur toujours à droite. Les arêtes se chaînent ensuite
 * en boucles ; l'orientation constante donne gratuitement le bon sens pour les
 * trous, et surtout la normale intérieure de chaque arête, dont le liseré en
 * retrait a besoin.
 */
function contoursSecteur(cellules: number[], largeur: number): Pt[][] {
  const dedans = new Set(cellules);
  const clef = (p: Pt) => `${p.x},${p.y}`;
  const arcs = new Map<string, { a: Pt; b: Pt }[]>();
  const pousser = (a: Pt, b: Pt) => {
    const l = arcs.get(clef(a));
    if (l) l.push({ a, b });
    else arcs.set(clef(a), [{ a, b }]);
  };

  for (const i of cellules) {
    const x = i % largeur;
    const y = Math.floor(i / largeur);
    // Sens horaire dans le repère écran : l'intérieur reste à droite.
    if (!dedans.has(i - largeur) || y === 0) pousser({ x, y }, { x: x + 1, y });
    if (!dedans.has(i + 1) || x === largeur - 1) pousser({ x: x + 1, y }, { x: x + 1, y: y + 1 });
    if (!dedans.has(i + largeur)) pousser({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
    if (!dedans.has(i - 1) || x === 0) pousser({ x, y: y + 1 }, { x, y });
  }

  const boucles: Pt[][] = [];
  let restant = [...arcs.values()].reduce((n, l) => n + l.length, 0);
  const retirer = (arc: { a: Pt; b: Pt }) => {
    const l = arcs.get(clef(arc.a))!;
    l.splice(l.indexOf(arc), 1);
    if (!l.length) arcs.delete(clef(arc.a));
    restant--;
  };

  while (restant > 0) {
    const depart = arcs.values().next().value![0];
    let arc = depart;
    const pts: Pt[] = [arc.a];
    for (;;) {
      retirer(arc);
      pts.push(arc.b);
      const suivants = arcs.get(clef(arc.b));
      if (!suivants || !suivants.length) break;
      // Aux pincements en diagonale, plusieurs arêtes partent du même point :
      // on tourne d'abord à droite, ce qui longe l'intérieur au plus près et
      // sépare deux blocs qui ne se touchent que par un coin.
      const d = { x: arc.b.x - arc.a.x, y: arc.b.y - arc.a.y };
      const score = (s: { a: Pt; b: Pt }) => {
        const e = { x: s.b.x - s.a.x, y: s.b.y - s.a.y };
        const croix = d.x * e.y - d.y * e.x; // > 0 : virage à droite (écran)
        return croix > 0 ? 0 : croix === 0 ? 1 : 2;
      };
      arc = [...suivants].sort((p, q) => score(p) - score(q))[0];
      // La boucle se referme d'elle-même : revenue au point de départ, la
      // première arête a été retirée, donc plus rien ne part de ce point.
    }
    if (pts.length > 2) boucles.push(fusionnerAlignes(pts));
  }
  return boucles;
}

/** Fusionne les sommets alignés : sans cela, le retrait du liseré doublerait
 *  au milieu d'un côté droit, où les deux normales sont la même. */
function fusionnerAlignes(pts: Pt[]): Pt[] {
  const ferme = pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y;
  const p = ferme ? pts.slice(0, -1) : pts;
  const out: Pt[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[(i - 1 + p.length) % p.length];
    const b = p[i];
    const c = p[(i + 1) % p.length];
    const colineaire = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) === 0;
    if (!colineaire) out.push(b);
  }
  return out.length ? out : p;
}

const chemin = (pts: Pt[], echelle = S) =>
  `M${pts.map((p) => `${(p.x * echelle).toFixed(0)} ${(p.y * echelle).toFixed(0)}`).join('L')}Z`;


const etiquette = (x: number, y: number, texte: string, couleur: string, taille = 21) =>
  `<text ${attrs({
    x: x.toFixed(0),
    y: y.toFixed(0),
    fill: couleur,
    'font-family': 'ui-monospace, monospace',
    'font-size': taille,
    'letter-spacing': 1.2,
    'text-anchor': 'middle',
    stroke: ENCRE.halo,
    'stroke-width': 5,
    'paint-order': 'stroke',
    'stroke-linejoin': 'round',
  })}>${texte}</text>`;

/**
 * Encre de la limite selon l'état du secteur. **Une seule ligne par secteur**,
 * et c'est son encre qui porte l'état.
 *
 * La planche 4 posait deux traits : la limite, plus un liseré tireté en retrait
 * de 12 px reprenant le filet de la fiche. À l'usage, sur un fond de paysage
 * déjà dense en traits, cela faisait un trait plein pris en sandwich entre deux
 * tiretés, bruyant et illisible. L'information tient dans une ligne : elle est
 * là, et elle a une couleur. Au repos cette ligne est **claire**, ce qui se lit
 * comme une coupure du paysage sans y ajouter d'encre.
 */
function encreDeLimite(etat: EtatSecteur | undefined): string {
  if (etat === 'peril') return SECTEUR.braise;
  if (etat === 'vigueur') return SECTEUR.vertPin;
  if (etat === 'montee') return SECTEUR.vertClair;
  // « Activable » n'est pas un état à afficher sur la carte : le panneau le dit
  // déjà, et le signaler partout reviendrait à souligner tout le versant.
  return SECTEUR.limite;
}

/**
 * Étiquette de secteur : nom du modèle en Fraunces, **jamais tronqué**, et une
 * sous-ligne en capitales. Halo de parchemin par `paint-order`, jamais de
 * cartouche opaque : un fond plein rouvrirait l'interdit d'aplat.
 */
function etiquetteSecteur(x: number, y: number, nom: string, sous: string, k = 1): string {
  const halo = {
    stroke: ENCRE.halo,
    'stroke-width': 6 * k,
    'paint-order': 'stroke',
    'stroke-linejoin': 'round',
    'text-anchor': 'middle',
  };
  return (
    `<text ${attrs({
      ...halo,
      x: x.toFixed(0),
      y: y.toFixed(0),
      fill: ENCRE.cadre,
      'font-family': 'Fraunces, ui-serif, Georgia, serif',
      'font-size': 21 * k,
    })}>${nom}</text>` +
    `<text ${attrs({
      ...halo,
      'stroke-width': 5 * k,
      x: x.toFixed(0),
      y: (y + 20 * k).toFixed(0),
      fill: ENCRE.gestion,
      'font-family': 'ui-sans-serif, system-ui, sans-serif',
      'font-size': 12 * k,
      'letter-spacing': k,
    })}>${sous.toUpperCase()}</text>`
  );
}

/**
 * Calque secteur, rendu séparément de la carte pour que le survol et la
 * sélection ne redessinent pas le paysage : à l'échelle native, la carte
 * entière pèse 727 Ko de SVG et 1040 cellules de semis.
 */
export function rendreCalqueSecteurs(
  etat: Etat,
  options: OptionsSecteurs & { fenetre?: Fenetre } = {},
): string {
  const f = options.fenetre ?? { x0: 0, y0: 0, largeur: etat.largeur, hauteur: etat.hauteur };
  // Géométrie du chrome, multipliée par le diviseur : ce qui doit garder sa
  // taille **à l'écran** doit grandir dans le repère de la carte quand celle-ci
  // rétrécit. Les épaisseurs, elles, sont tenues par `vector-effect`.
  const k = options.echelle ?? 1;
  const parId = new Map((options.donnees ?? []).map((d) => [d.id, d]));
  const morceaux: string[] = [];
  const etiquettes: string[] = [];
  /** Contours du secteur choisi, réunis pour percer le voile. */
  const contoursChoisi: string[] = [];

  for (const s of etat.secteurs) {
    const cellules = s.cellules.filter((i) => dansFenetre(
      { x: i % etat.largeur, y: Math.floor(i / etat.largeur) },
      f,
    ));
    if (!cellules.length) continue;

    const d = parId.get(s.id);
    const survole = options.survole === s.id;
    const selectionne = options.selectionne === s.id;
    const boucles = contoursSecteur(s.cellules, etat.largeur);

    // 1. La limite. Angles arrondis, aucun remplissage.
    for (const b of boucles) {
      morceaux.push(
        `<path ${attrs({
          class: 'secteur__limite',
          d: chemin(b),
          fill: 'none',
          // La sélection ne change pas l'encre : le voile la dit déjà, et une
          // limite braise en plus faisait doublon. Le trait s'épaissit
          // seulement, comme au survol.
          stroke: encreDeLimite(d?.etat),
          'stroke-width': selectionne ? 4 : survole ? SECTEUR.traitSurvol : SECTEUR.trait,
          'stroke-linejoin': 'round',
          'vector-effect': 'non-scaling-stroke',
        })}/>`,
      );
      if (selectionne) contoursChoisi.push(chemin(b));
    }

    // 4. Les deux seules valeurs chiffrées que le calque pose sur la carte.
    if (d?.etat === 'montee' && d.crans) {
      // Dans l'angle bas du polygone : l'adoption est la variable la plus
      // difficile à sentir, et la seule qui mérite un compte sur la carte.
      const bas = cellules.reduce((m, i) => (Math.floor(i / etat.largeur) > Math.floor(m / etat.largeur) ? i : m), cellules[0]);
      const bx = (bas % etat.largeur) * S + 16;
      const by = Math.floor(bas / etat.largeur) * S + S - 22;
      for (let k = 0; k < d.crans.total; k++) {
        morceaux.push(
          `<rect ${attrs({
            x: bx + k * 11,
            y: by,
            width: 6,
            height: 14,
            fill: k < d.crans.pleins ? SECTEUR.vertClair : 'none',
            stroke: SECTEUR.vertClair,
            'stroke-width': 1.5,
          })}/>`,
        );
      }
    }

    // **L'étiquette ne s'affiche qu'au survol ou sur le secteur choisi.** Quatorze
    // noms posés en permanence sur le paysage recouvraient le semis et les
    // courbes, et disaient partout ce dont on n'a besoin qu'ici : le nom sert à
    // confirmer ce qu'on désigne, pas à cartographier le versant.
    if (options.etiquettes !== false && (survole || selectionne)) {
      const ex = (s.ax + 0.5) * S;
      const ey = (s.ay + 0.5) * S;
      const nature = NATURE_SECTEUR[s.nature].toLowerCase();
      const porte = d?.porte ?? 'aucune';
      etiquettes.push(etiquetteSecteur(ex, ey, s.nom, `${nature} · ${s.cellules.length} cellules · ${porte}`, k));
      if (d?.etat === 'peril' && d.ecartPlancher) {
        etiquettes.push(
          `<text ${attrs({
            x: ex.toFixed(0),
            y: (ey + 40).toFixed(0),
            fill: SECTEUR.braise,
            'font-family': 'ui-sans-serif, system-ui, sans-serif',
            'font-size': 13,
            'text-anchor': 'middle',
            stroke: ENCRE.halo,
            'stroke-width': 5,
            'paint-order': 'stroke',
          })}>${d.ecartPlancher}</text>`,
        );
      }
    }
  }

  // 5. Bâti orphelin : toute construction hors couronne. Sans ce signe, on
  // croit avoir tout couvert en équipant ses trois couronnes, alors que le
  // mitage est volontaire et qu'aucune politique de hameau ne l'atteint.
  const natureDeSecteur = new Map(etat.secteurs.map((s) => [s.id, s.nature]));
  for (const c of etat.grille) {
    if (c.type !== 'bati' || !dansFenetre(c, f)) continue;
    if (natureDeSecteur.get(c.secteur) === 'couronne') continue;
    const g = composerCellule(c, etat.meteo).glyphes[0];
    if (!g) continue;
    const x = g.x + g.w * EMPRISE_MAISON.x;
    const y = g.y + g.h * EMPRISE_MAISON.y;
    morceaux.push(
      `<rect ${attrs({
        x: (x - 6).toFixed(0),
        y: (y - 6).toFixed(0),
        width: (g.w * EMPRISE_MAISON.w + 12).toFixed(0),
        height: (g.h * EMPRISE_MAISON.h + 12).toFixed(0),
        fill: 'none',
        stroke: SECTEUR.braise,
        'stroke-width': 1.5,
        'vector-effect': 'non-scaling-stroke',
        // Plein si la construction est durcie : le cerne dit à la fois qu'elle
        // est seule et ce qu'elle vaut face aux braises.
        'stroke-dasharray': c.durcissement >= 1 ? undefined : '6 5',
      })}/>`,
    );
  }

  /**
   * **Écart assumé à la planche 4**, qui interdit tout aplat, même à 8 %, au
   * motif que le grain de sous-bois et les paliers de densité justifient la
   * décision et ne doivent jamais être recouverts.
   *
   * Le voile ne se pose que pendant une sélection, et **jamais sur le secteur
   * choisi**, qui garde son grain intact : c'est précisément celui qu'on est en
   * train de juger. Les autres sont mis en retrait le temps qu'on décide, et
   * retrouvent leur paysage dès qu'on referme. La règle protégeait la lecture
   * de ce qu'on regarde ; elle est tenue.
   */
  const voile = contoursChoisi.length
    ? `<path ${attrs({
        class: 'secteur__voile',
        d: `M0 0H${etat.largeur * S}V${etat.hauteur * S}H0Z${contoursChoisi.join('')}`,
        'fill-rule': 'evenodd',
        fill: SECTEUR.voile,
        'fill-opacity': SECTEUR.opaciteVoile,
      })}/>`
    : '';

  return voile + morceaux.join('') + etiquettes.join('');
}

/** Compose la carte. Le `<svg>` appartient à la page, qui décide de sa taille. */
export function rendreCarte(
  etat: Etat,
  options: OptionsCarte = {},
): { contenu: string; viewBox: string } {
  const f = options.fenetre ?? { x0: 0, y0: 0, largeur: etat.largeur, hauteur: etat.hauteur };
  const { z, gradient } = champ(etat);

  const visibles = etat.grille.filter((c) => dansFenetre(c, f));
  const composees = new Map<number, CelluleComposee>();
  for (const c of visibles) {
    composees.set(c.y * etat.largeur + c.x, composerCellule(c, etat.meteo, options));
  }

  // ---- 1. sol -------------------------------------------------------------
  const sol = visibles
    .map((c) => {
      const comp = composees.get(c.y * etat.largeur + c.x)!;
      return `<rect ${attrs({ x: c.x * S, y: c.y * S, width: S, height: S, fill: comp.couleurSol })}/>`;
    })
    .join('');

  // ---- 2. relief ----------------------------------------------------------
  let relief = '';
  const cotes: string[] = [];
  if (options.relief !== false) {
    const { traces, cotes: valeurs } = courbesDeNiveau(etat, f, composees, z);
    const t = talweg(etat);
    const cr = crete(etat);
    relief = traces + t.trace + cr.trace;
    if (options.etiquettes !== false) {
      for (const c of valeurs) cotes.push(etiquette(c.x, c.y, c.texte, ENCRE.cote, 21));
      if (t.milieu) cotes.push(etiquette(t.milieu[0], t.milieu[1] + 30, 'TALWEG', 'oklch(0.40 0.075 220)', 20));
      if (cr.milieu) cotes.push(etiquette(cr.milieu[0], cr.milieu[1] - 34, 'CRÊTE', ENCRE.crete, 20));
    }
  }

  // ---- 3. sous-bois -------------------------------------------------------
  const sousBois = visibles
    .map((c) => {
      const comp = composees.get(c.y * etat.largeur + c.x)!;
      return comp.motif
        ? `<rect ${attrs({ x: c.x * S, y: c.y * S, width: S, height: S, fill: `url(#${comp.motif})` })}/>`
        : '';
    })
    .join('');

  // ---- 4. gestion, puis 5. glyphes triés par pied -------------------------
  const gestion = visibles.flatMap((c) => composees.get(c.y * etat.largeur + c.x)!.gestion).join('');
  const glyphes: Glyphe[] = visibles.flatMap((c) => composees.get(c.y * etat.largeur + c.x)!.glyphes);
  glyphes.sort((a, b) => a.pied - b.pied);
  const dessinGlyphes = glyphes
    .map((g) =>
      `<use ${attrs({ href: `#${g.href}`, x: g.x, y: g.y, width: g.w, height: g.h, style: g.couleur ? `color:${g.couleur}` : undefined })}/>`,
    )
    .join('');

  return {
    contenu:
      `<rect ${attrs({ x: f.x0 * S, y: f.y0 * S, width: f.largeur * S, height: f.hauteur * S, fill: ENCRE.fondCarte })}/>` +
      `<g class="couche-sol">${sol}</g>` +
      `<g class="couche-relief" pointer-events="none">${relief}</g>` +
      `<g class="couche-sous-bois" pointer-events="none">${sousBois}</g>` +
      (options.structure === false ? '' : `<g class="couche-structure" pointer-events="none">${structure(etat, f, composees)}</g>`) +
      `<g class="couche-gestion" pointer-events="none">${gestion}</g>` +
      `<g class="couche-glyphes">${dessinGlyphes}</g>` +
      `<g class="couche-feu" pointer-events="none">${front(etat, f, gradient)}</g>` +
      (options.secteurs
        ? `<g class="couche-secteurs">${rendreCalqueSecteurs(etat, { ...options.secteurs, fenetre: f })}</g>`
        : '') +
      // Vide au rendu serveur : l'îlot la remplit à la visée et à la
      // désignation, sans retoucher au paysage.
      `<g class="couche-gestes" pointer-events="none"></g>` +
      `<g class="couche-etiquettes" pointer-events="none">${cotes.join('')}</g>`,
    viewBox: `${f.x0 * S} ${f.y0 * S} ${f.largeur * S} ${f.hauteur * S}`,
  };
}
