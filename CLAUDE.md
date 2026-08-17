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

## Trois états de publication

`brouillon` retire la page du build de production : elle n'existe pas en ligne.
**`prive`** la construit et la sert, mais l'exclut de toutes les listes et lui
pose un `noindex, nofollow` : c'est l'état d'une page qu'on donne à relire par
son adresse, à quelques personnes, avant de l'annoncer. Sans ce troisième état,
faire tester une page revenait à la publier.

Le champ vit dans `champsCommuns`, donc les trois collections l'ont. Deux règles
à ne pas confondre en le lisant : les **routes** (`[...id].astro`) construisent
les pages privées, c'est tout l'intérêt ; les **listes** les écartent, index de
collection comme liens croisés. Un bandeau le dit au relecteur, qui doit savoir
qu'il est sur une adresse non annoncée.

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

Outil `outils` de `format: simulation`. **La v2 est supprimée** depuis que
l'îlot v3 joue (elle vit dans l'historique git, avec son `FROZEN.md`), et la
page reste en `brouillon: true`. Le modèle v3 est spécifié avant
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
  écrasait mécaniquement les braises ;
- la troisième action ponctuelle du §9.2, « traiter un point noir », s'appelle
  **débroussailler une parcelle** et ne remet plus le statut « géré ». Son nom
  promettait ce que le modèle ne modélise pas : rien ne désigne un point noir
  nulle part, n'importe quelle parcelle non bâtie pouvait être « traitée ». Le
  statut « géré » tombait sous le même reproche, le geste portant sur le
  sous-bois et non sur la densité de tiges, qui relève de l'éclaircie. Reste un
  geste simple, une coupure d'une seule parcelle, et le piège de la surface
  ouverte laissée sans reprise s'applique à elle comme aux autres. Aucune
  stratégie du harnais ne l'emploie : la calibration est inchangée.

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
`src/harness/calibrer.ts`). Joueur compétent : 84 % du bâti, 52 % de la fraction
stratégique sous le seuil, 73 % de surface parcourue (observation), 3,2
renoncements par partie. Les quatre mauvaises stratégies finissent différemment
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

**Doctrine : posture héritée, réforme fenêtrée** (patch au brief v3,
`research/simulation/patch_doctrine_posture_heritee.md`). La doctrine était un
interrupteur gratuit et instantané, ce qui est l'inverse du terrain et vidait le
paradoxe de la suppression : on lisait la météo de l'année et on basculait. Le
territoire **hérite** désormais du cran 1, que le premier été confirme ou
réforme gratuitement — le choix fondateur, sans lequel le piège serait une
fatalité. Ensuite l'**effet** de la posture reste immédiat, mais son
**changement** coûte 8 et prend trois étés, sauf dans la fenêtre ouverte par un
incendie où il coûte 2 et prend un été. Une réforme engagée court seule.

Valeurs **mesurées, pas choisies** : 8 vaut les deux tiers d'une recette
annuelle sur un budget qui tourne entre 0 et 30, donc payable et jamais
indolore ; 2 dans une fenêtre qui apporte +9 par tour rend le moment évident ;
trois étés dépassent l'horizon où l'on peut anticiper la sécheresse, un seul
fait atterrir la réforme pour la saison suivante. Jamais de verrou sans issue :
les décisions passent avant le bouclage, mais la fenêtre dure trois étés et le
+9 tombe entre-temps.

**Deux conséquences trouvées à la mesure.** « Ne rien faire » devenait la copie
exacte de « extinction maintenue » et le §12 perdait une de ses quatre défaites
distinguables : elle garde donc son cran d'ouverture au 2, « ne rien faire »
portant sur le terrain et non sur la posture. Et la compétente, qui réforme vers
le feu géré dans la première fenêtre, **perd 0,8 point de bâti** (83,6 contre
84,4 si elle restait au cran 2) : c'est la thèse, pas un défaut de réglage. Le
critère « meilleure sur le bâti » ne se compare donc plus qu'aux **cinq
stratégies du §12** et non à la sonde « durcissement seul » (84,0), qui n'en
fait pas partie : mêler une sonde de diagnostic à un critère de calibration le
faisait basculer sur quatre dixièmes de point.

Le §12 est repassé au vert, avec trois assertions de plus : la posture héritée
tient les quarante étés chez qui ne la réforme jamais, le joueur informé
l'esquive à l'ouverture, et réformer hors fenêtre coûte nettement plus que
dedans (10 de dépense cumulée mesurée entre deux sondes identiques par ailleurs).

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

**Une seule ligne par secteur, et son encre porte l'état.** La planche 4 posait
deux traits, la limite plus un liseré tireté en retrait de 12 px reprenant le
filet de la fiche : sur un fond de paysage déjà dense, cela donnait un trait
plein pris en sandwich entre deux tiretés, bruyant et illisible. Au repos la
ligne est **claire**, ce qui se lit comme une coupure sans ajouter d'encre ;
elle passe en vert clair (montée en charge), vert pin (en vigueur) ou braise
(péril). « Activable » ne s'affiche plus sur la carte : le panneau le dit, et le
signaler partout revenait à souligner tout le versant. **La sélection ne change
pas l'encre** : le voile la dit déjà, une limite braise faisait doublon, et le
trait ne fait que s'épaissir comme au survol.

**Un seul aplat, et il est daté.** La planche interdit tout aplat, même à 8 %,
au motif que le grain de sous-bois justifie la décision. Pendant une sélection,
un voile sombre (25 %) couvre pourtant les autres secteurs, **jamais le secteur
choisi**, dont le contour perce le voile en `fill-rule="evenodd"`. La règle
protégeait la lecture de ce qu'on regarde ; elle est tenue, et les autres
retrouvent leur paysage dès qu'on referme le tiroir. La planche vérifie que le
voile épargne bien le choisi.

**Le nom d'un secteur ne s'affiche qu'au survol ou sur le choisi.** Quatorze
étiquettes posées en permanence recouvraient le semis et les courbes, et
disaient partout ce dont on n'a besoin qu'à un endroit : le nom confirme ce
qu'on désigne, il ne cartographie pas le versant. Recliquer le secteur choisi le
referme, comme la croix du tiroir.

Équerres, filet de garde et liseré en retrait ont disparu avec ces
simplifications : le calque est passé de 4,4 à 2,4 Ko.

**Le calque est du chrome, pas du paysage**, et cela a une conséquence que la
planche 4 ne pouvait pas voir, puisqu'elle est écrite à l'échelle native. Tout
y était en unités de carte : à 1:3, la limite de 2 px en mesurait 0,67 et une
équerre de 20, sept. La sélection était invisible. Les **épaisseurs** sont donc
tenues par `vector-effect="non-scaling-stroke"`, et la **géométrie** (équerres,
retrait du liseré, corps des étiquettes) est multipliée par le diviseur
d'échelle, que l'îlot lit sur le bouton radio coché.

**La sélection passe en braise**, limite et nom du secteur. Épaissir un trait
d'encre de 2 à 3,5 px ne se voyait pas sur un fond de paysage ; la couleur
porte, et la braise dit précisément « interaction » dans la charte.

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

**La page d'entrée porte quatre choses** : l'appel à l'action, la **légende des
glyphes** engendrée depuis la palette du rendu (rien n'y est recopié, donc rien
ne peut mentir sur ce que le joueur verra), **six façons de jouer et ce qu'elles
donnent**, et **ce sur quoi le modèle s'appuie**, mécanisme par mécanisme.

**Les six façons de jouer sont jouées au build**, par le harnais de calibration
lui-même, cinquante parties de quarante étés chacune : aucun chiffre n'est
recopié, ils sortent du noyau que le lecteur va manipuler et ils bougeront le
jour où le modèle bougera. C'est la règle de la légende, une couche plus loin,
et elle coûte 1,9 s de build sur une page qui n'est de toute façon pas dans le
build de production. La description de chaque ligne de conduite doit pouvoir se
vérifier dans `src/harness/strategies.ts` ; le commentaire de fin, lui, énonce
le seul enseignement que le tableau porte, et il a été **réécrit après la
mesure** plutôt qu'avant.

Une sonde a rejoint le harnais pour l'occasion, `eclaircieSansProtection`, hors
des cinq du §12 : éclaircir partout **coûte le double de l'inaction pour son
résultat exact** (37,8 % du bâti contre 37,6 %, 168 dépensés contre 80), alors
que le peuplement s'ouvre pour de bon (56,6 % de fermé contre 71,3 %). Le budget
part dans un cycle d'établissements coupés puis rétablis, quatorze fois par
partie, et rien de ce qu'elle achète ne protège une construction. Écrite avec un
autre ordre de secteurs, une première version tombait à 32 % et donnait un « pire
que rien » plus spectaculaire : c'est l'ordre du harnais qui a été gardé, pas le
chiffre le plus frappant.

Ce dernier point réparait une régression de fond : la route excluait la
bibliographie pour le format simulation (`!isSimulation && biblio.length`), si
bien que l'objet le plus argumenté du site était le seul sans traçabilité, sur
un site dont la colonne vertébrale est que les sources sont des données. Les
rattachements de `src/lib/sources-simulateur.ts` sont **portés de la v2**, pas
inventés ; les quatre références qui documentaient des politiques que la v3.0
n'implémente pas (brûlage dirigé, hydrologie) ont quitté le frontmatter, on ne
source pas une règle absente. Les **thèmes** `brulage-dirige` et `hydrologie`
sont partis avec, pour la même raison : ils annonçaient au lecteur, et aux pages
de thème, un contenu que l'outil ne porte pas.

**La page est passée en `prive`** : construite, servie, mais listée nulle part et
en `noindex`, le temps d'une relecture par quelques personnes. C'est ce qui
autorise encore la carte entière à l'échelle native. Le HTML pèse 913 Ko,
presque tout en SVG, soit **126 Ko une fois compressé** : tenable pour un test,
à régler avant de la lister.

**Le texte d'introduction a été récrit pour la v3, et raccourci de moitié**
(`src/content/outils/`). Il datait de la v2 et promettait ce qui n'existe plus :
vingt étés au lieu de quarante, le brûlage dirigé et l'ouvrage hydraulique parmi
les leviers, la zone des cinq premiers mètres comme si la grille la
représentait. Trois paragraphes suffisent : ce qu'est la partie, la **doctrine de
lutte** (le cœur de la v3, qui n'y figurait pas du tout), et l'avertissement
réglementaire. Détailler les leviers y était doublement inutile, les six façons
de jouer et les mécanismes sourcés le faisant plus bas et avec des chiffres.

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

L'ordre du panneau descend du durable vers l'immédiat : moyens, doctrine, puis
les deux registres de dépense. Les gestes ont longtemps tenu le bord bas, leur
place dans la lecture disant qu'ils soulagent sans transformer ; ce que
l'onglet dit maintenant en toutes lettres.

**Deux registres de dépense, deux onglets** (`ongletsDesRegistres`). Politiques
et gestes ne se distinguaient que par leur position dans la colonne, convention
muette que rien n'énonçait, et la pile portait d'affilée la doctrine, quatorze
secteurs et trois gestes sans que ces blocs aient le même statut. L'étiquette ne
nomme donc pas une catégorie, qui laisserait le joueur ignorer ce qui les
sépare, mais **la règle** : « plusieurs étés » contre « un été, une parcelle »
dans la barre, et sous l'onglet actif, ce que ça coûte et quand. **Les deux
sous-titres restent lisibles en même temps** : le contraste entre les registres
est un enseignement du modèle, pas un rangement, et un onglet qui le cacherait
coûterait plus qu'il ne range.

**La doctrine reste au-dessus des onglets** : le budget a trois emplois et non
deux, et celui-là est une posture qu'on tient, pas un achat qu'on fait. Rien
d'engagé ne vit derrière un onglet, le récapitulatif du pied listant tout,
secteurs et registres confondus.

Deux boutons radio et leurs étiquettes, comme le sélecteur d'échelle : la
commutation est en CSS, les flèches du clavier marchent seules, et la page
rendue au build sait déjà changer d'onglet sans script. Trois pièges tenus par
la planche : le groupe de radios porte un **nom unique par rendu**, sans quoi
deux panneaux dans une même page (la planche) formeraient un seul groupe et
s'éteindraient l'un l'autre ; on **cache l'inactif** plutôt que de montrer
l'actif, si bien qu'un navigateur sans `:has()` retombe sur la colonne d'avant
les onglets et non sur une colonne vide ; et l'îlot **retient l'onglet** d'un
rendu à l'autre, comme il retient le pli de la doctrine, sans quoi armer un
geste puis cliquer la carte ramenait aux politiques. Passer l'été le remet en
revanche sur les politiques, avec la désélection du secteur et le repli de la
doctrine : chaque été s'ouvre au même endroit.

**Le panneau tient en quatre zones, et le secteur est un tiroir.** Le bandeau
des moyens, le compte rendu et le pied (étés restants, décisions en attente,
bouton) ne bougent jamais : ils valent quoi qu'on regarde. Entre le bandeau et
le compte rendu, le corps porte la pile courante (doctrine, puis les deux
onglets) et le **tiroir du secteur choisi vient la couvrir**, en glissant depuis
la droite, d'où la carte l'appelle. Une croix en tête du tiroir le referme et
désélectionne.

C'est le remplacement d'un bloc contextuel glissé au milieu de la colonne, qui
ne marchait pas : mêlé aux blocs permanents, il passait inaperçu et choisir un
secteur semblait sans effet. Une sélection ne doit pas changer un bloc parmi
cinq, elle doit occuper la colonne et se refermer.

**Un écart assumé sur la jauge.** Le handoff borne la **surface tenue**, le
plafond étant le point où la charge d'entretien égale la recette. Cela suppose
une charge proportionnelle à la surface ; dans l'économie implémentée elle ne
l'est pas (le contrôle des OLD se paie par construction, le contrat pastoral
s'autofinance une fois établi). La surface tenue dépasse donc régulièrement ce
seuil sans qu'aucun plafond ne soit franchi, et la jauge aurait hachuré en
braise pour une fausse alerte. La jauge borne donc **la charge par rapport à la
recette**, ce que le handoff borne réellement, et la surface tenue s'affiche en
observation dessous. En v3.0 la surface est de toute façon bornée par les
partenaires, pas par la charge. « Charge » s'entend au sens large depuis :
entretien, doctrine et exploitation déficitaire, faute de quoi la jauge ne
mesurait qu'un tiers de ce que l'été prélève.

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
la compétente comprise, ils ne s'écartent que sur « coupures uniquement » (les
valeurs de l'époque, 1,5 et 7,0 contre 7,8, ont changé depuis que le bouclage
est passé en tête d'été ; c'est l'égalité des deux relevés qui compte). `Etat.pinNoirDepart` complète le lot, la conversion en lande
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
le cadre, la carte occupe le reste. **Ce qui défile est borné et jamais
imbriqué** : la pile du panneau (ou le tiroir qui la couvre), le compte rendu
dans son cadre au bas de la colonne, la carte dans le sien ; les fiches du
secteur restent en place.

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

## L'îlot

`src/ilot/simulateur.ts`, monté par le composant Astro sur l'écran rendu au
serveur. **Le premier été est rendu au build** : sans script, la page montre le
versant de départ et le panneau, ce qui reste honnête ; avec, l'îlot recrée le
même état à la même graine et la partie commence.

**Une seule porte, `avancer`, et elle ne s'ouvre qu'au bouton « été suivant ».**
Tout ce que le joueur décide dans le tour attend là (`enAttente`), et la fiche
le dit : « engagée, elle prendra effet à l'été suivant ». Chaque été est ainsi
une transaction, pas une suite d'effets immédiats, et la partie se relit.

**Le budget est pré-débité à l'affichage, jamais dans le modèle.** Rien n'étant
prélevé pendant le tour, le budget ne bougeait pas d'un clic et décider semblait
gratuit. Le chiffre montre donc ce qui restera, la valeur réelle passant
dessous, et le pied annonce ce que l'été engagera. Trois conséquences tenues
ensemble : **toute décision en attente se retire**, **on ne passe pas l'été à
découvert** (bouton désactivé, refus chiffré, jamais un grisé muet), et le
modèle reste seul maître du prélèvement.

**Le pied récapitule tout ce qui est engagé**, secteurs confondus, juste
au-dessus du bouton : nom, où, prix, et de quoi le retirer. C'est le seul
endroit du panneau que le tiroir ne couvre jamais, et une politique engagée
n'apparaissait sinon que sur sa fiche, donc dans le tiroir de son secteur : en
ouvrir un autre la faisait disparaître de la vue. L'ordre de ce récapitulatif
**est** celui des rangs d'annulation, le pied ne renvoyant qu'un rang et jamais
un type à décoder, et son compte vient de la liste elle-même — calculé à part,
il ne voyait que les fiches du secteur ouvert.

Deux refus étaient **silencieux** dans le noyau : une activation ou un geste
trop chers étaient écartés sans un mot, si bien que le joueur croyait avoir
engagé. Les deux le disent maintenant en ligne chaude, avec le prix et la
caisse.

**Le rendu est refait depuis l'état, jamais rattrapé au coup par coup.** Une
carte entière plus un panneau coûtent **36 ms** ; l'affichage ne peut donc pas
survivre à l'état. Seule exception, le calque de secteur, seul redessiné au
survol et à la sélection, où le paysage n'a pas bougé.

Le même générateur sert à engendrer le terrain **puis** les étés, comme dans le
harnais : à graine égale, la partie jouée est celle que la calibration mesure.

Un clic n'est un clic que si le curseur n'a pas traîné de plus de 4 px : la
carte se déplace à la souris, et un déplacement ne doit jamais sélectionner. Les
écouteurs du panneau sont posés **sur la racine** et non sur les éléments, qui
sont réengendrés à chaque changement.

Îlot servi : **85 Ko brut, 29 Ko gzip**, sans une dépendance. Il embarque le
noyau et le moteur de rendu, ce qui est le prix d'un simulateur qui joue dans
le navigateur ; le reste du site n'en charge rien.

**Rejeu de propagation** (`src/rendu/rejeu.ts`), seule animation admise et seul
lien du compte rendu, posé sur la **première** ligne de feu. Il rejoue la
chronologie que le noyau livre, `arrivee` et les braises horodatées : une
propagation plausible mais inventée dirait le contraire de ce que la partie a
produit, et le joueur y chercherait des causes qui n'existent pas.

Trois décisions qui n'étaient dans aucun handoff :

- **il rejoue sur le paysage d'avant l'incendie**, repris du SVG encore à
  l'écran avant le tour. Sur la carte d'après, le feu courait sur une cicatrice
  déjà noire ;
- **tout est en CSS** : les parcelles sont groupées par pas d'arrivée, le groupe
  porte le délai, les brandons héritent du sien. Aucun script ne pilote d'image
  par image. Groupé ainsi, la couche d'un grand feu tombe de 184 à 71 Ko, à
  rendu identique ;
- **rien ne bouge sous `prefers-reduced-motion`** : la trace s'affiche d'un coup
  et s'efface. La règle du site vaut aussi pour la seule animation qu'on
  s'autorise.

La couche se retire d'elle-même et la carte revient à son état réel : le rejeu
montre ce qui s'est passé, il ne laisse rien derrière lui.

**Doctrine dans l'interface** (phase 5 du patch). Le sélecteur rend une
**posture debout** et non une action de tour : la ligne en vigueur est marquée
comme telle, une réforme engagée affiche sa cible et les étés qui restent, et
l'économie de la réforme est dite **une fois sous les trois lignes** plutôt que
répétée sur chacune, deux nombres par ligne rendant la gamme illisible. Trois
notes possibles : l'héritage à confirmer au premier été, la fenêtre ouverte (en
braise, c'est une interaction possible), ou le prix courant. L'îlot n'affiche
plus la doctrine cliquée comme en vigueur, ce qui était devenu faux : elle est
« demandée », puis engagée à l'été suivant, et un clic est refusé tant qu'une
réforme court.

Il ne se déplie plus **au premier été** : le joueur vient de choisir sa posture
sur l'écran d'ouverture, et la lui rouvrir en grand lui fait relire sa propre
décision. La note qui rappelle que ce choix était gratuit reste, elle, sous les
lignes.

**Le bloc se replie en menu, pas en accordéon.** Replié, il montre **l'item
choisi** (pastille, nom, seuils, prix) et un **bouton lisible**, « changer de
doctrine » : le pli se manœuvre rarement, donc rien ne s'apprend à l'usage et
une flèche seule ne dit pas qu'on peut changer de posture. Déplié, l'item
disparaît du sommaire, la gamme entière le portant deux lignes plus bas ; le
redire sous le titre écrivait deux fois la même chose dans le même écran. Le
coût de la posture porte son unité (**« par été »**) : nu, il se lisait comme un
numéro de cran, d'autant que 3 · 2 · 1 est l'inverse exact des crans 1 · 2 · 3,
et c'est la seule charge récurrente du bloc quand la réforme dite en dessous est
un paiement unique. Enfin l'îlot **conserve le pli** d'un rendu à l'autre : le
panneau étant réengendré en entier, ouvrir le menu puis cliquer un secteur le
refermait. Seul le changement d'été rend la décision du pli au modèle, qui
déplie de lui-même mais ne replie jamais ce que le joueur a ouvert.

Au passage, le mot « tour » ne s'affiche plus nulle part : l'interface parle en
étés partout ailleurs, et « par tour », « retour possible au tour 24 » ou
« éclaircies ce tour » étaient les trois dernières fuites de registre.

**Le compte rendu a quitté la pile pour le bas fixe de la colonne.** Il y était
en `flex: 1 1 auto; min-height: 0`, donc autorisé à descendre sous la hauteur de
son contenu alors qu'il ne défilait pas lui-même : un été bavard ne faisait
apparaître aucune barre, ses lignes débordaient par-dessus le registre des
gestes, et plus l'été racontait de choses, moins on en voyait. Le sortir de la
pile règle les deux causes ensemble. Il ne dépend plus du défilement d'une pile
que la liste des quatorze secteurs allonge à elle seule, et **le tiroir ne le
couvre plus**, lui qui vient de raconter l'effet de la politique qu'on y ouvre.
Borné à 38 % de la colonne pour ne pas manger la décision, il défile chez lui,
comme la carte défile dans son cadre. Le reste de la pile est en
`flex-shrink: 0` : un bloc qui ne défile pas ne doit jamais pouvoir rétrécir.
Son titre est collant, l'été qu'on lit restant nommé pendant qu'on le parcourt.

Le panneau a donc **quatre zones** et non plus trois, les trois fixes étant le
bandeau, le compte rendu et le pied. La planche compte désormais cinq zones
défilantes, toujours sans imbrication, et vérifie que le compte rendu est rendu
hors du corps.

**Le budget était un mystère, et c'était un défaut à deux têtes.**

D'abord un vrai bug de pré-débit : le coût annuel de la posture (1 à 3 selon la
doctrine) est prélevé **avant les établissements et les gestes**, et il ne
figurait ni dans le budget projeté ni nulle part ailleurs. On engageait donc
exactement ce qu'on croyait avoir, et le compte rendu refusait ensuite le geste
faute de moyens, sans qu'aucun écran n'ait prévenu. Mesuré sur une partie réelle,
le joueur compétent perdait ainsi son geste aux étés 1, 2, 3, 4, 5 et 7.
`disponibleAEngager` est désormais la **seule** formule, lue par le panneau comme
par le calque de visée : deux copies divergeraient au premier changement.

**La jauge porte toutes les charges récurrentes**, et non le seul entretien :
doctrine et exploitation déficitaire s'y ajoutent, une éclaircie bénéficiaire
grossissant à l'inverse la recette. C'est le seul endroit où l'économie de l'été
se lit d'un coup, et en omettre deux postes sur trois en faisait un instrument
qui rassure à tort : sur une partie réelle elle affichait 1,7 de charge sur 12
de recette quand l'été coûtait en fait 22. C'est aussi ce qui évite de répéter
le reste en toutes lettres sous le budget.

Ensuite un manque : **aucune ligne du compte rendu ne disait les comptes**. Les
établissements et les gestes sont annoncés avant, les coupures se signalent
quand elles tombent, mais la recette, l'exploitation et l'entretien ne
laissaient aucune trace. Or une éclaircie déficitaire en terrain raide coûte
jusqu'à 11 par été, davantage que tout ce que le joueur engage : le budget
fondait ou restait collé à zéro sans une phrase pour l'expliquer.
`bouclerBudget` pose donc une ligne par été, « Comptes de l'été : recette 12,
exploitation −9,1, entretien −1,7, doctrine −1. Il reste 13,6 », **avant** les
coupures puisque c'est ce solde qui les explique.

**Enfin le budget est devenu un budget, et non une caisse** : le bouclage est
passé **en tête d'été, avant les décisions**. La recette de l'année arrivait à la
clôture, après les dépenses, si bien que « j'ai 12 de recette, 3 de charges, donc
9 à engager », le raisonnement que tout joueur fait, était faux d'une année : on
dépensait la réserve accumulée, pas le budget de l'exercice. Une collectivité
vote son budget puis l'exécute, et peut engager sur des recettes à venir. Trois
conséquences tenues ensemble : le choix fondateur du premier été est appliqué
**avant** le bouclage, sinon la collectivité paierait la posture dont elle vient
de se défaire ; le coût annuel de la doctrine est passé dans `bouclerBudget`,
sans quoi la ligne de comptes ne pourrait pas dire « il reste » ; et la fenêtre
d'après-feu est **lue** au bouclage mais **décomptée en fin de tour**, faute de
quoi elle se fermerait un été trop tôt pour la décision et réformer coûterait 8
au lieu de 2 au dernier été utile. Le compteur affiche « réserve 10 · été +9 »
sous un disponible de 19, et l'addition se refait à l'œil.

Le compte rendu n'a **plus de pied**. Il répétait « budget, contrat pastoral,
parcelles tenues », c'est-à-dire les trois chiffres du bandeau, à quelques
centimètres d'eux et sans les nommer pareil : son « budget 10 » contredisait même
en apparence le 19 du bandeau, qui dit ce qui reste à engager. L'état des moyens
se lit en haut, ce que l'été a fait se lit dans le fil.

**La ligne de comptes se compose après les décisions, et se lit au rang du
bouclage.** Écrite dans `bouclerBudget`, elle donnait le budget d'avant les
engagements : un joueur qui plaçait quatre politiques au premier été lisait
« il reste 19 » l'été suivant, avec 1 en caisse. `avancer` la compose donc une
fois tout payé, avec un poste **engagements**, et l'insère à sa place, avant les
coupures qu'elle explique. Deux postes de plus, sans lesquels elle ne tombe pas
juste les années difficiles : **programmes coupés**, ce que la coupure rend au
budget, et **découvert épongé**, le plancher de caisse qui remet à zéro. Chaque
été, la ligne s'additionne à l'œil jusqu'au chiffre que le bandeau affichera.

**Un été déficitaire ne doit pas enfermer.** Le refus de passer l'été se jugeait
sur le budget projeté : l'année d'après une grosse installation, les charges
excèdent la recette avant que le joueur ait rien décidé, et le bouton se
désactivait en réclamant de retirer une décision qui n'existait pas. La partie
s'arrêtait là. Ce qui se refuse est **d'engager plus qu'on ne peut**
(`depassement`), jamais le découvert lui-même : celui-là appartient au modèle,
qui puise dans la réserve et, sous le plancher, coupe une politique.

**Quatre lectures de « finançable » à corriger ensemble**, toutes trouvées après
coup : le bouton « été suivant » refusait en silence dès qu'on engageait plus que
la réserve, bouton actif et clic sans effet, ce qui est le pire des symptômes ;
la fiche d'une politique payable par la recette de l'année s'affichait hors de
portée ; le secteur ne passait pas « activable » ; et le péril de coupure se
jugeait sur la réserve d'avant bouclage, qui en diffère maintenant d'une année.
Le remède est le même partout : **une seule formule**, `disponibleAEngager`, et
le péril sur `budget + soldeDeLEte`, qui est le montant sur lequel la coupure se
décide. La planche vérifie qu'une politique financée par la recette de l'année
n'est pas refusée faute de réserve.

**Calibration remesurée** (50 × 40) : les douze critères du §12 tiennent, le
joueur compétent reste à 84 % du bâti et 52 % de fraction stratégique. Un chiffre
bouge nettement, et c'est le bon : les **renoncements passent de 1,5 à 3,2 par
partie**. Pouvoir engager la recette de l'année avant qu'elle ne soit encaissée,
c'est pouvoir la dépenser deux fois quand l'exploitation déficitaire s'aggrave,
et la coupure vient plus souvent. Les stratégies du harnais n'ont pas le
garde-fou du découvert que l'interface impose au joueur : 3,2 est donc un
majorant. La variabilité se resserre (écart-type 15,0 → 11,7, pire partie 42 →
48 %) et les coupures multiples au même été deviennent possibles, ce que la
planche 8 rend désormais en autant de bandes.

**Engager une politique se voit à trois endroits, et à trois seulement.** Le
bouton de la fiche en était un mauvais premier : « Engager · 6 » s'affichait en
texte souligné, quand c'est le geste le plus lourd du jeu. Il est cerné de
braise (pas plein, pour ne pas disputer le pas à « passer l'été », seul bouton
qui engage le temps). Ensuite le tiroir **ne glisse plus qu'à son ouverture** :
le panneau étant refait à chaque décision, il rejouait son entrée à chaque clic
et toute la colonne repartait alors que rien n'avait bougé. Enfin la décision se
**pose** dans le récapitulatif du pied, fond braise léger qui s'efface en une
seconde : engagée depuis le tiroir, elle atterrit à l'autre bout de la colonne,
et sans ce signal on ne voyait pas où elle était partie. C'est le seul mouvement
de la colonne, il porte sur la ligne qui change et rien ne bouge sous
`prefers-reduced-motion`.

**L'état d'une fiche est dans son encadrement, sur les quatre côtés.** Il tenait
dans un filet vertical le long du bord gauche, tireté tant que la politique
n'était qu'activable : deux bordures de nature différente sur le même rectangle,
dont une seule portait du sens, et le tireté se lisait comme un défaut
d'alignement plutôt que comme un état. La couleur passe dans la bordure
elle-même, uniforme, et les crans d'adoption disent le reste.

**Passer l'été rend l'écran à son état de repos** : le secteur choisi est
désélectionné, l'onglet revient aux politiques et le menu de doctrine se replie. Ce sont des états d'interface
posés pour décider ; la décision prise, les garder ouverts fait lire le compte
rendu du nouvel été derrière un tiroir ouvert sur les fiches de l'ancien, et
laisse le versant sous un voile qui ne désigne plus rien. Chaque été s'ouvre sur
le versant entier.

**Écran d'ouverture** (`ouverture.ts`, §1 du patch). Il se pose **par-dessus le
versant**, qui reste visible derrière : « le territoire pratique déjà une
doctrine » se montre autant qu'il se dit. Il présente un héritage à confirmer ou
à réformer, avec le statu quo par défaut — voulu, il recrute le joueur naïf dans
le piège — et **ne dit rien de la dette de combustible** : le cadrage est
immédiat seulement, sinon le paradoxe de la suppression n'est plus qu'une
consigne. La planche le vérifie.

Il porte aussi le **choix du versant** par son numéro, qui est la graine. Le
modèle étant déterministe, un numéro désigne un versant et un seul : on y
revient, on le compare, on le transmet. Le numéro se lit et s'écrit dans
l'adresse (`?versant=1007`), donc une partie se partage.

**Plancher d'accessibilité clavier.** Le critère est simple : la partie se joue
sans souris. Quatre choses le tenaient en échec, toutes corrigées.

Les commandes étaient des `div` cliquables — doctrine, gestes, crans de
l'ouverture : ce sont des `<button>`, avec `aria-current` sur la posture en
vigueur et `aria-pressed` sur le geste armé. La sélection d'un secteur n'existait
qu'au curseur : le panneau porte désormais la **liste des secteurs**, qui est le
chemin clavier et accessoirement le seul sommaire du versant depuis que les
étiquettes de la carte ne s'affichent qu'au survol. La carte est focalisable
(`tabindex`, étiquette explicite), donc les flèches la déplacent comme le
curseur la tire. Et **le focus survit au réengendrement du panneau** : il est
refait en entier à chaque décision, si bien que le focus retombait sur le corps
du document dès le premier clic ; l'îlot retient ce que l'élément désignait, pas
l'élément, et le rend après le rendu.

Le compte rendu porte `aria-live="polite"` : sans score agrégé, c'est là que le
jeu explique, et il faut l'entendre. Anneau de focus braise partout où l'on
décide, y compris sur les étiquettes des boutons radio d'échelle, invisibles par
construction.

**Ce qui manque encore :** un rendu propre aux échelles réduites, et la reprise
d'une partie en cours (l'adresse ne retient que le versant, pas l'avancement). La coupure de combustible n'a toujours pas d'état
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

Avoid generic AI patterns ("slop").
- Tone/Style: Vary sentence length and rhythm. Do not use predictable transitional filler or buzzwords. Write with specific, grounded details rather than vague generalities.
- Design/Code: Avoid cookie-cutter component arrangements. Use intentional whitespace, asymmetric or distinct structural choices, and specific typographical hierarchy.
- Execution: Prioritize direct, substantive content over padding. If uncertain, rely on concrete evidence or real-world constraints rather than generic summaries.

