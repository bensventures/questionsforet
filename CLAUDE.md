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

**Déploiement :** Cloudflare Pages ou Netlify, build statique.

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
