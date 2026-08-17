# Projet — site public sur la forêt et le feu

Contexte permanent du projet. À lire avant toute intervention, à tenir à jour
quand une décision structurante change. Ce fichier porte les **règles et les
invariants** ; le détail d'implémentation vit dans les commentaires d'en-tête des
fichiers concernés, qui sont la source de vérité pour le « comment ».

## Ce qu'est ce site

Un site public de vulgarisation rigoureuse sur la forêt, le feu de végétation et
la prévention, en français. Il naît d'un travail de synthèse documentaire mené
sur le territoire du Diois (Drôme), mais s'adresse à un public large intéressé
par la forêt, pas seulement aux acteurs locaux.

Positionnement : ni discours de filière forêt-bois, ni discours militant. La
valeur ajoutée est la traçabilité des sources et l'honnêteté sur les
controverses. Quand la littérature n'est pas unanime, on le dit.

## Public et registre

Public large, curieux, non spécialiste, souvent arrivé par une recherche web sur
une question précise. Il faut donc :

- une idée par page, énoncée dès les premières lignes ;
- des chiffres toujours accompagnés de leur contexte et de leur source ;
- aucun jargon non explicité (« combustibilité », « sérotinie »,
  « débroussaillement » méritent chacun leur définition au premier emploi) ;
- assumer la nuance sans noyer le lecteur : un verdict clair, puis les réserves.

## Conventions d'écriture

**Typographie française.** Espaces insécables avant `; : ! ?` et à l'intérieur
des guillemets « français ». Traité par plugin remark pour les corps markdown, et
par `frenchTypography()` pour la prose du frontmatter (qui ne convertit pas les
apostrophes : le frontmatter garde les apostrophes droites, convention du site).

**Casse.** Phrases capitalisées normalement, jamais de Titres En Capitales.

**Pas de tiret cadratin (—).** Il sent le texte généré par IA. Selon le sens :
virgule (pause), deux-points (explication, jamais deux dans la même phrase),
point (deux propositions distinctes), parenthèses (incise).

**Chiffres.** Toujours des ordres de grandeur contextuels, jamais des cibles
réglementaires. Les distances et obligations applicables relèvent de la
réglementation locale et doivent renvoyer vers elle.

**Avertissement récurrent.** Toute page qui touche à des prescriptions techniques
rappelle qu'elle ne remplace ni un diagnostic de terrain ni l'expertise des
services compétents.

**Écriture inclusive : dans l'interface du simulateur seulement.** Mots neutres
en priorité (« les propriétaires », « quelqu'un », « une installation »), point
médian quand le neutre force la phrase (« éleveur·euse », « engagé·es »). La
règle vaut pour tout ce que l'interface affiche, donc aussi pour les lignes de
compte rendu **écrites dans le noyau** : le compte rendu affiche le texte du
modèle intact, et une convention qui s'arrêterait à la couche de rendu
produirait deux registres dans le même bloc. Les pages éditoriales (`questions`,
`dossiers`) ne sont pas concernées.

## Garde-fous

- Pas de dépendance JavaScript côté client sans nécessité démontrée. Le site
  doit rester consultable et rapide sur une connexion médiocre.
- Ne pas inventer de référence. Si un chiffre n'a pas de source dans
  `sources.yaml`, il ne sort pas. Les résultats du modèle sont une exception
  cadrée : ils s'affichent comme conséquences de ses règles, jamais comme
  observations de terrain, et se calculent au build plutôt que d'être recopiés.
- Ne pas transformer les nuances en affirmations. Les formulations du type
  « vrai et faux » ou « faux pour l'arbre, à nuancer pour le peuplement » sont
  volontaires.
- Vérifier l'API des *content collections* contre la documentation Astro en
  vigueur avant de coder : elle a évolué entre les versions majeures.

## Décisions techniques arrêtées

**Framework : Astro** (v7), pour le contenu en markdown, zéro JavaScript par
défaut et l'architecture en îlots. Écartés : Quarto (trop académique), Hugo
(templating pénible), Next.js (surdimensionné).

Depuis Astro 6.4 le processeur Markdown par défaut est Sätteri, qui n'exécute
**pas** les plugins remark/rehype. On revient explicitement au pipeline unifié
(`processor: unified()` de `@astrojs/markdown-remark`, dépendance de build) pour
garder l'écosystème remark : directives des encadrés, notes, coquille de
citation, typographie française. La configuration Markdown vit dans
`astro.config.mjs`.

**Déploiement : Cloudflare Workers Static Assets**, build statique, sur
`questionsforet.fr`. Dépôt `bensventures/questionsforet`, `npm run build` puis
`npx wrangler deploy`. Aucun code de Worker n'est déployé, seulement `dist/`.

Trois points à ne pas défaire :

- `wrangler.jsonc` **fige** `compatibility_date`. Sans valeur explicite, wrangler
  retient la date du jour, qui peut dépasser le binaire de la machine de build.
  Son `name` doit rester celui du Worker existant, sous peine d'en créer un second.
- `public/_headers` porte une CSP stricte (`script-src 'self'`, aucune origine
  externe). Elle tient parce que le site ne fait aucune requête sortante : toute
  dépendance externe ajoutée plus tard y échouera visiblement, ce qui est le
  comportement recherché.
- `vite.build.assetsInlineLimit` ne sort du HTML que les scripts, afin qu'aucun
  script inline n'oblige la CSP à tolérer `'unsafe-inline'`. Le CSS scoped reste
  inline : une requête de moins au premier rendu.

**Licence :** CC BY-SA envisagée, pour permettre la réutilisation en réunion
publique. À confirmer.

## Trois états de publication

`brouillon` retire la page du build de production : elle n'existe pas en ligne.
**`prive`** la construit et la sert, mais l'exclut de toutes les listes et lui
pose un `noindex, nofollow` : l'état d'une page qu'on donne à relire par son
adresse, à quelques personnes, avant de l'annoncer.

Le champ vit dans `champsCommuns`, donc les trois collections l'ont. Ne pas
confondre les deux règles : les **routes** (`[...id].astro`) construisent les
pages privées, c'est tout l'intérêt ; les **listes** les écartent, index de
collection comme liens croisés. Un bandeau prévient le relecteur.

## Architecture de contenu

| Collection | Nature | Longueur | Rôle |
|---|---|---|---|
| `questions` | Une question, une réponse | 400–800 mots | Porte d'entrée, capte la recherche web |
| `dossiers` | Synthèse longue | 2000–6000 mots | Traitement de fond, structuré en parties |
| `outils` | Objet interactif | — | Quiz, comparateurs, visualisations |
| `sources` | Données bibliographiques | — | Socle transversal, non publié comme pages |

Les `questions` renvoient vers les `dossiers` qui les approfondissent
(`approfondit`), et inversement par lien inverse.

## La bibliographie est le cœur du système

Décision structurante : **les sources sont des données, pas du texte**. Elles
vivent dans `src/data/sources.yaml` (78 entrées), chaque entrée portant un
identifiant, ses métadonnées et un champ `type` qui qualifie sa solidité :

- `pair` — article évalué par les pairs
- `ouvrage` — livre ou chapitre académique
- `rapport` — rapport technique, revue professionnelle, actes
- `institutionnel` — agence publique ou organisme officiel
- `vulgarisation` — presse, blog, site de vulgarisation
- `plaidoyer` — organisation avec une position affirmée

Conséquences à tenir :

1. Aucun appel de référence ne doit pouvoir pointer vers un identifiant
   inexistant : `reference()` de Zod fait échouer le build sur un lien mort.
2. Le composant de citation affiche systématiquement un badge de type. La rigueur
   doit être visible du lecteur, pas enfouie dans une note.
3. La page « toutes les sources », filtrable par type et par thème, est une
   ressource en soi.

**Archivage.** Chaque source porte un champ `archive` destiné à une URL Wayback
Machine. Prévoir `scripts/archive-sources.ts` (pas encore écrit) qui soumette les
URL non archivées à « Save Page Now » et réécrive le YAML. À lancer à la main,
jamais au build.

## Identité visuelle : « encre & braise »

Thème unique et assumé, ancré dans le sujet (manuel de terrain naturaliste) :
parchemin chaud, encre brun-noir, accent **braise** (`--ember`, terre de Sienne
brûlée) pour l'interaction et la sémantique du feu, **vert pin** (`--pine`) en
secondaire. Tout passe par des tokens CSS dans `src/styles/global.css` : pour
re-skiner, on touche aux variables, pas aux styles scoped.

- Polices auto-hébergées via Fontsource (dépendances de build, aucune requête
  externe) : **Fraunces** (titres) et **Hanken Grotesk** (texte et interface).
- Motion sobre : une seule révélation orchestrée au chargement, désactivée sous
  `prefers-reduced-motion`. Pas de JS ajouté.
- Un seul thème clair, volontairement. Cohérence avant exhaustivité.

## État des lieux

En place et build propre : les schémas et la bibliographie validée au build ; les
plugins (typographie, citations `[[cite:id]]`, enveloppe des tableaux larges) ;
le composant de citation et la page « toutes les sources » ; les trois
collections et leurs routes ; le dossier « Vivre avec le feu », converti et
sourcé ; trois questions publiées ; le simulateur v3 complet, en `prive`.

Reste pour la v1 : le dossier sur l'inflammabilité comparée des essences du
Sud-Est, une dizaine de questions extraites des deux dossiers, et le vrai/faux
sur le pin noir. Ne pas viser « toute la forêt » avant d'avoir publié cet
ensemble.

## Simulateur « Quarante étés »

Outil `format: simulation`, page `src/content/outils/quarante-etes.md`, route
`/outils/quarante-etes/`, statut `prive`. Le titre nomme le cadre du jeu et non
le thème : « Vivre avec le feu » est le nom du dossier, et deux pages homonymes
se confondaient dans un résultat de recherche comme dans un lien envoyé.

Le modèle est spécifié **avant implémentation** dans
`research/simulation/v3/BRIEF_SIMULATEUR_V3.md`, patch doctrine compris
(`research/simulation/patch_doctrine_posture_heritee.md`). La v2 est supprimée,
elle vit dans l'historique git.

Pourquoi la reprise : en v2, végétation, propagation, score et rendu vivaient
dans le même bloc, aucune variable ne pouvait être raisonnée isolément et la
calibration se faisait à l'aveugle. Trois règles priment sur toute
fonctionnalité : **aucun état sans processus, aucun levier sans chaîne causale
visible, aucune variable de résultat sans expression visuelle.**

### Trois couches, dans cet ordre

La séparation est vérifiable par le fait que le noyau tourne sous Node sans
navigateur.

- `src/model/` — noyau pur, `avancer(état, décisions) → état`, déterministe à
  graine fixée, aucune référence au rendu. Le feu calcule et renvoie la trace des
  braises ; il n'anime pas.
- `src/harness/` — exécution sans interface, stratégies scriptées, assertions.
  **À construire avant tout réglage.** Trois bugs de modèle ne se sont vus que
  là : sévérité non normalisée, « % brûlé » comptant les passages et non les
  parcelles, arbitrage d'abandon incapable de couper une éclaircie déficitaire.
- interface (`src/rendu/`, `src/ilot/`) — en dernier, une fois la calibration
  passée. Construire l'interface avant reproduirait la v2.

### Invariants du modèle

À ne pas défaire sans reprendre la calibration.

- **Une cellule vaut 50 m**, pas 25. À 25 m, être défendable imposait deux
  anneaux traités par maison, inatteignable sous le plafond d'entretien : 3 % du
  bâti seulement était défendable. Conséquence : **ni la zone 0 ni la plage
  5–20 m ne sont représentables dans la grille**, ce sont des attributs de
  construction (`durcissement`, `profondeurTraitee`). Ne pas les y remettre.
- `friche` est un type à part entière, vitesse 1,8 contre 0,75 pour la chênaie.
- Une construction n'est confrontée au front **qu'une fois par incendie**. Sinon
  chaque voisine en feu la testait à chaque pas de temps et le front écrasait
  mécaniquement les braises.
- Les secours sont une couche **supplémentaire**, jamais un substitut : l'échec
  d'une équipe retombe sur l'état propre de la construction. Autrement, être
  défendable exposait plus qu'être durci et ignoré du front.
- La surface brûlée est une **observation** avec garde-fou 20–80 %, jamais un
  score : en poser une borne haute ferait de la minimisation du feu un objectif,
  c'est-à-dire le réflexe que le jeu doit défaire.
- La cible de densité porte sur la **fraction stratégique** (couronnes et
  secteurs sous contrat), pas sur le massif. L'éclaircie doit donc pouvoir porter
  sur les couronnes, sinon on exige une cible sans donner de levier.
- Le plafond d'entretien ne vise que le traitement **forestier**. Les cinquante
  mètres autour des maisons relèvent de l'obligation légale : le propriétaire
  exécute et paie, le joueur ne finance que le **contrôle**, dont le taux de
  conformité plafonne sous 100 % et lui échappe.
- **Pente normalisée** (`RELIEF` dans `params.ts`). `Cellule.pente` recevait un
  gradient brut dont 97 % des valeurs tombaient sous 0,2 : les seuils n'étaient
  jamais franchis et « le feu monte » n'avait aucune assise. La normalisation
  ancre les 5 % les plus raides sur 0,50, valeur mesurée au harnais : plus haut,
  `economie.ts` multipliant le coût des travaux par la pente, l'éclaircie devient
  déficitaire partout et la fraction stratégique tombe à 34 %.
- **Trois champs d'observation** qu'aucune règle ne lit : `saisonsDepuisFeu` (le
  vieillissement se fait en tête de tour, **avant** l'allumage, sans quoi une
  parcelle parcourue ne vaut jamais zéro et la trace de l'année est
  indistinguable d'une cicatrice), `altitude`, `dejaBrulee`.
- **Débroussailler une parcelle** (troisième action ponctuelle) ne remet pas le
  statut « géré » : le geste porte sur le sous-bois, pas sur la densité de tiges,
  qui relève de l'éclaircie. Son nom précédent, « traiter un point noir »,
  promettait un référent que le modèle n'a pas.

### Doctrine : posture héritée, réforme fenêtrée

La doctrine était un interrupteur gratuit et instantané, ce qui vidait le
paradoxe de la suppression : on lisait la météo de l'année et on basculait. Le
territoire **hérite** désormais du cran 1, que le premier été confirme ou réforme
gratuitement (le choix fondateur, sans lequel le piège serait une fatalité).
Ensuite l'**effet** de la posture reste immédiat, mais son **changement** coûte 8
et prend trois étés, sauf dans la fenêtre ouverte par un incendie où il coûte 2
et prend un été. Une réforme engagée court seule.

Valeurs **mesurées, pas choisies** : 8 vaut les deux tiers d'une recette annuelle
sur un budget qui tourne entre 0 et 30, donc payable et jamais indolore ; 2 dans
une fenêtre qui apporte +9 par tour rend le moment évident ; trois étés dépassent
l'horizon où l'on peut anticiper la sécheresse. Jamais de verrou sans issue.

Deux conséquences à connaître : « ne rien faire » garde son cran d'ouverture au 2
(sans ce pick elle devenait la copie de « extinction maintenue » et le §12
perdait une défaite distinguable) ; et la compétente, qui réforme dans la
première fenêtre, **perd un point de bâti** par rapport à celle qui reste au
cran 2. C'est la thèse, pas un défaut de réglage.

### Économie

- **Le bouclage est en tête d'été, avant les décisions.** La recette arrivait à
  la clôture, après les dépenses : « j'ai 12 de recette, 3 de charges, donc 9 à
  engager », le raisonnement que tout joueur fait, était faux d'une année. Une
  collectivité vote son budget puis l'exécute. Trois conséquences tenues
  ensemble : le choix fondateur du premier été s'applique **avant** le bouclage
  (sinon on paie la posture dont on vient de se défaire) ; le coût annuel de la
  doctrine est prélevé dans `bouclerBudget` (sinon la ligne de comptes ne peut
  pas dire « il reste ») ; la fenêtre d'après-feu est **lue** au bouclage mais
  **décomptée en fin de tour** (sinon elle se ferme un été trop tôt pour la
  décision, et réformer coûte 8 au lieu de 2 au dernier été utile).
- **Une seule formule pour « finançable »** : `disponibleAEngager`, lue par le
  panneau, les fiches, l'état des secteurs et le calque de visée. Quatre lectures
  divergentes ont coexisté, dont un bouton actif qui ne faisait rien.
- **Ce qui se refuse est d'engager plus qu'on ne peut** (`depassement`), jamais le
  découvert lui-même : un été déficitaire avant toute décision bloquait la partie
  en réclamant de retirer une décision qui n'existait pas. Le découvert appartient
  au modèle, qui puise dans la réserve et, sous le plancher, coupe une politique.
- **Les comptes de l'été se disent**, une ligne par été composée dans `avancer`
  après les décisions : recette, exploitation, entretien, doctrine, engagements,
  programmes coupés, découvert épongé, puis « il reste X ». Elle se lit au rang du
  bouclage, avant les coupures qu'elle explique, et s'additionne à l'œil jusqu'au
  chiffre du bandeau. Sans elle, une éclaircie déficitaire pouvait coûter 11 par
  été sans qu'aucune phrase ne l'explique.
- **Comptabilité des partenaires en trois grandeurs** (`partenaires.ts`) :
  `disponibles`, `engages`, `perdus`, `retourAu`, jamais additionnés. Un compteur
  unique ne distingue pas le succès (tous sous contrat) de la perte (tous
  partis), et il masquait deux mécaniques mortes : l'engagement était
  irréversible et le retour n'existait pas. L'asymétrie 6 / 18 étés porte
  l'enseignement.

**Ce qu'on ne fait pas** : relever le plafond de conformité (0,78) pour faire
passer un test. Ce paramètre porte un fait de terrain documenté, le non-respect
massif des OLD, et ne se règle pas pour convenir à une cible.

### Calibration

Les douze critères du §12 sont tenus, 50 parties × 40 tours
(`npx tsx src/harness/calibrer.ts`). Joueur compétent : **84 % du bâti, 52 % de
la fraction stratégique sous le seuil, 73 % de surface parcourue** (observation),
3,2 renoncements par partie. Les quatre mauvaises stratégies finissent
différemment et la compétente est battue sur quatre axes.

Deux sondes hors des cinq du §12, à conserver :

- `durcissementSeul` teste la thèse du brief. Verdict : 85 % du bâti pour 166
  dépensés, contre 54 % au périmètre seul. La thèse tient, et le levier reste
  médiocre sur tous les axes de paysage, donc le dilemme n'est pas résolu par lui.
  Une sonde ne doit **pas** entrer dans un critère de calibration : mêler
  `durcissementSeul` au critère « meilleure sur le bâti » le faisait basculer sur
  quatre dixièmes de point.
- `eclaircieSansProtection` sert la page de présentation : éclaircir partout coûte
  le double de l'inaction pour son résultat exact (37,8 % du bâti contre 37,6 %,
  168 dépensés contre 80), alors que le peuplement s'ouvre pour de bon. Écrite
  avec un autre ordre de secteurs, elle tombait à 32 % : c'est l'ordre du harnais
  qui a été gardé, pas le chiffre le plus frappant.

Toute modification du noyau se termine par une remesure. Exemple : le passage du
bouclage en tête d'été a fait passer les renoncements de 1,5 à 3,2 par partie
(engager la recette avant de l'encaisser, c'est pouvoir la dépenser deux fois) et
resserré la variabilité, sans faire tomber un critère.

## Rendu de la carte

`src/rendu/` : `palette.ts` (couleurs et bornes de paliers), `cellule.ts`
(composition d'une parcelle), `carte.ts` (les sept couches et le calque de
secteurs), `gestes.ts` (empreinte d'un geste visé), `rejeu.ts`, et
`glyphes.svg` — **engendré, jamais modifié à la main**.

Cinq scripts, tous relançables :

| Script | Rôle |
|---|---|
| `extraire-glyphes.mjs` | recopie symboles et motifs depuis le handoff |
| `planche-verification.mjs` | essences × paliers, états de feu, motifs |
| `planche-carte.mjs` | une vraie partie rendue, 27 assertions |
| `planche-panneau.mjs` | le panneau et l'écran, 74 assertions |
| `banc-essai.mjs` | banc interactif : graine, tour, fenêtre, couches |

**Deux lots de design, deux rôles.** `design_handoff_langage_de_paysage/` est la
charte (vocabulaire, rampes, calques, jauges).
`design_handoff_carte_de_reference_v3/` est la **cible d'implémentation et le
test d'acceptation visuel** ; c'est elle qui fait foi pour les assets.

**Ce que le handoff suppose et que nous n'avons pas.** Sa carte fabrique son
relief par une formule et en déduit humidité, pente, essences et zone brûlée. Ici
tout vient de la simulation : ses sections 2 et 3 ne se transposent pas, ses
sections 4 à 11 sont suivies à la valeur près. Quatre adaptations, mesurées :

- **bornes de paliers** relevées sur des parties réelles
  (`src/harness/distributions.ts`) ; des quartiles théoriques sur 0–1 laissaient
  57 % des cellules au palier sec et **aucune** au palier frais ;
- **amplitude de relief de 240 m**, le serrage des courbes portant seul la
  raideur depuis le retrait des hachures ;
- **talweg** au point le plus bas de chaque colonne, **crête** au plus haut avec
  coupures, faute d'axe analytique ;
- **front** orienté vers l'amont réel (le gradient), nos versants n'ayant pas
  d'orientation privilégiée.

**Deux écarts assumés, actifs par défaut**, désactivables pour comparaison : les
couvertures basses sont **semées** comme les peuplements (six instances) ; sur
les **tapis** (garrigue, pelouse, friche), la charge de sous-bois est portée par
le nombre de touffes et le motif de sol est retiré, la densité de tiges étant un
canal mort sur ces types. Le sward de SB 1 reste dessiné, sa régularité signant
l'entretien ; le rocher est exclu.

**Trois états du bâti dérivés** qu'aucune charte ne livrait : deux paliers de
durcissement (contour 2,2 · 3,6 · 5) et une **ruine**, sans laquelle une
construction détruite se rendait debout. Engendrés depuis `m-bati`, **rien que
des angles droits** (un premier essai en dent de scie se lisait comme un
buisson). Le sprite compte seize symboles du handoff et trois dérivés.

**Calque secteur**, rendu **séparément** de la carte : à l'échelle native le
paysage pèse des centaines de Ko de SVG, qu'un survol de secteur ne doit pas
redessiner. Le calque tient en 2,4 Ko.

Le contour se trace en arêtes **orientées**, l'intérieur toujours à droite : les
côtés dont la voisine est dehors se chaînent en boucles, ce qui donne le bon sens
pour les trous et la normale intérieure de chaque arête. Aux pincements en
diagonale, le parcours **tourne à droite d'abord**, ce qui longe l'intérieur au
plus près.

Trois simplifications par rapport à la planche 4, toutes pour la lisibilité sur
un fond dense : **une seule ligne par secteur**, son encre portant l'état (claire
au repos, vert clair en montée, vert pin en vigueur, braise en péril) ; **le nom
ne s'affiche qu'au survol ou sur le choisi**, quatorze étiquettes permanentes
recouvrant le semis ; **un seul aplat**, le voile sombre à 25 % pendant une
sélection, qui épargne toujours le secteur choisi (`fill-rule="evenodd"`). La
sélection passe en braise, épaissir un trait d'encre ne se voyant pas.

**Le calque est du chrome, pas du paysage**, conséquence que la planche 4 ne
pouvait pas voir puisqu'elle est écrite à l'échelle native : les **épaisseurs**
sont tenues par `vector-effect="non-scaling-stroke"` et la **géométrie** est
multipliée par le diviseur d'échelle, que l'îlot lit sur le bouton radio coché.
Sans cela, à 1:3, une limite de 2 px en mesure 0,67 et la sélection est invisible.

**Pièges à ne pas rouvrir :**

- le sprite se masque **par la taille**, jamais par `display:none` : un `<use>` y
  trouve ses symboles, un `fill="url(#motif)"` n'y trouve rien, et le sous-bois
  disparaît sans erreur. Il se pose aussi **hors de la boîte de défilement**, la
  règle d'échelle donnant une largeur à tout SVG qu'elle trouve ;
- juger à l'**échelle native**, cellule de 180 px : réduite, la carte perd
  d'abord le semis, puis les paliers de densité ;
- **ne pas écrêter les glyphes** à leur cellule, le débord des houppiers faisant
  le continu du couvert ;
- **ne pas appliquer la règle de dégagement des courbes cellule par cellule** :
  le sous-bois saturant, elle hache les isolignes. Elle se décide une fois par vue.

## Page de présentation

`src/components/outils/SimulateurV3.astro`. **La page est la porte d'entrée, pas
le simulateur** : elle porte le texte, l'appel à l'action et l'écran de fin ; le
simulateur s'ouvre **par-dessus, sans marge, sur toute la fenêtre**, par ancre
(`:target`), donc sans script, et l'adresse dit dans quel état on est. Une carte
est un rectangle paysage : dans le flux d'un article elle n'a qu'une colonne
étroite et déborde de plusieurs milliers de pixels en hauteur.

Elle porte quatre choses :

1. l'appel à l'action ;
2. la **légende des glyphes**, engendrée depuis la palette du rendu : rien n'y est
   recopié, donc rien ne peut mentir sur ce que le joueur verra ;
3. **six façons de jouer et ce qu'elles donnent**, jouées au build par le harnais
   de calibration lui-même (50 parties × 40 étés, 1,9 s) : aucun chiffre recopié,
   ils sortent du noyau que le lecteur va manipuler et bougeront avec lui. La
   description de chaque ligne de conduite doit se vérifier dans
   `src/harness/strategies.ts`, et le commentaire de fin est **écrit après la
   mesure** ;
4. **ce sur quoi le modèle s'appuie**, mécanisme par mécanisme
   (`src/lib/sources-simulateur.ts`). Les rattachements sont **portés de la v2**,
   pas inventés. Ce point réparait une régression de fond : la route excluait la
   bibliographie pour le format simulation, si bien que l'objet le plus argumenté
   du site était le seul sans traçabilité. On ne source pas une règle absente : les
   références et les thèmes des politiques que la v3.0 n'implémente pas (brûlage
   dirigé, hydrologie) ont quitté le frontmatter.

Le texte d'introduction tient en trois paragraphes : ce qu'est la partie, la
doctrine de lutte, l'avertissement réglementaire. Détailler les leviers y est
inutile, les six façons de jouer et les mécanismes sourcés le faisant plus bas et
avec des chiffres.

Le HTML pèse 913 Ko, presque tout en SVG, soit **126 Ko compressé** : tenable pour
un test, à régler avant de lister la page.

**Piège rencontré deux fois** : un `<style>` scopé d'Astro ne s'applique **pas** au
HTML injecté par `set:html`. Tout ce qui habille du HTML injecté doit vivre dans
la feuille globale. Même famille que les jetons du panneau (portés par
`.pan, .decision`, sans quoi une fiche détachée sort ses aplats en transparent) et
que le sprite masqué par `display:none` : ce qui est injecté ou détaché perd tout
ce qui n'est pas global, et **sans erreur**.

Pour la voir en build complet : passer momentanément le filtre de
`src/pages/outils/[...id].astro` à `true`.

## Panneau de décision

`src/rendu/panneau/` : `jetons.ts` (couleurs et polices du handoff, source
unique), `styles.ts` (feuille exportée en chaîne, pour que la planche Node et
l'îlot lisent la même), `vue.ts` (ce que le panneau lit dans l'état), `blocs.ts`,
`index.ts` (assemblage), `fin.ts`, `ecran.ts`, `ouverture.ts`. Fonctions pures
rendant du HTML, vérifiées sur planche statique **avant** tout câblage.

**Quatre zones, et le secteur est un tiroir.** Le bandeau des moyens, le compte
rendu et le pied ne bougent jamais. Entre le bandeau et le compte rendu, le corps
porte la pile courante (doctrine, puis les deux onglets) et le **tiroir du secteur
choisi vient la couvrir**, glissant depuis la droite, d'où la carte l'appelle. Une
sélection ne doit pas changer un bloc parmi cinq, elle doit occuper la colonne et
se refermer.

L'ordre descend du durable vers l'immédiat : moyens, doctrine, registres de
dépense.

**Deux registres, deux onglets.** L'étiquette ne nomme pas une catégorie, qui
laisserait ignorer ce qui les sépare, mais **la règle** : « plusieurs étés »
contre « un été, une parcelle », et sous l'onglet actif, ce que ça coûte et quand.
Les deux sous-titres restent lisibles en même temps, le contraste entre registres
étant un enseignement du modèle. **La doctrine reste au-dessus des onglets** : le
budget a trois emplois et non deux, et celui-là est une posture qu'on tient.

Boutons radio et étiquettes, comme le sélecteur d'échelle : commutation en CSS,
flèches du clavier gratuites. Trois pièges tenus par la planche : nom de groupe
**unique par rendu** (deux panneaux dans une page formeraient un seul groupe) ; on
**cache l'inactif** plutôt que de montrer l'actif, si bien qu'un navigateur sans
`:has()` retombe sur la colonne d'avant les onglets et non sur une colonne vide ;
l'îlot **retient l'onglet** d'un rendu à l'autre.

**Le compte rendu est au bas fixe de la colonne, borné à 38 %, et défile chez
lui.** Dans la pile, il pouvait descendre sous la hauteur de son contenu sans
défiler lui-même : ses lignes débordaient par-dessus le registre des gestes, et
plus l'été racontait, moins on en voyait. Hors de la pile, il ne dépend plus du
défilement que quatorze secteurs allongent, et **le tiroir ne le couvre plus**,
lui qui vient de raconter l'effet de la politique qu'on y ouvre. Le reste de la
pile est en `flex-shrink: 0` : un bloc qui ne défile pas ne doit jamais pouvoir
rétrécir. Son titre est collant.

**La jauge borne la charge par rapport à la recette**, pas la surface tenue comme
le voudrait le handoff : la charge n'est pas proportionnelle à la surface dans
l'économie implémentée (le contrôle se paie par construction, le contrat pastoral
s'autofinance), et la jauge aurait hachuré en braise pour une fausse alerte.
« Charge » s'entend au sens large : entretien, doctrine et exploitation
déficitaire, faute de quoi elle ne mesurait qu'un tiers de ce que l'été prélève
et rassurait à tort.

**Le sélecteur de doctrine est un menu, pas un accordéon.** Replié, il montre
l'item choisi et un **bouton lisible** (« changer de doctrine ») : le pli se
manœuvre rarement, rien ne s'apprend à l'usage et une flèche seule ne dit pas
qu'on peut changer de posture. Déplié, l'item disparaît du sommaire, la gamme le
portant deux lignes plus bas. Le coût porte son unité (**« par été »**) : nu, il
se lisait comme un numéro de cran, 3 · 2 · 1 étant l'inverse des crans 1 · 2 · 3.
Il ne se déplie pas au premier été, le joueur venant de choisir sa posture à
l'ouverture ; il s'ouvre de lui-même dans la fenêtre et pendant une réforme.

**Une vue est une valeur : elle copie.** `vueDuPanneau` renvoyait une référence
sur `moyens.eleveurs` ; le noyau mutant son état en place, trois instantanés
d'une même partie affichaient tous le vivier du dernier tour.

**L'état d'une fiche est dans son encadrement, sur les quatre côtés.** Un filet
vertical tireté à gauche donnait deux bordures de nature différente sur le même
rectangle, dont une seule portait du sens.

**Engager une politique se voit à trois endroits, et à trois seulement** : un
bouton cerné de braise (pas plein, pour ne pas disputer le pas à « été suivant »,
seul bouton qui engage le temps) ; le tiroir qui **ne glisse qu'à son ouverture**,
le panneau étant refait à chaque décision ; et la décision qui **se pose** dans le
récapitulatif du pied, fond braise léger s'effaçant en une seconde. C'est le seul
mouvement de la colonne, et rien ne bouge sous `prefers-reduced-motion`.

Le mot « tour » ne s'affiche nulle part : l'interface parle en étés.

**Écran de fin de partie** (`fin.ts`). Quarante étés relus sans note, sans étoile
et sans total : le jeu n'a pas de solution optimale, et un indice unique le
masquerait. L'écran ventile les causes, et le rapprochement des deux ventilations
(par cause, puis par état de la construction perdue) est la seule leçon qu'il
s'autorise. Quatre compteurs ont dû entrer dans le modèle, **additifs et sans
effet sur le tirage** : `cumul.departs` (sans dénominateur, « 19 départs éteints »
ne dit rien), `cumul.pertesDurcies` et `cumul.pertesConformes` relevés **au moment
de la perte** (la conformité d'une construction détruite continue de se relâcher),
`cumul.renoncements` (qui majore la déduction du harnais : une politique établie
puis coupée dans le même tour n'apparaissait nulle part). `Etat.pinNoirDepart`
complète le lot.

**Bande de coupe.** Elle reste une **ligne du compte rendu**, à son rang
chronologique, après le bouclage qui l'explique : l'événement appartient au tour,
pas au-dessus de lui. Trois exclusivités font sa force : seul fond braise pleine
largeur, seule ligne en serif, **seule adresse à la deuxième personne** du jeu.
Ni bouton, ni accusé de réception, ni remède : arrêter le jeu pour faire signer un
accusé transformerait une conséquence en sanction. `Tour.coupees` porte
l'événement, symétrique de `braises` et `arrivee` : le noyau dit ce qu'il a coupé,
l'interface écrit les conséquences datées depuis les paramètres, jamais depuis la
phrase du modèle. Plusieurs coupes peuvent tomber le même été, la planche en rend
autant de bandes. La graine 1000 traverse ses quarante étés sans une seule coupe :
la planche en prend une autre (1007) plutôt que de fabriquer l'événement.

**Composition de l'écran** (`ecran.ts`). Panneau de 536 px, la carte occupe le
reste. **Ce qui défile est borné et jamais imbriqué** : la pile (ou le tiroir qui
la couvre), le compte rendu dans son cadre, la carte dans le sien.

**La règle « la carte se déplace, elle ne se réduit pas » est amendée**, seul
écart de fond au langage de décision. Appliquée seule elle donne 7 × 6 parcelles
sur 40 × 26, un vingtième du versant : l'écran devenait une chasse au défilement.
Une spécification écrite pour un spécimen 1800 × 1080 n'est pas une preuve de
jouabilité. **Trois échelles : 1:2, 1:3 (défaut), 1:4**, et **chacune dit ce
qu'elle perd** — c'était le vrai objet de la règle, réduire en silence reste
interdit. L'échelle native et l'ajustement au cadre ont été essayés puis retirés.

Trois ajouts assumés hors des planches antérieures, et le contrôle échoue au
quatrième : la barre de position, la bascule carte / panneau des petits écrans, le
sélecteur d'échelle. Sur petit écran la cellule garde ses 180 px : c'est la
réduction qu'on refuse, pas la place.

## L'îlot

`src/ilot/simulateur.ts`, monté sur l'écran rendu au serveur. **Le premier été est
rendu au build** : sans script, la page montre le versant de départ et le panneau,
ce qui reste honnête ; avec, l'îlot recrée le même état à la même graine.

- **Une seule porte, `avancer`, et elle ne s'ouvre qu'au bouton « été suivant ».**
  Tout ce que le joueur décide attend là (`enAttente`) et la fiche le dit. Chaque
  été est une transaction, pas une suite d'effets immédiats, et la partie se relit.
- **Le budget est pré-débité à l'affichage, jamais dans le modèle.** Le chiffre
  montre ce qui restera, la réserve et le solde de l'année passant dessous, et le
  pied récapitule **tout ce qui est engagé**, secteurs confondus : c'est le seul
  endroit que le tiroir ne couvre jamais. L'ordre du récapitulatif **est** celui
  des rangs d'annulation, et son compte vient de la liste elle-même.
- **Le rendu est refait depuis l'état, jamais rattrapé au coup par coup.** Carte
  et panneau coûtent 36 ms. Seule exception, le calque de secteur au survol.
- Le même générateur engendre le terrain **puis** les étés, comme dans le
  harnais : à graine égale, la partie jouée est celle que la calibration mesure.
- Un clic n'est un clic que si le curseur n'a pas traîné de plus de 4 px. Les
  écouteurs sont posés **sur la racine**, les éléments étant réengendrés.
- **Le déplacement au curseur est le premier JavaScript du simulateur** : une
  quinzaine de lignes sans dépendance, servies depuis le domaine (la CSP interdit
  l'inline). La nécessité a été démontrée par deux essais, les barres de
  défilement étant impraticables sur un plan de 40 × 26. Échelles, bascule et
  plein écran restent en CSS.
- **Passer l'été rend l'écran à son état de repos** : secteur désélectionné,
  onglet aux politiques, menu de doctrine replié.
- Aucun refus silencieux : une activation ou un geste trop chers le disent en
  ligne chaude, avec le prix et la caisse.

Îlot servi : **85 Ko brut, 29 Ko gzip**, sans dépendance. Il embarque le noyau et
le moteur de rendu ; le reste du site n'en charge rien.

**Rejeu de propagation** (`rejeu.ts`), seule animation admise et seul lien du
compte rendu, posé sur la **première** ligne de feu. Il rejoue la chronologie que
le noyau livre : une propagation plausible mais inventée dirait le contraire de ce
que la partie a produit. Trois décisions hors handoff : il rejoue **sur le paysage
d'avant l'incendie** (sur la carte d'après, le feu courait sur une cicatrice déjà
noire) ; **tout est en CSS**, les parcelles groupées par pas d'arrivée portant le
délai (184 → 71 Ko à rendu identique) ; **rien ne bouge sous
`prefers-reduced-motion`**.

**Écran d'ouverture** (`ouverture.ts`). Il se pose **par-dessus le versant**, qui
reste visible : « le territoire pratique déjà une doctrine » se montre autant
qu'il se dit. Héritage à confirmer ou à réformer, statu quo par défaut (voulu : il
recrute le joueur naïf dans le piège), et **rien sur la dette de combustible**,
sinon le paradoxe de la suppression n'est plus qu'une consigne. Il porte aussi le
**choix du versant** par son numéro, qui est la graine, lisible et inscriptible
dans l'adresse (`?versant=1007`) : une partie se partage et deux façons de jouer
se comparent sur le même terrain.

**Plancher d'accessibilité clavier.** Le critère : la partie se joue sans souris.
Les commandes sont des `<button>` (`aria-current` sur la posture en vigueur,
`aria-pressed` sur le geste armé) ; le panneau porte la **liste des secteurs**,
chemin clavier et seul sommaire du versant depuis que les étiquettes de la carte
ne s'affichent qu'au survol ; la carte est focalisable et les flèches la
déplacent ; **le focus survit au réengendrement du panneau** (l'îlot retient ce
que l'élément désignait, pas l'élément) ; le compte rendu porte
`aria-live="polite"`, car sans score agrégé c'est là que le jeu explique. Anneau
de focus braise partout où l'on décide.

## Ce qui manque

- un rendu propre aux échelles réduites, qui conditionne la publication de la
  page (913 Ko de HTML) ;
- la reprise d'une partie en cours : l'adresse retient le versant, pas
  l'avancement ;
- la coupure de combustible n'a pas d'état persistant dans le modèle ;
- l'éclaircie déficitaire est un puits qui peut absorber la recette annuelle sans
  déclencher de coupure, et le joueur n'a aucun moyen de la lever secteur par
  secteur ;
- `scripts/archive-sources.ts`, et la licence à confirmer.

## Esthétique du frontend

Consigne générale, gardée telle quelle parce qu'elle a donné de bons résultats.
Là où elle croise l'identité du site (thème sombre, dégradés, choix de polices),
c'est la section « encre & braise » qui tranche : ces choix-là sont faits.

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

## Avoid generic AI patterns ("slop")

- Tone/Style: Vary sentence length and rhythm. Do not use predictable transitional filler or buzzwords. Write with specific, grounded details rather than vague generalities.
- Design/Code: Avoid cookie-cutter component arrangements. Use intentional whitespace, asymmetric or distinct structural choices, and specific typographical hierarchy.
- Execution: Prioritize direct, substantive content over padding. If uncertain, rely on concrete evidence or real-world constraints rather than generic summaries.
