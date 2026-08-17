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
  // vraiment : la charge par rapport à la recette. La surface tenue reste
  // dessous, en observation (voir `surfacePourUneRecette`).
  //
  // **Elle porte toutes les charges récurrentes**, entretien, doctrine et
  // exploitation déficitaire, et non le seul entretien. C'est le seul endroit
  // où l'économie de l'été se lit d'un coup ; en omettre deux postes sur trois
  // en faisait un instrument qui rassure à tort, et obligeait à répéter le
  // reste en toutes lettres sous le budget.
  const part = r.recette ? Math.min(1, r.charge / r.recette) : 0;
  const debord = r.recette && r.charge > r.recette ? Math.min(1, (r.charge - r.recette) / r.recette) : 0;

  // Quatre encres, aucune flèche, aucune courbe. Zéro n'est pas un seuil : la
  // recette du tour suivant arrive.
  const b = r.budget;
  const classeBudget = b <= r.plancher ? 'budget--coupe' : b <= r.plancher + 2 ? 'budget--braise' : '';
  // **Pré-débit.** Le grand chiffre est ce qui restera à engager quand l'été
  // s'ouvrira : la réserve, plus le solde de l'année (recette, exploitation,
  // entretien, doctrine), moins ce qui est déjà décidé. Les trois termes sont
  // dits dessous, pour que l'addition se refasse à l'œil. Le modèle, lui, ne
  // bouge pas : il ne prélève qu'au passage de l'été.
  const engage = (v.coutEnAttente ?? 0) > 0;

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
      <div class="res__t">Charges de l’été</div>
      <div class="jauge">
        <div class="jauge__p" style="width:${(part * 100).toFixed(0)}%"></div>
        ${debord ? `<div class="jauge__d" style="width:${(debord * 100).toFixed(0)}%"></div>` : ''}
        <div class="jauge__s" style="left:calc(100% - 1px)"></div>
      </div>
      <div class="res__u">${nombre(r.charge)} de charge sur ${nombre(r.recette)} de recette${
        r.chargeDoctrine ? `, dont ${nombre(r.chargeDoctrine)} de doctrine` : ''
      }</div>
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
      ${e.perdus && e.retourAu ? `<div class="res__u">retour possible à l’été ${e.retourAu}</div>` : ''}
    </div>
    <div>
      <div class="res__t">Budget</div>
      <div class="res__n ${classeBudget}${r.budgetProjete < 0 ? ' budget--braise' : ''}">${nombre(
        r.budgetProjete,
      )}</div>
      <div class="res__u">réserve ${nombre(b)} · été ${r.soldeDeLEte >= 0 ? '+' : '−'}${nombre(
        Math.abs(r.soldeDeLEte),
      )}${engage ? ` · engagé ${nombre(v.coutEnAttente ?? 0)}` : ''}</div>
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
 *
 * C'est une **posture debout, pas une action de tour** (patch « posture
 * héritée, réforme fenêtrée »). Le bloc dit donc ce qui est en vigueur, ce que
 * réformer coûte *maintenant*, et, le cas échéant, la réforme déjà engagée avec
 * les étés qui restent. L'économie de la réforme est rassemblée sous les trois
 * lignes plutôt que répétée sur chacune : deux nombres par ligne rendaient la
 * gamme illisible.
 */
export function selecteurDoctrine(v: VuePanneau): string {
  const d0 = v.doctrine;
  const lignes = CRANS_DOCTRINE.map((d) => {
    const enVigueur = d.cran === d0.cran;
    const vise = d0.reforme?.vers === d.cran;
    const demande = d0.demande === d.cran && !enVigueur;
    const classe = enVigueur ? ' doc__c--on' : vise ? ' doc__c--vise' : demande ? ' doc__c--demande' : '';
    const mention = enVigueur
      ? '<span class="doc__etat">en vigueur</span>'
      : vise
        ? `<span class="doc__etat">dans ${d0.reforme!.dans} été${d0.reforme!.dans > 1 ? 's' : ''}</span>`
        : demande
          ? '<span class="doc__etat">demandée</span>'
          : '';
    // Un bouton, pas un `div` cliquable : sans cela la doctrine était hors
    // d'atteinte au clavier, et le jeu injouable sans souris.
    return `<button type="button" class="doc__c${classe}" data-cran="${d.cran}"${
      enVigueur ? ' aria-current="true"' : ''
    }>
      <span class="doc__p"></span>
      <span><span class="doc__n">${ech(d.nom)} ${mention}</span><span class="doc__s">${ech(d.seuils)}</span></span>
      <span class="doc__x">${d.cout}<span class="doc__u">par été</span></span>
    </button>`;
  }).join('');

  const tranquillite = Array.from(
    { length: v.toursMax },
    (_, i) => `<i class="${i < d0.toursCran1 ? 'cran1' : ''}"></i>`,
  ).join('');

  // Ce que réformer coûte, dit une fois. À l'ouverture c'est l'héritage qu'on
  // confirme ou qu'on réforme, et c'est le seul moment gratuit.
  const economie = d0.reforme
    ? `<p class="doc__note doc__note--vise">Réforme engagée : ${ech(
        CRANS_DOCTRINE.find((c) => c.cran === d0.reforme!.vers)!.nom.toLowerCase(),
      )}, en vigueur dans ${d0.reforme.dans} été${d0.reforme.dans > 1 ? 's' : ''}. Aucune autre ne s'engage d'ici là.</p>`
    : d0.ouverture
      ? `<p class="doc__note">Le territoire pratique déjà l'extinction systématique. La conserver, ou la réformer ? Ce choix d'ouverture est sans délai ni coût.</p>`
      : d0.fenetre > 0
        ? `<p class="doc__note doc__note--fenetre">L'incendie a ouvert une fenêtre : réformer coûte ${d0.cout} et prend ${d0.delai} été${d0.delai > 1 ? 's' : ''}. Elle se referme dans ${d0.fenetre} été${d0.fenetre > 1 ? 's' : ''}.</p>`
        : `<p class="doc__note">Réformer coûte ${d0.cout} et prend ${d0.delai} étés. Un incendie ouvre une fenêtre où c'est plus rapide et bien moins cher.</p>`;

  // **Replié par défaut, et c'est le patch qui l'autorise** : depuis qu'elle est
  // une posture debout et non une action de tour, la doctrine se règle rarement,
  // et trois lignes dépliées en permanence prenaient un tiers de la colonne.
  //
  // Replié n'est pas caché : un `select` natif aurait mis les seuils et les prix
  // des deux autres postures derrière une interaction, or c'est là qu'est la
  // leçon, le cran le moins cher étant le plus risqué. Le pli en garde la forme
  // (l'item choisi, et un bouton clair pour en changer) mais déplie la gamme
  // entière, seuils compris. Le bloc s'ouvre **de lui-même** aux moments où il
  // a quelque chose à dire : dans la fenêtre où réformer est bon marché, et
  // pendant une réforme. **Pas au premier été** : le joueur vient de choisir sa
  // posture sur l'écran d'ouverture, la rouvrir en grand lui fait relire ce
  // qu'il vient de décider. La note du premier été reste, elle, sous les lignes.
  //
  // Replié, l'item en vigueur est le seul contenu ; déplié, il **disparaît du
  // sommaire**, la gamme le montrant deux lignes plus bas. Le redire sous le
  // titre du bloc, c'était écrire deux fois la même chose dans le même écran.
  const ouvert = d0.fenetre > 0 || d0.reforme || d0.demande;
  const enForce = CRANS_DOCTRINE.find((c) => c.cran === d0.cran)!;
  return `<section class="pan__bloc">
  <details class="doc__pli"${ouvert ? ' open' : ''}>
    <summary>
      <span class="doc__pli-t">Doctrine de lutte</span>
      <span class="doc__ouvrir">
        <span class="doc__lbl doc__lbl--ouvrir">Changer de doctrine</span>
        <span class="doc__lbl doc__lbl--fermer">Fermer</span>
        <i class="doc__chevron" aria-hidden="true">▾</i>
      </span>
      <span class="doc__vigueur">
        <span class="doc__p"></span>
        <span><span class="doc__n">${ech(enForce.nom)} <span class="doc__etat">en vigueur</span></span><span class="doc__s">${ech(
          enForce.seuils,
        )}</span></span>
        <span class="doc__x">${enForce.cout}<span class="doc__u">par été</span></span>
      </span>
    </summary>
    <div class="doc">${lignes}</div>
    ${economie}
    <p class="doc__note">Près des maisons, les secours attaquent quel que soit le cran : c'est vrai des trois.</p>
    <div class="tranquillite" title="étés passés en extinction systématique">${tranquillite}</div>
  </details>
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
    <div><b class="${f.charge.startsWith('aucune') ? 'aucune' : ''}">${ech(f.charge)}</b><span>par été</span></div>
  </div>
  <div class="crans">${crans}</div>
  ${pied}
  ${f.etat === 'abandon' ? '<p class="fiche__pied">Vous n’avez pas décidé.</p>' : ''}
  ${f.condition ? `<div class="fiche__cond">${ech(f.condition)}</div>` : ''}
  ${
    f.enAttente
      ? `<p class="fiche__attente">Engagée pour ${f.etablissement}, elle prendra effet à l’été suivant.</p>`
      : f.etat === 'activable'
        ? f.refus
          ? `<p class="fiche__refus">Hors de portée : ${ech(f.refus)}.</p>`
          : `<button class="fiche__appel" type="button">Engager · ${f.engager}</button>`
        : ''
  }
</article>`;
}

/**
 * Bloc du secteur sélectionné.
 *
 * **C'est le seul bloc contextuel du panneau**, et il doit se distinguer des
 * autres à l'œil : moyens, doctrine et compte rendu parlent de la partie, lui
 * seul parle de ce qu'on vient de désigner. Mêlé aux autres, il passait
 * inaperçu et la sélection semblait sans effet. Il porte donc son propre fond,
 * un filet braise, et le nom du secteur en titre plutôt qu'en capitales de
 * rubrique.
 *
 * Vide, il occupe la même place et le dit : une zone qui apparaît et disparaît
 * fait sauter le reste du panneau, et l'absence de sélection est une
 * information comme une autre.
 */
/**
 * Liste des secteurs, dans la pile courante.
 *
 * **C'est le chemin clavier vers la sélection**, sans lequel la partie ne se
 * joue qu'à la souris : le calque de la carte se désigne au curseur et rien
 * d'autre. Elle sert aussi de sommaire — quatorze secteurs, leurs natures et ce
 * qu'ils portent — ce qu'aucune vue ne donnait, les étiquettes de la carte ne
 * s'affichant plus qu'au survol.
 */
export function listeSecteurs(v: VuePanneau): string {
  if (!v.secteurs?.length) return '';
  return `<section class="pan__bloc">
  <p class="onglets__regle">Elles s’établissent en plusieurs étés et se paient chaque été. Choisissez un secteur, dans la liste ou sur la carte.</p>
  <ul class="secteurs">
    ${v.secteurs
      .map(
        (s) => `<li><button type="button" class="secteurs__b${s.id === v.secteur?.id ? ' secteurs__b--on' : ''}" data-secteur="${s.id}"${
          s.id === v.secteur?.id ? ' aria-current="true"' : ''
        }>
      <span class="secteurs__n">${ech(s.nom)}</span>
      <span class="secteurs__e">${ech(s.porte)}</span>
    </button></li>`,
      )
      .join('')}
  </ul>
</section>`;
}

/* ------------------------------------------------------- les deux registres */

export type Onglet = 'politiques' | 'gestes';

/**
 * Deux façons d'engager le budget, séparées et **nommées par ce qui les
 * sépare**. Jusqu'ici les deux registres ne se distinguaient que par leur
 * position dans la colonne, convention muette que rien n'énonçait, et la pile
 * portait d'affilée la doctrine, quatorze secteurs et trois gestes sans que ces
 * blocs aient le même statut.
 *
 * L'étiquette ne dit donc pas une catégorie (« politiques », « actions »), qui
 * laisserait le joueur ignorer ce qui les sépare, mais **la règle** : plusieurs
 * étés contre un été, et sous l'onglet actif, ce que ça coûte et quand. Les
 * deux sous-titres restent lisibles en même temps, sans quoi l'onglet cacherait
 * la moitié du contraste, qui est un enseignement du modèle et pas un rangement.
 *
 * **La doctrine reste dehors**, au-dessus : le budget a trois emplois et non
 * deux, et celui-là est une posture qu'on tient, pas un achat qu'on fait.
 *
 * Deux boutons radio et leurs étiquettes, comme le sélecteur d'échelle : la
 * commutation est en CSS, les flèches du clavier marchent seules. Le groupe
 * porte un nom unique par rendu, sans quoi deux panneaux dans une même page
 * (la planche) formeraient un seul groupe et s'éteindraient l'un l'autre.
 */
let groupe = 0;
export function ongletsDesRegistres(v: VuePanneau, arme: GesteVue['type'] | null, actif: Onglet): string {
  const n = `pan-onglet-${++groupe}`;
  const onglet = (valeur: Onglet, nom: string, regle: string) =>
    `<label class="onglets__e"><input type="radio" class="onglets__r onglets__r--${valeur}" name="${n}" value="${valeur}"${
      actif === valeur ? ' checked' : ''
    }><span class="onglets__n">${nom}</span><span class="onglets__d">${regle}</span></label>`;

  return `<div class="onglets">
  <div class="onglets__barre" role="group" aria-label="Deux façons d’engager le budget">
    ${onglet('politiques', 'Politiques', 'plusieurs étés')}
    ${onglet('gestes', 'Gestes', 'un été, une parcelle')}
  </div>
  <div class="onglets__vue onglets__vue--politiques">${listeSecteurs(v)}</div>
  <div class="onglets__vue onglets__vue--gestes">${registreGestes(v, arme)}</div>
</div>`;
}

/**
 * @param neuf le tiroir vient de s'ouvrir sur ce secteur, il glisse depuis la
 *   droite. Faux quand le panneau est simplement réengendré, ce qu'il fait à
 *   chaque décision : rejouer le glissement à l'engagement d'une politique
 *   faisait repartir toute la colonne alors que rien n'avait bougé, et on
 *   cherchait ce qui venait de changer au mauvais endroit.
 */
export function blocSecteur(v: VuePanneau, neuf = true): string {
  if (!v.secteur) return '';
  return `<section class="pan__tiroir${neuf ? ' pan__tiroir--neuf' : ''}" data-secteur="${v.secteur.id}">
  <header class="tiroir__tete">
    <button class="tiroir__fermer" type="button" data-fermer-secteur aria-label="Fermer et désélectionner">✕</button>
    <div>
      <h2>Secteur choisi</h2>
      <h3 class="secteur__nom">${ech(v.secteur.nom)}</h3>
      <p class="secteur__sous">${ech(v.secteur.sous)}</p>
    </div>
  </header>
  <div class="tiroir__corps">${v.secteur.fiches.map(fichePolitique).join('')}</div>
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
  const lignes = v.lignes.length
    ? v.lignes.map((l: LigneVue) => (l.coupe ? bandeCoupe(l) : ligneOrdinaire(l))).join('')
    : // Seule ligne du bloc qui ne vienne pas du noyau, et signalée comme telle.
      `<li><span class="cr__m cr__m--neutre"></span><div class="cr__muet">Rien à signaler. Les politiques en vigueur ont poursuivi leur effet.</div></li>`;

  // `aria-live` : sans score agrégé, c'est ici que le jeu explique, et un
  // lecteur d'écran doit entendre l'été qui vient de passer.
  // **Aucun pied de bloc.** Il répétait « budget, contrat pastoral, parcelles
  // tenues », c'est-à-dire les trois chiffres du bandeau, à trois centimètres
  // d'eux et sans les nommer pareil : le budget y paraissait même contredire
  // celui du bandeau, qui montre ce qui reste à engager quand l'été s'ouvre.
  // L'état des moyens se lit en haut, ce que l'été a fait se lit ici.
  return `<section class="pan__bloc pan__bloc--rendu" aria-live="polite">
  <h2>Été ${v.tour}</h2>
  <ul class="cr">${lignes}</ul>
</section>`;
}

/* ------------------------------------------------------------------- gestes */

/** Registre des actions ponctuelles : l'autre registre de décision, celui qui
 *  soulage tout de suite sans rien transformer. Sous son onglet, qui dit en
 *  toutes lettres ce que sa place dans la colonne disait à mots couverts. */
export function registreGestes(v: VuePanneau, arme?: GesteVue['type'] | null): string {
  // Les gestes désignés se récapitulent dans le pied, avec le reste : c'est le
  // seul endroit que le tiroir ne couvre pas.
  const attente = '';
  return `<section class="pan__bloc pan__bloc--gestes">
  <p class="onglets__regle">Payés une fois, sans charge d’entretien ensuite. À désigner sur la carte, parcelle par parcelle.</p>
  ${attente}
  ${v.gestes
    .map(
      (g) => `<button type="button" class="geste${arme === g.type ? ' geste--arme' : ''}${
        g.refus ? ' geste--refus' : ''
      }" data-geste="${g.type}"${arme === g.type ? ' aria-pressed="true"' : ''}>
    <span><span class="geste__n">${ech(g.nom)}</span><span class="geste__e">${ech(g.emprise)}</span></span>
    <span class="geste__c">${g.cout}</span>
    ${g.refus ? `<span class="geste__r">${ech(g.refus)}</span>` : ''}
  </button>`,
    )
    .join('')}
</section>`;
}

/* --------------------------------------------------------------------- pied */

/**
 * @param signale rang de la décision qui vient d'être engagée. Elle s'annonce
 *   en se posant dans le récapitulatif : une politique engagée depuis le tiroir
 *   atterrit à l'autre bout de la colonne, et sans ce signal on ne voyait pas
 *   où elle était partie. C'est le seul mouvement de la colonne, et il porte
 *   sur ce qui a changé, pas sur ce qui l'entoure.
 */
export function piedTour(v: VuePanneau, enAttente = 0, signale?: number): string {
  const restants = Math.max(0, v.toursMax - v.tour + 1);
  // Ce que l'été suivant va prélever : rien n'est débité pendant le tour, et le
  // budget qui ne bougeait pas d'un clic laissait croire à la gratuité.
  const cout = v.coutEnAttente ?? 0;
  // Le modèle écarterait les engagements trop chers ; autant l'empêcher avant,
  // et le dire chiffré plutôt que de griser un bouton en silence.
  //
  // **On ne bloque que ce que le joueur peut défaire.** Jugé sur le budget
  // projeté, le refus s'appliquait aussi quand le solde de l'année était négatif
  // sans qu'il ait rien décidé : l'été ne passait plus et il n'avait rien à
  // retirer. Ce découvert-là appartient au modèle, qui puise dans la réserve et,
  // sous le plancher, coupe une politique.
  const trop = v.ressources.trop;
  const liste = (v.enAttente ?? []).length
    ? `<ul class="pan__liste">${(v.enAttente ?? [])
        .map(
          (d, i) => `<li${i === signale ? ' class="pan__liste--pose"' : ''}>
      <span class="pan__liste-n">${ech(d.nom)}${d.ou ? ` <span>${ech(d.ou)}</span>` : ''}</span>
      <span class="pan__liste-c">${d.cout ? nombre(d.cout) : '—'}</span>
      <button type="button" class="fiche__retirer" data-annuler="${i}" aria-label="Retirer : ${ech(d.nom)}">Retirer</button>
    </li>`,
        )
        .join('')}</ul>`
    : '';

  return `<div class="pan__pied">
  ${liste}
  <div class="pan__tour">
  <div>
    <b>${restants} été${restants > 1 ? 's' : ''} restant${restants > 1 ? 's' : ''}</b>
    ${
      enAttente
        ? `<span class="pan__attente">${enAttente} décision${enAttente > 1 ? 's' : ''} en attente${
            cout ? `, ${nombre(cout)} à engager` : ''
          }</span>`
        : ''
    }
    ${
      trop
        ? `<span class="pan__decouvert">Vos engagements dépassent de ${nombre(
            trop,
          )} ce que la collectivité peut engager. Retirez-en un.</span>`
        : ''
    }
  </div>
  <button class="pan__suivant" type="button"${trop ? ' disabled' : ''}>Été suivant</button>
  </div>
</div>`;
}
