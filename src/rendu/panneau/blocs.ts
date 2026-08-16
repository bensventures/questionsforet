import type { FicheVue, GesteVue, LigneVue, VuePanneau } from './vue';
import { CRANS_DOCTRINE, DEPRISE } from './vue';

/**
 * Les cinq blocs du panneau (planches 1, 2, 3, 5 et 6).
 *
 * Fonctions pures rendant du HTML : elles se vérifient sur une planche statique
 * avant qu'aucune interaction ne soit câblée, exactement comme le harnais
 * précède la calibration. Construire l'interface d'abord reproduirait la
 * situation de la v2.
 */

const ech = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const nombre = (n: number) => n.toFixed(Math.abs(n) < 10 && !Number.isInteger(n) ? 1 : 0).replace('.', ',');

/* ------------------------------------------------------------------ bandeau */

/**
 * Bandeau de ressources. **Le budget n'est pas la tension principale** et n'est
 * donc pas en tête : la surface tenue vient d'abord, parce que c'est elle qui
 * plafonne, puis les partenaires, parce que c'est la rareté qu'aucune somme ne
 * lève.
 */
export function bandeauRessources(v: VuePanneau): string {
  const r = v.ressources;
  // Seule jauge bornée du panneau, et elle borne ce que le handoff borne
  // vraiment : la charge d'entretien par rapport à la recette. La surface
  // tenue reste dessous, en observation (voir `surfacePourUneRecette`).
  const part = r.recette ? Math.min(1, r.charge / r.recette) : 0;
  const debord = r.recette && r.charge > r.recette ? Math.min(1, (r.charge - r.recette) / r.recette) : 0;

  // Quatre encres, aucune flèche, aucune courbe. Zéro n'est pas un seuil : la
  // recette du tour suivant arrive.
  const b = r.budget;
  const classeBudget = b <= r.plancher ? 'budget--coupe' : b <= r.plancher + 2 ? 'budget--braise' : '';

  const e = r.eleveurs;
  const groupe = (n: number, classe: string, titre: string) =>
    `<span class="elv" title="${titre}">${
      n > 0
        ? Array.from({ length: n }, () => `<i class="elv__d elv__d--${classe}"></i>`).join('')
        : '<span class="elv__vide">—</span>'
    }</span>`;

  // La déprise se voit venir : un cran par tour sans contrat, six au total,
  // et le compte repart après chaque départ. Elle ne s'affiche que sans
  // contrat en cours, puisque c'est le débouché qui retient l'activité.
  const ecoules = r.toursSansContrat % DEPRISE || (r.toursSansContrat ? DEPRISE : 0);
  const crans = e.engages === 0
    ? `<div class="deprise" title="étés sans contrat avant qu'une installation cesse">${
        Array.from({ length: DEPRISE }, (_, i) => `<i class="${i < ecoules ? 'plein' : ''}"></i>`).join('')
      }</div>`
    : '';

  return `<section class="pan__bloc">
  <h2>Moyens</h2>
  <div class="res">
    <div>
      <div class="res__t">Entretien</div>
      <div class="jauge">
        <div class="jauge__p" style="width:${(part * 100).toFixed(0)}%"></div>
        ${debord ? `<div class="jauge__d" style="width:${(debord * 100).toFixed(0)}%"></div>` : ''}
        <div class="jauge__s" style="left:calc(100% - 1px)"></div>
      </div>
      <div class="res__u">${nombre(r.charge)} de charge sur ${r.recette} de recette</div>
      <div class="res__u">${r.surfaceTenue} parcelle${r.surfaceTenue > 1 ? 's' : ''} tenue${r.surfaceTenue > 1 ? 's' : ''}</div>
    </div>
    <div>
      <div class="res__t">Éleveur·euses</div>
      <div class="eleveurs">
        ${groupe(e.disponibles, 'dispo', 'disponibles')}
        ${groupe(e.engages, 'engage', 'engagé·es')}
        ${groupe(e.perdus, 'perdu', 'perdu·es')}
      </div>
      ${crans}
      ${e.perdus && e.retourAu ? `<div class="res__u">retour possible au tour ${e.retourAu}</div>` : ''}
    </div>
    <div>
      <div class="res__t">Budget</div>
      <div class="res__n ${classeBudget}">${nombre(b)}</div>
      ${b <= r.plancher + 2 ? `<div class="res__u">plancher ${r.plancher}</div>` : ''}
      ${r.fenetrePostFeu ? `<div class="res__u">moyens exceptionnels, ${r.fenetrePostFeu} tour(s)</div>` : ''}
    </div>
    <div>
      <div class="res__t">Équipes</div>
      <div class="equipes">${Array.from({ length: r.equipes }, () => '<i></i>').join('')}</div>
      <div class="res__u">par incendie</div>
    </div>
    <div class="reserve">Réservé<br>v3.2</div>
  </div>
</section>`;
}

/* ----------------------------------------------------------------- doctrine */

/**
 * Sélecteur de doctrine. Les crans **ne portent pas leur numéro** : « 1, 2, 3 »
 * se lit du pire au meilleur. Les prix sont affichés nus, même corps et même
 * encre, sans mise en avant : le cran le moins cher est le plus risqué, et
 * c'est au joueur de le voir.
 */
export function selecteurDoctrine(v: VuePanneau): string {
  const lignes = CRANS_DOCTRINE.map(
    (d) => `<div class="doc__c${d.cran === v.doctrine.cran ? ' doc__c--on' : ''}" data-cran="${d.cran}">
      <div class="doc__p"></div>
      <div><div class="doc__n">${ech(d.nom)}</div><div class="doc__s">${ech(d.seuils)}</div></div>
      <div class="doc__x">${d.cout}</div>
    </div>`,
  ).join('');

  const tranquillite = Array.from(
    { length: v.toursMax },
    (_, i) => `<i class="${i < v.doctrine.toursCran1 ? 'cran1' : ''}"></i>`,
  ).join('');

  return `<section class="pan__bloc">
  <h2>Doctrine de lutte</h2>
  <div class="doc">${lignes}</div>
  <p class="doc__note">Près des maisons, les secours attaquent quel que soit le cran : c'est vrai des trois.</p>
  <div class="tranquillite" title="étés passés en extinction systématique">${tranquillite}</div>
</section>`;
}

/* -------------------------------------------------------------------- fiche */

/** Une carte de politique. Le filet gauche est le seul porteur de l'état. */
export function fichePolitique(f: FicheVue): string {
  const crans = Array.from(
    { length: f.crans.total },
    (_, i) => `<i class="${i < f.crans.pleins ? '' : 'vide'}"></i>`,
  ).join('');

  const pied =
    f.etat === 'levee' || f.etat === 'abandon'
      ? `<div class="fiche__pied">Ce qui se défait : ${ech(f.defait ?? '')}.</div>`
      : `<div class="fiche__pied">${ech(f.emprise)}</div>`;

  return `<article class="fiche fiche--${f.etat}" data-politique="${f.id}">
  <div class="fiche__h">
    <span class="fiche__p">${ech(f.portee)}</span>
    <span class="fiche__d">délai ${f.delai} tours</span>
  </div>
  <h3 class="fiche__n">${ech(f.nom)}</h3>
  <p class="fiche__c">${ech(f.chaine)}</p>
  <div class="fiche__prix">
    <div><b>${f.etablissement}</b><span>établissement, une fois</span></div>
    <div><b class="${f.charge.startsWith('aucune') ? 'aucune' : ''}">${ech(f.charge)}</b><span>par tour</span></div>
  </div>
  <div class="crans">${crans}</div>
  ${pied}
  ${f.etat === 'abandon' ? '<p class="fiche__pied">Vous n’avez pas décidé.</p>' : ''}
  ${f.condition ? `<div class="fiche__cond">${ech(f.condition)}</div>` : ''}
  ${
    f.etat === 'activable'
      ? f.refus
        ? `<p class="fiche__refus">Hors de portée : ${ech(f.refus)}.</p>`
        : `<button class="fiche__appel" type="button">Engager · ${f.engager}</button>`
      : ''
  }
</article>`;
}

export function blocSecteur(v: VuePanneau): string {
  if (!v.secteur) {
    return `<section class="pan__bloc">
  <h2>Secteur</h2>
  <p class="fiche__pied">Aucun secteur sélectionné. Choisissez-en un sur la carte.</p>
</section>`;
  }
  return `<section class="pan__bloc">
  <h2>${ech(v.secteur.nom)}</h2>
  <p class="fiche__pied">${ech(v.secteur.sous)}</p>
  ${v.secteur.fiches.map(fichePolitique).join('')}
</section>`;
}

/* -------------------------------------------------------------- compte rendu */

/**
 * Compte rendu du tour. **Le texte du noyau s'affiche intact** : l'interface
 * ajoute l'attache, elle ne réécrit pas. Sans score agrégé, c'est ici que le
 * jeu explique, et le bloc porte donc la charge pédagogique.
 */
const ligneOrdinaire = (l: LigneVue) => `<li class="${l.ton ?? 'neutre'}">
      <span class="cr__m cr__m--${l.ton === 'chaud' ? 'chaud' : l.ton === 'bon' ? 'bon' : 'neutre'}"></span>
      <div>
        <div>${ech(l.texte)}</div>
        ${l.attache ? `<div class="cr__a">${ech(l.attache)}</div>` : ''}
        ${l.rejeu ? '<button class="cr__lien" type="button">rejouer la propagation</button>' : ''}
      </div>
    </li>`;

/**
 * Bande de coupe (planche 8). Le moment le plus fort de la partie, traité
 * **sans rien ajouter au vocabulaire** : elle reste une ligne du compte rendu,
 * à son rang chronologique, après le bouclage qui l'explique.
 *
 * Trois exclusivités font sa force, et aucune n'est une couleur de plus : seul
 * fond braise pleine largeur de l'interface, seule ligne composée en serif,
 * **seule adresse à la deuxième personne** de tout le jeu, qui parle partout
 * ailleurs du versant à la troisième.
 *
 * Ce qu'elle ne fait pas : pas de modale, pas de bouton d'accusé de réception,
 * pas de pause, aucun remède proposé, aucun reproche. Arrêter le jeu pour faire
 * signer un accusé de réception transformerait une conséquence en sanction.
 */
export function bandeCoupe(l: LigneVue): string {
  const c = l.coupe!;
  return `<li class="cr__coupe">
      <div>
        <h3>${ech(c.titre)}</h3>
        <p class="cr__vous">Vous n’avez pas décidé.</p>
        <div>${ech(l.texte)}</div>
        ${c.consequences.map((p) => `<p>${ech(p)}</p>`).join('')}
      </div>
    </li>`;
}

export function compteRendu(v: VuePanneau): string {
  const r = v.ressources;
  const lignes = v.lignes.length
    ? v.lignes.map((l: LigneVue) => (l.coupe ? bandeCoupe(l) : ligneOrdinaire(l))).join('')
    : // Seule ligne du bloc qui ne vienne pas du noyau, et signalée comme telle.
      `<li><span class="cr__m cr__m--neutre"></span><div class="cr__muet">Rien à signaler. Les politiques en vigueur ont poursuivi leur effet.</div></li>`;

  return `<section class="pan__bloc pan__bloc--rendu">
  <h2>Été ${v.tour}</h2>
  <ul class="cr">${lignes}</ul>
  <div class="cr__pied">Budget ${nombre(r.budget)} · ${
    r.eleveurs.engages
      ? `${r.eleveurs.engages} éleveur·euse${r.eleveurs.engages > 1 ? 's' : ''} engagé·e${r.eleveurs.engages > 1 ? 's' : ''}`
      : 'aucun contrat pastoral'
  } · ${r.surfaceTenue} parcelle${r.surfaceTenue > 1 ? 's' : ''} tenue${r.surfaceTenue > 1 ? 's' : ''}</div>
</section>`;
}

/* ------------------------------------------------------------------- gestes */

/** Registre des actions ponctuelles : l'autre registre de décision, celui qui
 *  soulage tout de suite sans rien transformer. Contre le bord bas, là où la
 *  main revient. */
export function registreGestes(v: VuePanneau, arme?: GesteVue['type'] | null): string {
  return `<section class="pan__bloc pan__bloc--gestes">
  <h2>Gestes · à désigner sur la carte</h2>
  ${v.gestes
    .map(
      (g) => `<div class="geste${arme === g.type ? ' geste--arme' : ''}${g.refus ? ' geste--refus' : ''}" data-geste="${g.type}">
    <div><div class="geste__n">${ech(g.nom)}</div><div class="geste__e">${ech(g.emprise)}</div></div>
    <div class="geste__c">${g.cout}</div>
    ${g.refus ? `<div class="geste__r">${ech(g.refus)}</div>` : ''}
  </div>`,
    )
    .join('')}
</section>`;
}

/* --------------------------------------------------------------------- pied */

export function piedTour(v: VuePanneau): string {
  const restants = Math.max(0, v.toursMax - v.tour + 1);
  return `<div class="pan__tour">
  <b>${restants} été${restants > 1 ? 's' : ''} restant${restants > 1 ? 's' : ''}</b>
  <button class="pan__suivant" type="button">Été suivant</button>
</div>`;
}
