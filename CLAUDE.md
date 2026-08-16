# Projet — site public sur la forêt et le feu

Ce fichier est le contexte permanent du projet. Il a été rédigé lors d'une session de
cadrage préalable. Lis-le avant toute intervention et tiens-le à jour quand une
décision structurante change.

## Ce qu'est ce site

Un site public de vulgarisation rigoureuse sur la forêt, le feu de végétation et la
prévention, en français. Il naît d'un travail de synthèse documentaire mené sur le
territoire du Diois (Drôme), mais s'adresse à un public large intéressé par la forêt,
pas seulement aux acteurs locaux.

Positionnement : ni discours de filière forêt-bois, ni discours militant. La valeur
ajoutée est la traçabilité des sources et l'honnêteté sur les controverses. Quand la
littérature n'est pas unanime, on le dit.

## Public et registre

Public large, curieux, non spécialiste, souvent arrivé par une recherche web sur une
question précise. Il faut donc :

- une idée par page, énoncée dès les premières lignes ;
- des chiffres toujours accompagnés de leur contexte et de leur source ;
- aucun jargon non explicité (« combustibilité », « sérotinie », « débroussaillement »
  méritent chacun leur définition au premier emploi) ;
- assumer la nuance sans noyer le lecteur : un verdict clair, puis les réserves.

## Décisions techniques arrêtées

**Framework : Astro.** Retenu pour trois raisons : contenu en markdown, zéro JavaScript
par défaut (site sobre et rapide), et architecture en îlots permettant d'embarquer des
composants interactifs uniquement sur les pages qui en ont besoin. Les *content
collections* typées servent de socle à la bibliographie.

Écartés : Quarto (registre trop académique pour du grand public), Hugo (templating
pénible, interactivité laborieuse), Next.js (surdimensionné pour un site de contenu).

Version installée : **Astro 7**. Depuis Astro 6.4, le processeur Markdown par défaut
est Sätteri (compilateur Rust rapide) qui n'exécute *pas* les plugins remark/rehype.
On a fait le choix explicite de revenir au pipeline unifié (`processor: unified()` de
`@astrojs/markdown-remark`, dépendance de build uniquement, aucun coût côté client)
pour garder l'écosystème remark : directives des encadrés d'avertissement, notes,
future coquille de citation, et le plugin de typographie française. La configuration
Markdown vit donc dans `astro.config.mjs`.

**Déploiement :** Cloudflare, build statique, sur `questionsforet.fr`. Cloudflare
ne propose plus la création de projets Pages : le site part donc en **Workers
Static Assets**, dépôt `bensventures/questionsforet` connecté, `npm run build`
puis `npx wrangler deploy`. Les requêtes vers des fichiers statiques ne sont pas
facturées et aucun code de Worker n'est déployé, seulement `dist/`.

Trois points à ne pas défaire :

- `wrangler.jsonc` **fige** `compatibility_date`. Sans valeur explicite, wrangler
  retient la date du jour, qui peut dépasser d'un jour le binaire de la machine
  de build et faire échouer le déploiement. Son `name` doit rester celui du
  Worker existant, sous peine d'en créer un second.
- `public/_headers` porte une CSP stricte (`script-src 'self'`, aucune origine
  externe). Elle tient parce que le site ne fait aucune requête sortante :
  toute dépendance externe ajoutée plus tard y échouera visiblement, ce qui est
  le comportement recherché.
- `vite.build.assetsInlineLimit` dans `astro.config.mjs` ne sort du HTML que les
  scripts, afin qu'aucun script inline n'oblige la CSP à tolérer
  `'unsafe-inline'`. Le CSS scoped, lui, reste inline : une requête de moins au
  premier rendu, ce qui compte pour un lecteur arrivé par une recherche web.

**Licence :** CC BY-SA envisagée, pour permettre la réutilisation en réunion publique.
À confirmer.

## Architecture de contenu

Trois collections, plus une collection de données.

| Collection | Nature | Longueur | Rôle |
|---|---|---|---|
| `questions` | Une question, une réponse | 400–800 mots | Porte d'entrée, capte la recherche web |
| `dossiers` | Synthèse longue | 2000–6000 mots | Traitement de fond, structuré en parties |
| `outils` | Objet interactif | — | Quiz, comparateurs, visualisations |
| `sources` | Données bibliographiques | — | Socle transversal, non publié comme pages |

Les `questions` renvoient vers les `dossiers` qui les approfondissent, et inversement.

## La bibliographie est le cœur du système

C'est la décision structurante du projet : **les sources sont des données, pas du
texte**. Elles vivent dans `src/data/sources.yaml`, chaque entrée portant un
identifiant, ses métadonnées et surtout un champ `type` qui qualifie sa solidité.

Taxonomie des types, à respecter strictement :

- `pair` — article évalué par les pairs dans une revue scientifique
- `ouvrage` — livre ou chapitre d'ouvrage académique
- `rapport` — rapport technique, revue technique professionnelle, actes
- `institutionnel` — publication d'agence publique ou d'organisme officiel
- `vulgarisation` — presse, blog, site de vulgarisation
- `plaidoyer` — publication d'organisation avec une position affirmée

Conséquences à tenir dans le code :

1. Aucun appel de référence ne doit pouvoir pointer vers un identifiant inexistant.
   Utiliser `reference()` de Zod pour que le build échoue en cas de lien mort interne.
2. Le composant de citation affiche systématiquement un badge de type. La rigueur doit
   être visible par le lecteur, pas enfouie dans une note.
3. Une page « toutes les sources », filtrable par type et par thème, est une ressource
   en soi. La prévoir dès la v1.

**Archivage.** Chaque source porte un champ `archive` destiné à recevoir une URL
Wayback Machine. Les liens web pourrissent en quelques années et une source morte
dans un document de référence coûte cher en crédibilité. Prévoir un script
(`scripts/archive-sources.ts`) qui soumet les URL non encore archivées à l'API
« Save Page Now » et réécrit le YAML. À lancer manuellement, pas au build.

## Conventions d'écriture

**Typographie française.** Espaces insécables avant `; : ! ?` et à l'intérieur des
guillemets « français ». À traiter une fois pour toutes par un plugin remark plutôt
qu'à la main. C'est le détail qui distingue un site sérieux d'un site bâclé en
français.

**Casse.** Phrases capitalisées normalement, jamais de Titres En Capitales.

**Pas de tiret cadratin (—).** Il sent le texte généré par IA. À la rédaction, ne
pas en produire : selon le sens, employer une virgule (pause), un deux-points
(explication, sans en cumuler deux dans la même phrase), un point (deux propositions
distinctes) ou des parenthèses (incise, surtout si elle contient déjà des virgules).

**Chiffres.** Toujours présentés comme des ordres de grandeur contextuels, jamais
comme des cibles réglementaires. Les distances et obligations applicables relèvent de
la réglementation locale et doivent renvoyer vers elle.

**Avertissement récurrent.** Les pages qui touchent à des prescriptions techniques
doivent porter une mention rappelant qu'elles ne remplacent ni un diagnostic de
terrain ni l'expertise des services compétents.

**Écriture inclusive : dans l'interface du simulateur.** Mots neutres en
priorité (« les propriétaires », « quelqu'un », « une installation »), point
médian quand le neutre force la phrase (« éleveur·euse », « engagé·es »,
« le·la joueur·euse »). La règle vaut pour tout ce que l'interface affiche,
donc aussi pour les lignes de compte rendu et les chaînes causales **écrites
dans le noyau** : le compte rendu affiche le texte du modèle intact, une
convention qui s'arrêterait à la couche de rendu produirait deux registres dans
le même bloc. Les pages éditoriales (`questions`, `dossiers`) ne sont pas
concernées et restent inchangées.

## Périmètre de la v1

Ne pas viser « toute la forêt ». Le matériel déjà rassemblé sur le feu suffit :

- le dossier de synthèse « Vivre avec le feu » (existe en .docx, à convertir) ;
- un dossier sur l'inflammabilité comparée des essences du Sud-Est ;
- une dizaine de `questions` extraites de ces deux dossiers ;
- un `outil` : le vrai/faux sur le pin noir (dix affirmations, déjà rédigées).

Publier cet ensemble avant d'élargir à d'autres thèmes forestiers.

## Garde-fous

- Ne pas ajouter de dépendance JavaScript côté client sans nécessité démontrée. Le
  site doit rester consultable et rapide sur une connexion médiocre.
- Ne pas inventer de référence. Si un chiffre n'a pas de source dans `sources.yaml`,
  il ne sort pas.
- Ne pas transformer les nuances en affirmations. Les formulations du type « vrai et
  faux » ou « faux pour l'arbre, à nuancer pour le peuplement » sont volontaires.
- Vérifier l'API des *content collections* contre la documentation Astro en vigueur
  avant de coder : elle a évolué entre les versions majeures (loaders `glob` et `file`,
  emplacement du fichier de configuration).

## État des lieux

Le socle éditorial est en place et le site build proprement :

- `src/content.config.ts`, schémas des collections, et `src/data/sources.yaml`,
  bibliographie de 74 entrées typées, validée au build par le schéma Zod ;
- les plugins de build : typographie française, citations `[[cite:id]]`
  numérotées d'après le frontmatter, et enveloppe de défilement des tableaux
  larges, tous branchés dans `astro.config.mjs` via le processeur unifié ;
- le composant de citation à badge de type et la page « toutes les sources » ;
- les trois collections et leurs routes, `dossiers` compris (index, page,
  sommaire tiré des titres de niveau deux, avertissement, liens inverses depuis
  les questions qui déclarent `approfondit`) ;
- le dossier « Vivre avec le feu », converti et sourcé.

Prochaine étape : la couche décision du simulateur, qui n'a pas encore de
langage visuel, puis l'îlot Astro qui portera la carte.

## Identité visuelle : « encre & braise »

Thème unique et assumé, ancré dans le sujet (manuel de terrain naturaliste) :
parchemin chaud, encre brun-noir, accent **braise** (`--ember`, terre de Sienne
brûlée) pour l'interaction et la sémantique du feu, **vert pin** (`--pine`) en
secondaire. Tout passe par des tokens CSS dans `src/styles/global.css` — pour
re-skiner, on touche aux variables, pas aux styles scoped des pages.

- Polices auto-hébergées via Fontsource (dépendances de build, aucune requête
  externe) : **Fraunces** (titres, caractère de vieille monographie) et **Hanken
  Grotesk** (texte et interface). Importées dans `src/layouts/Base.astro`.
- Motion sobre : une seule révélation orchestrée au chargement (`@keyframes rise`
  + décalages), désactivée sous `prefers-reduced-motion`. Pas de JS ajouté.
- Un seul thème clair, volontairement (pas de bascule sombre) : cohérence avant
  exhaustivité, conforme au garde-fou « site sobre et rapide ».

## Simulateur « Vivre avec le feu »

Outil `outils` de `format: simulation`. **La v2 est gelée** (`src/sim/FROZEN.md`)
et la page reste en `brouillon: true`. Le modèle v3 est spécifié avant
implémentation dans `research/simulation/v3/BRIEF_SIMULATEUR_V3.md`, patch
compris, et ce document remplace le brief initial et son amendement, devenus
historiques.

Pourquoi la reprise : en v2, état de la végétation, propagation, score et rendu
vivaient dans le même bloc. Aucune variable ne pouvait être raisonnée isolément
et la calibration se faisait à l'aveugle. Trois règles priment désormais sur
toute fonctionnalité : aucun état sans processus, aucun levier sans chaîne
causale visible, aucune variable de résultat sans expression visuelle.

**Architecture en trois couches**, la séparation étant vérifiable par le fait
que le noyau tourne sous Node sans navigateur :

- `src/model/` — noyau pur, `avancer(état, décisions) → état`, déterministe à
  graine fixée. Aucune référence au rendu. Le feu calcule et renvoie la trace
  des braises ; il n'anime pas.
- `src/harness/` — exécution sans interface, cinq stratégies scriptées,
  assertions du §12 et du patch 3. À construire **avant** tout réglage.
- interface — en dernier, une fois la calibration passée (§14). Construire
  l'interface avant reproduirait exactement la situation de la v2.

**Écarts au brief assumés**, à ne pas défaire sans raison :

- `friche` est un type à part entière, avec une vitesse de propagation de 1,8
  contre 0,75 pour la chênaie (assertion 4 du patch 3) ;
- une cellule vaut **50 m**, pas 25. À 25 m, être défendable imposait de traiter
  deux anneaux complets par maison, ce que le plafond d'entretien rendait
  inatteignable : mesuré, 3 % du bâti seulement était défendable et toute la
  mécanique du patch 1 restait lettre morte. Conséquence inscrite par
  l'amendement 2 B.2 : **ni la zone 0 ni la plage 5–20 m ne sont représentables
  dans la grille**, ce sont des attributs de construction (`durcissement`,
  `profondeurTraitee`). Ne pas tenter de les y remettre ;
- une construction n'est confrontée au front qu'une fois par incendie. Sans
  cela, chaque voisine en feu la testait à chaque pas de temps et le front
  écrasait mécaniquement les braises.

**Trois bugs trouvés par le harnais**, qui justifient à eux seuls son
antériorité : la sévérité n'était pas normalisée (toutes les parcelles
finissaient en houppier consommé, et les trois issues du §8.1 redevenaient
deux) ; le « % brûlé » comptait les passages et non les parcelles distinctes ;
l'arbitrage d'abandon budgétaire ne pouvait couper que le contrôle des OLD,
jamais l'éclaircie déficitaire, si bien que la conformité s'effondrait à 6 %.

**Amendement 2 appliqué intégralement.** La surface brûlée n'est plus une cible
mais une observation avec garde-fou 20–80 %, et n'est **jamais** scorée : en
poser une borne haute revenait à faire de la minimisation du feu un objectif,
c'est-à-dire le réflexe que le jeu doit défaire. La cible de densité porte sur
la **fraction stratégique** (couronnes et secteurs sous contrat), pas sur le
massif. Le plafond d'entretien ne vise que le traitement forestier : les
cinquante mètres autour des maisons relèvent de l'obligation légale, le
propriétaire exécute et paie, le joueur ne finance que le **contrôle**, dont le
taux de conformité plafonne sous 100 % et lui échappe. L'assertion 1 ne porte
que sur les constructions conformes.

**Calibration : les douze critères du §12 sont tenus** (50 parties × 40 tours,
`src/harness/calibrer.ts`). Joueur compétent : 85 % du bâti, 53 % de la fraction
stratégique sous le seuil, 73 % de surface parcourue (observation), 1,3
renoncement par partie. Les quatre mauvaises stratégies finissent différemment
et la compétente est battue sur quatre axes.

**Pente normalisée (`RELIEF` dans `params.ts`).** `Cellule.pente` se disait
« 0–1 normalisé » mais recevait un gradient d'altitude brut, dont 97 % des
valeurs tombaient sous 0,2 : `penteMoyenne` (0,35) et `penteImpossible` (0,72)
n'étaient jamais franchis, la pénalité de pente sur la défendabilité était
lettre morte et « le feu monte » n'avait presque aucune assise mécanique. La
normalisation ancre les 5 % les plus raides d'une carte sur 0,50, valeur choisie
au harnais et non au jugé : `economie.ts` multiplie le coût des travaux par la
pente, si bien qu'ancrer plus haut rend l'éclaircie déficitaire partout et fait
tomber la fraction stratégique à 34 %, sous la cible du §12. Reste un manque
assumé, `penteImpossible` n'étant franchi que par une cellule sur mille.

**Trois champs d'observation** ajoutés pour le rendu, qu'aucune règle ne lit :
`saisonsDepuisFeu` (le vieillissement se fait en tête de tour, **avant**
l'allumage, sans quoi une parcelle parcourue ne vaut jamais zéro et la trace du
feu de l'année est indistinguable d'une cicatrice), `altitude` (le champ continu
dont dérivent les courbes de niveau, que `positionTopo` ne peut pas remplacer),
et `dejaBrulee` qui existait déjà.

**Stratégie de diagnostic à conserver** : `durcissementSeul` dans
`src/harness/strategies.ts`. Elle n'est pas l'une des cinq du §12, elle teste la
thèse centrale du brief — le durcissement est-il vraiment le meilleur
investissement ? Verdict : 85 % du bâti pour 163 dépensés, contre 54 % au
périmètre seul. La thèse tient dans l'implémentation, et le levier reste
médiocre sur tous les axes de paysage (21 % de fraction stratégique, 0 % de
mosaïque), donc le dilemme n'est pas résolu par lui.

**Trois défauts de modèle trouvés par ce test**, à ne pas réintroduire :

1. Les secours étaient un **substitut** et non une couche supplémentaire :
   l'échec d'une équipe détruisait une maison qu'un durcissement seul aurait
   sauvée. Être défendable rendait donc plus exposé qu'être durci et ignoré du
   front, et la stratégie qui finançait le contrôle des OLD y perdait du bâti.
   Un échec des secours retombe désormais sur l'état propre de la construction.
2. L'éclaircie ne portait pas sur les couronnes, alors que l'amendement 2 range
   les couronnes dans la fraction stratégique dont on demande de tenir la
   densité : on exigeait une cible sans donner de levier.
3. L'arbitrage d'abandon budgétaire ne pouvait couper que le contrôle des OLD,
   jamais l'éclaircie déficitaire, si bien que la conformité s'effondrait à 6 %.

**Ce qu'on ne fait pas** : relever le plafond de conformité (0,78) pour faire
passer un test. Ce paramètre porte un fait de terrain documenté — le
non-respect des OLD est massif — et ne se règle pas pour convenir à une cible.

**Comptabilité des partenaires, en trois grandeurs** (`src/model/partenaires.ts`).
`moyens.eleveurs` était un compteur unique, et un compteur unique ne peut pas
distinguer un succès d'une perte : le même zéro disait « les deux sont sous
contrat, le sous-bois est tenu » et « les deux sont partis, le levier est mort ».
Le noyau expose donc `disponibles`, `engages`, `perdus` et `retourAu`, jamais
additionnés. Le manque n'était pas que d'affichage, il masquait deux mécaniques
mortes : l'engagement était **irréversible** (rien ne rendait l'éleveur au vivier
quand le contrat cessait) et le **retour n'existait pas**, `toursAvantRetour`
étant déclaré et lu par personne, comme `eleveursMax`. L'asymétrie 6 / 18 qui
porte l'enseignement vivait dans le commentaire, pas dans le modèle. Conséquence
mesurée sur le joueur compétent : déprise au tour 6, premier contrat au tour 7,
retour au tour 24, **second contrat au tour 25** que l'ancien code interdisait à
jamais. La surface tenue passe de 77 à 125 parcelles, la fraction stratégique de
53 à 51 % (cible : plus de 50 %, marge désormais mince, à surveiller) et les
douze critères du §12 restent tenus. Trois assertions de `calibrer.ts` gardent
la séparation des trois grandeurs.

Au passage, `moyens.equipes` était un état que personne ne lisait, le feu
utilisant `LUTTE.equipesParTour` : `feu.ts` lit désormais l'état, seule source
de vérité que l'interface pourra afficher.

## Rendu de la carte

Le code vit dans `src/rendu/` : `palette.ts` (couleurs et bornes de paliers),
`cellule.ts` (composition d'une parcelle), `carte.ts` (assemblage des sept
couches), et `glyphes.svg`, **engendré, jamais modifié à la main**.

Quatre scripts, tous relançables :

| Script | Rôle |
|---|---|
| `extraire-glyphes.mjs` | recopie symboles et motifs depuis le handoff |
| `planche-verification.mjs` | essences × paliers, états de feu, motifs |
| `planche-carte.mjs` | une vraie partie rendue, plus les assertions (le tour intermédiaire est le pire feu **hors tours 1 et 40**, sans quoi une partie dont le plus gros incendie tombe au dernier tour ne produit que deux instantanés) |
| `banc-essai.mjs` | banc interactif autonome : graine, tour, fenêtre, couches |
| `planche-panneau.mjs` | le panneau de décision sur une vraie partie, plus ses contrôles |

**Deux lots de design, deux rôles.** `design_handoff_langage_de_paysage/` est la
charte (vocabulaire, rampes, calques, jauges). `design_handoff_carte_de_reference_v3/`
est la **cible d'implémentation et le test d'acceptation visuel** ; c'est elle
qui fait foi pour les assets. De la v1 à la v3, les seize symboles n'ont pas
bougé : la v2 a refait les motifs de sous-bois (du trait au semis de points) et
supprimé les hachures de versant, la v3 a refait le semis des arbres (bande
stratifiée, effectifs 3 · 5 · 8 · 12).

**Ce que le handoff suppose et que nous n'avons pas.** Sa carte fabrique son
relief par une formule et en déduit humidité, pente, essences et zone brûlée.
Ici tout cela vient de la simulation : ses sections 2 et 3 ne se transposent
pas, ses sections 4 à 11 décrivent le rendu et sont suivies à la valeur près.
Quatre adaptations, toutes mesurées plutôt que choisies :

- **bornes de paliers** relevées sur des parties réelles
  (`src/harness/distributions.ts`) ; des quartiles théoriques sur 0–1 laissaient
  57 % des cellules au palier sec et **aucune** au palier frais ;
- **amplitude de relief de 240 m**, le serrage des courbes portant seul la
  raideur depuis le retrait des hachures ;
- **talweg** suivant le point le plus bas de chaque colonne, **crête** le plus
  haut avec coupures, faute d'axe analytique ;
- **front** orienté vers l'amont réel (le gradient) et non vers le nord de la
  planche, nos versants n'ayant pas d'orientation privilégiée.

**Deux écarts assumés, actifs par défaut**, et désactivables pour comparaison :

1. les couvertures basses sont **semées** comme les peuplements, garrigue,
   friche et pelouse passant à six instances ;
2. sur les **tapis** (garrigue, pelouse, friche), la charge de sous-bois est
   portée par le **nombre de touffes** et le motif de sol correspondant est
   retiré. Raison : sur ces types la densité de tiges est un canal mort, le
   modèle ne la faisant pas croître, tandis que le sous-bois *est* la
   végétation ; le motif et les touffes disaient la même chose deux fois. Le
   sward de SB 1 reste dessiné, sa régularité signant l'entretien, et le rocher
   est exclu, son sous-bois étant gelé à un tirage de génération.

**Pièges à ne pas rouvrir :**

- le sprite se masque **par la taille**, jamais par `display:none` : un `<use>`
  y trouve ses symboles, un `fill="url(#motif)"` n'y trouve rien, et le
  sous-bois disparaît sans erreur ;
- juger à l'**échelle native**, cellule de 180 px : réduite, la carte perd
  d'abord le semis (disques de 1 à 2 px de rayon), puis les paliers de densité ;
- **ne pas écrêter les glyphes** à leur cellule, le débord des houppiers faisant
  le continu du couvert ;
- **ne pas appliquer la règle de dégagement des courbes cellule par cellule** :
  le sous-bois saturant, elle hachait les isolignes en segments isolés. Elle se
  décide une fois par vue.

**Trois états du bâti dérivés** (`extraire-glyphes.mjs`), qu'aucune charte ne
livrait : deux paliers de durcissement, qui épaississent le contour comme le
demande le langage de paysage (2,2 · 3,6 · 5), et une **ruine**, sans laquelle
une construction détruite se rendait debout. La ruine reprend l'emprise du
bâti, toiture emportée, avec ses deux couleurs et **rien que des angles
droits** : la famille anguleuse est la seule du langage, et un premier essai en
dent de scie se lisait comme un buisson sombre. Ils sont engendrés depuis
`m-bati` et non dessinés à la main, avec garde-fou si le handoff le retouche.
Le sprite compte donc seize symboles de la carte de référence et trois dérivés.

**Calque secteur** (`rendreCalqueSecteurs`, planche 4 du langage de décision).
Rendu **séparément** de la carte, et non comme une couche de plus : à l'échelle
native le paysage pèse 727 Ko de SVG pour 1040 cellules de semis, qu'un simple
survol de secteur ne doit pas redessiner. Le calque, lui, tient en 4 Ko.

Le contour d'un secteur se trace en arêtes **orientées**, l'intérieur toujours
à droite : les côtés de cellule dont la voisine est dehors se chaînent en
boucles, ce qui donne gratuitement le bon sens pour les trous et surtout la
normale intérieure de chaque arête. Le liseré d'état en retrait de 12 px en
dépend : sommets alignés fusionnés, deux arêtes consécutives sont
perpendiculaires, et le sommet rentré est exactement le sommet décalé de la
somme des deux normales. Aucun rognage à faire. Aux pincements en diagonale, le
parcours **tourne à droite d'abord**, ce qui longe l'intérieur au plus près.

Contrainte dominante, vérifiée par la planche : **aucun aplat**, même à 8 %.
Seuls les textes et les crans d'adoption portent un remplissage. Les équerres
de sélection se posent sur l'encombrement du secteur, « les quatre angles »
n'ayant pas de sens sur un polygone rectilinéaire quelconque.

## Page de visualisation

`src/components/outils/SimulateurV3.astro` remplace la v2 sur la route des
outils. **La page est la porte d'entrée, pas le simulateur** : elle porte le
texte, un appel à l'action, et l'écran de fin de partie ; le simulateur s'ouvre
**par-dessus, sans marge, sur toute la fenêtre**. Une carte est un rectangle
paysage ; logée dans le flux d'un article elle n'a qu'une colonne étroite et
déborde en hauteur de plusieurs milliers de pixels. C'est le seul cadre au bon
rapport, et c'est là que l'échelle « massif entier » tient enfin d'un coup
d'œil. Ouverture et fermeture par ancre (`:target`), donc sans script, et
l'adresse dit dans quel état on est.

Une vraie partie, rendue au build, sans un octet de JavaScript. La page pèse
1 Mo, ce qu'autorise `brouillon: true` (les brouillons sont exclus des builds
de production). Le composant v2 reste sur disque, gelé et sans importateur.

**Piège retrouvé une seconde fois** : un `<style>` scopé d'Astro ne s'applique
**pas** au HTML injecté par `set:html`. La hauteur du cadre y était, elle n'a
jamais pris, l'écran n'avait donc aucune hauteur et la carte sortait de la
fenêtre. Même piège que les jetons du panneau, une couche plus haut : tout ce
qui habille du HTML injecté doit vivre dans la feuille globale.

Pour la voir : `astro dev`, ou passer momentanément le filtre de
`src/pages/outils/[...id].astro` à `true` pour un build complet.

## Panneau de décision

`src/rendu/panneau/` : `jetons.ts` (couleurs et polices du handoff, source
unique), `styles.ts` (la feuille, exportée en chaîne pour que la planche Node et
l'îlot Astro lisent la même), `vue.ts` (ce que le panneau lit dans l'état),
`blocs.ts` (bandeau, doctrine, fiches, compte rendu, gestes), `index.ts`
(assemblage). Fonctions pures rendant du HTML, vérifiées sur une planche
statique **avant** tout câblage : `scripts/planche-panneau.mjs`, onze contrôles,
sur une vraie partie.

L'ordre du panneau descend du durable vers l'immédiat, et les gestes sont
contre le bord bas : leur place dans la lecture dit qu'ils soulagent sans
transformer.

**Un écart assumé sur la jauge.** Le handoff borne la **surface tenue**, le
plafond étant le point où la charge d'entretien égale la recette. Cela suppose
une charge proportionnelle à la surface ; dans l'économie implémentée elle ne
l'est pas (le contrôle des OLD se paie par construction, le contrat pastoral
s'autofinance une fois établi). La surface tenue dépasse donc régulièrement ce
seuil sans qu'aucun plafond ne soit franchi, et la jauge aurait hachuré en
braise pour une fausse alerte. La jauge borne donc **la charge par rapport à la
recette**, ce que le handoff borne réellement, et la surface tenue s'affiche en
observation dessous. En v3.0 la surface est de toute façon bornée par les
partenaires, pas par la charge.

**Deux pièges trouvés au rendu**, invisibles à la lecture du code :

1. `vueDuPanneau` renvoyait une **référence** sur `moyens.eleveurs`. Le noyau
   mutant son état en place, trois instantanés d'une même partie affichaient
   tous le vivier du dernier tour. Une vue est une valeur : elle copie.
2. Les jetons n'étaient posés que sur `.pan`. Toute fiche rendue hors du
   panneau perdait ses variables et sortait ses aplats en transparent, les
   crans d'adoption disparaissant **sans erreur** : le piège du sprite masqué
   par `display:none`, une couche plus haut. Ils sont désormais portés par
   `.pan, .decision`, et la planche vérifie que toute variable lue est déclarée.

**Écran de fin de partie** (`fin.ts`, planche 7). Quarante étés relus sans note,
sans étoile et sans total : le jeu n'a pas de solution optimale, c'est un
résultat mesuré, et un indice unique le masquerait. L'écran ventile donc les
causes, et le rapprochement des deux ventilations (par cause, puis par état de
la construction perdue) est la seule leçon qu'il s'autorise.

Quatre compteurs ont dû entrer dans le modèle, tous **additifs et sans effet sur
le tirage** (calibration identique, vérifiée au diff) : `cumul.departs`, sans
quoi « 19 départs éteints » n'a pas de dénominateur et le paradoxe de la
suppression ne se lit plus ; `cumul.pertesDurcies` et `cumul.pertesConformes`,
relevés **au moment de la perte** parce que la conformité d'une construction
détruite continue de se relâcher, ce qu'aucune règle ne lit mais qui fausserait
une lecture d'après-coup ; et `cumul.renoncements`, que le harnais déduisait en
comparant les tours. Ce dernier **majore** l'ancienne déduction : une politique
établie et coupée dans le même tour n'apparaissait dans aucun des deux relevés,
alors que le joueur l'avait payée puis perdue. Identiques sur cinq stratégies,
la compétente comprise (1,5), ils ne s'écartent que sur « coupures uniquement »
(7,0 contre 7,8). `Etat.pinNoirDepart` complète le lot, la conversion en lande
se mesurant par différence et s'affichant en hectares.

**Bande de coupe** (planche 8), le moment le plus fort de la partie. Elle reste
une **ligne du compte rendu**, à son rang chronologique, après le bouclage qui
l'explique : aucune fenêtre ne s'ouvre, l'événement appartient au tour et non
au-dessus de lui. Trois exclusivités font sa force, et aucune n'est une couleur
de plus : seul fond braise pleine largeur de l'interface, seule ligne composée
en serif, **seule adresse à la deuxième personne** de tout le jeu. Elle ne
propose ni bouton, ni accusé de réception, ni remède : arrêter le jeu pour faire
signer un accusé transformerait une conséquence en sanction.

`Tour.coupees` porte l'événement, symétrique de `braises` et `arrivee` : le
noyau dit **ce qu'il a coupé**, l'interface écrit les conséquences datées
(emprise réelle, délais tirés de `ENTRETIEN`, `PARTENAIRES`, `DENSITE`,
`CONFORMITE`). Les tirer de la phrase du modèle aurait été fragile, et contraire
à la séparation des couches ; le texte n'est lu que pour retrouver le rang de la
ligne dans le fil.

Deux fautes de français corrigées au rendu, la première dans le noyau : la ligne
de coupe écrivait « *Programme d'éclaircie interrompue* », participe accordé au
féminin alors que trois noms de politiques sur quatre sont masculins ; elle est
désormais sans participe. Et le titre de la bande pose l'article et l'accord à
partir du nom du modèle, sinon on lit « faute de moyens, programme d'éclaircie
est coupé ».

La graine 1000 traverse ses quarante étés **sans une seule coupe** : 1,5 par
partie est une moyenne. La planche en prend donc une autre (1007, coupe à
l'été 18) plutôt que de fabriquer l'événement.

**Composition de l'écran** (`ecran.ts`, planche 9). Panneau de 536 px pris sur
le cadre, la carte occupe le reste. **Deux zones défilent et pas une de plus** :
le compte rendu dans le panneau, la carte dans son cadre ; les fiches du secteur
restent en place.

**La règle « la carte se déplace, elle ne se réduit pas » est amendée**, et
c'est le seul écart de fond au langage de décision. Appliquée seule, elle donne
7 × 6 parcelles sur 40 × 26, soit un vingtième du versant : à l'usage, l'écran
devenait une chasse au défilement horizontal, et le cadre haut de 78 vh
ajoutait un second défilement vertical à celui de la page. Une spécification
écrite pour un spécimen 1800 × 1080 n'est pas une preuve de jouabilité.

**Trois échelles utiles : 1:2, 1:3 (défaut), 1:4.** Deux bornes ont été
essayées puis retirées, inutilisables chacune à sa manière : l'échelle native
1:1, qui ne montre qu'un vingtième du versant et ne sert qu'à juger le dessin,
et un ajustement au cadre faisant tenir les 40 × 26, où l'on ne distingue plus
rien. **Chacune dit ce qu'elle perd** : c'était le vrai objet de la règle de la
charte, réduire en silence reste interdit. La planche vérifie que les trois
portent leur mention et qu'aucune ne sort de 1:2 – 1:4.

**Le déplacement se fait au curseur**, comme sur une carte en ligne, et c'est
le **premier JavaScript du simulateur** : une quinzaine de lignes sans
dépendance, servies depuis le domaine (la CSP interdit l'inline). Le garde-fou
demande une nécessité démontrée ; elle l'a été par deux essais successifs, les
deux barres de défilement étant impraticables sur un plan de 40 × 26 et aucune
mise en page ne rattrapant cela. Échelles, bascule et plein écran restent en
CSS.

Pendant le plein écran, la page derrière est **verrouillée**
(`html:has(.plein:target) { overflow: hidden }`) : sa barre de défilement
restait sinon à droite de celle du panneau, et deux ascenseurs côte à côte
n'appartiennent à personne.

La règle de la planche 9 est que **tout élément absent des planches antérieures
est un défaut, pas une trouvaille**. Trois ajouts sont donc assumés, et le
contrôle échoue au quatrième : la barre de position (imposée par le cadrage), la
bascule carte / panneau des petits écrans, et le sélecteur d'échelle.

Piège à ne pas rouvrir : le sprite se pose **hors de la boîte de défilement**.
Il se masque par la taille (0 × 0), donc la règle d'échelle, qui donne une
largeur à tout SVG qu'elle trouve, le ferait apparaître à pleine page.

**Petits écrans : bascule carte / panneau**, en CSS pur (deux boutons radio et
leurs étiquettes), sans un octet de JavaScript. La cellule garde ses 180 px :
c'est la réduction qu'on refuse, pas la place. La fenêtre visible est **déduite
du cadre** par `fenetreVisible()` plutôt qu'écrite, et la barre de position
l'affiche ; sur page statique elle vaut pour le défilement au chargement,
l'îlot la mettra à jour au défilement.

**Ce qui manque avant l'îlot :** le câblage. Restent ouvertes, non tranchées par
les handoffs : la spécification du rejeu d'incendie, le plancher
d'accessibilité clavier, la reprise de partie, l'entrée et la sortie de partie. La coupure de combustible n'a toujours pas d'état
persistant dans le modèle. Cinq questions ne sont tranchées par aucun handoff :
petits écrans (réponse retenue : bascule carte / panneau, cellule maintenue à
180 px), spécification du rejeu d'incendie, accessibilité clavier, reprise de
partie, entrée et sortie de partie.

DISTILLED_AESTHETICS_PROMPT = """
<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Focus on:

Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.

Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.

Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.

Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>
"""
