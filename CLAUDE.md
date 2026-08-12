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

Projet Astro initialisé (squelette qui build proprement). En place :

- ce fichier ;
- `src/content.config.ts`, schémas des collections ;
- `src/data/sources.yaml`, bibliographie initiale d'environ soixante entrées typées,
  validée au build par le schéma Zod ;
- `src/plugins/remark-french-typography.mjs`, typographie française appliquée au build,
  branché dans `astro.config.mjs` via le processeur unifié ;
- `src/content/{questions,dossiers,outils}/`, répertoires des collections (encore vides).

Prochaine étape suggérée : le composant de citation (badge de type visible) et la page
« toutes les sources » filtrable, puis convertir le dossier « Vivre avec le feu ».

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
`src/harness/calibrer.ts`). Joueur compétent : 85 % du bâti, 60 % de la fraction
stratégique sous le seuil, 61 % de surface parcourue (observation), 4,5
renoncements par partie. Les quatre mauvaises stratégies finissent différemment
et la compétente est battue sur quatre axes.

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
