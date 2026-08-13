/**
 * Engendre `research/simulation/v3/banc-essai.html` : un banc d'essai autonome
 * du moteur de rendu, à ouvrir directement dans un navigateur.
 *
 *     node scripts/banc-essai.mjs
 *
 * La planche de vérification est un instantané : elle prouve qu'une carte se
 * compose, pas qu'elle se lit. Juger un rendu demande de le faire bouger —
 * changer de graine pour voir d'autres reliefs, avancer d'un tour pour voir le
 * paysage dériver, isoler une couche pour savoir laquelle gêne l'autre.
 *
 * Le modèle et le rendu sont empaquetés dans la page : aucun serveur, aucun
 * réseau, un seul fichier. Le noyau tournant déjà sans navigateur, il tourne
 * aussi dedans sans rien changer.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

const ENTREE = `
import { creerRng } from './src/model/rng';
import { creerEtat } from './src/model/terrain';
import { avancer } from './src/model/avancer';
import { rendreCarte } from './src/rendu/carte';
import { composerCellule } from './src/rendu/cellule';
import { palierDensite } from './src/rendu/palette';
import { CINQ, durcissementSeul } from './src/harness/strategies';

const STRATS = [...CINQ, durcissementSeul];
export const noms = STRATS.map((s) => s.nom);

/** Rejoue une partie depuis sa graine : déterministe, donc rejouable à volonté. */
export function jouer(graine, nomStrat, tours) {
  const strat = STRATS.find((s) => s.nom === nomStrat) ?? STRATS[0];
  const rng = creerRng(graine);
  const etat = creerEtat(graine, rng, 40);
  for (let t = 1; t < tours; t++) {
    const fin = avancer(etat, strat.decider(etat, etat.tour), rng);
    if (fin.termine) break;
  }
  return etat;
}

export function rendre(etat, options) {
  return rendreCarte(etat, options);
}

/** De quoi lire ce qu'on voit : la carte doit pouvoir être confrontée aux chiffres. */
export function releve(etat, f) {
  const dans = etat.grille.filter(
    (c) => c.x >= f.x0 && c.x < f.x0 + f.largeur && c.y >= f.y0 && c.y < f.y0 + f.hauteur,
  );
  const compte = (fn) => {
    const o = {};
    for (const c of dans) { const k = fn(c); o[k] = (o[k] ?? 0) + 1; }
    return Object.entries(o).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  };
  return {
    parcelles: dans.length,
    types: compte((c) => c.type),
    sousBois: compte((c) => composerCellule(c, etat.meteo).sousBois),
    densite: compte((c) => palierDensite(c.densite)),
    humidite: compte((c) => composerCellule(c, etat.meteo).humidite),
    feu: dans.filter((c) => c.saisonsDepuisFeu === 0).length,
    secheresse: etat.meteo.secheresse,
  };
}
`;

const paquet = await build({
  stdin: { contents: ENTREE, resolveDir: racine, loader: 'ts' },
  bundle: true,
  format: 'iife',
  globalName: 'BANC',
  write: false,
  logLevel: 'error',
  resolveExtensions: ['.ts', '.js'],
});

const sprite = readFileSync(join(racine, 'src/rendu/glyphes.svg'), 'utf8');

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Banc d'essai — moteur de rendu</title>
<style>
  :root { color-scheme: light }
  body { margin:0; background:oklch(0.93 0.012 95); color:oklch(0.26 0.02 130);
         font:15px/1.5 ui-sans-serif, system-ui, sans-serif }
  header { padding:1rem 1.5rem .6rem; border-bottom:1px solid oklch(0.85 0.02 100);
           background:oklch(0.975 0.012 92); position:sticky; top:0; z-index:5 }
  h1 { font:600 1.05rem/1.2 ui-serif, Georgia, serif; margin:0 0 .7rem }
  .commandes { display:flex; flex-wrap:wrap; gap:.5rem 1.4rem; align-items:center;
               font-family:ui-monospace, monospace; font-size:.78rem }
  label { display:flex; gap:.4rem; align-items:center; white-space:nowrap;
          color:oklch(0.40 0.02 130) }
  input[type=number] { width:5.5rem } input[type=range] { width:9rem }
  select, input, button { font:inherit; font-family:ui-monospace, monospace;
          border:1px solid oklch(0.80 0.02 100); border-radius:4px; padding:.15rem .3rem;
          background:oklch(0.99 0.005 95) }
  button { cursor:pointer; padding:.2rem .6rem } button:hover { background:oklch(0.95 0.02 95) }
  .valeur { color:oklch(0.26 0.02 130); font-weight:600; min-width:2.2rem; display:inline-block }
  main { display:flex; gap:1rem; align-items:flex-start; padding:1rem 1.5rem 3rem }
  #carte { overflow:auto; border:1px solid oklch(0.85 0.02 100); border-radius:6px;
           background:oklch(0.86 0.035 82); max-height:82vh; flex:1 }
  #carte svg { display:block; max-width:none }
  aside { width:17rem; flex:none; font-family:ui-monospace, monospace; font-size:.74rem;
          color:oklch(0.40 0.02 130) }
  aside h2 { font-size:.72rem; text-transform:uppercase; letter-spacing:.1em;
             color:oklch(0.55 0.02 120); margin:1.2rem 0 .3rem; font-weight:500 }
  aside table { border-collapse:collapse; width:100% }
  aside td { padding:.05rem 0 } aside td:last-child { text-align:right;
             color:oklch(0.26 0.02 130) }
  .note { max-width:34rem; padding:0 1.5rem; color:oklch(0.45 0.02 130); font-size:.82rem }
</style></head>
<body>
${sprite}
<header>
  <h1>Banc d'essai du moteur de rendu</h1>
  <div class="commandes">
    <label>graine <input id="graine" type="number" value="1000" step="1"></label>
    <label>stratégie <select id="strat"></select></label>
    <label>tour <input id="tour" type="range" min="1" max="40" value="18">
      <span class="valeur" id="tourV">18</span></label>
    <button id="prec">◀</button><button id="suiv">▶</button>
    <label>x <input id="x0" type="range" min="0" max="26" value="0">
      <span class="valeur" id="x0V">0</span></label>
    <label>y <input id="y0" type="range" min="0" max="17" value="0">
      <span class="valeur" id="y0V">0</span></label>
    <label>fenêtre <select id="taille">
      <option value="8x5">8 × 5</option>
      <option value="14x9" selected>14 × 9</option>
      <option value="20x13">20 × 13</option>
      <option value="40x26">tout le massif</option>
    </select></label>
    <label>zoom <select id="zoom">
      <option value="0.25">25 %</option><option value="0.5">50 %</option>
      <option value="1" selected>100 %</option><option value="2">200 %</option>
    </select></label>
    <label><input id="semis" type="checkbox" checked> semer les couvertures basses</label>
    <label><input id="tapis" type="checkbox" checked> sous-bois au nombre de touffes</label>
    <label><input id="relief" type="checkbox" checked> relief</label>
    <label><input id="structure" type="checkbox" checked> structure</label>
    <label><input id="etiquettes" type="checkbox" checked> étiquettes</label>
  </div>
</header>
<p class="note">La carte de référence est calibrée pour une cellule de 180 px : à 100 % le semis
de sous-bois et les paliers de densité se lisent, en dessous ils s'effacent. Le tour se rejoue
depuis la graine à chaque changement, donc deux affichages identiques donnent la même image.</p>
<main>
  <div id="carte"></div>
  <aside id="releve"></aside>
</main>
<script>${paquet.outputFiles[0].text}</script>
<script>
  const $ = (id) => document.getElementById(id);
  const strat = $('strat');
  for (const n of BANC.noms) strat.add(new Option(n, n));
  strat.value = 'mixte compétente';

  function dessiner() {
    const [lw, lh] = $('taille').value.split('x').map(Number);
    $('x0').max = Math.max(0, 40 - lw);
    $('y0').max = Math.max(0, 26 - lh);
    const f = {
      x0: Math.min(+$('x0').value, 40 - lw),
      y0: Math.min(+$('y0').value, 26 - lh),
      largeur: lw,
      hauteur: lh,
    };
    for (const id of ['tour', 'x0', 'y0']) $(id + 'V').textContent = $(id).value;

    const t0 = performance.now();
    const etat = BANC.jouer(+$('graine').value, strat.value, +$('tour').value);
    const t1 = performance.now();
    const r = BANC.rendre(etat, {
      fenetre: f,
      semisNonForestier: $('semis').checked,
      sousBoisAuGlyphe: $('tapis').checked,
      relief: $('relief').checked,
      structure: $('structure').checked,
      etiquettes: $('etiquettes').checked,
    });
    const t2 = performance.now();

    const z = +$('zoom').value;
    const [, , w, h] = r.viewBox.split(' ').map(Number);
    $('carte').innerHTML =
      '<svg viewBox="' + r.viewBox + '" width="' + Math.round(w * z) + '" height="' +
      Math.round(h * z) + '">' + r.contenu + '</svg>';

    const rel = BANC.releve(etat, f);
    const tableau = (titre, entrees) =>
      '<h2>' + titre + '</h2><table>' +
      entrees.map(([k, v]) => '<tr><td>' + k + '</td><td>' + v + '</td></tr>').join('') +
      '</table>';
    $('releve').innerHTML =
      tableau('fenêtre', [
        ['parcelles', rel.parcelles],
        ['sécheresse', rel.secheresse.toFixed(2)],
        ['brûlé ce tour', rel.feu],
        ['partie', (t1 - t0).toFixed(0) + ' ms'],
        ['rendu', (t2 - t1).toFixed(0) + ' ms'],
      ]) +
      tableau('couverture', rel.types) +
      tableau('sous-bois', rel.sousBois) +
      tableau('densité', rel.densite) +
      tableau('humidité', rel.humidite);
  }

  for (const id of ['graine','strat','tour','x0','y0','taille','zoom','semis','tapis','relief','structure','etiquettes']) {
    $(id).addEventListener('input', dessiner);
  }
  $('prec').onclick = () => { $('tour').value = Math.max(1, +$('tour').value - 1); dessiner(); };
  $('suiv').onclick = () => { $('tour').value = Math.min(40, +$('tour').value + 1); dessiner(); };
  dessiner();
</script>
</body></html>
`;

const sortie = join(racine, 'research/simulation/v3/banc-essai.html');
writeFileSync(sortie, html);
console.log(`banc écrit : ${sortie.replace(racine + '/', '')} (${(html.length / 1024).toFixed(0)} Ko)`);
