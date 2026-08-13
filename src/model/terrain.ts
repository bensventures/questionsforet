import type { Cellule, Etat, PositionTopo, TypeVeg } from './types';
import type { Rng } from './rng';
import { W, H, TYPES, DENSITE, CLIMAT, HORIZON, RELIEF } from './params';
import { idx, dans, borne } from './util';
import { decouperSecteurs } from './secteurs';

/**
 * Génération du terrain et des variables statiques (§4.1).
 *
 * Nouveauté par rapport à la v2 : les **routes** existent. Le §4.1 fait de
 * l'accessibilité une variable statique (distance à une route) qui détermine le
 * coût des travaux, le §7.1 pondère l'allumage par la proximité des routes, et
 * le §10 fait dépendre la rentabilité de l'éclaircie de cette même distance.
 * Sans routes, ces trois mécaniques n'ont pas de support.
 */

/** Densité initiale par type : le Diois part largement fermé et non géré. */
function densiteInitiale(t: TypeVeg, rng: Rng): number {
  if (t === 'pinNoir') return rng.entre(520, 860);
  if (t === 'pinSylvestre') return rng.entre(460, 780);
  if (t === 'chene') return rng.entre(360, 560);
  if (t === 'hetre') return rng.entre(340, 540);
  if (t === 'ripisylve') return rng.entre(300, 500);
  return rng.entre(80, 180);
}

export function creerEtat(graine: number, rng: Rng, toursMax = HORIZON.long): Etat {
  const grille: Cellule[] = [];

  // ---- relief : quelques collines et une vallée est-ouest (la Drôme) ----
  const collines = [];
  for (let k = 0; k < 5; k++) {
    collines.push({ x: rng.entre(2, W - 2), y: rng.entre(1, H - 1), r: rng.entre(7, 15), h: rng.entre(0.5, 1) });
  }
  const alt: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let e = 0;
      for (const c of collines) {
        const d = Math.hypot(x - c.x, y - c.y);
        e += c.h * Math.exp(-(d * d) / (2 * c.r * c.r));
      }
      e -= 0.55 * Math.exp(-Math.pow(y - (H * 0.62 + 2.6 * Math.sin(x / 6)), 2) / 11);
      alt[idx(x, y)] = e;
    }
  }
  const mn = Math.min(...alt);
  const mx = Math.max(...alt);
  for (let i = 0; i < alt.length; i++) alt[i] = (alt[i] - mn) / (mx - mn);

  // ---- route principale : elle suit le fond de vallée, comme en montagne ----
  const route = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) {
    // Le point le plus bas de la colonne, c'est là que passe la route.
    let by = 0;
    let be = Infinity;
    for (let y = 0; y < H; y++) {
      if (alt[idx(x, y)] < be) { be = alt[idx(x, y)]; by = y; }
    }
    route[idx(x, by)] = 1;
  }
  // Une desserte qui remonte un versant : au-delà, plus rien n'est desservi.
  const xb = Math.floor(rng.entre(W * 0.25, W * 0.75));
  let yb = 0;
  let eb = Infinity;
  for (let y = 0; y < H; y++) if (alt[idx(xb, y)] < eb) { eb = alt[idx(xb, y)]; yb = y; }
  const sens = rng.chance(0.5) ? -1 : 1;
  for (let k = 1; k < Math.floor(H * 0.45); k++) {
    const y = yb + sens * k;
    const x = xb + Math.round(Math.sin(k / 3) * 1.5);
    if (dans(x, y)) route[idx(x, y)] = 1;
  }

  // ---- exposition : normalisée sur le relief effectivement engendré ----
  // Sans normalisation, le gradient nord-sud de collines lisses est trop faible
  // pour franchir un seuil absolu, et toute la carte devient de l'ubac : plus
  // de pin noir, donc plus de leçon centrale, et un découpage sans contraste.
  const gradY: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      gradY[idx(x, y)] = alt[idx(x, Math.min(H - 1, y + 1))] - alt[idx(x, Math.max(0, y - 1))];
    }
  }
  const echelle = quantile(gradY.map(Math.abs), 0.85) || 1e-6;

  // ---- pente : normalisée elle aussi sur le relief engendré (RELIEF) ----
  // Deux passes sont nécessaires : l'échelle dépend de toute la distribution.
  const penteBrute: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dzy = gradY[idx(x, y)];
      const dzx = alt[idx(Math.min(W - 1, x + 1), y)] - alt[idx(Math.max(0, x - 1), y)];
      penteBrute[idx(x, y)] = Math.hypot(dzx, dzy);
    }
  }
  const echellePente = (quantile(penteBrute, RELIEF.quantile) || 1e-6) / RELIEF.valeur;

  // ---- cellules ----
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const el = alt[idx(x, y)];
      const dzy = gradY[idx(x, y)];
      const pente = borne(penteBrute[idx(x, y)] / echellePente, 0, 1);
      // 0.5 = terrain plat, 1 = plein sud, 0 = plein nord.
      const expositionSud = borne(0.5 - dzy / (2 * echelle), 0, 1);
      // `topoDe` garde la pente **brute** : son seuil de crête est calibré sur
      // cette échelle, et le passer au normalisé reclasserait la topographie,
      // donc l'humidité et le découpage en secteurs. Le correctif porte sur le
      // champ documenté, pas sur la génération du relief.
      const positionTopo = topoDe(el, penteBrute[idx(x, y)]);

      // Le type découle de la station : c'est la seule façon d'avoir un couvert
      // initial qu'un processus aurait pu produire (règle 1). La répartition
      // vise un versant du Diois : pin noir de reboisement RTM sur les adrets,
      // chênaie et hêtraie sur les ubacs, garrigue sur les stations sèches.
      let type: TypeVeg;
      if (positionTopo === 'talweg') type = rng.chance(0.66) ? 'ripisylve' : 'pelouse';
      else if (el > 0.82) type = rng.chance(0.55) ? 'rocher' : 'pelouse';
      else if (expositionSud > SEUIL_ADRET) {
        const r = rng.suivant();
        type = r < 0.44 ? 'pinNoir' : r < 0.66 ? 'pinSylvestre' : 'garrigue';
      } else {
        const r = rng.suivant();
        // Le hêtre ne tient que sur les stations fraîches et hautes.
        const fraiche = el > 0.45 && expositionSud < 0.35;
        type = r < 0.55 ? 'chene' : r < (fraiche ? 0.85 : 0.66) ? 'hetre' : 'garrigue';
      }

      grille.push({
        x, y,
        pente, expositionSud, positionTopo, altitude: el,
        accessibilite: 0, // calculé plus bas, une fois les routes posées
        distanceBati: 99,
        secteur: -1,
        type,
        densite: densiteInitiale(type, rng),
        sousBois: rng.entre(0.35, 0.8),
        age: TYPES[type].arbore ? Math.round(rng.entre(12, 45)) : 0,
        gestion: DENSITE.memoireGestion + 5, // rien n'est géré au départ
        paturage: 0,
        effetBrulage: 0,
        ouverture: 0,
        sansEntretien: 0,
        durcissement: 0,
        profondeurTraitee: 0,
        conforme: false,
        habitants: 0,
        detruite: false,
        regenDans: 0,
        mortaliteDifferee: 0,
        dejaBrulee: false,
        saisonsDepuisFeu: Infinity,
      });
    }
  }

  // ---- bâti : village en terrain doux, plus quelques hameaux ----
  poserBati(grille, alt, route, rng);

  // ---- variables statiques dérivées d'une distance ----
  const dRoute = distanceA(grille, (c) => route[idx(c.x, c.y)] === 1);
  for (let i = 0; i < grille.length; i++) {
    // L'accessibilité décroît vite : au-delà de ~6 cellules d'une route, les
    // travaux deviennent une perte sèche (§10, recette 1).
    grille[i].accessibilite = borne(1 - dRoute[i] / 8, 0, 1);
  }
  const dBati = distanceA(grille, (c) => c.type === 'bati');
  for (let i = 0; i < grille.length; i++) grille[i].distanceBati = dBati[i];

  const etat: Etat = {
    largeur: W, hauteur: H, grille, secteurs: [],
    tour: 1, toursMax,
    meteo: { secheresse: CLIMAT.base, ventAngle: 0, ventForce: 0.5 },
    secheressePrecedente: CLIMAT.base,
    doctrine: 2,
    moyens: { budget: 10, eleveurs: 2, equipes: 2, fenetrePostFeu: 0 },
    politiques: [],
    toursSansContrat: 0,
    cumul: {
      parcourues: 0, parcouruesDistinctes: 0,
      pertesBraise: 0, pertesFront: 0, pertesSecoursDebordes: 0,
      braiseConforme: 0, frontConforme: 0, braiseNonConforme: 0, frontNonConforme: 0,
      departsEteints: 0, toursCran1: 0, depense: 0, recettes: 0,
    },
    dernierFeu: null,
  };
  etat.secteurs = decouperSecteurs(grille);
  return etat;
}

/**
 * Seuil au-dessus duquel une station compte comme adret. Partagé avec le
 * découpage en secteurs, sinon la carte et le zonage ne racontent pas la même
 * histoire.
 */
export const SEUIL_ADRET = 0.56;

/** Quantile d'une série, pour normaliser sur le relief réellement engendré. */
function quantile(v: number[], q: number): number {
  const t = [...v].sort((a, b) => a - b);
  return t[Math.min(t.length - 1, Math.floor(t.length * q))];
}

/** Position topographique à partir de l'altitude et de la pente locale. */
function topoDe(el: number, pente: number): PositionTopo {
  if (el < 0.18) return 'talweg';
  if (el < 0.38) return 'basVersant';
  if (el > 0.78 && pente < 0.06) return 'crete';
  return 'versant';
}

/** Distance de Chebyshev à l'ensemble des cellules vérifiant `estCible`, par
 *  parcours en largeur multi-source. */
function distanceA(grille: Cellule[], estCible: (c: Cellule) => boolean): number[] {
  const d = new Array<number>(grille.length).fill(Infinity);
  const file: number[] = [];
  for (let i = 0; i < grille.length; i++) {
    if (estCible(grille[i])) { d[i] = 0; file.push(i); }
  }
  for (let t = 0; t < file.length; t++) {
    const i = file[t];
    const c = grille[i];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!dans(c.x + dx, c.y + dy)) continue;
        const j = idx(c.x + dx, c.y + dy);
        if (d[j] !== Infinity) continue;
        d[j] = d[i] + 1;
        file.push(j);
      }
    }
  }
  for (let i = 0; i < d.length; i++) if (d[i] === Infinity) d[i] = 99;
  return d;
}

/**
 * Village et hameaux. On s'installe en terrain doux et desservi, comme dans la
 * réalité : le bâti est donc défendable en principe, et c'est au joueur de le
 * rendre défendable en fait.
 */
function poserBati(grille: Cellule[], alt: number[], route: Uint8Array, rng: Rng): void {
  const marquer = (c: Cellule) => {
    c.type = 'bati';
    c.sousBois = 0.5;
    c.densite = 0;
    c.age = 0;
    c.habitants = Math.floor(rng.entre(2, 7));
  };

  // Bourg : la meilleure combinaison de terrain plat, bas et desservi.
  let meilleur = -1;
  let score = Infinity;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 4; x < W - 4; x++) {
      const i = idx(x, y);
      const c = grille[i];
      const s = alt[i] + c.pente * 2 - (route[i] ? 0.4 : 0);
      if (s < score) { score = s; meilleur = i; }
    }
  }
  const b = grille[meilleur];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dans(b.x + dx, b.y + dy) && rng.chance(0.82)) marquer(grille[idx(b.x + dx, b.y + dy)]);
    }
  }

  // Hameaux : petits groupes, un peu partout sur du terrain praticable.
  let hameaux = 0;
  let essais = 0;
  while (hameaux < 4 && essais < 800) {
    essais++;
    const c = grille[rng.entier(grille.length)];
    if (c.type === 'bati' || c.pente > 0.45) continue;
    if (Math.hypot(c.x - b.x, c.y - b.y) < 6) continue;
    // Pas de hameau collé à un autre : `distanceBati` n'est pas encore calculée
    // à ce stade, on regarde donc directement le voisinage.
    let colle = false;
    for (let dy = -2; dy <= 2 && !colle; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dans(c.x + dx, c.y + dy) && grille[idx(c.x + dx, c.y + dy)].type === 'bati') { colle = true; break; }
      }
    }
    if (colle) continue;
    let pose = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dans(c.x + dx, c.y + dy)) continue;
        const n = grille[idx(c.x + dx, c.y + dy)];
        if (n.type !== 'bati' && rng.chance(0.45)) { marquer(n); pose++; }
      }
    }
    if (pose) hameaux++;
  }
}
