/**
 * Extrait les glyphes du handoff « carte de référence v3 » vers
 * `src/rendu/glyphes.svg`.
 *
 *     node scripts/extraire-glyphes.mjs [--audit]
 *
 * La carte de référence livre des symboles **déjà paramétrables** : la masse de
 * feuillage porte `fill="currentColor"` et reçoit la rampe d'humidité par un
 * `style="color: …"` posé sur le `<use>`. L'extraction est donc une copie
 * conforme, sans réécriture de couleurs.
 *
 * C'est un net progrès sur le premier lot, dont les glyphes étaient figés sur un
 * seul palier et qu'il fallait déparamétrer à la main : les quatre variables CSS
 * (`--veg`, `--veg-clair`, `--veg-sombre`, `--veg-trait`) et les écarts mesurés
 * qui allaient avec n'ont plus lieu d'être. Une seule couleur pilote chaque
 * glyphe, les nuances internes restant littérales dans le dessin.
 *
 * De la v1 à la v3, les seize symboles n'ont pas bougé d'un caractère : la v2 a
 * refait les quatre `<pattern>` de sous-bois, du trait au **semis de points**,
 * et la v3 n'a touché qu'à l'algorithme de placement, pas aux dessins. Le motif ne concurrence plus le linéaire du relief et
 * l'encre de la couche tombe de moitié à information constante ; un disque
 * supporte en outre la réduction, là où un brin devient un point arbitraire.
 *
 * Le lot précédent (`design_handoff_langage_de_paysage/`) reste la charte de
 * référence pour tout ce que la carte ne montre pas ; ses planches ne sont plus
 * la source des assets.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(
  racine,
  'research/simulation/v3/design_handoff_carte_de_reference_v3/Langage de paysage - Carte de reference v3.dc.html',
);
const sortie = join(racine, 'src/rendu/glyphes.svg');
const audit = process.argv.includes('--audit');

const SYMBOLES = [
  'm-chene', 'm-chene-roussi', 'm-souche', 'm-hetre', 'm-pin', 'm-pin3',
  'm-pin-roussi', 'm-pin-mort', 'm-sylv', 'm-garrigue', 'm-pelouse',
  'm-friche', 'm-ripi', 'm-rocher', 'm-bati', 'm-mouton',
];
const MOTIFS = ['m-sb1', 'm-sb2', 'm-sb3', 'm-sb4'];

/** Glyphes dont la masse de feuillage suit la rampe d'humidité (§ 8.1). */
const RAMPES_ATTENDUES = ['m-chene', 'm-hetre', 'm-pin', 'm-pin3', 'm-sylv', 'm-garrigue', 'm-ripi'];

const src = readFileSync(source, 'utf8');

const bloc = (balise, id) => {
  const m = src.match(new RegExp(`<${balise}[^>]*id="${id}"[\\s\\S]*?</${balise}>`));
  if (!m) throw new Error(`${balise} « ${id} » introuvable dans la carte de référence.`);
  return m[0];
};

const morceaux = [];
const journal = [];
for (const id of SYMBOLES) {
  const svg = bloc('symbol', id);
  const teintable = svg.includes('currentColor');
  const vb = svg.match(/viewBox="([^"]+)"/)?.[1];
  const attendu = id === 'm-mouton' ? '0 0 64 40' : '0 0 64 96';
  if (vb !== attendu) throw new Error(`${id} : viewBox « ${vb} », attendu « ${attendu} » (§ 8.1).`);
  if (RAMPES_ATTENDUES.includes(id) && !teintable) {
    throw new Error(`${id} devrait porter currentColor : sans lui, la rampe d'humidité ne s'applique pas.`);
  }
  journal.push({ id, teintable, vb });
  morceaux.push(svg);
}
for (const id of MOTIFS) morceaux.push(bloc('pattern', id));

/**
 * Trois états du bâti que la carte de référence ne livre pas, **dérivés** de
 * `m-bati` plutôt que dessinés à la main : ils restent donc engendrés, et une
 * retouche du bâti dans le handoff les emporte avec elle.
 *
 * - deux paliers de durcissement, la charte de paysage demandant que « le
 *   durcissement épaisse le contour » sans jamais l'avoir été ;
 * - une **ruine**, qui manquait à toutes les chartes : une construction
 *   détruite se rendait debout, indistinguable d'une maison sauvée.
 *
 * La ruine croise les deux familles existantes plutôt que d'en inventer une :
 * la géométrie angulaire du bâti, l'encre sombre des restes d'après-feu
 * (`m-souche`, `m-pin-mort`). Aucune couleur nouvelle n'entre dans la palette.
 */
const batiSrc = bloc('symbol', 'm-bati');
const TRAIT_BATI = 'stroke-width="2.2"';
const traits = batiSrc.split(TRAIT_BATI).length - 1;
if (traits !== 2) {
  throw new Error(
    `m-bati : ${traits} trait(s) à ${TRAIT_BATI}, deux attendus. Le dessin du handoff a changé, ` +
      'les états dérivés (durcissement, ruine) sont à revoir avant de les réengendrer.',
  );
}
const EMPRISE_BATI = 'M14 90 V60 L32 46 L50 60 V90 Z';
if (!batiSrc.includes(EMPRISE_BATI)) {
  throw new Error('m-bati : emprise inattendue, la ruine en dérive et doit être revue.');
}
const ENCRE_RESTES = bloc('symbol', 'm-souche').match(/fill="(oklch\([^)]+\))"/)?.[1];
if (!ENCRE_RESTES) throw new Error('m-souche : encre des restes introuvable, la ruine en dépend.');
const MUR = batiSrc.match(/fill="(oklch\([^)]+\))"/)?.[1];
const TRAIT = batiSrc.match(/stroke="(oklch\([^)]+\))"/)?.[1];
if (!MUR || !TRAIT) throw new Error('m-bati : remplissage ou trait introuvable, la ruine en dérive.');

const derive = (id, corps) => `<symbol id="${id}" viewBox="0 0 64 96">\n${corps}\n      </symbol>`;

// Durcissement : même dessin, contour épaissi. Deux paliers, parce que le
// modèle n'en produit que deux (0,5 par le programme d'aide, 1 par le geste).
morceaux.push(
  batiSrc.replace('id="m-bati"', 'id="m-bati-durci-partiel"').replaceAll(TRAIT_BATI, 'stroke-width="3.6"'),
);
morceaux.push(
  batiSrc.replace('id="m-bati"', 'id="m-bati-durci"').replaceAll(TRAIT_BATI, 'stroke-width="5"'),
);

// Ruine : la même emprise, toiture emportée, deux pans de mur restés debout.
//
// Elle garde le remplissage et le trait du bâti, et **rien que des angles
// droits** : la famille anguleuse est la seule du langage de paysage, et une
// dent de scie l'aurait quittée pour se lire comme un buisson sombre. Ce qui
// dit la perte, c'est le vide là où était le toit, plus les gravats à l'encre
// des restes d'après-feu.
morceaux.push(
  derive(
    'm-bati-ruine',
    [
      `        <path d="M14 90 V62 H26 V72 H32 V90 Z" fill="${MUR}" stroke="${TRAIT}" stroke-width="2.2" stroke-linejoin="miter" />`,
      `        <path d="M40 90 V70 H50 V90 Z" fill="${MUR}" stroke="${TRAIT}" stroke-width="2.2" stroke-linejoin="miter" />`,
      `        <rect x="31" y="83" width="10" height="7" fill="${ENCRE_RESTES}" opacity="0.55" />`,
      `        <path d="M11 90 H53" stroke="${ENCRE_RESTES}" stroke-width="2.6" stroke-linecap="butt" fill="none" />`,
    ].join('\n'),
  ),
);
journal.push(
  { id: 'm-bati-durci-partiel', teintable: false, vb: '0 0 64 96' },
  { id: 'm-bati-durci', teintable: false, vb: '0 0 64 96' },
  { id: 'm-bati-ruine', teintable: false, vb: '0 0 64 96' },
);

const entete = `<!--
  Sprite de glyphes du simulateur « Vivre avec le feu ».

  ENGENDRÉ par scripts/extraire-glyphes.mjs depuis la carte de référence
  (research/simulation/v3/design_handoff_carte_de_reference_v3/). Ne pas modifier à
  la main : relancer le script après toute mise à jour du handoff.

  Les identifiants sont ceux du handoff, à la lettre, pour que le rapprochement
  avec la documentation de design reste immédiat.

  Teinte : la masse de feuillage porte \`fill="currentColor"\` et reçoit la rampe
  d'humidité par un \`style="color: …"\` posé sur le \`<use>\` (src/rendu/palette.ts).
  Les nuances internes et les marqueurs ■/○ des pins restent littéraux : ils
  identifient l'essence et ne suivent pas l'humidité.

  MASQUAGE : par la taille, jamais par \`display:none\`. Un \`<use>\` va chercher
  un symbole dans un sprite masqué ainsi ; un \`fill="url(#motif)"\` n'y trouve
  rien, et les motifs de sous-bois disparaissent sans erreur ni avertissement.
  Vérifié au rendu : motif absent avec \`display:none\`, présent avec la taille
  nulle, symboles servis dans les deux cas.
-->
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
`;

mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, `${entete}${morceaux.join('\n')}\n  </defs>\n</svg>\n`);

console.log(
  `${SYMBOLES.length} symboles du handoff, 3 états du bâti dérivés et ${MOTIFS.length} motifs ` +
    'écrits dans src/rendu/glyphes.svg',
);
console.log(`${journal.filter((j) => j.teintable).length} glyphes teintables par la rampe d'humidité`);
if (audit) {
  console.log('\nsymbole            viewBox        teinte');
  for (const j of journal) {
    console.log(`${j.id.padEnd(18)} ${j.vb.padEnd(14)} ${j.teintable ? 'currentColor' : 'littérale'}`);
  }
}
