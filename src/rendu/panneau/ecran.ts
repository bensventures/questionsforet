import type { Fenetre } from '../carte';
import { S } from '../cellule';
import { LARGEUR_PANNEAU } from './jetons';

/**
 * Composition de l'écran complet (planche 9).
 *
 * **Ce que la composition tranche** : le panneau prend sa largeur sur le cadre
 * et la carte occupe le reste. La planche ajoutait « la carte se déplace, elle
 * ne se réduit pas » ; à l'usage, cela donne 7 × 6 parcelles visibles sur
 * 40 × 26, soit un vingtième du versant, et une chasse au défilement
 * horizontal. La règle est donc amendée : l'échelle native reste la **vue de
 * travail**, mais elle vaut 1:2 et non 1:1 : à l'échelle native une parcelle
 * de 50 m occupe 180 px et l'on ne voit qu'un vingtième du versant, ce qui
 * n'est utile qu'à juger le dessin. À l'autre bout, une échelle qui fait tenir
 * les 40 × 26 d'un coup ne montre plus rien. Trois échelles utiles, donc, de
 * 1:2 à 1:4, et chacune **dit ce qu'elle perd** : réduire en silence reste
 * interdit, c'était le vrai objet de la règle.
 *
 * Règle de contrôle de la planche : **si un élément de cet écran ne se trouve
 * pas dans une planche antérieure, c'est un défaut, pas une trouvaille.** Le
 * seul ajout est la barre de position, imposée par le cadrage — et, sur petit
 * écran, la bascule carte / panneau, seule réponse retenue à un cadre trop
 * étroit pour les deux (réduire la cellule perdrait d'abord le semis, puis les
 * paliers, c'est-à-dire ce qui justifie la décision).
 */

export interface OptionsEcran {
  /**
   * Sprite des glyphes, posé **hors du cadre de défilement**. Il se masque par
   * la taille (0 × 0) et non par `display:none` ; le laisser dans la boîte de
   * la carte le ferait attraper par la règle d'échelle, qui donne une largeur
   * à tout SVG qu'elle trouve.
   */
  sprite: string;
  /** SVG de la carte seul, tel que `rendreCarte` le rend. */
  carte: string;
  /** Panneau, tel que `rendrePanneau` le rend. */
  panneau: string;
  /** Terrain entier, en cellules. */
  largeur: number;
  hauteur: number;
  /**
   * Fenêtre effectivement visible dans le cadre. Sur une page statique, c'est
   * celle du défilement au chargement ; l'îlot la mettra à jour au défilement,
   * la barre de position n'ayant aucun autre moyen de dire où l'on est.
   */
  vue: Fenetre;
  /** Échelle cochée à l'ouverture. Par défaut la moyenne : on entre sur le
   *  paysage, on se rapproche ensuite. */
  echelle?: (typeof ECHELLES)[number]['id'];
}

/**
 * Trois échelles utiles, et **ce que chacune coûte est dit**.
 *
 * Deux bornes ont été essayées puis retirées, chacune inutilisable à sa
 * manière : l'échelle native 1:1, qui ne montre qu'un vingtième du versant et
 * ne sert qu'à juger le dessin, et une échelle « massif entier » ajustée au
 * cadre, où l'on ne distingue plus rien. L'utile tient entre les deux, de 1:2
 * à 1:4. Réduire en silence reste interdit ; réduire en le disant est ce qui
 * rend la carte utilisable.
 */
export const ECHELLES = [
  { id: 'proche', nom: 'Proche', rapport: '1:2', diviseur: 2, perd: 'le semis et les paliers de densité se lisent' },
  { id: 'moyenne', nom: 'Moyenne', rapport: '1:3', diviseur: 3, perd: 'le semis devient un grain, les paliers se devinent' },
  { id: 'large', nom: 'Large', rapport: '1:4', diviseur: 4, perd: 'il ne reste que les masses, le relief et les limites' },
] as const;

/** Barre de position : le terrain en miniature, la fenêtre visible dessus. */
function barrePosition(o: OptionsEcran, vue: Fenetre, echelle: (typeof ECHELLES)[number]): string {
  const { largeur, hauteur } = o;
  const tout = vue.largeur >= largeur && vue.hauteur >= hauteur;
  const boussole = tout
    ? 'le versant entier'
    : (vue.y0 + vue.hauteur / 2 < hauteur / 2 ? 'nord' : 'sud') +
      (vue.x0 + vue.largeur / 2 < largeur / 2 ? '-ouest' : '-est');
  return `<div class="ecran__position ecran__position--${echelle.id}">
  <svg viewBox="0 0 ${largeur} ${hauteur}" width="${largeur * 2}" height="${hauteur * 2}" aria-hidden="true">
    <rect x="0.5" y="0.5" width="${largeur - 1}" height="${hauteur - 1}" fill="none" stroke="currentColor" stroke-width="1"/>
    <rect x="${vue.x0}" y="${vue.y0}" width="${Math.min(vue.largeur, largeur)}" height="${Math.min(vue.hauteur, hauteur)}" fill="currentColor" fill-opacity="0.28" stroke="currentColor" stroke-width="1"/>
  </svg>
  <span>${Math.min(vue.largeur, largeur)} × ${Math.min(vue.hauteur, hauteur)} parcelles sur ${largeur} × ${hauteur} · ${boussole}<br><i>${echelle.perd}</i></span>
</div>`;
}

export function rendreEcran(o: OptionsEcran): string {
  const active = o.echelle ?? 'moyenne';
  const echelles = ECHELLES.map(
    (e) =>
      `<input type="radio" name="ecran-echelle" id="echelle-${e.id}" class="ecran__radio ecran__radio--echelle"${
        e.id === active ? ' checked' : ''
      }>`,
  ).join('');

  const boutons = ECHELLES.map(
    (e) => `<label for="echelle-${e.id}">${e.nom}${e.rapport ? ` <i>${e.rapport}</i>` : ''}</label>`,
  ).join('');

  // Une barre par échelle : sans script, c'est la seule façon de dire
  // juste ce qu'on voit à chacune d'elles.
  const barres = ECHELLES.map((e) =>
    barrePosition(
      o,
      { ...o.vue, largeur: o.vue.largeur * e.diviseur, hauteur: o.vue.hauteur * e.diviseur },
      e,
    ),
  ).join('');

  // La largeur naturelle du SVG pilote les échelles : « moitié » doit vouloir
  // dire la moitié de la carte, pas la moitié du cadre.
  return `<div class="ecran" style="--carte-largeur:${o.largeur * S}px">
  ${o.sprite}
  <input type="radio" name="ecran-vue" id="ecran-carte" class="ecran__radio" checked>
  <input type="radio" name="ecran-vue" id="ecran-panneau" class="ecran__radio">
  ${echelles}
  <nav class="ecran__bascule" aria-label="Vue">
    <label for="ecran-carte">Carte</label>
    <label for="ecran-panneau">Panneau</label>
  </nav>
  <div class="ecran__vue">
    <div class="ecran__carte" tabindex="0" role="group" aria-label="Carte du versant : flèches pour se déplacer, curseur pour tirer">${o.carte}</div>
    <nav class="ecran__echelles" aria-label="Échelle">${boutons}</nav>
    ${barres}
  </div>
  ${o.panneau}
</div>`;
}

/**
 * Fenêtre visible au chargement, déduite de la place laissée par le panneau.
 * Rien n'est arrondi à la hausse : une parcelle à moitié coupée n'est pas une
 * parcelle vue.
 */
export function fenetreVisible(cadre: { largeur: number; hauteur: number }): Fenetre {
  return {
    x0: 0,
    y0: 0,
    largeur: Math.max(1, Math.floor((cadre.largeur - LARGEUR_PANNEAU) / S)),
    hauteur: Math.max(1, Math.floor(cadre.hauteur / S)),
  };
}

/** Feuille de l'écran. Séparée de celle du panneau : le panneau existe aussi
 *  hors de cette composition, et la planche 9 n'ajoute qu'un cadre. */
export const STYLES_ECRAN = `
/*
 * Plein écran. La carte est un rectangle paysage : la loger dans le flux d'une
 * page d'article lui donne une colonne étroite et une hauteur de plusieurs
 * milliers de pixels, hors de la fenêtre. La page de l'outil reste la porte
 * d'entrée, avec son texte, et le simulateur s'ouvre par-dessus, sans marge,
 * sur toute la fenêtre — c'est le seul cadre qui ait le bon rapport.
 *
 * Ouverture et fermeture par ancre : aucun script, et l'adresse dit dans quel
 * état on est.
 */
.plein { display: none; }
/* La page derrière ne défile plus : sa barre restait à droite de celle du
   panneau, et deux ascenseurs côte à côte n'appartiennent à personne. Et le
   geste de retour du navigateur est neutralisé : sur pavé tactile, se déplacer
   sur la carte à deux doigts revenait à quitter la page. */
html:has(.plein:target) { overflow: hidden; overscroll-behavior-x: none; }
.plein:target { display: block; position: fixed; inset: 0; z-index: 60; background: oklch(0.86 0.035 82); }
.plein:target .ecran { height: 100vh; height: 100dvh; }
/* Fin de partie : elle remplace la composition et défile seule si le relevé
   dépasse la fenêtre. */
.fin__cadre { height: 100%; overflow-y: auto; }
.fin__reprise { margin: 0; padding: 0 32px 28px; }
/* En haut à gauche : en bas à droite, il tombait sur le bouton « été suivant »
   du pied de panneau. Les trois autres coins sont pris par le sélecteur
   d'échelle et la barre de position. */
.plein__fermer {
  position: absolute;
  left: 14px;
  top: 14px;
  z-index: 2;
  padding: 7px 13px;
  font: 500 12px/1 "Hanken Grotesk Variable", ui-sans-serif, system-ui, sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
  color: oklch(0.96 0.014 88);
  background: oklch(0.48 0.16 44);
}

.ecran {
  display: flex;
  align-items: stretch;
  min-height: 0;
  height: 100%;
  background: oklch(0.86 0.035 82);
}
/* Une colonne, un défilement, et le même dans les deux contextes : c'est le
   corps du panneau qui défile, entre un bandeau et un pied qui ne bougent
   jamais. Deux barres imbriquées dans la même colonne sont ingouvernables. */
.ecran__radio { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.ecran__bascule { display: none; }
.ecran__vue { position: relative; flex: 1 1 auto; min-width: 0; display: flex; }
/* La carte défile dans son cadre. L'échelle native reste la vue de travail,
   mais elle n'est plus la seule : à 1:1 on ne voit qu'un vingtième du versant,
   et l'écran devenait une chasse au défilement horizontal. */
/* « contain » retient le défilement dans la boîte : il ne se propage plus au
   document, donc plus de navigation arrière quand on atteint le bord gauche.
   (Pas d'accent grave dans cette feuille : elle est un gabarit de chaîne.) */
.ecran__carte { flex: 1 1 auto; min-width: 0; overflow: auto; overscroll-behavior: contain; cursor: grab; }
.ecran__carte[data-tire] { cursor: grabbing; }
.ecran__carte[data-tire] * { pointer-events: none; }
.ecran__carte > svg { display: block; height: auto; max-width: none; width: calc(var(--carte-largeur) / 3); }
#echelle-proche:checked ~ .ecran__vue .ecran__carte > svg { width: calc(var(--carte-largeur) / 2); }
#echelle-moyenne:checked ~ .ecran__vue .ecran__carte > svg { width: calc(var(--carte-largeur) / 3); }
#echelle-large:checked ~ .ecran__vue .ecran__carte > svg { width: calc(var(--carte-largeur) / 4); }

.ecran__echelles {
  position: absolute;
  right: 12px;
  top: 12px;
  display: flex;
  gap: 0;
  border: 1px solid oklch(0.86 0.02 82);
  background: oklch(0.955 0.016 86 / 0.92);
}
.ecran__echelles label {
  padding: 6px 11px;
  font-size: 11.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: oklch(0.42 0.035 64);
  cursor: pointer;
}
.ecran__echelles label i { font-style: normal; opacity: 0.6; }
.ecran__echelles label + label { border-left: 1px solid oklch(0.86 0.02 82); }
/* Les boutons radio sont invisibles : c'est leur étiquette qui doit montrer le
   focus, sans quoi le sélecteur d'échelle est inatteignable à l'aveugle. */
#echelle-proche:focus-visible ~ .ecran__vue label[for='echelle-proche'],
#echelle-moyenne:focus-visible ~ .ecran__vue label[for='echelle-moyenne'],
#echelle-large:focus-visible ~ .ecran__vue label[for='echelle-large'],
.ecran__radio:focus-visible ~ .ecran__bascule label[for='ecran-carte'],
.ecran__radio:focus-visible ~ .ecran__bascule label[for='ecran-panneau'] {
  outline: 2px solid oklch(0.55 0.16 44);
  outline-offset: -2px;
}
.ecran__carte:focus-visible { outline: 2px solid oklch(0.55 0.16 44); outline-offset: -2px; }
#echelle-proche:checked ~ .ecran__vue label[for='echelle-proche'],
#echelle-moyenne:checked ~ .ecran__vue label[for='echelle-moyenne'],
#echelle-large:checked ~ .ecran__vue label[for='echelle-large'] {
  color: oklch(0.26 0.03 62);
  box-shadow: inset 0 -2px 0 oklch(0.55 0.16 44);
}

/* Barre de position, hors du défilement : sans elle, on ne sait pas où l'on est
   sur un terrain dont on ne voit qu'une part. Une par échelle, celle de
   l'échelle courante seule étant montrée. */
.ecran__position {
  display: none;
  position: absolute;
  left: 12px;
  bottom: 12px;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: oklch(0.955 0.016 86 / 0.92);
  border: 1px solid oklch(0.86 0.02 82);
  color: oklch(0.26 0.03 62);
  font-size: 11.5px;
  letter-spacing: 0.04em;
}
.ecran__position svg { display: block; }
.ecran__position i { font-style: normal; color: oklch(0.52 0.03 70); }
#echelle-proche:checked ~ .ecran__vue .ecran__position--proche,
#echelle-moyenne:checked ~ .ecran__vue .ecran__position--moyenne,
#echelle-large:checked ~ .ecran__vue .ecran__position--large { display: flex; }

/* Sous un cadre trop étroit pour les deux, carte et panneau deviennent deux
   vues commutables. La cellule garde ses 180 px : c'est la réduction qu'on
   refuse, pas la place. */
@media (max-width: 1100px) {
  .ecran { flex-direction: column; }
  .ecran__bascule { display: flex; gap: 0; border-bottom: 1px solid oklch(0.86 0.02 82); }
  .ecran__bascule label {
    flex: 1 1 50%;
    padding: 10px 12px;
    text-align: center;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: oklch(0.42 0.035 64);
    background: oklch(0.935 0.02 84);
    cursor: pointer;
  }
  #ecran-carte:checked ~ .ecran__bascule label[for='ecran-carte'],
  #ecran-panneau:checked ~ .ecran__bascule label[for='ecran-panneau'] {
    background: oklch(0.955 0.016 86);
    color: oklch(0.26 0.03 62);
    box-shadow: inset 0 -2px 0 oklch(0.55 0.16 44);
  }
  
  #ecran-carte:checked ~ .pan,
  #ecran-panneau:checked ~ .ecran__vue { display: none; }
  #ecran-panneau:checked ~ .pan { display: flex; }
  .ecran .pan { width: 100%; flex: 1 1 auto; }
}
`;
