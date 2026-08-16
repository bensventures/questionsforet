import type { Cellule, Etat, IdPolitique, Ligne, NatureSecteur, PolitiqueActive, Secteur } from './types';
import type { Rng } from './rng';
import { TYPES, DENSITE, SOUS_BOIS, CONFORMITE } from './params';
import { libererEleveur } from './partenaires';
import { borne, dans, idx } from './util';

/**
 * Couche décision (§9). Cinq politiques en v3.0, dont la doctrine de lutte,
 * traitée à part dans `avancer` parce qu'elle est globale.
 *
 * Chaque politique agit sur une **variable d'état explicite** (règle 2), jamais
 * « sur le feu ». La chaîne que le joueur doit pouvoir suivre est indiquée dans
 * `chaine`, et l'interface devra l'afficher telle quelle.
 */

export interface Politique {
  id: IdPolitique;
  nom: string;
  /** Natures de secteur sur lesquelles la politique se désigne. */
  portee: NatureSecteur[];
  /** Chaîne causale, à afficher : c'est l'exigence de la règle 2. */
  chaine: string;
  /** Tours de montée en charge (adoption progressive). */
  delai: number;
  /** Coût d'établissement, payé à l'ouverture (patch 2). */
  etablissement: number;
  /** Cellules du secteur que la politique tient effectivement. */
  emprise(etat: Etat, s: Secteur): Cellule[];
  /** Effet du tour, appliqué aux cellules de l'emprise. */
  appliquer(etat: Etat, s: Secteur, cellules: Cellule[], adoption: number, rng: Rng): Ligne[];
}

/** Une cellule sur laquelle un traitement de végétation a un sens. */
const traitable = (c: Cellule) => c.type !== 'bati' && c.type !== 'rocher';

export const POLITIQUES: Politique[] = [
  {
    id: 'old',
    nom: 'Contrôle des obligations de débroussaillement',
    portee: ['couronne'],
    chaine: 'contrôle → conformité des propriétaires → apron traité → les secours peuvent approcher',
    delai: 2,
    etablissement: 3,
    /**
     * L'emprise, ce sont les **constructions**, pas la forêt. Les cinquante
     * mètres autour d'une maison relèvent de l'obligation légale : c'est le
     * propriétaire qui exécute et qui paie. La collectivité, donc le joueur, ne
     * finance que le contrôle. C'est pour cela que cinquante mètres autour de
     * chaque maison est faisable alors que traiter le massif ne l'est pas : ce
     * ne sont pas les mêmes payeurs (amendement 2, B.1).
     */
    emprise(etat, s) {
      return s.cellules.map((i) => etat.grille[i]).filter((c) => c.type === 'bati' && !c.detruite);
    },
    appliquer(etat, s, cellules, adoption, rng) {
      let misesEnConformite = 0;
      const conformes = cellules.filter((c) => c.conforme).length;
      const part = cellules.length ? conformes / cellules.length : 0;

      for (const b of cellules) {
        if (!b.conforme) {
          // Le contrôle fait monter le taux, mais il plafonne : une part des
          // propriétaires n'exécute pas, et le joueur n'y peut rien.
          if (part < CONFORMITE.plafond && rng.chance(CONFORMITE.miseEnConformite * adoption)) {
            b.conforme = true;
            misesEnConformite++;
          }
        } else if (rng.chance(CONFORMITE.relachement)) {
          b.conforme = false;
        }
      }

      // L'apron d'une construction conforme est effectivement débroussaillé.
      for (const b of cellules) {
        if (!b.conforme) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if ((!dx && !dy) || !dans(b.x + dx, b.y + dy)) continue;
            const n = etat.grille[idx(b.x + dx, b.y + dy)];
            if (!traitable(n)) continue;
            n.sousBois = Math.min(n.sousBois, SOUS_BOIS.seuilTraite);
            n.ouverture = Math.max(1, n.ouverture);
            n.sansEntretien = 0;
          }
        }
      }

      return misesEnConformite
        ? [{ texte: `${s.nom} : ${misesEnConformite} construction${misesEnConformite > 1 ? 's' : ''} mise${misesEnConformite > 1 ? 's' : ''} en conformité.`, ton: 'bon' }]
        : [];
    },
  },
  {
    id: 'durcissement',
    nom: 'Aide au durcissement du bâti',
    portee: ['couronne', 'adret', 'ubac', 'vallon', 'massif'],
    chaine: 'durcissement ↑ → une braise posée sur le toit ne trouve rien à allumer',
    delai: 4,
    etablissement: 6,
    emprise(etat, s) {
      return s.cellules.map((i) => etat.grille[i]).filter((c) => c.type === 'bati' && !c.detruite);
    },
    appliquer(etat, s, cellules, adoption, rng) {
      let equipes = 0;
      for (const c of cellules) {
        if (c.durcissement >= 1) continue;
        // Les foyers s'équipent progressivement : c'est ce que le délai
        // représente. Une fois équipé, c'est acquis et sans entretien.
        if (!rng.chance(0.5 * adoption)) continue;
        c.durcissement = borne(c.durcissement + 0.5, 0, 1);
        if (c.durcissement >= 1) equipes++;
      }
      return equipes
        ? [{ texte: `${s.nom} : ${equipes} logement${equipes > 1 ? 's' : ''} entièrement équipé${equipes > 1 ? 's' : ''}.`, ton: 'bon' }]
        : [];
    },
  },
  {
    id: 'pastoral',
    nom: 'Contrat pastoral',
    portee: ['adret', 'ubac', 'vallon', 'massif'],
    chaine: 'pâturage → sous-bois maintenu bas → l’état mosaïque émerge',
    delai: 3,
    etablissement: 7, // débroussaillement mécanique initial : c'est le vrai coût
    emprise(etat, s) {
      return s.cellules.map((i) => etat.grille[i]).filter(traitable);
    },
    appliquer(etat, s, cellules, adoption) {
      // Le troupeau ne couvre qu'une part du secteur tant que le contrat monte
      // en charge. Le compteur `paturage` est ce qui, au bout de quelques
      // tours, fait émerger l'état mosaïque : celui-ci n'est pas posé, il naît
      // d'un processus (règle 1).
      const n = Math.max(1, Math.round(cellules.length * adoption));
      for (const c of cellules.slice(0, n)) c.paturage++;
      for (const c of cellules.slice(n)) c.paturage = 0;
      return [];
    },
  },
  {
    id: 'eclaircie',
    nom: 'Programme d’éclaircie',
    // Les couronnes en font partie : l'amendement 2 range les couronnes de
    // hameaux dans la fraction stratégique dont on demande au joueur de tenir
    // la densité. Les en exclure lui demandait de tenir une cible sur laquelle
    // il n'avait aucun levier. Éclaircir les peuplements au contact des hameaux
    // est par ailleurs une pratique courante et recommandée.
    portee: ['couronne', 'adret', 'ubac', 'vallon', 'massif'],
    chaine: 'densité ↓ et statut « géré » → moins de continuité verticale → moins de feu de cime',
    delai: 3,
    etablissement: 5,
    emprise(etat, s) {
      return s.cellules
        .map((i) => etat.grille[i])
        .filter((c) => TYPES[c.type].arbore && c.densite > DENSITE.apresEclaircie);
    },
    appliquer(etat, s, cellules, adoption) {
      const n = Math.max(1, Math.round(cellules.length * 0.45 * adoption));
      const tries = [...cellules].sort((a, b) => b.densite - a.densite).slice(0, n);
      for (const c of tries) {
        c.densite = Math.max(DENSITE.apresEclaircie, c.densite - DENSITE.reductionEclaircie);
        c.gestion = 0;
        // Ouvrir le couvert relance le sous-bois : le processus lent s'en
        // charge, il n'y a rien à écrire ici. C'est ce qui punit l'éclaircie
        // brutale sans qu'aucune règle ne le dise.
      }
      return [];
    },
  },
];

export function politiqueParId(id: IdPolitique): Politique {
  return POLITIQUES.find((p) => p.id === id)!;
}

export function applicable(p: Politique, s: Secteur): boolean {
  return p.portee.includes(s.nature);
}

/** Fait avancer chaque politique d'un tour et applique ses effets. */
export function appliquerPolitiques(etat: Etat, rng: Rng): Ligne[] {
  const lignes: Ligne[] = [];
  for (const active of etat.politiques) {
    const p = politiqueParId(active.id);
    const s = etat.secteurs[active.secteur];
    if (!s) continue;
    active.tours++;
    active.adoption = borne(active.tours / p.delai, 0, 1);
    lignes.push(...p.appliquer(etat, s, p.emprise(etat, s), active.adoption, rng));
  }

  // Sans contrôle sur un secteur, la conformité s'y relâche : elle n'est jamais
  // acquise, c'est un état entretenu (règle 1).
  const controles = new Set<number>();
  for (const a of etat.politiques) {
    if (a.id !== 'old') continue;
    for (const i of etat.secteurs[a.secteur]?.cellules ?? []) controles.add(i);
  }
  for (let i = 0; i < etat.grille.length; i++) {
    const c = etat.grille[i];
    if (c.type !== 'bati' || !c.conforme || controles.has(i)) continue;
    if (rng.chance(CONFORMITE.relachementSansControle)) c.conforme = false;
  }

  // Le pâturage se défait dès que le contrat cesse : l'état mosaïque n'est pas
  // acquis, il est entretenu (§1, règle 1 et §6).
  const sousContrat = new Set<number>();
  for (const a of etat.politiques) {
    if (a.id !== 'pastoral') continue;
    for (const i of etat.secteurs[a.secteur]?.cellules ?? []) sousContrat.add(i);
  }
  for (let i = 0; i < etat.grille.length; i++) {
    if (!sousContrat.has(i) && etat.grille[i].paturage > 0) etat.grille[i].paturage = 0;
  }
  return lignes;
}

export function activer(etat: Etat, id: IdPolitique, secteur: number): PolitiqueActive | null {
  const s = etat.secteurs[secteur];
  const p = politiqueParId(id);
  if (!s || !applicable(p, s)) return null;
  if (etat.politiques.some((a) => a.id === id && a.secteur === secteur)) return null;
  const a: PolitiqueActive = { id, secteur, tours: 0, adoption: 0 };
  etat.politiques.push(a);
  return a;
}

export function lever(etat: Etat, id: IdPolitique, secteur: number): void {
  const avant = etat.politiques.length;
  etat.politiques = etat.politiques.filter((a) => !(a.id === id && a.secteur === secteur));
  // Lever un contrat rend son éleveur au vivier : sans cela l'engagement était
  // irréversible, et le vivier ne pouvait que descendre sur toute une partie.
  if (id === 'pastoral' && etat.politiques.length < avant) libererEleveur(etat.moyens.eleveurs);
}
