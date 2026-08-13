import type { Cellule, Etat } from '../model/types';
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
      `<g class="couche-etiquettes" pointer-events="none">${cotes.join('')}</g>`,
    viewBox: `${f.x0 * S} ${f.y0 * S} ${f.largeur * S} ${f.hauteur * S}`,
  };
}
