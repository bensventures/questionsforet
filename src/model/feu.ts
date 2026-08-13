import type { BilanFeu, Cellule, Etat, CausePerte } from './types';
import type { Rng } from './rng';
import { TYPES, BRAISES, LUTTE, DOCTRINE, ALLUMAGE, METRES_PAR_CELLULE } from './params';
import { idx, dans, borne } from './util';
import { inflammabilite, intensite, vitesse, profondeurTraiteeReelle } from './derive';

/**
 * Le feu (§7).
 *
 * L'allumage est inévitable et ne dépend pas des décisions. Ce qui en dépend,
 * c'est ce que le feu fait ensuite : c'est la correction de doctrine du §7.1,
 * et la raison pour laquelle la v2 paraissait arbitraire.
 */

/** État transitoire d'une cellule pendant l'incendie. Jamais persisté. */
interface Front {
  etat: Uint8Array; // 0 intact, 1 s'allume, 2 brûle, 3 consumé
  minuterie: Float32Array;
  /** Intensité subie par la cellule, retenue pour l'issue (§8.1). */
  subie: Float32Array;
}

export interface Braise {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function bilanVide(): BilanFeu {
  return {
    parcourues: 0, surface: 0, houppierRoussi: 0, houppierConsomme: 0,
    braises: 0, pertesBraise: 0, pertesFront: 0, pertesSecoursDebordes: 0,
    braiseConforme: 0, frontConforme: 0, braiseNonConforme: 0, frontNonConforme: 0,
    defendables: 0, equipes: 0, sauvees: 0, eteints: 0, laissesCourir: 0,
  };
}

/**
 * Allumage (§7.1). Stochastique, pondéré par la sécheresse régionale et par la
 * proximité des routes et de l'habitat : les causes humaines dominent
 * largement. Le joueur ne peut rien sur le nombre de départs.
 */
export function tirerDeparts(etat: Etat, rng: Rng): number[] {
  const { grille, meteo } = etat;
  const attendus = ALLUMAGE.base + meteo.secheresse * ALLUMAGE.parSecheresse;
  const n = Math.floor(attendus) + (rng.chance(attendus % 1) ? 1 : 0);
  if (n <= 0) return [];

  // Tirage pondéré : on s'allume près des routes et des maisons.
  const poids: number[] = [];
  let total = 0;
  for (const c of grille) {
    let p = 0;
    if (c.type !== 'rocher' && c.type !== 'bati') {
      p = 0.15 + ALLUMAGE.poidsAcces * c.accessibilite + 0.3 * borne(1 - c.distanceBati / 10, 0, 1);
      p *= inflammabilite(c, meteo);
    }
    poids.push(p);
    total += p;
  }
  if (total <= 0) return [];

  const departs: number[] = [];
  for (let k = 0; k < n; k++) {
    let t = rng.suivant() * total;
    for (let i = 0; i < poids.length; i++) {
      t -= poids[i];
      if (t <= 0) {
        if (!departs.includes(i)) departs.push(i);
        break;
      }
    }
  }
  return departs;
}

/**
 * Doctrine de lutte (§7.5). Décide, départ par départ, si les secours
 * l'éteignent. L'extinction est efficace immédiatement et **laisse le
 * combustible en place** : c'est tout le support du paradoxe du §8.2.
 *
 * Le cran 3 ne coûte pas d'argent, il coûte du risque : un feu laissé courir
 * peut grossir et atteindre le bâti si le vent tourne.
 */
export function appliquerDoctrine(etat: Etat, departs: number[], rng: Rng, bilan: BilanFeu): number[] {
  const D = DOCTRINE[etat.doctrine];
  const { grille, meteo } = etat;
  const maitrisable = meteo.secheresse <= D.secheresseMax && meteo.ventForce <= 0.75;
  const restants: number[] = [];

  for (const i of departs) {
    const c = grille[i];
    // Près des maisons, on attaque quel que soit le cran affiché.
    const loin = c.distanceBati >= D.distanceMin;
    if (maitrisable && loin && D.distanceMin > 0) {
      bilan.laissesCourir++;
      restants.push(i);
      continue;
    }
    // Probabilité d'extinction : élevée par temps calme, elle s'effondre en
    // conditions extrêmes. Aucun cran ne tient contre un feu de grand vent.
    const p = borne(1.55 - meteo.secheresse * 1.15 - meteo.ventForce * 0.4, 0, 0.97);
    if (rng.chance(p)) {
      bilan.eteints++;
      etat.cumul.departsEteints++;
    } else {
      restants.push(i);
    }
  }
  return restants;
}

/**
 * Profondeur traitée requise autour d'une construction, en mètres (§7.4).
 * Une cinquantaine de mètres en pente douce, davantage en forte pente ; au-delà
 * d'une certaine pente, aucune profondeur ne suffit.
 */
export function profondeurRequise(c: Cellule): number {
  if (c.pente >= LUTTE.penteImpossible) return Infinity;
  return c.pente >= LUTTE.penteMoyenne ? LUTTE.profondeurEnPente : LUTTE.profondeurBase;
}

/** Charge de combustible immédiatement au contact d'une construction : c'est
 *  elle qui décide si le passage du front l'allume. */
export function combustibleVoisin(grille: Cellule[], c: Cellule): number {
  let pire = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || !dans(c.x + dx, c.y + dy)) continue;
      const n = grille[idx(c.x + dx, c.y + dy)];
      if (n.type === 'bati' || n.type === 'rocher') continue;
      if (n.sousBois > pire) pire = n.sousBois;
    }
  }
  return pire;
}

/** Une construction est-elle défendable ? Condition nécessaire, pas suffisante. */
export function estDefendable(grille: Cellule[], c: Cellule): boolean {
  const requise = profondeurRequise(c);
  if (!Number.isFinite(requise)) return false;
  return profondeurTraiteeReelle(grille, c, 4) >= requise;
}

/**
 * Un incendie, joué jusqu'à extinction. Renvoie le bilan et la trace des
 * braises, que la couche interface pourra rejouer : le modèle calcule, il
 * n'anime pas.
 */
export interface ResultatFeu {
  bilan: BilanFeu;
  braises: Braise[];
  /** Intensité subie par cellule pendant ce feu. Transitoire. */
  subie: Float32Array;
  /** 0 = intacte, >0 = parcourue par le feu. */
  touchee: Uint8Array;
}

export function simulerFeu(etat: Etat, departs: number[], rng: Rng, bilan = bilanVide()): ResultatFeu {
  const { grille, meteo } = etat;
  const n = grille.length;
  const braises: Braise[] = [];

  const f: Front = {
    etat: new Uint8Array(n),
    minuterie: new Float32Array(n),
    subie: new Float32Array(n),
  };
  for (const i of departs) if (grille[i].type !== 'rocher') f.etat[i] = 1;

  const wx = Math.cos(meteo.ventAngle);
  const wy = Math.sin(meteo.ventAngle);
  // Amplificateur de conditions : une année humide et calme donne un feu qui
  // s'éteint tout seul, une année sèche et ventée donne une conflagration.
  const conditions = 0.55 + meteo.secheresse * 0.8 + meteo.ventForce * 0.35;

  // Moyens de lutte, finis et non duplicables (patch 1). Ce qui protège un
  // hameau ne protège pas l'autre : c'est cette rivalité qui fait du
  // durcissement, qui agit partout à la fois, le meilleur investissement.
  let equipesLibres = LUTTE.equipesParTour;
  bilan.equipes = equipesLibres;

  // Une construction n'est confrontée au front qu'**une fois par incendie**.
  // Sans cela, chaque voisine en feu la testait à chaque pas de temps, soit
  // plusieurs dizaines de tirages par passage de front : la destruction
  // devenait quasi certaine, et le front écrasait mécaniquement les braises,
  // contre le critère de fidélité de l'assertion 1 du patch 3.
  const frontTeste = new Uint8Array(n);

  const enVol: { i: number; t: number; x0: number; y0: number }[] = [];

  const perdre = (c: Cellule, cause: CausePerte) => {
    if (c.detruite) return;
    c.detruite = true;
    c.causePerte = cause;
    if (cause === 'braise') {
      bilan.pertesBraise++; etat.cumul.pertesBraise++;
      if (c.conforme) { bilan.braiseConforme++; etat.cumul.braiseConforme++; }
      else { bilan.braiseNonConforme++; etat.cumul.braiseNonConforme++; }
    } else if (cause === 'front') {
      bilan.pertesFront++; etat.cumul.pertesFront++;
      if (c.conforme) { bilan.frontConforme++; etat.cumul.frontConforme++; }
      else { bilan.frontNonConforme++; etat.cumul.frontNonConforme++; }
    } else { bilan.pertesSecoursDebordes++; etat.cumul.pertesSecoursDebordes++; }
  };

  /** Une braise atteint une cellule. Le terrain traversé n'y est pour rien. */
  const poser = (cible: number, x0: number, y0: number) => {
    const c = grille[cible];
    braises.push({ x0, y0, x1: c.x, y1: c.y });
    if (f.etat[cible] !== 0) return;
    if (c.type === 'bati') {
      if (c.detruite) return;
      // Seul le durcissement joue. Ni le périmètre, ni les secours, ni la
      // distance débroussaillée ne protègent d'un brandon posé sur un toit.
      const p = BRAISES.allumageBatiNu +
        (BRAISES.allumageBatiDurci - BRAISES.allumageBatiNu) * c.durcissement;
      if (rng.chance(p)) perdre(c, 'braise');
      return;
    }
    if (rng.chance(inflammabilite(c, meteo) * 0.85)) f.etat[cible] = 1;
  };

  let garde = 0;
  for (;;) {
    if (garde++ > 6000) break;

    // Braises en vol.
    for (let k = enVol.length - 1; k >= 0; k--) {
      enVol[k].t -= 1;
      if (enVol[k].t <= 0) {
        poser(enVol[k].i, enVol[k].x0, enVol[k].y0);
        enVol.splice(k, 1);
      }
    }

    let actif = enVol.length > 0;

    for (let i = 0; i < n; i++) {
      const c = grille[i];

      if (f.etat[i] === 1) {
        // La cellule prend feu : on fige l'intensité subie et la durée.
        f.etat[i] = 2;
        const inte = intensite(c, meteo);
        f.subie[i] = inte;
        f.minuterie[i] = Math.max(1, 3 / vitesse(c));
        if (c.type !== 'bati') {
          bilan.parcourues++;
          etat.cumul.parcourues++;
          if (!c.dejaBrulee) { c.dejaBrulee = true; etat.cumul.parcouruesDistinctes++; }
          c.saisonsDepuisFeu = 0;
        }
        actif = true;

        // Projection de braises (§7.3), à queue longue et indépendante du
        // terrain traversé : c'est ce qui interdit la stratégie de périmètre.
        // Un feu de cime produit une averse, pas un brandon : les cellules les
        // plus intenses émettent plusieurs fois. C'est ce qui fait des braises
        // la première cause de perte chez les constructions conformes, qui sont
        // par ailleurs protégées du front (amendement 2, C).
        const pE = (inte > 0.55 ? BRAISES.emissionCime : BRAISES.emissionBase) * (0.5 + meteo.ventForce);
        const tirages = inte > 0.55 ? BRAISES.tiragesCime : 1;
        for (let k = 0; k < tirages; k++) if (rng.chance(pE)) {
          const longue = rng.chance(BRAISES.partLongue);
          const base = rng.entre(BRAISES.porteeCourte[0], BRAISES.porteeCourte[1]);
          const d = (longue ? base * rng.entre(BRAISES.facteurLong[0], BRAISES.facteurLong[1]) : base) *
            (0.6 + meteo.ventForce);
          const j = longue ? 4 : 2;
          const tx = Math.round(c.x + wx * d + rng.entre(-j, j));
          const ty = Math.round(c.y + wy * d + rng.entre(-j, j));
          if (dans(tx, ty)) {
            enVol.push({ i: idx(tx, ty), t: 3, x0: c.x, y0: c.y });
            bilan.braises++;
          }
        }
        continue;
      }

      if (f.etat[i] !== 2) continue;
      actif = true;
      f.minuterie[i] -= 1;
      if (f.minuterie[i] > 0) {
        // Propagation de proche en proche (§7.2).
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (!dans(c.x + dx, c.y + dy)) continue;
            const jj = idx(c.x + dx, c.y + dy);
            if (f.etat[jj] !== 0) continue;
            const v = grille[jj];
            const align = (dx * wx + dy * wy) / Math.hypot(dx, dy);
            const fVent = Math.max(0.05, 1 + align * meteo.ventForce * 1.5);
            // Le feu monte : la pente de la réceptrice accélère si elle est
            // au-dessus de la source.
            const fPente = 1 + borne((v.pente - c.pente) * 3 + (v.pente > 0 ? v.pente * 0.6 : 0), -0.4, 1.3);

            if (v.type === 'bati') {
              if (v.detruite || frontTeste[jj]) continue;
              frontTeste[jj] = 1;
              tenterFront(v, jj);
              continue;
            }
            const p = 0.26 * conditions * inflammabilite(v, meteo) * vitesse(v) * fVent * fPente;
            if (rng.chance(p)) f.etat[jj] = 1;
          }
        }
      } else {
        f.etat[i] = 3;
      }
    }

    if (!actif) break;
  }

  /**
   * Le front atteint une construction (§7.4, patch 1). Être défendable ne
   * signifie pas être sauvé : la défense est probabiliste, et les équipes sont
   * en nombre fini.
   */
  function tenterFront(v: Cellule, jj: number): void {
    const inte = intensite(v, meteo);

    // Ce que risque la construction par son seul état propre. Le durcissement
    // inclut la zone 0, les cinq premiers mètres minéraux : il retire le
    // combustible au contact autant qu'il ôte prise aux braises. Un front
    // n'allume une maison que s'il trouve de quoi s'accrocher au contact, et
    // c'est le critère de fidélité de l'assertion 1 du patch 3 : on retrouve
    // des constructions détruites dans une végétation restée intacte.
    const auContact = borne(combustibleVoisin(grille, v) * (1 - v.durcissement), 0, 1);
    const pPropre = borne(0.04 + 0.24 * auContact, 0, 0.9) * (1 - 0.7 * v.durcissement);
    const resoudre = (cause: CausePerte) => {
      if (rng.chance(pPropre)) perdre(v, cause);
      else f.etat[jj] = 0;
    };

    if (!estDefendable(grille, v)) {
      // Profondeur traitée insuffisante compte tenu de la pente : les secours
      // ne peuvent pas approcher, quels que soient leurs moyens.
      resoudre('front');
      return;
    }

    bilan.defendables++;
    if (equipesLibres <= 0) {
      // Capacité débordée : la construction est livrée à son seul état propre.
      resoudre('secoursDebordes');
      return;
    }

    equipesLibres--;
    const succes = borne(LUTTE.succesBase - inte * LUTTE.succesParIntensite, 0.1, LUTTE.succesBase);
    if (rng.chance(succes)) { bilan.sauvees++; return; }

    // Les secours sont une couche **supplémentaire**, jamais un substitut :
    // leur échec ne condamne pas la construction, qui reste défendue par son
    // propre état. Sans cette règle, être défendable rendait une maison plus
    // exposée qu'être simplement durcie et ignorée du front, et la stratégie
    // qui finançait le contrôle des OLD y perdait du bâti.
    resoudre('front');
  }

  etat.dernierFeu = bilan;
  // L'intensité subie n'est pas un état de cellule : elle ne survit pas au
  // tour. Elle est rendue au tour appelant, qui la passe à la phase d'après-feu.
  return { bilan, braises, subie: f.subie, touchee: f.etat };
}
