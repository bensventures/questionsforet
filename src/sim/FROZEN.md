# v2 — gelée, document de référence

Ce répertoire n'évolue plus. Il est conservé au titre du §13 du brief v3 (« Ce
qu'on récupère du prototype : des données, pas du code »).

La page `src/content/outils/vivre-avec-le-feu.md` reste en `brouillon: true`,
donc non publiée. Ne rien ajouter ici : le modèle v3 vit dans `src/model/` et
son harnais de calibration dans `src/harness/`.

Ce qui est repris de la v2, et pourquoi :

- la table des types de végétation et leurs valeurs de combustible et
  d'inflammabilité (`params.ts`), calibrées au fil des tests ;
- le comportement de l'indice de sécheresse (dérive lente + bruit interannuel) ;
- la transition vers la friche à graminées ;
- les coûts d'action déjà éprouvés ;
- le découpage en secteurs (`sectors.ts`), qui a passé ses tests headless sur
  60 graines et dont le principe est repris tel quel par le §3 du brief v3 ;
- le générateur de RNG à graine (`rng.ts`), qui rend une partie fonction de
  (graine, décisions).

Ce qui ne l'est pas, et pourquoi :

- l'humidité était une formule unique mélangeant sécheresse régionale, ombrage,
  topographie et ouvrages ; le §5 du brief v3 sépare sécheresse régionale
  (exogène) et humidité locale (endogène, dérivée) ;
- `mixte` (mosaïque) était un type de terrain posé à la génération sans qu'aucun
  processus ne le produise ; en v3 c'est un état émergent (règle 1) ;
- la défendabilité était un booléen, ce qui faisait gagner la stratégie de
  périmètre ; le patch 1 du brief v3 la rend probabiliste et rivale.
