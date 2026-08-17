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

const [modele, terrain, avancerMod, strategies, panneau, politiques, rejeu] = await Promise.all([
  charger('src/model/rng.ts'),
  charger('src/model/terrain.ts'),
  charger('src/model/avancer.ts'),
  charger('src/harness/strategies.ts'),
  charger('src/rendu/panneau/index.ts'),
  charger('src/model/politiques.ts'),
  charger('src/rendu/rejeu.ts'),
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

// ---- pré-débit des décisions en attente -------------------------------------
// Le modèle ne prélève qu'au passage de l'été : le budget ne bougeait donc pas
// d'un clic, ce qui laissait croire que décider était gratuit. L'affichage
// pré-débite, le modèle non.
const vueEngagee = {
  ...moments[1].vue,
  coutEnAttente: 9,
  gestesEnAttente: 1,
  enAttente: [
    { nom: 'Contrat pastoral', ou: 'Fond de vallon', cout: 7 },
    { nom: 'Durcir un hameau', ou: '(12, 7)', cout: 5 },
  ],
  ressources: { ...moments[1].vue.ressources, budgetProjete: moments[1].vue.ressources.budget - 9 },
};
const panneauEngage = panneau.rendrePanneau(vueEngagee);
ajouter(
  'le budget affiché pré-débite les décisions en attente',
  /réserve .* · été [+−].* · engagé 9/.test(panneauEngage) && /à engager/.test(panneauEngage),
);
// **Le coût annuel de la posture est un prélèvement certain**, pris au début de
// l'été avant les établissements et les gestes. L'omettre du pré-débit faisait
// engager exactement ce qu'on croyait avoir, puis refusait le geste au passage
// de l'été, sans que rien n'ait prévenu : c'est ce qui rendait le budget
// incompréhensible.
const vueNue = { ...moments[1].vue, coutEnAttente: 0, enAttente: [] };
const nue = vueNue.ressources;
// **Le budget de l'été est un budget, pas une caisse.** La recette arrivait à la
// clôture, après les dépenses : « j'ai 12 de recette, 3 de charges, donc 9 à
// engager » était faux d'une année. Le bouclage passe en tête d'été, et
// l'affichage montre ce dont on disposera quand les décisions s'appliqueront.
ajouter(
  'le disponible compte la recette de l’année et ses charges',
  nue.chargeDoctrine > 0 &&
    Math.abs(nue.budget + nue.soldeDeLEte - (moments[1].vue.coutEnAttente ?? 0) - nue.budgetProjete) < 1e-9 &&
    /réserve .* · été [+−]/.test(panneau.rendrePanneau(vueNue)),
);
// Régression : tout ce qui juge « finançable » doit lire le **même** disponible
// que l'affichage. Sur la seule réserve, une politique payable par la recette de
// l'année s'affichait hors de portée, le secteur ne passait pas « activable », et
// le bouton « été suivant » restait actif sans rien faire — le pire des trois.
const neuf = terrain.creerEtat(GRAINE, modele.creerRng(GRAINE), 40);
neuf.moyens.budget = 0;
const vueNeuve = panneau.vueDuPanneau(neuf, { secteur: 0 });
const payables = vueNeuve.secteur.fiches.filter(
  (f) => f.etat === 'activable' && f.etablissement <= vueNeuve.ressources.budgetProjete,
);
ajouter(
  `ce que la recette de l’année finance n’est pas refusé faute de réserve (${payables.length} fiche(s))`,
  vueNeuve.ressources.budget === 0 && payables.length > 0 && payables.every((f) => !f.refus),
);

// **Un seul endroit pour lire l'économie de l'été.** La jauge portait le seul
// entretien : la doctrine, prélevée quoi qu'on décide, et l'exploitation, qui
// peut coûter en un été plus que tout ce que le joueur engage, n'y étaient pas.
// Elle rassurait à tort, et obligeait à répéter le reste en toutes lettres.
const vueCharges = panneau.vueDuPanneau(etat, {});
ajouter(
  'la jauge porte toutes les charges récurrentes, doctrine comprise',
  vueCharges.ressources.charge >= vueCharges.ressources.chargeDoctrine &&
    vueCharges.ressources.chargeDoctrine > 0 &&
    /de charge sur .* de recette, dont \d+ de doctrine/.test(panneau.rendrePanneau(vueCharges)),
);
// Chaque établissement et chaque geste avait sa ligne ; les charges récurrentes
// n'en avaient aucune, si bien qu'une éclaircie déficitaire pouvait coûter en un
// été plus que tout ce que le joueur engage, sans une phrase pour le dire.
ajouter(
  'le compte rendu tient les comptes de l’été, poste par poste',
  moments.every((m) => m.vue.lignes.some((l) => /Comptes de l'été : .*doctrine .*Il reste/.test(l.texte))),
);
// Une politique engagée n'apparaissait que sur sa fiche, donc dans le tiroir de
// son secteur : en ouvrir un autre la faisait disparaître de la vue.
ajouter(
  'le pied récapitule tout ce qui est engagé, secteurs confondus',
  /pan__liste/.test(panneauEngage) &&
    /Contrat pastoral/.test(panneauEngage) &&
    /Fond de vallon/.test(panneauEngage) &&
    /Durcir un hameau/.test(panneauEngage),
);
ajouter(
  'chaque décision se retire depuis ce récapitulatif',
  (panneauEngage.match(/data-annuler="\d+"/g) ?? []).length === vueEngagee.enAttente.length,
);
// Le compte et la liste doivent dire la même chose : calculé à part, le compte
// ne voyait que les fiches du secteur ouvert.
ajouter(
  'le compte annoncé est celui de la liste',
  new RegExp(`${vueEngagee.enAttente.length} décisions? en attente`).test(panneauEngage),
);
const aDecouvert = panneau.rendrePanneau({
  ...vueEngagee,
  coutEnAttente: 999,
  ressources: { ...vueEngagee.ressources, budgetProjete: -4, trop: 4 },
});
ajouter(
  'on n’engage pas plus qu’on ne peut, et le refus est chiffré',
  /pan__suivant" type="button" disabled/.test(aDecouvert) && /dépassent de 4/.test(aDecouvert),
);
// **Mais un solde d'année négatif n'enferme pas.** L'année d'après une grosse
// installation, les charges peuvent excéder la recette avant que le joueur ait
// rien décidé : refuser l'été le laissait sans issue, sans rien à retirer.
const soldeNegatif = panneau.rendrePanneau({
  ...moments[1].vue,
  coutEnAttente: 0,
  enAttente: [],
  ressources: { ...moments[1].vue.ressources, budgetProjete: -4.3, soldeDeLEte: -9.3, trop: 0 },
});
ajouter(
  'un été déficitaire se joue quand même : rien à retirer, rien à bloquer',
  !/pan__suivant" type="button" disabled/.test(soldeNegatif) && !/dépassent/.test(soldeNegatif),
);

// ---- plancher d'accessibilité clavier ---------------------------------------
// La partie doit se jouer sans souris. Ce contrôle attrape la faute la plus
// facile à commettre : une commande écrite en `div` cliquable, invisible au
// clavier comme au lecteur d'écran.
const toutLePanneau = panneau.rendrePanneau(moments[1].vue, { geste: 'ouvrirCoupure' }) + ouvertureHtml();
function ouvertureHtml() {
  return panneau.rendreOuverture({ graine: GRAINE, cran: 1 });
}
const commandes = [...toutLePanneau.matchAll(/<(\w+)[^>]*data-(cran|geste|secteur|commencer|tirer|fermer-secteur)[^>]*>/g)];
const enDiv = commandes.filter((m) => m[1] !== 'button' && m[1] !== 'section');
ajouter(
  `les ${commandes.length} commandes sont des boutons${enDiv.length ? ` — ${enDiv.length} en ${enDiv[0][1]}` : ''}`,
  enDiv.length === 0,
);
ajouter(
  'le compte rendu s’annonce aux lecteurs d’écran',
  /pan__bloc--rendu" aria-live="polite"/.test(toutLePanneau),
);
ajouter(
  'la sélection d’un secteur a un chemin clavier',
  /class="secteurs__b[^"]*" data-secteur=/.test(toutLePanneau),
);

// ---- les deux registres de dépense -----------------------------------------
// Les deux façons d'engager le budget ne se distinguaient que par leur place
// dans la colonne. L'onglet les sépare, mais il ne doit pas cacher ce qui les
// distingue : les deux règles restent lisibles en même temps, dans la barre.
const ongletsHtml = panneau.rendrePanneau(moments[1].vue, { geste: 'ouvrirCoupure' });
ajouter(
  'deux onglets, et la barre porte la règle de chacun',
  /onglets__n">Politiques<[\s\S]*?onglets__d">plusieurs étés</.test(ongletsHtml) &&
    /onglets__n">Gestes<[\s\S]*?onglets__d">un été, une parcelle</.test(ongletsHtml),
);
ajouter(
  'chaque registre dit sous la barre ce qu’il coûte et quand',
  /onglets__vue--politiques[\s\S]*?se paient chaque été/.test(ongletsHtml) &&
    /onglets__vue--gestes[\s\S]*?Payés une fois/.test(ongletsHtml),
);
// Les onglets se manœuvrent au clavier sans rien coder : un groupe de boutons
// radio, ses flèches, ses étiquettes.
ajouter(
  'les onglets sont des boutons radio étiquetés, commutés en CSS',
  /<label class="onglets__e"><input type="radio"/.test(ongletsHtml) &&
    /\.onglets:has\(\.onglets__r--politiques:checked\) \.onglets__vue--gestes/.test(css),
);
// Le budget a trois emplois et non deux : la doctrine est une posture qu'on
// tient, pas un achat qu'on fait, et sa place hors des onglets le dit.
ajouter(
  'la doctrine reste au-dessus des onglets',
  ongletsHtml.indexOf('doc__pli') < ongletsHtml.indexOf('<div class="onglets">'),
);
// Deux panneaux dans une même page (cette planche) formeraient un seul groupe
// de boutons radio et s'éteindraient l'un l'autre.
ajouter(
  'chaque panneau rendu a son propre groupe d’onglets',
  new Set(rendus.map((h) => h.match(/name="(pan-onglet-\d+)"/)[1])).size === rendus.length,
);
// Là où « :has() » manquerait, on retombe sur les deux registres visibles,
// c'est-à-dire la colonne d'avant les onglets, et non une colonne vide.
ajouter(
  'sans « :has() », les deux registres restent visibles',
  !/\.onglets__vue \{[^}]*display: none/.test(css),
);
// L'écran est composé plus bas ; ici on n'a besoin que de son balisage.
const ecranPourClavier = panneau.rendreEcran({
  sprite: '',
  carte: '<svg></svg>',
  panneau: '',
  largeur: 40,
  hauteur: 26,
  vue: panneau.fenetreVisible({ largeur: 1800, hauteur: 1080 }),
});
ajouter(
  'la carte est focalisable et se déplace aux flèches',
  /class="ecran__carte" tabindex="0"/.test(ecranPourClavier) &&
    /aria-label="Carte du versant/.test(ecranPourClavier),
);
ajouter(
  'un anneau de focus visible partout où l’on décide',
  /:focus-visible \{[^}]*outline/.test(css) && /ecran__carte:focus-visible/.test(panneau.STYLES_ECRAN),
);

// ---- doctrine repliée -------------------------------------------------------
// Trois lignes dépliées en permanence prenaient un tiers de la colonne, pour un
// réglage devenu rare. Replié n'est pas caché : le bloc s'ouvre de lui-même aux
// moments où il a quelque chose à dire, et un « select » aurait mis les seuils
// et les prix des deux autres postures derrière une interaction.
const vueCalme = {
  ...moments[2].vue,
  doctrine: { ...moments[2].vue.doctrine, fenetre: 0, reforme: null, ouverture: false, demande: undefined },
};
const pli = (v) => panneau.rendrePanneau(v).match(/<details class="doc__pli"[^>]*>/)[0];
ajouter('la doctrine est repliée quand rien ne s’y joue', !/open/.test(pli(vueCalme)));
ajouter(
  'elle s’ouvre d’elle-même en fenêtre et pendant une réforme',
  ['fenetre', 'reforme'].every((cas) =>
    /open/.test(
      pli({
        ...vueCalme,
        doctrine: {
          ...vueCalme.doctrine,
          fenetre: cas === 'fenetre' ? 2 : 0,
          reforme: cas === 'reforme' ? { vers: 3, dans: 2 } : null,
        },
      }),
    ),
  ),
);
// Mais **pas au premier été** : le joueur vient de choisir sa posture sur
// l'écran d'ouverture, la rouvrir en grand lui fait relire sa propre décision.
ajouter(
  'elle reste repliée au premier été, le choix vient d’être fait',
  !/open/.test(pli({ ...vueCalme, doctrine: { ...vueCalme.doctrine, ouverture: true } })),
);
ajouter(
  'repliée, elle montre l’item choisi : posture, seuils et prix',
  /doc__vigueur[\s\S]*?Feu géré[\s\S]*?doc__s">sécheresse[\s\S]*?doc__x">1/.test(panneau.rendrePanneau(vueCalme)),
);
ajouter(
  'un bouton lisible ouvre le menu, et non un chevron seul',
  /doc__ouvrir[\s\S]*?Changer de doctrine/.test(panneau.rendrePanneau(vueCalme)),
);
// Dépliée, la gamme entière porte l'item choisi : le redire sous le titre du
// bloc écrivait deux fois la même chose dans le même écran.
ajouter(
  'dépliée, la posture en vigueur n’est plus redite sous le titre',
  /\.doc__pli\[open\] \.doc__vigueur \{ display: none; \}/.test(panneau.STYLES_PANNEAU),
);

// ---- écran d'ouverture (patch §1) ------------------------------------------
// Le territoire présente un héritage à confirmer, pas un choix neutre, et le
// versant se choisit par son numéro puisque le modèle est déterministe.
const ouv = panneau.rendreOuverture({ graine: GRAINE, cran: 1 });
ajouter(
  'l’ouverture présente la doctrine héritée et son caractère gratuit',
  /héritée/.test(ouv) && /ne coûte rien/.test(ouv),
);
ajouter(
  // §3 du patch : la conséquence reste silencieuse, elle se lit dans les jauges
  // lentes et s'explicite après la catastrophe. La dire ici tuerait le paradoxe.
  'l’ouverture ne dit rien de la dette de combustible',
  !/combustible|dette|paradoxe|s'accumule/i.test(ouv.replace(/<[^>]+>/g, ' ')),
);
ajouter(
  `le versant se choisit par son numéro (${GRAINE})`,
  /data-graine/.test(ouv) && /data-tirer/.test(ouv) && /data-commencer/.test(ouv),
);

// ---- doctrine : posture debout (patch « posture héritée, réforme fenêtrée ») -
// Le sélecteur doit rendre une posture permanente et non une action de tour :
// ce qui est en vigueur, ce que réformer coûte maintenant, et la réforme
// engagée avec les étés qui restent.
const rngD = modele.creerRng(GRAINE);
const etatD = terrain.creerEtat(GRAINE, rngD, 40);
const bloc1 = panneau.rendrePanneau(panneau.vueDuPanneau(etatD, { lignes: [] }));
ajouter(
  'à l’ouverture, le bloc présente un héritage à confirmer, pas un choix neutre',
  /pratique déjà l'extinction systématique/.test(bloc1) && /sans délai ni coût/.test(bloc1),
);
// Une partie jouée jusqu'à une réforme engagée dans la fenêtre.
let blocFenetre = '';
let blocReforme = '';
for (let t = 1; t <= 40 && !(blocFenetre && blocReforme); t++) {
  const avantReforme = etatD.reforme;
  avancerMod.avancer(etatD, strat.decider(etatD, etatD.tour), rngD);
  const vue = panneau.vueDuPanneau(etatD, { lignes: [] });
  if (!blocFenetre && vue.doctrine.fenetre > 0 && !vue.doctrine.reforme) {
    blocFenetre = panneau.rendrePanneau(vue);
  }
  if (!blocReforme && etatD.reforme && !avantReforme) blocReforme = panneau.rendrePanneau(vue);
}
ajouter(
  'la fenêtre post-incendie est signalée comme le moment où réformer est facile',
  !blocFenetre || /L'incendie a ouvert une fenêtre/.test(blocFenetre),
);
ajouter(
  'une réforme engagée s’affiche avec les étés qui restent, et bloque les autres',
  !blocReforme || (/Réforme engagée/.test(blocReforme) && /en vigueur dans \d+ été/.test(blocReforme)),
);
ajouter(
  'la posture en vigueur est marquée comme telle, pas comme un choix coché',
  /doc__etat">en vigueur/.test(bloc1),
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
  // Le contrôle porte sur le **compte rendu** : la fiche d'une politique
  // abandonnée s'adresse elle aussi à la deuxième personne, et c'est voulu.
  // Compté sur le panneau entier, il dépendait de l'état des fiches du secteur
  // ouvert, donc du tour où la coupe tombe.
  const fil = bande.match(/<ul class="cr">[\s\S]*?<\/ul>/)?.[0] ?? '';
  const bandes = (fil.match(/<li class="cr__coupe">/g) ?? []).length;
  ajouter(
    `seule adresse à la deuxième personne du compte rendu (${bandes} bande(s))`,
    bandes > 0 && (fil.match(/\bVous\b/g) ?? []).length === bandes,
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

// ---- rejeu de propagation (planche 6) --------------------------------------
// La seule animation admise, et le seul lien du compte rendu. Elle rejoue la
// chronologie que le noyau livre, elle ne fabrique pas une propagation
// plausible : c'est la différence entre montrer et illustrer.
const rngR = modele.creerRng(GRAINE);
const etatR = terrain.creerEtat(GRAINE, rngR, 40);
let feuR = null;
for (let t = 1; t <= 40 && !feuR; t++) {
  const tour = avancerMod.avancer(etatR, strat.decider(etatR, etatR.tour), rngR);
  if (tour.feu && tour.arrivee && [...tour.arrivee].filter((a) => a > 0).length > 100) feuR = tour;
}
if (feuR) {
  const couche = rejeu.rendreRejeu(feuR.arrivee, feuR.braises, etatR.largeur);
  const delais = [...couche.matchAll(/animation-delay:(\d+)ms/g)].map((m) => Number(m[1]));
  const pas = [...feuR.arrivee].filter((a) => a > 0);
  // Un groupe par pas d'arrivée, d'un côté les parcelles, de l'autre les
  // brandons : les deux séries ont leur propre horloge et se recouvrent.
  const pasBraises = new Set(feuR.braises.map((b) => Math.max(1, b.t - 3)));
  ajouter(
    `le rejeu suit la chronologie du modèle (${new Set(pas).size} pas de front, ${pasBraises.size} de braises)`,
    new Set(pas).size > 5 && delais.length === new Set(pas).size + pasBraises.size,
  );
  ajouter(
    `les délais tiennent dans la fenêtre du rejeu (${Math.min(...delais)} → ${Math.max(...delais)} ms)`,
    Math.max(...delais) <= rejeu.DUREE_REJEU,
  );
  ajouter(
    `groupé par pas de temps, pas par parcelle (${(couche.length / 1024).toFixed(0)} Ko pour ${pas.length} parcelles)`,
    couche.length / pas.length < 120,
  );
  ajouter(
    'rien ne bouge sous prefers-reduced-motion',
    /@media \(prefers-reduced-motion: reduce\)[^}]*\{[^}]*opacity/.test(rejeu.STYLES_REJEU),
  );
} else {
  ajouter('un incendie a été trouvé pour le rejeu', false);
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
// Une colonne, un défilement : la pile du panneau **ou** le tiroir qui la
// couvre, la carte dans son cadre, l'écran de fin qui remplace tout.
ajouter(
  `cinq zones défilantes, jamais imbriquées (${defilants.join(' / ')})`,
  defilants.length === 5 &&
    ['pan__pile', 'pan__tiroir', 'pan__bloc--rendu', 'ecran__carte', 'fin__cadre'].every((c) =>
      defilants.some((s) => s.includes(c)),
    ),
);
// Le compte rendu a rejoint le bas fixe de la colonne : c'est là que le jeu
// explique, faute de score agrégé, et cela ne peut dépendre ni du défilement
// d'une pile que quatorze secteurs allongent, ni de l'absence du tiroir.
ajouter(
  'le compte rendu est hors du corps, borné et défilant chez lui',
  /<\/div>\s*<section class="pan__bloc pan__bloc--rendu"/.test(panneau.rendrePanneau(moments[0].vue)) &&
    /\.pan__bloc--rendu \{[\s\S]*?max-height: 38%[\s\S]*?overflow-y: auto/.test(sansCommentaires),
);
// Un bloc qui ne défile pas ne doit pas pouvoir descendre sous la hauteur de son
// contenu : il ne rétrécit pas, il déborde sur son voisin. C'est ce que le
// compte rendu faisait par-dessus le registre des gestes.
ajouter(
  'aucun bloc de la pile ne se comprime sous son contenu',
  /\.pan__pile > \* \{ flex-shrink: 0; \}/.test(sansCommentaires),
);
// Le tiroir couvre la pile, il ne s'y insère pas : c'est ce qui fait qu'une
// sélection se voit.
ajouter(
  'le tiroir couvre la colonne et se referme par sa croix',
  /\.pan__tiroir \{[^}]*position: absolute/.test(sansCommentaires) &&
    /data-fermer-secteur/.test(panneau.rendrePanneau(moments[0].vue)),
);
// Il glisse à son ouverture et **pas au réengendrement** : le panneau est refait
// à chaque décision, et rejouer le glissement à l'engagement d'une politique
// faisait repartir toute la colonne alors que rien n'avait bougé.
ajouter(
  'le tiroir ne glisse qu’à son ouverture',
  /\.pan__tiroir--neuf \{ animation: pan-glisse/.test(sansCommentaires) &&
    !/pan__tiroir--neuf/.test(panneau.rendrePanneau(moments[0].vue, { tiroirNeuf: false })) &&
    /pan__tiroir--neuf/.test(panneau.rendrePanneau(moments[0].vue)),
);
// Une politique engagée depuis le tiroir atterrit à l'autre bout de la colonne :
// sans signal, on ne voit pas où elle est partie.
const piedSignale = panneau.rendrePanneau(
  { ...moments[0].vue, enAttente: [{ nom: 'Contrat pastoral', ou: 'Serre du Puy', cout: 4 }] },
  { signale: 0 },
);
ajouter(
  'la décision engagée se signale en se posant dans le récapitulatif',
  /<li class="pan__liste--pose">/.test(piedSignale) &&
    /@keyframes pan-pose/.test(sansCommentaires) &&
    // Rien ne bouge sous « prefers-reduced-motion », la règle du site vaut aussi
    // pour ce mouvement-là.
    /prefers-reduced-motion: no-preference\) \{\s*\.pan__liste--pose/.test(sansCommentaires),
);
// L'engagement d'une politique est le geste le plus lourd du jeu : il ne peut
// pas se présenter comme une ligne de texte soulignée.
ajouter(
  'engager une politique se présente comme un bouton',
  /\.fiche__appel \{[\s\S]*?border: 1px solid var\(--braise\)/.test(sansCommentaires),
);
// L'état de la fiche est dans son encadrement, sur les quatre côtés : deux
// bordures de nature différente sur le même rectangle, dont une seule portait du
// sens, se lisaient comme un défaut d'alignement.
ajouter(
  'les fiches n’ont qu’une bordure, uniforme, et elle porte l’état',
  !/\.fiche::before/.test(sansCommentaires) &&
    ['activable', 'montee', 'vigueur', 'levee', 'abandon'].every((e) =>
      new RegExp(`\\.fiche--${e} \\{[^}]*border-color`).test(sansCommentaires),
    ),
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
