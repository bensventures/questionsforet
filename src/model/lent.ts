import type { Etat, Ligne } from './types';
import type { Rng } from './rng';
import { TYPES, DENSITE, SOUS_BOIS, CLIMAT, ENTRETIEN } from './params';
import { borne } from './util';
import { enDesherence } from './derive';

/**
 * Météo (§5) et processus lents (§6). Ce sont eux qui produisent la dérive du
 * paysage entre les feux, et donc la partie de la difficulté que le joueur doit
 * voir venir dans les jauges plutôt que subir d'un coup.
 */

/**
 * Sécheresse régionale. Exogène, stochastique, **corrélée d'une année sur
 * l'autre** pour produire des séquences sèches, avec une dérive climatique
 * lente. Le joueur ne peut pas l'améliorer, et l'interface devra le dire :
 * c'est une météo, pas un score.
 */
export function tirerMeteo(etat: Etat, rng: Rng): void {
  const avancement = etat.tour / etat.toursMax;
  const cible = CLIMAT.base + avancement * CLIMAT.derivePart;
  etat.secheressePrecedente = etat.meteo.secheresse;
  const s =
    etat.secheressePrecedente * CLIMAT.correlation +
    cible * (1 - CLIMAT.correlation) +
    rng.entre(-CLIMAT.bruit, CLIMAT.bruit);
  etat.meteo = {
    secheresse: borne(s, 0.05, 1),
    ventAngle: rng.entre(0, Math.PI * 2),
    ventForce: borne(0.3 + s * 0.7 + rng.entre(-0.2, 0.3), 0.15, 1.4),
  };
}

/**
 * Processus lents. Chacun a une expression visuelle progressive attendue, ce
 * qui sera la matière du brief graphique.
 */
export function processusLents(etat: Etat, rng: Rng): Ligne[] {
  const lignes: Ligne[] = [];
  let bascules = 0;

  for (const c of etat.grille) {
    if (c.type === 'bati' || c.type === 'rocher') continue;
    const T = TYPES[c.type];

    // Vieillissement : l'écorce épaissit, le houppier s'élève. C'est ce qui
    // fait de « laisser vieillir » une mesure de prévention lisible (§8.1).
    if (T.arbore) c.age++;

    // Croissance de la densité : la fermeture spontanée du paysage.
    if (T.arbore) {
      const station = 0.7 + (1 - c.expositionSud) * 0.6; // plus vite en station fraîche
      const frein = c.paturage > 0 ? 0.55 : 1;
      c.densite = borne(c.densite + DENSITE.croissance * station * frein, 0, DENSITE.plafond + 250);
    }

    // Croissance du sous-bois, **d'autant plus rapide que le couvert est
    // ouvert**. C'est ce terme qui punit l'éclaircie brutale et qui donne sa
    // valeur au couvert fermé : sans lui, ouvrir serait gratuit.
    if (c.paturage > 0) {
      c.sousBois = Math.min(c.sousBois, SOUS_BOIS.niveauPature);
    } else {
      const ouverture = 1 - T.couvert;
      c.sousBois = borne(c.sousBois + SOUS_BOIS.croissanceBase + ouverture * SOUS_BOIS.bonusOuverture, 0, 1);
    }

    // Perte de gestion : au-delà du délai, la parcelle repasse « non gérée ».
    c.gestion++;

    // Estompement du brûlage dirigé (v3.1, le champ est déjà porté).
    if (c.effetBrulage > 0) c.effetBrulage--;

    // Entretien des surfaces ouvertes, et piège du renoncement (patch 2).
    if (c.ouverture > 0) {
      c.ouverture++;
      c.sansEntretien++;
      if (enDesherence(c) && TYPES[c.type].arbore === false && c.type !== 'friche') {
        // Une surface ouverte puis abandonnée ne revient pas à l'état
        // forestier : elle bascule en friche à graminées, plus inflammable et
        // plus rapide que la forêt qu'on y a retirée.
        c.type = 'friche';
        c.densite = 0;
        c.sousBois = 0.5;
        c.ouverture = 0;
        c.sansEntretien = 0;
        bascules++;
      }
    }
  }

  if (bascules > 0) {
    lignes.push({
      texte: `${bascules} parcelle${bascules > 1 ? 's' : ''} ouverte${bascules > 1 ? 's' : ''} puis laissée${bascules > 1 ? 's' : ''} sans entretien a basculé en friche à graminées.`,
      ton: 'chaud',
    });
  }
  return lignes;
}
