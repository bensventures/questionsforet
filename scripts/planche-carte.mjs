/**
 * Rend une vraie partie avec le moteur de rendu et écrit
 * `research/simulation/v3/verification-carte.html`.
 *
 *     node scripts/planche-carte.mjs
 *
 * Trois instantanés d'une même partie, joués par la stratégie compétente : le
 * paysage de départ, un état intermédiaire, et l'après-feu. C'est la seule
 * épreuve qui vaille pour une carte : des états fabriqués à la main ne
 * produisent jamais les combinaisons que la simulation produit.
 *
 * Le script vérifie aussi ce qui se contrôle sans regarder : déterminisme du
 * rendu, glyphes tous présents dans le sprite, aucune valeur `undefined` dans
 * la sortie.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

async function charger(entree) {
  const paquet = await build({
    entryPoints: [join(racine, entree)],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'error',
    resolveExtensions: ['.ts', '.js'],
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(paquet.outputFiles[0].text).toString('base64')}`
  );
}

const [rendu, cartouche, modele, terrain, avancer, strategies] = await Promise.all([
  charger('src/rendu/cellule.ts'),
  charger('src/rendu/carte.ts'),
  charger('src/model/rng.ts'),
  charger('src/model/terrain.ts'),
  charger('src/model/avancer.ts'),
  charger('src/harness/strategies.ts'),
]);

const GRAINE = 1000;
const rng = modele.creerRng(GRAINE);
const etat = terrain.creerEtat(GRAINE, rng, 40);
const strat = strategies.mixteCompetente;

const instantanes = [];
// Le départ, le plus gros incendie de la partie, et l'état final. Le tour de
// feu est choisi par la partie et non fixé d'avance : sinon la couche du front
// actif n'est jamais exercée, et c'est précisément elle qu'il faut voir.
let tourDuFeu = -1;
{
  const rngSonde = modele.creerRng(GRAINE);
  const sonde = terrain.creerEtat(GRAINE, rngSonde, 40);
  let pire = 0;
  for (;;) {
    // `avancer` incrémente le tour en fin de course : le tour joué est celui
    // relevé avant l'appel, sinon on cible le tour suivant l'incendie, où la
    // trace a déjà vieilli d'un cran et où le front est vide.
    const joue = sonde.tour;
    const t = avancer.avancer(sonde, strat.decider(sonde, sonde.tour), rngSonde);
    const touchees = sonde.grille.filter((c) => c.saisonsDepuisFeu === 0).length;
    // Le pire feu **strictement intermédiaire** : le tour 1 n'a pas d'histoire
    // et le tour 40 est déjà capturé comme état final. Sans cette borne, une
    // partie dont le plus gros incendie tombe au dernier tour ne produit que
    // deux instantanés, et la planche perd son état intermédiaire.
    if (joue > 1 && joue < 40 && touchees > pire) { pire = touchees; tourDuFeu = joue; }
    if (t.termine) break;
  }
}
if (tourDuFeu < 0) tourDuFeu = 20; // partie sans aucun feu intermédiaire
// Le tour de feu se relève **après** son incendie : capturé avant, on montrerait
// le paysage intact et la couche du front resterait vide.
const CIBLES = [...new Set([1, tourDuFeu, 40])].sort((a, b) => a - b);

function capturer(tour) {
  if (!CIBLES.includes(tour)) return;
  const grille = etat.grille.map((c) => ({ ...c }));
  instantanes.push({
    tour,
    meteo: { ...etat.meteo },
    grille,
    brulees: grille.filter((c) => c.saisonsDepuisFeu < 3).length,
    front: grille.filter((c) => c.saisonsDepuisFeu === 0).length,
    // Un état figé, suffisant pour la couche carte.
    // Les secteurs sont figés pour la partie : on les emporte tels quels, le
    // calque décision en a besoin et ils ne changent pas d'un tour à l'autre.
    etat: { largeur: etat.largeur, hauteur: etat.hauteur, meteo: { ...etat.meteo }, grille, secteurs: etat.secteurs },
  });
}

capturer(1); // le paysage de départ, avant tout tour joué
for (;;) {
  const joue = etat.tour;
  const t = avancer.avancer(etat, strat.decider(etat, etat.tour), rng);
  if (joue !== 1) capturer(joue);
  if (t.termine) break;
}

const sprite = readFileSync(join(racine, 'src/rendu/glyphes.svg'), 'utf8');
const idsSprite = new Set(
  [...sprite.matchAll(/<(?:symbol|pattern)[^>]*id="([^"]+)"/g)].map((m) => m[1]),
);

const { largeur, hauteur } = etat;

// Fenêtre centrée sur le village : c'est là que se joue l'essentiel, et une
// vue de travail montre une poignée de parcelles, pas le massif entier.
const village = instantanes[0].grille.find((c) => c.type === 'bati') ?? { x: 12, y: 12 };
const FEN = {
  x0: Math.max(0, Math.min(largeur - 14, village.x - 7)),
  y0: Math.max(0, Math.min(hauteur - 9, village.y - 4)),
  w: 14,
  h: 9,
};

// ---- contrôles ------------------------------------------------------------
const dernier = instantanes[instantanes.length - 1];
// Les contrôles portent sur la **vue de travail** : c'est la seule où tout le
// vocabulaire est actif. Les mener à l'échelle par défaut ne vérifierait que
// des aplats de couleur, donc rien.
const TRAVAIL = {};
const rendu1 = cartouche.rendreCarte(dernier.etat, TRAVAIL).contenu;
const rendu2 = cartouche.rendreCarte(dernier.etat, TRAVAIL).contenu;
const refs = [...rendu1.matchAll(/href="#([^"]+)"|url\(#([^)]+)\)/g)].map((m) => m[1] ?? m[2]);
const manquants = [...new Set(refs)].filter((id) => !idsSprite.has(id));

// Toute couverture présente sur la carte doit être dessinée. C'est le contrôle
// qui a rattrapé le choix d'échelle fait par cellule : les jeunes peuplements
// et toutes les couvertures non forestières basculaient seuls en aplat pendant
// que leurs voisines gardaient leurs glyphes.
const sansGlyphe = [...new Set(dernier.grille.map((c) => c.type))].filter((t) => {
  const cellules = dernier.grille.filter((c) => c.type === t && rendu.etatFeuDe(c) === 'sain');
  return cellules.length > 0 && !cellules.some((c) => rendu.composerCellule(c, dernier.meteo).glyphes.length);
});

const controles = [
  ['rendu déterministe (deux appels identiques)', rendu1 === rendu2],
  ['aucun « undefined » dans la sortie', !rendu1.includes('undefined')],
  ['aucun « NaN » dans la sortie', !rendu1.includes('NaN')],
  [`tous les glyphes référencés existent (${new Set(refs).size} distincts)`, manquants.length === 0],
  [`toute couverture présente est dessinée${sansGlyphe.length ? ` — sans glyphe : ${sansGlyphe}` : ''}`, sansGlyphe.length === 0],
];
// ---- couche carte ---------------------------------------------------------
const pleine = cartouche.rendreCarte(dernier.etat, TRAVAIL);
const fenetree = cartouche.rendreCarte(dernier.etat, { fenetre: { x0: FEN.x0, y0: FEN.y0, largeur: FEN.w, hauteur: FEN.h } });
const ordre = ['couche-sol', 'couche-relief', 'couche-sous-bois', 'couche-gestion', 'couche-glyphes', 'couche-feu']
  .map((c) => pleine.contenu.indexOf(c));

// Un tour où le feu est passé : sans lui, la couche front ne prouve rien.
const avecFeu = instantanes.find((s) => s.front > 0);
const rendufeu = avecFeu ? cartouche.rendreCarte(avecFeu.etat, TRAVAIL).contenu : '';

controles.push(
  ['couches empilées dans l’ordre du § 4.1', ordre.every((v, i) => v >= 0 && (i === 0 || v > ordre[i - 1]))],
  ['le relief est tracé sous les glyphes', ordre[1] < ordre[4]],
  ['talweg et crête présents', pleine.contenu.includes('0.52 0.09 220') && pleine.contenu.includes('stroke-dasharray="13 7"')],
  ['cotes et lignes nommées', pleine.contenu.includes('TALWEG') && /<text/.test(pleine.contenu)],
  [
    `cadrage : ${(fenetree.contenu.length / 1024).toFixed(0)} Ko pour ${FEN.w}×${FEN.h} contre ${(pleine.contenu.length / 1024).toFixed(0)} Ko pour la carte entière`,
    fenetree.contenu.length < pleine.contenu.length / 5,
  ],
  [
    avecFeu ? `front actif au tour ${avecFeu.tour} (${avecFeu.front} parcelles)` : 'aucun tour avec front actif dans les instantanés',
    avecFeu ? rendufeu.includes('0.72 0.19 48') : false,
  ],
);

for (const [libelle, ok] of controles) console.log(`  ${ok ? '✓' : '✗'} ${libelle}`);
if (manquants.length) console.log('    manquants :', manquants);

const typesVus = new Set(dernier.grille.map((c) => c.type));
console.log(`  · types rencontrés : ${[...typesVus].sort().join(', ')}`);
console.log(`  · ${dernier.grille.length} cellules rendues, ${(rendu1.length / 1024).toFixed(0)} Ko de SVG`);

// ---- planche --------------------------------------------------------------
const COTE = rendu.S;

// La carte de référence est calibrée pour une cellule de 180 px : disques de
// sous-bois de 0,85 à 2 unités de rayon, glyphes de 62 à 108. Réduite pour
// tenir dans la page, elle perd d'abord le sous-bois (un disque de rayon 2
// tombe à 1,6 px à 40 %), puis la lisibilité des paliers de densité. La planche
// rend donc à l'échelle native et défile.
const carte = (snap, opts = {}, fen = null, zoom = 1) => {
  const f = fen
    ? { x0: fen.x0, y0: fen.y0, largeur: fen.w, hauteur: fen.h }
    : { x0: 0, y0: 0, largeur, hauteur };
  const r = cartouche.rendreCarte(snap.etat, { ...opts, fenetre: f });
  const [, , w, h] = r.viewBox.split(' ').map(Number);
  return `<svg viewBox="${r.viewBox}" width="${Math.round(w * zoom)}" height="${Math.round(h * zoom)}">${r.contenu}</svg>`;
};

const sections = instantanes
  .map(
    (snap) => `
    <section>
      <h2>Tour ${snap.tour}</h2>
      <p>sécheresse ${snap.meteo.secheresse.toFixed(2)} · vent ${snap.meteo.ventForce.toFixed(2)}
         · ${snap.brulees} parcelle(s) brûlée(s) depuis moins de trois saisons</p>
      <div class="carte">${carte(snap, {}, FEN)}</div>
    </section>`,
  )
  .join('');

const echelles = [
  ['paysage seul', { structure: false, etiquettes: false }],
  ['avec le relief nommé', { structure: false }],
  ['avec la structure', {}],
]
  .map(
    ([nom, opts]) => `
    <figure>
      <div class="carte etroit">${carte(instantanes[1], opts, FEN)}</div>
      <figcaption>${nom}</figcaption>
    </figure>`,
  )
  .join('');

const massif = `<div class="carte">${carte(instantanes[2], { etiquettes: false }, null, 0.5)}</div>`;

// ---- calque secteur (langage de décision, planche 4) -----------------------
// Les quatre états vont aux secteurs **réellement visibles** dans la fenêtre :
// autrement la planche ne montre que des limites nues et ne prouve rien.
const dansFen = (i) => {
  const x = i % largeur;
  const y = Math.floor(i / largeur);
  return x >= FEN.x0 && x < FEN.x0 + FEN.w && y >= FEN.y0 && y < FEN.y0 + FEN.h;
};
const secteursVus = dernier.etat.secteurs.filter((s) => s.cellules.some(dansFen));
const ETATS = ['vigueur', 'montee', 'activable', 'peril'];
const donneesSecteurs = secteursVus.map((s, i) => ({
  id: s.id,
  etat: ETATS[i % 4],
  crans: i % 4 === 1 ? { pleins: 2, total: 3 } : undefined,
  ecartPlancher: i % 4 === 3 ? 'budget −4 · plancher −6' : undefined,
  porte: s.nature === 'couronne'
    ? `${s.cellules.filter((j) => dernier.grille[j].type === 'bati').length} constr.`
    : `${(i % 3) + 1} politique${i % 3 ? 's' : ''}`,
}));
const OPT_SECTEURS = {
  donnees: donneesSecteurs,
  survole: secteursVus[1]?.id ?? null,
  selectionne: secteursVus[0]?.id ?? null,
};
const calque = cartouche.rendreCalqueSecteurs(dernier.etat, {
  ...OPT_SECTEURS,
  fenetre: { x0: FEN.x0, y0: FEN.y0, largeur: FEN.w, hauteur: FEN.h },
});

// Le calque **n'ajoute qu'un seul aplat**, et il est daté : le voile posé sur
// les secteurs qu'on ne regarde pas pendant une sélection. La planche 4
// l'interdisait ; l'écart est assumé parce que le voile épargne le secteur
// choisi, dont le grain justifie la décision qu'on est en train de prendre.
const remplissages = [...calque.matchAll(/<(path|rect)\b[^>]*fill="([^"]+)"/g)].map((m) => m[2]);
const aplats = remplissages.filter(
  (f) => f !== 'none' && !f.startsWith('oklch(0.62') && f !== 'oklch(0.26 0.03 62)',
);
// Et il épargne le secteur choisi : son contour perce le voile.
const voile = calque.match(/<path class="secteur__voile"[^>]*d="([^"]+)"/);
const perce = !!voile && (voile[1].match(/M/g) ?? []).length > 1 && /fill-rule="evenodd"/.test(calque);
// Le liseré d'état est en retrait **à l'intérieur** de la limite : son
// encombrement doit donc être strictement contenu dans celui du secteur.
const boite = (d) => {
  const n = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
// Repérés par leur classe et non par leur encre : la limite d'un secteur
// sélectionné passe en braise, et la reconnaître à sa couleur revenait à ne
// plus la compter.
const parClasse = (nom) =>
  [...calque.matchAll(new RegExp(`<path class="${nom}"[^>]*d="([^"]+)"`, 'g'))].map((m) => ({ d: m[1] }));
const limites = parClasse('secteur__limite');
const liseres = parClasse('secteur__lisere'); // vide depuis la ligne unique
const dedans = liseres.every((l) => {
  const b = boite(l.d);
  return limites.some((li) => {
    const a = boite(li.d);
    return b[0] >= a[0] && b[1] >= a[1] && b[2] <= a[2] && b[3] <= a[3];
  });
});
// Le cerne du bâti orphelin se vérifie sur **toute la carte** : la fenêtre de
// travail est centrée sur le village, où par construction il n'y a pas de bâti
// diffus, et le contrôle y serait vide de sens.
const natures = new Map(dernier.etat.secteurs.map((s) => [s.id, s.nature]));
const orphelins = dernier.grille.filter((c) => c.type === 'bati' && natures.get(c.secteur) !== 'couronne').length;
const calqueEntier = cartouche.rendreCalqueSecteurs(dernier.etat, OPT_SECTEURS);
const cernes = [...calqueEntier.matchAll(/<rect [^>]*stroke="oklch\(0\.55 0\.16 44\)"/g)].length;

// La sélection se lit **au voile seul** : ni limite ni nom en braise, qui
// faisaient doublon avec lui.
const calqueChoisi = cartouche.rendreCalqueSecteurs(dernier.etat, { ...OPT_SECTEURS, echelle: 3 });
const sansBraiseEnTrop = !/<text[^>]*fill="oklch\(0\.55 0\.16 44\)"/.test(calqueChoisi);
// Et elle doit tenir à toutes les échelles : les traits sont en unités
// d'écran, la géométrie suit le diviseur.
const a1 = cartouche.rendreCalqueSecteurs(dernier.etat, { ...OPT_SECTEURS, echelle: 1 });
const a4 = cartouche.rendreCalqueSecteurs(dernier.etat, { ...OPT_SECTEURS, echelle: 4 });
// Les équerres ont disparu avec le voile ; le retrait aussi. Reste le corps des
// étiquettes, qui doit toujours suivre la réduction.
const corps = (svg) => Number(svg.match(/font-size="(\d+)"/)?.[1] ?? 0);

console.log('\ncalque secteur (planche 4) :');
for (const [libelle, ok] of [
  [`${secteursVus.length} secteurs visibles, ${limites.length} limite(s) tracée(s)`, limites.length >= secteursVus.length],
  ['toutes les limites sont fermées', limites.every((l) => l.d.endsWith('Z'))],
  [`aucun aplat${aplats.length ? ` — ${[...new Set(aplats)]}` : ''}`, aplats.length === 0],

  [`le bâti orphelin est cerné (${cernes} cerne(s) pour ${orphelins} construction(s) hors couronne)`, cernes === orphelins],
  [`le calque pèse ${(calque.length / 1024).toFixed(1)} Ko contre ${(fenetree.contenu.length / 1024).toFixed(0)} Ko de paysage`, calque.length < fenetree.contenu.length / 4],
  ['la sélection se lit au voile, sans braise en doublon', sansBraiseEnTrop],
  [
    // Quatorze noms posés en permanence recouvraient le semis et les courbes.
    `les noms de secteur n'apparaissent qu'au survol ou sur le choisi (${
      [...calqueChoisi.matchAll(/Fraunces, ui-serif/g)].length
    } sur ${dernier.etat.secteurs.length})`,
    [...calqueChoisi.matchAll(/Fraunces, ui-serif/g)].length <= 2,
  ],
  ['le voile épargne le secteur choisi', perce],
  [
    `une seule ligne par secteur, son encre porte l'état (${new Set(
      [...calque.matchAll(/<path class="secteur__limite"[^>]*stroke="([^"]+)"/g)].map((m) => m[1]),
    ).size} encres)`,
    !/class="secteur__lisere"/.test(calque),
  ],
  [
    'les traits du calque gardent leur épaisseur à l’écran',
    (calqueChoisi.match(/vector-effect="non-scaling-stroke"/g) ?? []).length > 3,
  ],
  [`le corps des étiquettes suit l’échelle (${corps(a1)} → ${corps(a4)})`, corps(a4) > corps(a1)],
]) console.log(`  ${ok ? '✓' : '✗'} ${libelle}`);

const vueSecteurs = `<div class="carte">${carte(dernier, { secteurs: OPT_SECTEURS }, FEN)}</div>`;
const vueCalqueSeul = `<div class="carte">${(() => {
  const r = cartouche.rendreCarte(dernier.etat, {
    fenetre: { x0: FEN.x0, y0: FEN.y0, largeur: FEN.w, hauteur: FEN.h },
    relief: false, structure: false, etiquettes: false, secteurs: OPT_SECTEURS,
  });
  const [, , w, h] = r.viewBox.split(' ').map(Number);
  return `<svg viewBox="${r.viewBox}" width="${w}" height="${h}">${r.contenu}</svg>`;
})()}</div>`;

// Comparaison des deux régimes de semis pour les couvertures basses : le
// handoff les aligne sur la ligne de pied, l'option les étale comme un
// peuplement. Seule la position change, effectifs et tailles sont ceux du §8.2.
const REGIMES = [
  ['ligne de pied (handoff v3)', { semisNonForestier: false, sousBoisAuGlyphe: false }],
  ['étalées', { semisNonForestier: true, sousBoisAuGlyphe: false }],
  ['étalées, sous-bois aux touffes (défaut)', {}],
];
const comparaison = REGIMES.map(
  ([nom, opts]) => `
    <figure>
      <div class="carte">${carte(instantanes[1], { ...opts, etiquettes: false }, FEN)}</div>
      <figcaption>${nom}</figcaption>
    </figure>`,
).join('');

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Vérification du moteur de rendu</title>
<style>
  :root { color-scheme: light }
  body { margin:0; padding:2.5rem; background:oklch(0.975 0.012 92); color:oklch(0.26 0.02 130);
         font:16px/1.6 ui-serif, Georgia, serif }
  main { max-width:min(96rem, 100%); margin:0 auto }
  h1 { font-size:1.6rem; margin:0 0 .3rem }
  h2 { font-size:1.05rem; margin:2.5rem 0 .3rem; font-family:ui-monospace, monospace;
       text-transform:uppercase; letter-spacing:.08em }
  p { max-width:46rem; color:oklch(0.40 0.02 130); margin:.2rem 0 1rem; font-size:.9rem }
  .carte { overflow-x:auto; border:1px solid oklch(0.85 0.02 100); border-radius:6px;
           background:oklch(0.93 0.02 88) }
  .carte svg { display:block; max-width:none }
  .etroit { }
  figure { margin:0 0 1.5rem } figcaption { font:.75rem ui-monospace, monospace;
           color:oklch(0.55 0.02 120); margin-top:.4rem }
  .echelles { display:flex; gap:1.5rem; flex-wrap:wrap }
</style></head>
<body>${sprite}
<main>
  <h1>Vérification du moteur de rendu</h1>
  <p>Une partie réelle (graine ${GRAINE}, stratégie mixte compétente) rendue par
  <code>src/rendu/cellule.ts</code>. Une cellule de simulation vaut une parcelle d'affichage.
  Le talweg, la crête et le front actif relèvent de la carte et non de la cellule : ils
  n'apparaissent pas ici.</p>
  <p>Les trois vues ci-dessous cadrent les ${FEN.w} × ${FEN.h} parcelles autour du village,
  <strong>à l'échelle native de la carte de référence</strong> : une cellule fait 180 px, et les
  vues défilent horizontalement plutôt que de se réduire. Réduites, elles perdent d'abord le
  semis de sous-bois, dont les disques font 1 à 2 px de rayon.</p>
  ${sections}
  <h2>Trois échelles de vue</h2>
  <p>Le plancher de 16 px décide du basculement : le vocabulaire ne se dégrade pas, il se retire.</p>
  <div class="echelles">${echelles}</div>
  <h2>Couvertures basses : alignées ou étalées</h2>
  <p>Trois régimes. D'abord la ligne de pied du § 8.2. Puis les couvertures basses étalées sur la
  bande de semis, comme les peuplements. Puis, sur les seuls tapis — garrigue, pelouse, friche —,
  la charge de sous-bois portée par le <strong>nombre de touffes</strong> plutôt que par le semis
  de points, qui décrivait la même strate et la noyait. Le sward du pâturage reste dessiné : il
  dit un entretien, ce qu'aucun effectif ne sait dire. Le bâti reste posé dans tous les cas.</p>
  ${comparaison}

  <h2>Calque secteur</h2>
  <p>L'unité de décision, qui n'avait aucune existence graphique. Limite d'encre suivant les bords
  de cellule, plus épaisse que les courbes de niveau et plus fine que le contour du bâti ; liseré
  d'état en retrait de 12 px, qui reprend le code du filet de la fiche de politique (tireté long
  pour l'activable, tireté serré vert clair pour la montée en charge, plein vert pin pour ce qui
  est en vigueur, doublé braise pour le péril budgétaire) ; équerres et filet de garde sur le
  secteur sélectionné, limite épaissie sur le survolé. Les constructions hors couronne portent
  leur cerne braise, plein si elles sont durcies. <strong>Aucun aplat</strong> : le grain de
  sous-bois et les paliers de densité sont ce qui justifie la décision.</p>
  ${vueSecteurs}

  <h2>Le calque seul</h2>
  <p>Paysage retiré, relief et structure éteints : ce qui reste est exactement ce que le calque
  ajoute. C'est la vue qui montre si un trait est de trop.</p>
  ${vueCalqueSeul}

  <h2>Le massif entier, en vue agrégée</h2>
  <p>${largeur} × ${hauteur} parcelles au dernier tour, à demi-échelle : le relief et les teintes
  de sol restent lisibles, le semis et les silhouettes non. C'est la vue d'ensemble, pas la vue
  de travail.</p>
  ${massif}
</main></body></html>
`;

const sortie = join(racine, 'research/simulation/v3/verification-carte.html');
writeFileSync(sortie, html);
console.log(`\nplanche écrite : ${sortie.replace(racine + '/', '')}`);
