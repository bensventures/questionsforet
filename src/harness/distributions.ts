import { creerRng } from '../model/rng';
import { creerEtat } from '../model/terrain';
import { avancer } from '../model/avancer';
import { humiditeLocale } from '../model/derive';
import { TYPES, DENSITE, SOUS_BOIS, LUTTE, HORIZON } from '../model/params';
import { CINQ } from './strategies';
import type { Cellule, Etat } from '../model/types';

/**
 * Distribution réelle des variables que la carte doit rendre visibles.
 *
 *     node scripts/... (voir README du harnais) ou via esbuild
 *
 * Pourquoi ce relevé. Le langage de paysage découpe l'humidité en 4 paliers, la
 * densité en 4, le sous-bois en 5, la pente en 4, mais ne dit pas où passent les
 * bornes. Les poser au jugé revient à parier sur la distribution : des bornes
 * mal placées laissent deux paliers vides sur quatre, et la carte paraît plate
 * quelles que soient les couleurs. On mesure donc avant de trancher.
 *
 * Le relevé porte sur **toutes les cellules à chaque tour**, et non sur l'état
 * final : le joueur regarde la carte pendant toute la partie, pas seulement à la
 * fin. Il pool les cinq stratégies du §12, pour que les bornes ne soient pas
 * ajustées à un seul style de jeu.
 */

const PARTIES = Number(process.env.PARTIES ?? 10);

/** Histogramme à pas fixe, pour ne pas garder des millions d'échantillons. */
class Histo {
  private readonly bacs: number[];
  private n = 0;
  constructor(readonly min: number, readonly max: number, readonly pas: number) {
    this.bacs = new Array(Math.ceil((max - min) / pas) + 1).fill(0);
  }
  ajouter(v: number): void {
    const i = Math.min(this.bacs.length - 1, Math.max(0, Math.floor((v - this.min) / this.pas)));
    this.bacs[i]++;
    this.n++;
  }
  get total(): number {
    return this.n;
  }
  /** Valeur sous laquelle se trouve `p` (0–1) de la population. */
  quantile(p: number): number {
    let cumul = 0;
    const cible = this.n * p;
    for (let i = 0; i < this.bacs.length; i++) {
      cumul += this.bacs[i];
      if (cumul >= cible) return this.min + i * this.pas;
    }
    return this.max;
  }
  /** Part de la population sous `seuil`. */
  partSous(seuil: number): number {
    let cumul = 0;
    for (let i = 0; i < this.bacs.length; i++) {
      if (this.min + i * this.pas >= seuil) break;
      cumul += this.bacs[i];
    }
    return this.n ? cumul / this.n : 0;
  }
}

const humidite = new Histo(0, 1, 0.01);
const densite = new Histo(0, 1200, 10);
const sousBois = new Histo(0, 1, 0.01);
const pente = new Histo(0, 1, 0.01);

function releverTour(etat: Etat): void {
  for (const c of etat.grille) {
    if (c.type === 'bati' || c.type === 'rocher') continue;
    humidite.ajouter(humiditeLocale(c, etat.meteo));
    sousBois.ajouter(c.sousBois);
    // `densite` n'a de sens que sous un étage arboré (§4.2 du brief).
    if (TYPES[c.type].arbore) densite.ajouter(c.densite);
  }
}

for (const strat of CINQ) {
  for (let k = 0; k < PARTIES; k++) {
    const graine = 1000 + k * 7919;
    const rng = creerRng(graine);
    const etat = creerEtat(graine, rng, HORIZON.long);
    // La pente est statique : un relevé par partie suffit, sinon elle serait
    // comptée quarante fois et pèserait autant que les variables dynamiques.
    if (strat === CINQ[0]) for (const c of etat.grille) pente.ajouter(c.pente);
    for (;;) {
      releverTour(etat);
      const t = avancer(etat, strat.decider(etat, etat.tour), rng);
      if (t.termine) break;
    }
  }
}

const pc = (x: number) => `${(x * 100).toFixed(1)} %`;

function profil(nom: string, h: Histo, unite = ''): void {
  const q = [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => h.quantile(p).toFixed(2)).join('  ');
  console.log(`\n${nom} — ${h.total.toLocaleString('fr-FR')} relevés${unite}`);
  console.log(`  quantiles 5/25/50/75/95 : ${q}`);
}

/** Part de la population dans chaque palier défini par des bornes. */
function paliers(h: Histo, bornes: number[]): string {
  const parts: string[] = [];
  let precedent = 0;
  for (const b of [...bornes, Infinity]) {
    const sous = b === Infinity ? 1 : h.partSous(b);
    parts.push(pc(sous - precedent));
    precedent = sous;
  }
  return parts.join(' · ');
}

console.log(`${PARTIES} parties × ${CINQ.length} stratégies × ${HORIZON.long} tours`);

profil('HUMIDITÉ locale (0–1)', humidite);
console.log('  aucun seuil mécanique dans le modèle : les bornes sont libres,');
console.log('  donc choisies pour que les quatre paliers servent.');
for (const b of [
  [0.25, 0.5, 0.75],
  [0.1, 0.22, 0.32],
  [0.1, 0.2, 0.3],
]) {
  console.log(`  bornes ${JSON.stringify(b).padEnd(22)} → ${paliers(humidite, b)}`);
}

profil('DENSITÉ de tiges (tiges/ha, peuplements arborés)', densite);
console.log(`  seuils du modèle : éclaircie ${DENSITE.apresEclaircie}, sévérité ${DENSITE.seuil}, plafond ${DENSITE.plafond}`);
for (const b of [
  [DENSITE.apresEclaircie, DENSITE.seuil, 700],
  [DENSITE.seuil, 700, 950],
  [DENSITE.seuil, 650, 900],
]) {
  console.log(`  bornes ${JSON.stringify(b).padEnd(22)} → ${paliers(densite, b)}`);
}

profil('SOUS-BOIS (0–1)', sousBois);
console.log(`  seuils du modèle : traité ${SOUS_BOIS.seuilTraite}, pâturé ${SOUS_BOIS.niveauPature}`);
for (const b of [
  [0.02, SOUS_BOIS.niveauPature, SOUS_BOIS.seuilTraite, 0.5],
  [0.001, SOUS_BOIS.seuilTraite, 0.55, 0.9],
  [0.001, SOUS_BOIS.seuilTraite, 0.6, 0.95],
]) {
  console.log(`  bornes ${JSON.stringify(b).padEnd(22)} → ${paliers(sousBois, b)}`);
}

profil('PENTE (0–1, statique)', pente);
console.log(`  seuils du modèle : lutte gênée ${LUTTE.penteMoyenne}, lutte impossible ${LUTTE.penteImpossible}`);
for (const b of [
  [0.2, LUTTE.penteMoyenne, LUTTE.penteImpossible],
  [0.2, LUTTE.penteMoyenne, 0.55],
  [0.15, LUTTE.penteMoyenne, 0.5],
]) {
  console.log(`  bornes ${JSON.stringify(b).padEnd(22)} → ${paliers(pente, b)}`);
}