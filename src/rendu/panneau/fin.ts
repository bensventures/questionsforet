import type { Etat } from '../../model/types';
import { METRES_PAR_CELLULE } from '../../model/params';
import { indicateurs } from '../../model/indicateurs';

/**
 * Écran de fin de partie (planche 7).
 *
 * Quarante étés se relisent **sans note, sans étoile, sans total**. Le jeu n'a
 * pas de solution optimale, c'est un résultat mesuré (la stratégie compétente
 * est battue sur quatre axes), et un indice unique masquerait ce fait. L'écran
 * fait donc ce qu'un score fait d'ordinaire, mais en ventilant les causes.
 *
 * Six interdits, tous vérifiables sur la planche : pas de total agrégé, pas de
 * verdict, pas de comparatif ni de percentile, **une seule braise**, pas de
 * courbe, une seule page sans défilement.
 */

export interface VueFin {
  tours: number;
  /** Les deux faits du titre, de même corps. Ni l'un ni l'autre n'est le résultat. */
  bruleePct: number;
  batiDebout: number;
  batiTotal: number;
  /** Pertes ventilées par cause. */
  pertes: { braise: number; front: number; secoursDebordes: number; total: number };
  /** Les mêmes pertes, ventilées par état de la construction au moment de la
   *  perte. Leur rapprochement est la seule leçon que l'écran s'autorise. */
  durcies: number;
  conformes: number;
  paysage: { libelle: string; valeur: string; irreversible?: boolean }[];
  releve: { libelle: string; valeur: string; braise?: boolean }[];
}

/** Un hectare pour quatre cellules : la maille fait 50 m de côté. */
const HECTARES = (METRES_PAR_CELLULE * METRES_PAR_CELLULE) / 10_000;

/** Vrai signe moins, jamais le trait d'union : un relevé de terrain se compose. */
const signe = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `${n}`);

export function vueFinDePartie(etat: Etat): VueFin {
  const ind = indicateurs(etat);
  const c = etat.cumul;
  const total = c.pertesBraise + c.pertesFront + c.pertesSecoursDebordes;

  return {
    tours: etat.toursMax,
    bruleePct: ind.bruleePct,
    batiDebout: ind.batiDebout,
    batiTotal: ind.batiTotal,
    pertes: {
      braise: c.pertesBraise,
      front: c.pertesFront,
      secoursDebordes: c.pertesSecoursDebordes,
      total,
    },
    // Comptés au moment de la perte, jamais relus sur la grille : la conformité
    // d'une construction détruite continue de se relâcher, ce qu'aucune règle
    // ne lit mais qui fausserait une lecture d'après-coup.
    durcies: c.pertesDurcies,
    conformes: c.pertesConformes,
    paysage: [
      { libelle: 'Fraction stratégique sous le seuil de densité', valeur: `${ind.sousSeuilStrategiquePct} %` },
      { libelle: 'Parcelles boisées en état mosaïque', valeur: `${ind.mosaiquePct} %` },
      { libelle: 'Capacité de récupération du paysage', valeur: `${ind.recuperationPct} %` },
      { libelle: 'Surface passée en friche', valeur: `${ind.frichePct} %` },
      {
        libelle: 'Pin noir converti irréversiblement en lande',
        valeur: `${Math.round(ind.pinNoirConverti * HECTARES)} ha`,
        irreversible: true,
      },
    ],
    releve: [
      { libelle: 'Départs éteints', valeur: `${c.departsEteints} sur ${c.departs}` },
      { libelle: 'Étés en extinction systématique', valeur: `${c.toursCran1} sur ${etat.toursMax}` },
      { libelle: 'Renoncements subis', valeur: `${c.renoncements}`, braise: true },
      // « Recettes » se dirait mal d'un nombre négatif, et il l'est souvent :
      // l'éclaircie est déficitaire sur les versants raides et éloignés, ce qui
      // est le dilemme réel de la forêt de montagne et non un défaut du bilan.
      {
        libelle: 'Dépenses · exploitation, cumul',
        valeur: `${signe(Math.round(c.depense))} · ${signe(Math.round(c.recettes))}`,
      },
    ],
  };
}

const ech = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Cinq marques par rang : le contour épais est le bâti équipé, le plein le
 *  bâti conforme. Aucun texte ne conseille, le rapprochement suffit. */
function marques(total: number, oui: number, classeOui: string, classeNon: string): string {
  return Array.from(
    { length: total },
    (_, i) => `<i class="${i < oui ? classeOui : classeNon}"></i>`,
  ).join('');
}

export function rendreFinDePartie(v: VueFin): string {
  const p = v.pertes;
  const barre = (nom: string, n: number) =>
    p.total
      ? `<div class="fin__cause">
      <span>${nom}</span>
      <span class="fin__barre"><i style="width:${((n / p.total) * 100).toFixed(0)}%"></i></span>
      <b>${n}</b>
    </div>`
      : '';

  return `<section class="fin ${'decision'}" aria-label="Fin de partie">
  <h2 class="fin__sur">${v.tours} étés · versant du Diois</h2>
  <div class="fin__titre">
    <p>Le versant a brûlé sur ${v.bruleePct} % de sa surface.</p>
    <p>${v.batiDebout} constructions sur ${v.batiTotal} sont debout.</p>
  </div>

  <div class="fin__grille">
    <div>
      <h3>${p.total} construction${p.total > 1 ? 's' : ''} perdue${p.total > 1 ? 's' : ''}, ventilée${p.total > 1 ? 's' : ''} par cause</h3>
      ${barre('Braise', p.braise)}
      ${barre('Front', p.front)}
      ${barre('Secours débordés', p.secoursDebordes)}
      ${
        p.total
          ? `<div class="fin__rangs">
        <div class="fin__rang">
          <span>Durcissement des perdues</span>
          <span class="fin__marques">${marques(p.total, v.durcies, 'durci', 'nu')}</span>
          <em>${p.total - v.durcies} non durcie${p.total - v.durcies > 1 ? 's' : ''}, ${v.durcies} durcie${v.durcies > 1 ? 's' : ''}.</em>
        </div>
        <div class="fin__rang">
          <span>Conformité des perdues</span>
          <span class="fin__marques">${marques(p.total, v.conformes, 'conforme', 'nonconforme')}</span>
          <em>${p.total - v.conformes} non conforme${p.total - v.conformes > 1 ? 's' : ''}. Le plafond de 0,78 laisse toujours une part que rien n'atteint.</em>
        </div>
      </div>`
          : '<p class="fin__note">Aucune construction perdue.</p>'
      }
    </div>

    <div>
      <h3>Ce que le versant est devenu</h3>
      <dl class="fin__liste">
        ${v.paysage
          .map(
            (l) => `<div class="${l.irreversible ? 'irr' : ''}">
          <dt>${ech(l.libelle)}</dt><dd>${ech(l.valeur)}</dd>
        </div>`,
          )
          .join('')}
      </dl>
    </div>
  </div>

  <div>
    <h3>Surface parcourue par le feu</h3>
    <p class="fin__note">${v.bruleePct} % du versant, cumulé sur ${v.tours} tours. La plage claire
    est le garde-fou du modèle, pas une cible : lui poser une borne haute ferait de la minimisation
    du feu un objectif, c'est-à-dire le réflexe que le jeu défait.</p>
    <div class="fin__regle">
      <span class="fin__plage"></span>
      <span class="fin__valeur" style="left:${v.bruleePct}%"></span>
      <span class="fin__cotes"><i>0</i><i>20</i><i>80</i><i>100</i></span>
    </div>
  </div>

  <div class="fin__releve">
    ${v.releve
      .map(
        (l) => `<div><span>${ech(l.libelle)}</span><b class="${l.braise ? 'braise' : ''}">${ech(l.valeur)}</b></div>`,
      )
      .join('')}
  </div>
</section>`;
}
