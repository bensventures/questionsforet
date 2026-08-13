/**
 * Engendre une planche de vérification du paramétrage :
 * `research/simulation/v3/verification-palette.html`, à ouvrir dans un
 * navigateur.
 *
 *     node scripts/planche-verification.mjs
 *
 * Elle sert à un contrôle que ni les tests ni la lecture du code ne peuvent
 * faire : voir si les glyphes, une fois teintés par la rampe d'humidité,
 * tiennent encore comme dessin. À relancer après toute modification de la
 * palette ou des planches.
 *
 * esbuild (déjà présent via Astro) sert à charger `palette.ts` sans étape de
 * compilation séparée.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

const paquet = await build({
  entryPoints: [join(racine, 'src/rendu/palette.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'error',
});
const palette = await import(
  `data:text/javascript;base64,${Buffer.from(paquet.outputFiles[0].text).toString('base64')}`
);
const { couleurVegetation, glyphe, largeurGlyphe, FEU } = palette;

const sprite = readFileSync(join(racine, 'src/rendu/glyphes.svg'), 'utf8');

const ESSENCES = [
  ['chene', 'Chêne'], ['hetre', 'Hêtre'], ['pinNoir', 'Pin noir'],
  ['pinSylvestre', 'Pin sylvestre'], ['garrigue', 'Garrigue'], ['pelouse', 'Pelouse'],
  ['friche', 'Friche'], ['ripisylve', 'Ripisylve'], ['rocher', 'Rocher'], ['bati', 'Bâti'],
];

const vignette = (type, palier, etat = 'sain', age = 2) => {
  const id = glyphe(type, age, etat);
  if (!id) return `<div class="vide">glyphe<br>retiré</div>`;
  const couleur = couleurVegetation(type, palier);
  return `<svg viewBox="0 0 64 96"${couleur ? ` style="color:${couleur}"` : ''}><use href="#${id}"/></svg>`;
};

const lignes = ESSENCES.map(
  ([type, nom]) => `
      <tr>
        <th>${nom}</th>
        ${[1, 2, 3, 4].map((p) => `<td>${vignette(type, p)}</td>`).join('')}
        <td class="sep">${vignette(type, 3, 'roussi')}</td>
      </tr>`,
).join('');

const ages = [1, 2, 3]
  .map(
    (a) => `<figure>${vignette('pinNoir', 3, 'sain', a)}<figcaption>âge ${a} · ${largeurGlyphe('pinNoir', a)} px</figcaption></figure>`,
  )
  .join('');

const etats = [
  ['chêne roussi', 'chene', 'roussi'], ['chêne consommé', 'chene', 'consomme'],
  ['pin roussi', 'pinNoir', 'roussi'], ['pin consommé', 'pinNoir', 'consomme'],
  ['garrigue consommée', 'garrigue', 'consomme'],
]
  .map(([nom, type, etat]) => `<figure>${vignette(type, 3, etat)}<figcaption>${nom}</figcaption></figure>`)
  .join('');

const motifs = ['m-sb1', 'm-sb2', 'm-sb3', 'm-sb4']
  .map(
    (id, i) =>
      `<figure><svg viewBox="0 0 64 64"><rect width="64" height="64" fill="oklch(0.86 0.035 82)"/><rect width="64" height="64" fill="url(#${id})"/></svg><figcaption>SB ${i + 1}</figcaption></figure>`,
  )
  .join('');

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Vérification du paramétrage des glyphes</title>
<style>
  :root { color-scheme: light }
  body { margin:0; padding:2.5rem; background:oklch(0.975 0.012 92); color:oklch(0.26 0.02 130);
         font:16px/1.6 ui-serif, Georgia, serif }
  main { max-width:60rem; margin:0 auto }
  h1 { font-size:1.6rem; margin:0 0 .3rem } h2 { font-size:1.05rem; margin:2.5rem 0 .8rem;
       text-transform:uppercase; letter-spacing:.08em; font-family:ui-monospace, monospace }
  p { max-width:46rem; color:oklch(0.40 0.02 130) }
  table { border-collapse:collapse } th { font-weight:400; text-align:right; padding-right:1rem;
       font-size:.9rem; color:oklch(0.40 0.02 130) }
  td { padding:.25rem } td.sep { border-left:1px dashed oklch(0.85 0.02 100); padding-left:1rem }
  thead td { font-family:ui-monospace, monospace; font-size:.75rem; text-align:center;
       color:oklch(0.55 0.02 120) }
  svg { width:64px; height:96px; display:block }
  .vide { width:64px; height:96px; display:grid; place-items:center; font:400 .7rem/1.2 ui-monospace,
       monospace; color:oklch(0.62 0.02 100); border:1px dashed oklch(0.85 0.02 100); text-align:center }
  .galerie { display:flex; gap:1.5rem; flex-wrap:wrap }
  figure { margin:0; text-align:center } figcaption { font:.75rem ui-monospace, monospace;
       color:oklch(0.55 0.02 120); margin-top:.4rem }
  .galerie svg { width:80px; height:120px } .galerie figure:has(rect) svg { height:80px }
</style></head>
<body>${sprite}
<main>
  <h1>Vérification du paramétrage des glyphes</h1>
  <p>Engendrée par <code>scripts/planche-verification.mjs</code>. Chaque glyphe est le symbole
  extrait de la carte de référence, teinté au rendu par un <code>color</code> posé sur le
  <code>&lt;use&gt;</code>. La colonne isolée montre le houppier roussi : silhouette conservée,
  feuillage passé dans la réserve chaude.</p>

  <h2>Essence × palier d'humidité</h2>
  <table>
    <thead><tr><td></td><td>H1 sec</td><td>H2</td><td>H3</td><td>H4 frais</td><td class="sep">roussi</td></tr></thead>
    <tbody>${lignes}</tbody>
  </table>

  <h2>Pin noir · variantes d'âge</h2>
  <p>Seule essence dont le tracé change avec l'âge : le houppier se comprime, le fût nu s'allonge.</p>
  <div class="galerie">${ages}</div>

  <h2>États à silhouette propre</h2>
  <p>Le houppier a disparu : ce sont des glyphes à part entière, pas des recolorations.</p>
  <div class="galerie">${etats}</div>

  <h2>Motifs de sous-bois</h2>
  <p>Non paramétrés : la teinte de chaque palier est l'information.</p>
  <div class="galerie">${motifs}</div>
</main></body></html>
`;

const sortie = join(racine, 'research/simulation/v3/verification-palette.html');
writeFileSync(sortie, html);
console.log(`planche écrite : ${sortie.replace(racine + '/', '')}`);