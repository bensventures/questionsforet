import type { ActionPonctuelle, Decisions, Doctrine, Etat, IdPolitique } from '../model/types';
import { creerRng, type Rng } from '../model/rng';
import { creerEtat } from '../model/terrain';
import { avancer } from '../model/avancer';
import { S } from '../rendu/cellule';
import { rendreCalqueSecteurs, rendreCarte } from '../rendu/carte';
import { DUREE_REJEU, rendreRejeu } from '../rendu/rejeu';
import {
  rendreOuverture,
  consequencesDeLaCoupe,
  etatsDesSecteurs,
  rendreFinDePartie,
  rendrePanneau,
  titreDeLaCoupe,
  vueDuPanneau,
  vueFinDePartie,
  type GesteVue,
  type LigneVue,
} from '../rendu/panneau';

/**
 * Îlot du simulateur : le seul endroit où l'on décide et où le temps passe.
 *
 * **L'interface lit un état et émet des `Decisions`, elle ne calcule rien.** Le
 * noyau n'a qu'une porte, `avancer`, et elle ne s'ouvre qu'au bouton « été
 * suivant » : tout ce que le joueur décide pendant un tour attend là, et la
 * fiche le dit. C'est aussi ce qui rend la partie relisible, chaque été étant
 * une transaction et non une suite d'effets immédiats.
 *
 * Le rendu est refait à partir de l'état, jamais rattrapé au coup par coup :
 * une carte de 1040 parcelles et un panneau de cinq blocs se réengendrent en
 * quelques dizaines de millisecondes, et cela évite qu'un état affiché survive
 * à l'état réel. Seule exception, le calque de secteur, redessiné seul au
 * survol et à la sélection : le paysage, lui, n'a pas bougé.
 */

interface Partie {
  etat: Etat;
  rng: Rng;
  /** Décisions du tour en cours, en attente du prochain `avancer`. */
  enAttente: { activer: { id: IdPolitique; secteur: number }[]; ponctuelles: ActionPonctuelle[]; doctrine?: Doctrine };
  selection: number | null;
  survol: number | null;
  geste: GesteVue['type'] | null;
  lignes: LigneVue[];
  finie: boolean;
  /**
   * Chronologie du dernier incendie, gardée pour le rejeu, **avec le paysage
   * d'avant**. Rejouer sur la carte d'après montrerait le feu courir sur une
   * cicatrice déjà noire : on garde donc le SVG affiché juste avant le tour,
   * que le DOM contient de toute façon.
   */
  dernierFeu: { arrivee: Uint16Array; braises: import('../model/feu').Braise[]; carteAvant: string } | null;
}

/** Attache d'une ligne : secteur, étape du tour, valeur du modèle en cause.
 *  C'est elle qui répond à « pourquoi celle-là et pas sa voisine ». */
function attacher(texte: string, etat: Etat): string | undefined {
  if (/parcourue|houppier|braise|feu de surface|rejeté|dépéri|lande/i.test(texte)) {
    return `Feu · sécheresse ${etat.meteo.secheresse.toFixed(2)} · vent ${etat.meteo.ventForce.toFixed(2)}`;
  }
  if (/éleveur|installation pastorale/i.test(texte)) {
    return `Partenaires · ${etat.toursSansContrat} été(s) sans contrat`;
  }
  if (/entretien/i.test(texte)) return `Bouclage · budget ${etat.moyens.budget.toFixed(0)}`;
  if (/conformité|équipé/i.test(texte)) return 'Politiques en vigueur';
  if (/friche/i.test(texte)) return 'Processus lents';
  return undefined;
}

export function monterSimulateur(racine: HTMLElement, graineParDefaut: number): void {
  /**
   * Le versant se lit dans l'adresse : le modèle étant déterministe à graine
   * fixée, une partie se retrouve, se compare et se transmet. C'est une
   * propriété du noyau, autant la rendre partageable.
   */
  const dansUrl = Number(new URLSearchParams(location.search).get('versant'));
  const graine = Number.isFinite(dansUrl) && dansUrl > 0 ? dansUrl : graineParDefaut;
  // Un seul générateur pour la génération du terrain **puis** les étés, comme
  // dans le harnais : à graine égale, la partie jouée ici est celle que la
  // calibration mesure, et pas une variante.
  const rng = creerRng(graine);
  const partie: Partie = {
    rng,
    etat: creerEtat(graine, rng, 40),
    enAttente: { activer: [], ponctuelles: [] },
    selection: null,
    survol: null,
    geste: null,
    lignes: [],
    finie: false,
    dernierFeu: null,
  };

  const svg = racine.querySelector<SVGSVGElement>('.ecran__carte > svg');
  const boite = racine.querySelector<HTMLElement>('.ecran__carte');
  if (!svg || !boite) return;

  /** Index de cellule sous le curseur, ou `null` hors de la grille. */
  function cellule(e: PointerEvent | MouseEvent): number | null {
    const r = svg!.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * partie.etat.largeur);
    const y = Math.floor(((e.clientY - r.top) / r.height) * partie.etat.hauteur);
    if (x < 0 || y < 0 || x >= partie.etat.largeur || y >= partie.etat.hauteur) return null;
    return y * partie.etat.largeur + x;
  }

  /**
   * Diviseur d'échelle courant, lu sur le bouton radio coché. Le calque de
   * secteur en a besoin : c'est du chrome, et sa géométrie doit garder sa
   * taille **à l'écran** quand la carte rétrécit.
   */
  function echelleAffichee(): number {
    const coche = racine.querySelector<HTMLInputElement>('.ecran__radio--echelle:checked');
    const id = coche?.id ?? '';
    return id.includes('proche') ? 2 : id.includes('large') ? 4 : 3;
  }

  const optionsSecteurs = () => ({
    donnees: etatsDesSecteurs(partie.etat),
    selectionne: partie.selection,
    survole: partie.survol,
    echelle: echelleAffichee(),
  });

  /** Le calque seul : au survol et à la sélection, le paysage n'a pas bougé. */
  function redessinerSecteurs(): void {
    const calque = svg!.querySelector('.couche-secteurs');
    if (calque) calque.innerHTML = rendreCalqueSecteurs(partie.etat, optionsSecteurs());
  }

  function redessinerCarte(): void {
    const r = rendreCarte(partie.etat, { secteurs: optionsSecteurs() });
    svg!.innerHTML = r.contenu;
  }

  /**
   * Repère de l'élément qui a le focus, pour le retrouver après un rendu.
   *
   * Le panneau est réengendré en entier à chaque changement : sans cela, le
   * focus retombait sur le corps du document à chaque clic, et une partie
   * menée au clavier devenait impossible dès la première décision. On ne
   * conserve pas l'élément (il n'existe plus), mais **ce qu'il désignait**.
   */
  function repereDuFocus(): string | null {
    const a = document.activeElement as HTMLElement | null;
    if (!a || !racine.contains(a)) return null;
    if (a.closest('[data-fermer-secteur]')) return '[data-fermer-secteur]';
    if (a.closest('.pan__suivant')) return '.pan__suivant';
    if (a.closest('.cr__lien')) return '.cr__lien';
    const cran = a.closest<HTMLElement>('[data-cran]');
    if (cran) return `[data-cran="${cran.dataset.cran}"]`;
    const geste = a.closest<HTMLElement>('[data-geste]');
    if (geste) return `[data-geste="${geste.dataset.geste}"]`;
    const rangee = a.closest<HTMLElement>('.secteurs__b');
    if (rangee) return `.secteurs__b[data-secteur="${rangee.dataset.secteur}"]`;
    // La fiche porte l'identifiant, mais c'est son appel qu'on refocalise.
    const fiche = a.closest<HTMLElement>('[data-politique]');
    if (fiche) return `[data-politique="${fiche.dataset.politique}"] .fiche__appel`;
    return null;
  }

  function rendreLeFocus(repere: string | null): void {
    if (!repere) return;
    racine.querySelector<HTMLElement>(repere)?.focus();
  }

  function redessinerPanneau(): void {
    const ancien = racine.querySelector('.pan');
    if (!ancien) return;
    const focus = repereDuFocus();
    const vue = vueDuPanneau(partie.etat, {
      secteur: partie.selection,
      lignes: partie.lignes,
      attente: partie.enAttente.activer,
      gestesEnAttente: partie.enAttente.ponctuelles.length,
      // La doctrine demandée ne s'affiche **pas** comme en vigueur : depuis le
      // patch, la décider n'est qu'engager une réforme, qui prend des étés hors
      // fenêtre. L'écran montrait un cran appliqué que le modèle n'appliquait
      // pas encore.
      doctrineDemandee: partie.enAttente.doctrine,
    });
    const gabarit = document.createElement('div');
    gabarit.innerHTML = rendrePanneau(vue, { geste: partie.geste });
    const nouveau = gabarit.firstElementChild;
    if (nouveau) ancien.replaceWith(nouveau);
    rendreLeFocus(focus);
  }

  /**
   * Rejoue l'incendie du tour. La couche est réinsérée à chaque demande : c'est
   * ce qui relance les animations, et elle se retire d'elle-même une fois le
   * dernier brandon posé.
   */
  let minuterie: number | undefined;
  function rejouerLeFeu(): void {
    const feu = partie.dernierFeu;
    if (!feu) return;
    const couche = rendreRejeu(feu.arrivee, feu.braises, partie.etat.largeur);
    if (!couche) return;
    window.clearTimeout(minuterie);
    // On remonte le paysage d'avant, on y fait courir le feu, puis on rend la
    // carte à son état réel. Le rejeu montre ce qui s'est passé ; il ne laisse
    // rien derrière lui.
    svg!.innerHTML = feu.carteAvant + couche;
    minuterie = window.setTimeout(() => redessinerCarte(), DUREE_REJEU + 400);
  }

  /** Fin de partie : l'écran remplace la composition, sans rien garder d'elle. */
  function terminer(): void {
    const vue = racine.querySelector('.ecran');
    if (!vue) return;
    vue.innerHTML =
      `<div class="fin__cadre decision">${rendreFinDePartie(vueFinDePartie(partie.etat))}` +
      `<p class="fin__reprise"><button class="pan__suivant" type="button" data-rejouer>Rejouer un autre versant</button></p></div>`;
  }

  function jouerLeTour(): void {
    if (partie.finie) return;
    // Le paysage d'avant l'été, tel qu'il est encore à l'écran.
    const carteAvant = svg!.innerHTML;
    const decisions: Decisions = {
      doctrine: partie.enAttente.doctrine,
      activer: partie.enAttente.activer,
      ponctuelles: partie.enAttente.ponctuelles,
    };
    const tour = avancer(partie.etat, decisions, partie.rng);

    // Les lignes du noyau s'affichent intactes ; l'interface n'ajoute que
    // l'attache, et la bande pour une coupe, dont les données viennent de
    // `tour.coupees` et non du texte.
    partie.dernierFeu =
      tour.feu && tour.arrivee ? { arrivee: tour.arrivee, braises: tour.braises, carteAvant } : null;

    // **Un seul lien dans tout le bloc** : le rejeu, posé sur la première ligne
    // de feu. Le compte rendu se lit, il ne se navigue pas.
    let lienPose = false;
    const coupees = [...tour.coupees];
    partie.lignes = tour.lignes.map((l) => {
      const estCoupe = /ne peut plus assurer l'entretien/.test(l.texte);
      const coupee = estCoupe ? coupees.shift() : undefined;
      const estFeu =
        !!partie.dernierFeu && !lienPose && /parcourue|houppier|feu de surface|braise|rejeté|lande/i.test(l.texte);
      if (estFeu) lienPose = true;
      return {
        ...l,
        rejeu: estFeu,
        attache: coupee ? undefined : attacher(l.texte, partie.etat),
        coupe: coupee
          ? {
              titre: titreDeLaCoupe(partie.etat, coupee),
              consequences: [
                'C’était la politique la plus coûteuse à entretenir.',
                ...consequencesDeLaCoupe(partie.etat, coupee),
              ],
            }
          : undefined,
      };
    });

    partie.enAttente = { activer: [], ponctuelles: [] };
    partie.geste = null;
    partie.finie = tour.termine;

    if (partie.finie) {
      terminer();
      return;
    }
    redessinerCarte();
    redessinerPanneau();
  }

  // ---- désignation sur la carte --------------------------------------------
  // Un clic n'est un clic que si le curseur n'a pas traîné : la carte se
  // déplace aussi à la souris, et un déplacement ne doit jamais sélectionner.
  let depart: { x: number; y: number } | null = null;
  boite.addEventListener('pointerdown', (e) => {
    depart = { x: e.clientX, y: e.clientY };
  });

  boite.addEventListener('pointerup', (e) => {
    const d = depart;
    depart = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    const i = cellule(e);
    if (i == null) return;

    if (partie.geste) {
      // Un geste armé s'exécutera à l'été suivant, comme toute décision.
      partie.enAttente.ponctuelles.push({ type: partie.geste, cellule: i });
      partie.geste = null;
      redessinerPanneau();
      return;
    }
    // Recliquer le secteur choisi le referme : la carte désélectionne comme la
    // croix du tiroir, et l'on n'est jamais coincé dans une sélection.
    const vise = partie.etat.grille[i].secteur;
    partie.selection = partie.selection === vise ? null : vise;
    redessinerSecteurs();
    redessinerPanneau();
  });

  boite.addEventListener('pointermove', (e) => {
    if (depart) return; // on déplace la carte : pas de survol
    const i = cellule(e);
    const s = i == null ? null : partie.etat.grille[i].secteur;
    if (s === partie.survol) return;
    partie.survol = s;
    redessinerSecteurs();
  });

  boite.addEventListener('pointerleave', () => {
    if (partie.survol === null) return;
    partie.survol = null;
    redessinerSecteurs();
  });

  // ---- décisions du panneau -------------------------------------------------
  // Un seul écouteur, posé sur la racine : le panneau est réengendré à chaque
  // changement, et rattacher des écouteurs à chaque rendu les perdrait.
  racine.addEventListener('click', (e) => {
    const cible = e.target as HTMLElement;

    if (cible.closest('[data-rejouer]')) {
      window.location.reload();
      return;
    }
    // La croix du tiroir désélectionne : refermer, c'est revenir au versant.
    if (cible.closest('[data-fermer-secteur]')) {
      partie.selection = null;
      redessinerSecteurs();
      redessinerPanneau();
      return;
    }
    if (cible.closest('.cr__lien')) {
      rejouerLeFeu();
      return;
    }
    if (cible.closest('.pan__suivant')) {
      jouerLeTour();
      return;
    }

    const cran = cible.closest<HTMLElement>('[data-cran]');
    if (cran) {
      // Une réforme déjà engagée court seule : le modèle refuserait, autant ne
      // pas laisser croire le contraire.
      if (!partie.etat.reforme) {
        const vise = Number(cran.dataset.cran) as Doctrine;
        partie.enAttente.doctrine = vise === partie.etat.doctrine ? undefined : vise;
        redessinerPanneau();
      }
      return;
    }

    const appel = cible.closest('.fiche__appel');
    if (appel) {
      const fiche = appel.closest<HTMLElement>('[data-politique]');
      if (fiche && partie.selection != null) {
        partie.enAttente.activer.push({
          id: fiche.dataset.politique as IdPolitique,
          secteur: partie.selection,
        });
        redessinerPanneau();
      }
      return;
    }

    // La liste du panneau sélectionne comme la carte : c'est le chemin clavier.
    const rangee = cible.closest<HTMLElement>('[data-secteur]');
    if (rangee && rangee.classList.contains('secteurs__b')) {
      const vise = Number(rangee.dataset.secteur);
      partie.selection = partie.selection === vise ? null : vise;
      redessinerSecteurs();
      redessinerPanneau();
      return;
    }

    const geste = cible.closest<HTMLElement>('[data-geste]');
    if (geste) {
      const type = geste.dataset.geste as GesteVue['type'];
      partie.geste = partie.geste === type ? null : type;
      redessinerPanneau();
    }
  });

  // Changer d'échelle redessine le calque : ses équerres et son retrait sont en
  // unités de carte, ils doivent suivre la réduction pour garder leur taille.
  for (const radio of racine.querySelectorAll<HTMLInputElement>('.ecran__radio--echelle')) {
    radio.addEventListener('change', redessinerSecteurs);
  }

  // ---- écran d'ouverture ----------------------------------------------------
  // Il se pose **par-dessus le versant**, qui reste visible derrière : « le
  // territoire pratique déjà une doctrine » se montre autant qu'il se dit.
  let cranChoisi: Doctrine = partie.etat.doctrine;
  let graineChoisie = graine;

  function afficherOuverture(): void {
    racine.querySelector('.ouv')?.remove();
    const vue = racine.querySelector('.ecran__vue');
    vue?.insertAdjacentHTML('beforeend', rendreOuverture({ graine: graineChoisie, cran: cranChoisi }));
  }

  /** Change de versant sans quitter l'ouverture : nouvel état, nouvelle carte. */
  function changerDeVersant(g: number): void {
    graineChoisie = g;
    const r = creerRng(g);
    partie.rng = r;
    partie.etat = creerEtat(g, r, 40);
    partie.selection = null;
    partie.survol = null;
    partie.lignes = [];
    redessinerCarte();
    redessinerPanneau();
    afficherOuverture();
  }

  racine.addEventListener('click', (e) => {
    const cible = e.target as HTMLElement;
    const ouverture = cible.closest('.ouv');
    if (!ouverture) return;
    // Tant que l'ouverture est là, elle capte tout : les crans qu'elle porte
    // sont un choix fondateur, pas une réforme.
    e.stopPropagation();

    const cran = cible.closest<HTMLElement>('[data-cran]');
    if (cran) {
      cranChoisi = Number(cran.dataset.cran) as Doctrine;
      afficherOuverture();
      return;
    }
    if (cible.closest('[data-tirer]')) {
      changerDeVersant(Math.floor(1000 + Math.random() * 9000));
      return;
    }
    if (cible.closest('[data-commencer]')) {
      const champ = ouverture.querySelector<HTMLInputElement>('[data-graine]');
      const g = Number(champ?.value);
      if (Number.isFinite(g) && g > 0 && g !== graineChoisie) changerDeVersant(g);
      // Le choix d'ouverture est fondateur : la posture est **en vigueur** avant
      // le premier été, elle n'est pas une réforme qu'on engage.
      partie.etat.doctrine = cranChoisi;
      history.replaceState(null, '', `?versant=${graineChoisie}${location.hash}`);
      racine.querySelector('.ouv')?.remove();
      redessinerCarte();
      redessinerPanneau();
    }
  }, true);

  // Premier rendu : l'état de départ vient d'être créé, la carte du serveur
  // montre le même, et le panneau prend la main.
  redessinerPanneau();
  afficherOuverture();
}
