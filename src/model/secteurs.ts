import type { Cellule, NatureSecteur, Secteur } from './types';
import { W, H } from './params';
import { SEUIL_ADRET } from './terrain';
import { idx, dans } from './util';

/**
 * Découpage en secteurs (§3). C'est à la fois l'unité de décision (les
 * politiques s'appliquent à un secteur) et l'unité d'affichage : aujourd'hui
 * les deux granularités sont décalées de deux ordres de grandeur.
 *
 * Le découpage est administratif et figé pour la partie : les constructions
 * brûlent, les peuplements se convertissent, le périmètre sur lequel on décide
 * ne bouge pas.
 *
 * Algorithme porté de la v2, où il avait passé ses tests sur soixante graines.
 * Deux réglages portent du sens et ne sont pas cosmétiques :
 *  - un **plafond de taille**, sans lequel le relief produit des secteurs
 *    couvrant la moitié de la carte, et une politique y traiterait tout le
 *    massif d'un clic ;
 *  - un **nombre maximal de couronnes**, le bâti diffus restant dans le versant
 *    qui l'entoure, ce qui est exactement ce que le mitage fait à une commune :
 *    aucune politique à l'échelle du hameau ne le couvre.
 */

export const SECTEURS = {
  rayonCouronne: 2,
  maxCouronnes: 3,
  minCellules: 14,
  maxCellules: 130,
  maxSecteurs: 14,
};

const NB4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export const NATURE_SECTEUR: Record<NatureSecteur, string> = {
  couronne: 'Couronne bâtie',
  vallon: 'Fond de vallon',
  adret: "Versant d'adret",
  ubac: "Versant d'ubac",
  massif: 'Cœur de massif',
};

function natureDe(c: Cellule, procheBati: boolean): NatureSecteur {
  if (procheBati) return 'couronne';
  if (c.positionTopo === 'talweg') return 'vallon';
  if (c.positionTopo === 'crete') return 'massif';
  if (c.expositionSud > SEUIL_ADRET) return 'adret';
  return 'ubac';
}

/** Composantes connexes (8-voisinage) d'un sous-ensemble de cellules. */
function composantes(grille: Cellule[], cellules: number[]): number[][] {
  const ens = new Set(cellules);
  const vus = new Set<number>();
  const out: number[][] = [];
  for (const depart of cellules) {
    if (vus.has(depart)) continue;
    const groupe: number[] = [];
    const pile = [depart];
    vus.add(depart);
    while (pile.length) {
      const j = pile.pop()!;
      groupe.push(j);
      const c = grille[j];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!dans(c.x + dx, c.y + dy)) continue;
          const m = idx(c.x + dx, c.y + dy);
          if (ens.has(m) && !vus.has(m)) { vus.add(m); pile.push(m); }
        }
      }
    }
    out.push(groupe);
  }
  return out;
}

/** Coupe un secteur en deux dans son axe long, puis recoupe chaque moitié en
 *  morceaux d'un seul tenant : un périmètre en deux morceaux n'est pas
 *  utilisable comme unité de décision. */
function couper(grille: Cellule[], cellules: number[]): number[][] {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const j of cellules) {
    const c = grille[j];
    if (c.x < minx) minx = c.x;
    if (c.x > maxx) maxx = c.x;
    if (c.y < miny) miny = c.y;
    if (c.y > maxy) maxy = c.y;
  }
  const horizontal = maxx - minx >= maxy - miny;
  const coord = (j: number) => (horizontal ? grille[j].x : grille[j].y);
  const tries = [...cellules].sort((a, b) => coord(a) - coord(b));
  const med = coord(tries[tries.length >> 1]);
  const a = cellules.filter((j) => coord(j) < med);
  const b = cellules.filter((j) => coord(j) >= med);
  if (!a.length || !b.length) return [cellules];
  return [...composantes(grille, a), ...composantes(grille, b)];
}

export function decouperSecteurs(grille: Cellule[]): Secteur[] {
  const n = grille.length;

  // 1. Nature de chaque cellule. Les couronnes priment sur la station.
  const procheBati = new Uint8Array(n);
  for (const c of grille) {
    if (c.type !== 'bati') continue;
    const r = SECTEURS.rayonCouronne;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dans(c.x + dx, c.y + dy)) procheBati[idx(c.x + dx, c.y + dy)] = 1;
      }
    }
  }
  const nature: NatureSecteur[] = new Array(n);
  for (let i = 0; i < n; i++) nature[i] = natureDe(grille[i], procheBati[i] === 1);

  // 2. Composantes connexes par nature.
  const proprio = new Int32Array(n).fill(-1);
  const parts = new Map<number, { nature: NatureSecteur; cellules: number[] }>();
  let prochainId = 0;
  for (let i = 0; i < n; i++) {
    if (proprio[i] >= 0) continue;
    const nat = nature[i];
    const id = prochainId++;
    const cellules: number[] = [];
    const pile = [i];
    proprio[i] = id;
    while (pile.length) {
      const j = pile.pop()!;
      cellules.push(j);
      const c = grille[j];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!dans(c.x + dx, c.y + dy)) continue;
          const m = idx(c.x + dx, c.y + dy);
          if (proprio[m] < 0 && nature[m] === nat) { proprio[m] = id; pile.push(m); }
        }
      }
    }
    parts.set(id, { nature: nat, cellules });
  }

  const frontieres = (id: number): Map<number, number> => {
    const m = new Map<number, number>();
    for (const j of parts.get(id)!.cellules) {
      const c = grille[j];
      for (const [dx, dy] of NB4) {
        if (!dans(c.x + dx, c.y + dy)) continue;
        const o = proprio[idx(c.x + dx, c.y + dy)];
        if (o === id) continue;
        m.set(o, (m.get(o) ?? 0) + 1);
      }
    }
    return m;
  };

  const cible = (id: number, couronneAutorisee: boolean, imposerTaille = false): number => {
    const moi = parts.get(id)!;
    let meilleur = -1;
    let score = -1;
    for (const [o, longueur] of frontieres(id)) {
      const p = parts.get(o);
      if (!p) continue;
      if (p.nature === 'couronne' && !couronneAutorisee) continue;
      const tient = p.cellules.length + moi.cellules.length <= SECTEURS.maxCellules;
      if (imposerTaille && !tient) continue;
      const s = longueur + (p.nature === moi.nature ? 1000 : 0) + (tient ? 5000 : 0);
      if (s > score) { score = s; meilleur = o; }
    }
    return meilleur;
  };

  const fusionner = (de: number, vers: number) => {
    const a = parts.get(vers)!;
    const b = parts.get(de)!;
    for (const j of b.cellules) proprio[j] = vers;
    a.cellules.push(...b.cellules);
    parts.delete(de);
  };

  // 3. Découper ce qui est trop gros.
  for (let garde = 0; garde < 200; garde++) {
    let gros = -1;
    for (const [id, p] of parts) if (p.cellules.length > SECTEURS.maxCellules) { gros = id; break; }
    if (gros < 0) break;
    const p = parts.get(gros)!;
    const morceaux = couper(grille, p.cellules);
    if (morceaux.length < 2) break;
    parts.delete(gros);
    for (const m of morceaux) {
      const id = prochainId++;
      for (const j of m) proprio[j] = id;
      parts.set(id, { nature: p.nature, cellules: m });
    }
  }

  // 4. Rendre les couronnes excédentaires au versant qui les entoure.
  const couronnes = [...parts.entries()]
    .filter(([, p]) => p.nature === 'couronne')
    .sort((a, b) => b[1].cellules.length - a[1].cellules.length);
  for (const [id] of couronnes.slice(SECTEURS.maxCouronnes)) {
    const t = cible(id, false);
    if (t >= 0) fusionner(id, t);
  }

  // 5. Absorber les résidus trop petits pour être un périmètre de décision.
  for (let garde = 0; garde < 1000; garde++) {
    let petit = -1;
    let taille = SECTEURS.minCellules;
    for (const [id, p] of parts) if (p.cellules.length < taille) { taille = p.cellules.length; petit = id; }
    if (petit < 0) break;
    const t = cible(petit, true);
    if (t < 0) break;
    fusionner(petit, t);
  }

  // 6. Plafond souple sur le nombre, sans jamais dépasser le plafond de taille.
  for (let garde = 0; garde < 1000 && parts.size > SECTEURS.maxSecteurs; garde++) {
    const pool = [...parts.entries()]
      .filter(([, p]) => p.nature !== 'couronne')
      .sort((a, b) => a[1].cellules.length - b[1].cellules.length);
    let fait = false;
    for (const [id] of pool) {
      const t = cible(id, false, true);
      if (t < 0) continue;
      fusionner(id, t);
      fait = true;
      break;
    }
    if (!fait) break;
  }

  // 7. Réindexer, nommer, estampiller.
  const ordonnes = [...parts.entries()].sort((a, b) => b[1].cellules.length - a[1].cellules.length);
  const secteurs: Secteur[] = ordonnes.map(([, p], i) => {
    const a = ancre(grille, p.cellules);
    return { id: i, nature: p.nature, nom: '', cellules: p.cellules, ax: a.x, ay: a.y };
  });
  for (const s of secteurs) for (const j of s.cellules) grille[j].secteur = s.id;
  nommer(grille, secteurs);
  return secteurs;
}

/** Cellule la plus intérieure d'un secteur, par parcours en largeur depuis son
 *  bord : un barycentre peut tomber hors d'une forme concave, pas ceci. */
function ancre(grille: Cellule[], cellules: number[]): { x: number; y: number } {
  const ens = new Set(cellules);
  const d = new Map<number, number>();
  const file: number[] = [];
  for (const j of cellules) {
    const c = grille[j];
    for (const [dx, dy] of NB4) {
      if (!dans(c.x + dx, c.y + dy) || !ens.has(idx(c.x + dx, c.y + dy))) {
        d.set(j, 0);
        file.push(j);
        break;
      }
    }
  }
  for (let t = 0; t < file.length; t++) {
    const j = file[t];
    const c = grille[j];
    for (const [dx, dy] of NB4) {
      if (!dans(c.x + dx, c.y + dy)) continue;
      const m = idx(c.x + dx, c.y + dy);
      if (!ens.has(m) || d.has(m)) continue;
      d.set(m, d.get(j)! + 1);
      file.push(m);
    }
  }
  let best = cellules[0];
  let bd = -1;
  for (const j of cellules) {
    const v = d.get(j) ?? 0;
    if (v > bd) { bd = v; best = j; }
  }
  return { x: grille[best].x, y: grille[best].y };
}

function boussole(x: number, y: number): string {
  const nx = (x / (W - 1)) * 2 - 1;
  const ny = (y / (H - 1)) * 2 - 1;
  const eo = nx > 0.3 ? 'est' : nx < -0.3 ? 'ouest' : '';
  const ns = ny > 0.3 ? 'sud' : ny < -0.3 ? 'nord' : '';
  if (ns && eo) return `${ns}-${eo}`;
  return ns || eo || 'central';
}

function altMoyenne(grille: Cellule[], cellules: number[]): number {
  let s = 0;
  for (const j of cellules) s += grille[j].positionTopo === 'crete' ? 1 : grille[j].positionTopo === 'versant' ? 0.6 : 0.2;
  return s / cellules.length;
}

const PALIERS: Record<number, string[]> = {
  2: ['haut', 'bas'],
  3: ['haut', 'médian', 'bas'],
};

function nommer(grille: Cellule[], secteurs: Secteur[]): void {
  const compte: Record<string, number> = {};
  for (const s of secteurs) compte[s.nature] = (compte[s.nature] ?? 0) + 1;

  let bourgFait = false;
  const brouillon = new Map<number, string>();
  for (const s of secteurs) {
    if (s.nature === 'couronne') {
      if (!bourgFait) { bourgFait = true; brouillon.set(s.id, 'Couronne du village'); }
      else brouillon.set(s.id, `Couronne du hameau ${boussole(s.ax, s.ay)}`);
    } else {
      const base = NATURE_SECTEUR[s.nature];
      brouillon.set(s.id, compte[s.nature] > 1 ? `${base} ${boussole(s.ax, s.ay)}` : base);
    }
  }

  const groupes = new Map<string, Secteur[]>();
  for (const s of secteurs) {
    const k = brouillon.get(s.id)!;
    (groupes.get(k) ?? groupes.set(k, []).get(k)!).push(s);
  }

  const pris = new Set<string>();
  for (const [base, membres] of groupes) {
    if (membres.length === 1) { membres[0].nom = base; pris.add(base); continue; }
    // Tous les membres d'un groupe en collision reçoivent le qualificatif, pour
    // qu'ils se lisent comme des pairs et non comme un secteur et sa subdivision.
    const paliers = PALIERS[membres.length];
    const parHauteur = [...membres].sort((a, b) => altMoyenne(grille, b.cellules) - altMoyenne(grille, a.cellules));
    parHauteur.forEach((s, i) => {
      let nom = paliers ? `${base}, ${paliers[i]}` : `${base} ${i + 1}`;
      for (let k = 2; pris.has(nom); k++) nom = `${base} ${i + 1}·${k}`;
      pris.add(nom);
      s.nom = nom;
    });
  }
}
