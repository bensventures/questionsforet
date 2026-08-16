/**
 * Rend le panneau de décision sur une vraie partie et écrit
 * `research/simulation/v3/verification-panneau.html`.
 *
 *     node scripts/planche-panneau.mjs
 *
 * Même principe que la planche de carte : le panneau se juge sur des états que
 * la simulation a produits, pas sur des maquettes. Un état fabriqué à la main
 * ne donne jamais les combinaisons qu'une partie donne, et c'est précisément
 * là que le langage se casse.
 *
 * Le script vérifie aussi ce qui se contrôle sans regarder : deux familles de
 * polices et pas trois, la hachure braise à ses deux emplois autorisés, aucune
 * adoption en pourcentage, aucun score agrégé, le texte du noyau intact, et le
 * zéro d'éleveur·euse par succès distinct du zéro par déprise.
 */

import { writeFileSync } from 'node:fs';
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
    platform: 'node',
  });
  const code = paquet.outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

const [modele, terrain, avancerMod, strategies, panneau, politiques] = await Promise.all([
  charger('src/model/rng.ts'),
  charger('src/model/terrain.ts'),
  charger('src/model/avancer.ts'),
  charger('src/harness/strategies.ts'),
  charger('src/rendu/panneau/index.ts'),
  charger('src/model/politiques.ts'),
]);

const GRAINE = 1000;
const rng = modele.creerRng(GRAINE);
const etat = terrain.creerEtat(GRAINE, rng, 40);
const strat = strategies.mixteCompetente;

/** Attache d'une ligne : secteur, étape du tour, valeur du modèle en cause.
 *  C'est elle qui répond à « pourquoi celle-là et pas sa voisine ». */
const attacher = (l, etat) => {
  if (/incendie|braise|front|parcourue|feu de surface|houppier/i.test(l.texte)) {
    return `Feu · sécheresse ${etat.meteo.secheresse.toFixed(2)} · vent ${etat.meteo.ventForce.toFixed(2)}`;
  }
  if (/éleveur|installation pastorale/i.test(l.texte)) return `Partenaires · ${etat.toursSansContrat} tour(s) sans contrat`;
  if (/interrompue/i.test(l.texte)) return `Bouclage · budget ${etat.moyens.budget.toFixed(0)}`;
  if (/conformité|équipé/i.test(l.texte)) return 'Politiques en vigueur';
  return `Processus lents · tour ${etat.tour - 1}`;
};

// Trois moments : le début de partie, un tour de feu, et la fin.
const moments = [];
for (let t = 1; t <= 26; t++) {
  const tour = avancerMod.avancer(etat, strat.decider(etat, etat.tour), rng);
  const lignes = tour.lignes.map((l) => ({
    ...l,
    attache: attacher(l, etat),
    rejeu: tour.feu && /parcourue|feu de surface|houppier|braise/i.test(l.texte),
  }));
  const secteurAvecPolitique = etat.politiques[0]?.secteur ?? 0;
  if (t === 3 || (tour.feu && !moments.some((m) => m.feu)) || t === 26) {
    moments.push({
      titre: t === 3 ? `Été ${t} · les premiers engagements` : tour.feu ? `Été ${t} · un incendie` : `Été ${t} · en régime`,
      feu: tour.feu,
      vue: panneau.vueDuPanneau(etat, { secteur: secteurAvecPolitique, lignes }),
    });
  }
}

// Un quatrième panneau : le tour muet, et le budget au bord du plancher. Les
// deux se produisent en partie, mais rarement au même tour ; on force l'état
// pour montrer le rendu, sans toucher au modèle.
const auBord = structuredClone(etat.moyens);
etat.moyens.budget = -5;
const vueBord = panneau.vueDuPanneau(etat, { secteur: etat.politiques[0]?.secteur ?? 0, lignes: [] });
etat.moyens = auBord;

// Cinq états de fiche : le modèle n'en produit que trois, « levée » et
// « abandon subi » étant portés par l'interface le temps d'un tour.
const modele5 = moments[0].vue.secteur.fiches[0];
const cinqEtats = ['activable', 'montee', 'vigueur', 'levee', 'abandon'].map((e, i) =>
  panneau.fichePolitique({
    ...modele5,
    etat: e,
    crans: { pleins: e === 'activable' ? 0 : e === 'montee' ? 1 : modele5.crans.total, total: modele5.crans.total },
    engager: modele5.etablissement,
    refus: undefined,
  }),
);

// ---- contrôles -------------------------------------------------------------
const rendus = moments.map((m) => panneau.rendrePanneau(m.vue, { geste: 'ouvrirCoupure' }));
const html1 = rendus[0];
const css = panneau.STYLES_PANNEAU;
const controles = [];
const ajouter = (libelle, ok) => controles.push([libelle, ok]);

const familles = [...css.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1]);
const inconnues = familles.filter((f) => !/Fraunces|Hanken|inherit/.test(f));
ajouter(`deux familles de polices, pas trois${inconnues.length ? ` — ${inconnues}` : ''}`, inconnues.length === 0);

const emploisHachure = [...css.matchAll(/repeating-linear-gradient\(135deg/g)].length;
ajouter(`la hachure braise n'a que ses deux emplois (${emploisHachure})`, emploisHachure === 2);

const fiches = [...html1.matchAll(/<article class="fiche[\s\S]*?<\/article>/g)].map((m) => m[0]);
ajouter(`aucune adoption en pourcentage dans les ${fiches.length} fiches`, fiches.every((f) => !f.includes('%')));

ajouter(
  'aucun score agrégé, aucune note',
  !/score|sur 100|\/100|note globale|étoile/i.test(html1),
);

// Le texte du noyau s'affiche intact : l'interface ajoute l'attache, elle ne
// réécrit pas.
const avecFeu = moments.find((m) => m.feu) ?? moments[0];
const rendufeu = panneau.rendrePanneau(avecFeu.vue);
const intactes = avecFeu.vue.lignes.every((l) =>
  rendufeu.includes(l.texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')),
);
ajouter(`les ${avecFeu.vue.lignes.length} lignes du noyau s'affichent intactes`, intactes);

const marques = [...rendufeu.matchAll(/<li class="[^"]*">\s*<span class="cr__m/g)].length;
const items = [...rendufeu.matchAll(/<li class="/g)].length;
ajouter(`chaque ligne porte sa marque (${marques}/${items})`, marques === items);

// Le zéro par succès et le zéro par perte doivent être **visuellement
// distincts** : c'est la dépendance modèle de tout le bandeau.
const bloc = (h) => h.match(/<div class="eleveurs">[\s\S]*?<\/div>/)[0];
const succes = panneau.rendrePanneau({
  ...moments[0].vue,
  ressources: { ...moments[0].vue.ressources, eleveurs: { disponibles: 0, engages: 2, perdus: 0, retourAu: null } },
});
const deprise = panneau.rendrePanneau({
  ...moments[0].vue,
  ressources: { ...moments[0].vue.ressources, eleveurs: { disponibles: 0, engages: 0, perdus: 2, retourAu: 24 } },
});
ajouter('le zéro d’éleveur·euse par succès diffère du zéro par déprise', bloc(succes) !== bloc(deprise));

// Toute variable lue doit être définie sur la règle de jetons, que portent le
// panneau **et** la classe des fragments détachés. Sinon un fragment rendu hors
// du panneau perd ses aplats sans la moindre erreur.
const declarees = new Set([...css.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]));
const lues = new Set([...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]));
const orphelines = [...lues].filter((v) => !declarees.has(v));
ajouter(
  `toutes les variables lues sont déclarées${orphelines.length ? ` — ${orphelines}` : ''}`,
  orphelines.length === 0,
);
ajouter(
  'les jetons sont portés par le panneau et par la classe des fragments détachés',
  /\.pan, \.decision \{/.test(css),
);

// ---- renoncement subi (planche 8) ------------------------------------------
// 1,5 renoncement par partie est une moyenne : la graine 1000 traverse ses
// quarante étés sans une seule coupe. On en prend donc une autre, fixée, plutôt
// que de fabriquer l'événement — l'écran doit montrer ce que le modèle produit.
const GRAINE_COUPE = 1007;
const rngC = modele.creerRng(GRAINE_COUPE);
const etatC = terrain.creerEtat(GRAINE_COUPE, rngC, 40);
let momentCoupe = null;
for (let t = 1; t <= 40 && !momentCoupe; t++) {
  const tour = avancerMod.avancer(etatC, strat.decider(etatC, etatC.tour), rngC);
  if (!tour.coupees.length) continue;
  const coupee = tour.coupees[0];
  momentCoupe = {
    tour: t,
    vue: panneau.vueDuPanneau(etatC, {
      secteur: coupee.secteur,
      // La ligne de la coupe se repère à sa phrase, mais **les données de la
      // bande viennent de `tour.coupees`** : on ne lit le texte que pour
      // retrouver son rang dans le fil, jamais pour en tirer des valeurs.
      lignes: tour.lignes.map((l) => {
        const estCoupe = /ne peut plus assurer l'entretien/.test(l.texte);
        return {
          ...l,
          attache: estCoupe ? undefined : attacher(l, etatC),
          coupe: estCoupe
            ? {
                titre: panneau.titreDeLaCoupe(etatC, coupee),
                consequences: [
                  'C’était la politique la plus coûteuse à entretenir.',
                  ...panneau.consequencesDeLaCoupe(etatC, coupee),
                ],
              }
            : undefined,
        };
      }),
    }),
  };
}

if (momentCoupe) {
  const bande = panneau.rendrePanneau(momentCoupe.vue);
  const bloc = bande.match(/<li class="cr__coupe">[\s\S]*?<\/li>/)?.[0] ?? '';
  ajouter('la bande reste dans le fil du compte rendu, aucune fenêtre ne s’ouvre', /<ul class="cr">[\s\S]*cr__coupe/.test(bande));
  ajouter('la bande ne propose ni bouton, ni accusé de réception, ni remède', !/<button/.test(bloc));
  ajouter(
    'seule adresse à la deuxième personne de toute l’interface',
    (bande.match(/\bVous\b/g) ?? []).length === 1,
  );
  const serif = [...css.matchAll(/\.cr__coupe h3[^}]*Fraunces/g)].length;
  ajouter('seule ligne du compte rendu composée en serif', serif === 1);
  ajouter(
    'conséquences datées : emprise et délais viennent du modèle',
    /\d+ parcelle|\d+ construction/.test(bloc) && /\d+ étés/.test(bloc),
  );
} else {
  ajouter('un tour de coupe a été trouvé dans la partie', false);
}

// ---- écran de fin de partie (planche 7) ------------------------------------
// Une partie complète, jouée jusqu'au bout : l'écran n'a de sens qu'à 40 tours.
const rngFin = modele.creerRng(GRAINE);
const etatFin = terrain.creerEtat(GRAINE, rngFin, 40);
for (let t = 1; t <= 40; t++) avancerMod.avancer(etatFin, strat.decider(etatFin, etatFin.tour), rngFin);
const vueFin = panneau.vueFinDePartie(etatFin);
const ecranFin = panneau.rendreFinDePartie(vueFin);

ajouter(
  'aucun total agrégé, aucun verdict, aucun comparatif',
  !/bien joué|partie perdue|moyenne des parties|percentile|rang |total général/i.test(ecranFin),
);
// Une seule braise : la conversion irréversible et ce qui a été subi. Aucun
// pourcentage n'est coloré parce qu'il est bas.
const braiseFin = [...ecranFin.matchAll(/class="[^"]*\b(irr|braise)\b[^"]*"/g)].length;
ajouter(`la braise ne marque que l'irréversible et le subi (${braiseFin} emplois)`, braiseFin <= 2);
ajouter(
  `les pertes se ventilent (${vueFin.pertes.braise} braise · ${vueFin.pertes.front} front · ${vueFin.pertes.secoursDebordes} débordés)`,
  vueFin.pertes.total === vueFin.pertes.braise + vueFin.pertes.front + vueFin.pertes.secoursDebordes,
);
ajouter(
  `les deux ventilations portent sur le même effectif (${vueFin.durcies} durcies, ${vueFin.conformes} conformes sur ${vueFin.pertes.total})`,
  vueFin.durcies <= vueFin.pertes.total && vueFin.conformes <= vueFin.pertes.total,
);
// Le texte seul, sans le balisage : « fin__note » est un nom de classe, pas un
// verdict, et il faisait échouer le contrôle sur son propre vocabulaire.
const texteFin = ecranFin.replace(/<[^>]+>/g, ' ');
ajouter(
  `la surface brûlée s'affiche sans être notée (${vueFin.bruleePct} %)`,
  ecranFin.includes('pas une cible') && !/\bscore\b|\bnote\b|\bnotée?\b/i.test(texteFin),
);

// ---- composition de l'écran (planche 9) ------------------------------------
// La carte se déplace, elle ne se réduit pas : le seul bloc qui défile dans le
// panneau est le compte rendu, et le seul autre défilement de l'écran est celui
// de la carte dans son cadre.
const cssEcran = panneau.STYLES_ECRAN;
const sansCommentaires = (css + cssEcran).replace(/\/\*[\s\S]*?\*\//g, '');
const defilants = [...sansCommentaires.matchAll(/([^{}]+)\{[^}]*overflow(-y)?:\s*auto/g)].map((m) => m[1].trim());
// Une colonne, un défilement. Dans le flux d'une page, c'est le compte rendu
// qui défile dans le panneau ; en plein écran, c'est le panneau entier, et le
// compte rendu rend le sien — deux barres imbriquées sont ingouvernables.
ajouter(
  `trois zones défilantes, jamais imbriquées (${defilants.join(' / ')})`,
  defilants.length === 3 &&
    defilants.some((s) => s.includes('pan__bloc--rendu')) &&
    defilants.some((s) => s.includes('ecran__carte')) &&
    defilants.some((s) => s.includes('.plein .pan')) &&
    /\.plein \.pan__bloc--rendu \{[^}]*overflow-y: visible/.test(sansCommentaires),
);
// L'unité de base des barres de position : ce que le cadre montrerait à
// l'échelle native. Les trois échelles la multiplient par leur diviseur.
const vue76 = panneau.fenetreVisible({ largeur: 1800, hauteur: 1080 });
ajouter(
  `${vue76.largeur} × ${vue76.hauteur} parcelles à l'échelle native, ${vue76.largeur * 3} × ${vue76.hauteur * 3} à l'échelle moyenne`,
  vue76.largeur === 7 && vue76.hauteur === 6,
);
// Ni l'échelle native ni un ajustement au cadre : les deux ont été essayés et
// retirés, l'un ne montrant qu'un vingtième du versant, l'autre plus rien.
ajouter(
  `trois échelles utiles, de 1:${panneau.ECHELLES[0].diviseur} à 1:${panneau.ECHELLES[2].diviseur}`,
  panneau.ECHELLES.every((e) => e.diviseur >= 2 && e.diviseur <= 4),
);
const ecran = panneau.rendreEcran({
  sprite: '',
  carte: '<svg></svg>',
  panneau: panneau.rendrePanneau(moments[0].vue),
  largeur: 40,
  hauteur: 26,
  vue: vue76,
});
ajouter('la barre de position dit où l’on est sur le terrain entier', /parcelles sur 40 × 26/.test(ecran));
ajouter(
  'échelles, bascule et plein écran ne coûtent aucun JavaScript',
  /input type="radio"/.test(ecran) && !/<script|onclick=/.test(ecran),
);
// La page derrière ne doit plus défiler quand le simulateur est ouvert : deux
// ascenseurs côte à côte n'appartiennent à personne.
ajouter(
  'la page derrière est verrouillée pendant le plein écran',
  /html:has\(\.plein:target\) \{ overflow: hidden/.test(cssEcran),
);
// La planche 9 n'autorise que la barre de position comme ajout. Deux autres
// ont été ajoutés **contre la planche**, et il faut que cela reste visible : la
// bascule des petits écrans, et le sélecteur d'échelle, sans lequel l'écran
// n'était pas jouable. Toute quatrième nouveauté doit refaire le débat.
const AJOUTS = ['ecran__radio', 'ecran__bascule', 'ecran__vue', 'ecran__carte', 'ecran__position', 'ecran__echelles'];
const blocsEcran = [...new Set([...ecran.matchAll(/class="(ecran__[a-z]+)/g)].map((m) => m[1]))];
ajouter(
  `aucun bloc hors des trois ajouts assumés (${blocsEcran.join(', ')})`,
  blocsEcran.every((c) => AJOUTS.includes(c)),
);
// Les trois échelles doivent dire ce qu'elles perdent : c'est ce qui distingue
// une réduction assumée d'une réduction silencieuse, seule vraiment interdite.
ajouter(
  `les ${panneau.ECHELLES.length} échelles disent chacune ce qu'elles perdent`,
  panneau.ECHELLES.every((e) => e.perd && ecran.includes(e.perd)),
);

ajouter(`le panneau fait ${panneau.LARGEUR_PANNEAU} px`, css.includes(`width: ${panneau.LARGEUR_PANNEAU}px`));
ajouter('aucun « undefined » ni « NaN »', !rendus.join('').includes('undefined') && !rendus.join('').includes('NaN'));

console.log('\npanneau de décision (planches 1, 2, 3, 5, 6) :');
for (const [libelle, ok] of controles) console.log(`  ${ok ? '✓' : '✗'} ${libelle}`);

// ---- planche ---------------------------------------------------------------
const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Vérification du panneau de décision</title>
<link rel="stylesheet" href="../../../node_modules/@fontsource-variable/fraunces/index.css">
<link rel="stylesheet" href="../../../node_modules/@fontsource-variable/hanken-grotesk/index.css">
<style>
  body { margin:0; padding:2.5rem; background:oklch(0.91 0.02 84); color:oklch(0.26 0.02 130);
         font:16px/1.6 "Hanken Grotesk Variable", ui-sans-serif, system-ui, sans-serif }
  main { max-width:76rem; margin:0 auto }
  h1 { font-family:"Fraunces Variable", ui-serif, Georgia, serif; font-size:1.8rem; margin:0 0 .4rem }
  h2.sec { font-size:.8rem; margin:2.6rem 0 .8rem; text-transform:uppercase; letter-spacing:.12em;
       color:oklch(0.45 0.02 120) }
  p.intro { max-width:48rem; color:oklch(0.40 0.02 130) }
  .rangee { display:flex; gap:1.5rem; align-items:flex-start; flex-wrap:wrap }
  .colonne { display:flex; flex-direction:column; gap:.5rem }
  .colonne > figcaption { font-size:.78rem; letter-spacing:.06em; text-transform:uppercase;
       color:oklch(0.45 0.02 120) }
  .cadre { height:940px; display:flex; box-shadow:0 1px 0 oklch(0.80 0.02 90) }
  .fiches { display:flex; gap:1rem; flex-wrap:wrap; background:oklch(0.955 0.016 86); padding:1rem }
  .fiches > * { width:300px }
  .ecranfin { max-width:1100px; box-shadow:0 1px 0 oklch(0.80 0.02 90) }
${css}
</style></head>
<body><main>
  <h1>Panneau de décision</h1>
  <p class="intro">Engendré par <code>scripts/planche-panneau.mjs</code> sur la partie de graine
  ${GRAINE}, jouée par la stratégie compétente. Trois moments réels, plus un état forcé au bord du
  plancher. Les fiches, le bandeau et le compte rendu lisent l'état du modèle ; les seules valeurs
  fabriquées sont les deux états de fiche que le modèle ne produit pas (« levée » et « abandon
  subi »), portés par l'interface le temps d'un tour.</p>

  <h2 class="sec">Trois moments d'une partie</h2>
  <div class="rangee">
    ${moments
      .map((m, i) => `<figure class="colonne" style="margin:0"><div class="cadre">${rendus[i]}</div><figcaption>${m.titre}</figcaption></figure>`)
      .join('')}
  </div>

  <h2 class="sec">Au bord du plancher</h2>
  <p class="intro">Budget à −5 pour deux du plancher : l'encre passe en braise et la ligne
  « plancher » apparaît pour donner la distance. C'est le seul avertissement du bandeau, et il ne
  propose aucun remède. Le compte rendu est muet ce tour-ci : la phrase est alors écrite par
  l'interface, en italique et sans marque, la seule du bloc qui ne vienne pas du noyau.</p>
  <div class="rangee">
    <figure class="colonne" style="margin:0"><div class="cadre">${panneau.rendrePanneau(vueBord)}</div>
    <figcaption>budget −5 · plancher −6</figcaption></figure>
  </div>

  <h2 class="sec">Renoncement subi</h2>
  <p class="intro">Été ${momentCoupe?.tour ?? '—'} de la partie de graine ${GRAINE_COUPE}, celle de
  la planche n'en produisant aucune en quarante étés : le budget est passé sous le
  plancher et le modèle a coupé la politique la plus coûteuse. La bande reste dans le fil du compte
  rendu, à son rang chronologique, après le bouclage qui l'explique. Aucune fenêtre ne s'ouvre,
  aucun bouton n'est proposé, aucun remède n'est suggéré : le tour continue, et l'été suivant vient.
  Ses conséquences sont datées, faute de quoi ce ne serait qu'une punition.</p>
  <div class="rangee">
    <figure class="colonne" style="margin:0"><div class="cadre">${momentCoupe ? panneau.rendrePanneau(momentCoupe.vue) : ''}</div>
    <figcaption>été ${momentCoupe?.tour ?? '—'} · la coupe</figcaption></figure>
  </div>

  <h2 class="sec">Écran de fin de partie</h2>
  <p class="intro">Quarante étés de la même partie, relus sans note, sans étoile et sans total.
  L'écran fait ce qu'un score fait d'ordinaire, mais en ventilant les causes : le rapprochement des
  deux ventilations (par cause, puis par état de la construction perdue) est la seule forme de leçon
  qu'il s'autorise, et aucun texte ne conseille.</p>
  <div class="ecranfin">${ecranFin}</div>

  <h2 class="sec">Les cinq états de la fiche</h2>
  <p class="intro">Le filet gauche est le seul porteur de l'état : ni la couleur du nom, ni le fond,
  ni la graisse ne le redisent. L'abandon subi est le seul à passer le filet à 6 px, à porter un
  fond braise et à s'adresser à la deuxième personne.</p>
  <div class="fiches ${panneau.CLASSE_JETONS}">${cinqEtats.join('')}</div>
</main></body></html>
`;

const sortie = join(racine, 'research/simulation/v3/verification-panneau.html');
writeFileSync(sortie, html);
console.log(`\nplanche écrite : ${sortie.replace(racine + '/', '')}`);
