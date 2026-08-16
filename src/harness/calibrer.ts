import { jouerLot, agrege, moyenne, ecartType, type Resultat, type Strategie } from './jouer';
import { CINQ, mixteCompetente, toutDebroussailler, durcissementSeul } from './strategies';

/**
 * Harnais de calibration (§12 et patch 3). Joue les cinq stratégies et vérifie
 * les assertions. Les assertions sur le rapport braises / front sont écrites
 * **dès la construction du harnais**, pas en fin de calibration.
 */

const PARTIES = Number(process.env.PARTIES ?? 50);

interface Ligne {
  nom: string;
  r: Resultat[];
}

function tableau(lignes: Ligne[]): void {
  console.log(
    'stratégie'.padEnd(26) +
      'bâti  conf  brûlé  strat  récup  fermé mosaïq   braise/front (conformes)  (non conf.)  débord.  forêt',
  );
  for (const { nom, r } of lignes) {
    const f = (c: keyof Resultat, d = 0) => agrege(r, c).toFixed(d);
    console.log(
      nom.padEnd(26) +
        `${f('batiPct').padStart(4)}% ${f('conformitePct').padStart(4)}% ${f('bruleePct').padStart(5)}% ` +
        `${f('sousSeuilStrategiquePct').padStart(5)}% ${f('recuperationPct').padStart(5)}% ${f('fermeePct').padStart(5)}% ` +
        `${f('mosaiquePct').padStart(5)}% ` +
        `${f('braiseConforme', 1).padStart(9)}/${f('frontConforme', 1)}` +
        `${(f('braiseNonConforme', 1) + '/' + f('frontNonConforme', 1)).padStart(15)}` +
        `${f('pertesSecoursDebordes', 1).padStart(9)} ${f('surfaceTenueMax', 0).padStart(6)}`,
    );
  }
}

const lignes: Ligne[] = [...CINQ, durcissementSeul].map((s: Strategie) => ({ nom: s.nom, r: jouerLot(s, PARTIES) }));
const par = (nom: string) => lignes.find((l) => l.nom === nom)!.r;

console.log(`\n${PARTIES} parties × 40 tours\n`);
tableau(lignes);

let ko = 0;
const verifier = (ok: boolean, libelle: string, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${libelle}${detail ? ` — ${detail}` : ''}`);
  if (!ok) ko++;
};

const mixte = par(mixteCompetente.nom);
const debrouss = par(toutDebroussailler.nom);
const rien = par('ne rien faire');
const coupures = par('coupures uniquement');
const extinction = par('extinction systématique');

console.log('\nTest décisif · le durcissement est-il le meilleur investissement ? (thèse du brief) :');
const durci = par(durcissementSeul.nom);
verifier(
  agrege(durci, 'batiPct') > agrege(debrouss, 'batiPct'),
  'le durcissement seul bat le périmètre seul sur le bâti (assertion 2, forme forte)',
  `durcissement ${agrege(durci, 'batiPct').toFixed(0)}% vs périmètre ${agrege(debrouss, 'batiPct').toFixed(0)}%`,
);
console.log(
  `  · durcissement seul : ${agrege(durci, 'batiPct').toFixed(0)}% du bâti, ${agrege(durci, 'pertesBraise', ).toFixed(1)} pertes par braise, ` +
  `${agrege(durci, 'pertesFront').toFixed(1)} par front, ${agrege(durci, 'depense').toFixed(0)} dépensés`,
);
console.log(
  `  · mixte compétente  : ${agrege(mixte, 'batiPct').toFixed(0)}% du bâti, ${agrege(mixte, 'pertesBraise').toFixed(1)} pertes par braise, ` +
  `${agrege(mixte, 'pertesFront').toFixed(1)} par front, ${agrege(mixte, 'depense').toFixed(0)} dépensés`,
);

console.log('\nAssertion 1, reformulée (amendement 2, C) :');
const braiseC = moyenne(lignes.flatMap((l) => l.r.map((x) => x.braiseConforme)));
const frontC = moyenne(lignes.flatMap((l) => l.r.map((x) => x.frontConforme)));
const braiseNC = moyenne(lignes.flatMap((l) => l.r.map((x) => x.braiseNonConforme)));
const frontNC = moyenne(lignes.flatMap((l) => l.r.map((x) => x.frontNonConforme)));
verifier(
  braiseC > frontC * 1.3,
  'chez les constructions conformes, les braises dominent nettement',
  `braises ${braiseC.toFixed(1)} vs front ${frontC.toFixed(1)}`,
);
console.log(
  `  · chez les non conformes, la dominance du front est attendue : braises ${braiseNC.toFixed(1)} vs front ${frontNC.toFixed(1)} (observation, pas un critère)`,
);

console.log('\nAutres assertions du patch 3 :');
verifier(
  agrege(debrouss, 'batiPct') < agrege(mixte, 'batiPct'),
  'assertion 2 · le périmètre ne gagne pas sur le bâti',
  `débroussailler ${agrege(debrouss, 'batiPct').toFixed(0)}% vs mixte ${agrege(mixte, 'batiPct').toFixed(0)}%`,
);
verifier(
  agrege(debrouss, 'surfaceTenueMax') < 0.15 * 1040,
  'assertion 3 · plafond d’entretien forestier',
  `${agrege(debrouss, 'surfaceTenueMax').toFixed(0)} parcelles au plus, soit ${((agrege(debrouss, 'surfaceTenueMax') / 1040) * 100).toFixed(0)}% de la carte`,
);
verifier(
  agrege(debrouss, 'frichePct') >= agrege(rien, 'frichePct'),
  'assertion 3bis · le surplus ouvert bascule en friche',
  `${agrege(debrouss, 'frichePct').toFixed(1)}% contre ${agrege(rien, 'frichePct').toFixed(1)}% en ne faisant rien`,
);
verifier(
  agrege(mixte, 'toursSecoursDebordes') > 0.5,
  'assertion 5 · les moyens de lutte sont régulièrement débordés',
  `${agrege(mixte, 'toursSecoursDebordes').toFixed(1)} tours par partie`,
);

console.log('\nCibles du §12 pour le joueur compétent :');
verifier(agrege(mixte, 'batiPct') > 80, 'plus de 80 % du bâti conservé', `${agrege(mixte, 'batiPct').toFixed(0)}%`);
verifier(
  agrege(mixte, 'sousSeuilStrategiquePct') > 50,
  'densité sous le seuil sur la fraction stratégique',
  `${agrege(mixte, 'sousSeuilStrategiquePct').toFixed(0)}%`,
);
verifier(
  agrege(mixte, 'renoncements') > 0.5,
  'a dû renoncer à au moins une politique faute de moyens',
  `${agrege(mixte, 'renoncements').toFixed(1)} par partie`,
);
/*
 * Le harnais déduisait les renoncements en comparant les politiques d'un tour à
 * l'autre ; le modèle les compte désormais lui-même, et c'est ce compteur que
 * l'écran de fin affiche. Les deux ne peuvent pas être égaux en toute
 * circonstance : une politique **établie et coupée dans le même tour** n'est
 * dans aucun des deux relevés du harnais, alors que le joueur l'a bel et bien
 * payée puis perdue. Le compteur du modèle est donc le bon, et il majore
 * l'ancienne déduction.
 *
 * Mesuré : identiques sur cinq stratégies, y compris la compétente sur laquelle
 * porte la cible du §12 ; seule « coupures uniquement », qui ouvre des
 * politiques sans jamais regarder son budget, écarte les deux comptes (7,0
 * contre 7,8).
 */
verifier(
  lignes.every(({ r }) => r.every((x) => x.renoncementsModele >= x.renoncements)),
  'le compteur du modèle majore la déduction du harnais',
  `compétente : ${agrege(mixte, 'renoncementsModele').toFixed(1)} des deux côtés`,
);
// La surface brûlée n'est plus une cible : minimiser le feu est précisément le
// réflexe que le jeu doit défaire. Elle reste une observation, avec un
// garde-fou large destiné à détecter un modèle dégénéré (amendement 2, A.1).
const brule = agrege(mixte, 'bruleePct');
verifier(brule >= 20 && brule <= 80, 'garde-fou · surface brûlée dans 20-80 % (observation, non scorée)', `${brule.toFixed(0)}%`);

console.log('\nDéfaites distinguables (§12) :');
const profil = (r: Resultat[]) =>
  [agrege(r, 'batiPct'), agrege(r, 'fermeePct'), agrege(r, 'frichePct'), agrege(r, 'densiteMoyenne')]
    .map((x) => Math.round(x))
    .join('/');
const profils = [
  ['extinction systématique', profil(extinction)],
  ['tout débroussailler', profil(debrouss)],
  ['ne rien faire', profil(rien)],
  ['coupures uniquement', profil(coupures)],
] as const;
for (const [nom, p] of profils) console.log(`  ${nom.padEnd(26)} bâti/fermé/friche/densité = ${p}`);
verifier(new Set(profils.map(([, p]) => p)).size === 4, 'les quatre mauvaises stratégies finissent différemment');

// Amendement 2, E : si la stratégie mixte gagne partout, le jeu a une solution
// optimale et le dilemme disparaît. Elle doit être la meilleure sur le bâti et
// sur la capacité de récupération, mais battue sur au moins un axe.
console.log('\nLa stratégie compétente ne doit pas dominer tous les axes (amendement 2, E) :');
const AXES = ['batiPct', 'recuperationPct', 'biodiversite', 'mosaiquePct', 'sousSeuilPct', 'recettes'] as const;
const battue: string[] = [];
for (const axe of AXES) {
  const moi = agrege(mixte, axe);
  const meilleurAutre = Math.max(...lignes.filter((l) => l.nom !== mixteCompetente.nom).map((l) => agrege(l.r, axe)));
  const gagne = moi >= meilleurAutre;
  console.log(`  ${axe.padEnd(24)} mixte ${moi.toFixed(0).padStart(5)}   meilleur autre ${meilleurAutre.toFixed(0).padStart(5)}   ${gagne ? 'domine' : 'battue'}`);
  if (!gagne) battue.push(axe);
}
verifier(agrege(mixte, 'batiPct') >= Math.max(...lignes.filter((l) => l.nom !== mixteCompetente.nom).map((l) => agrege(l.r, 'batiPct'))), 'meilleure sur le bâti');
verifier(battue.length > 0, 'battue sur au moins un axe par une stratégie spécialisée', battue.join(', ') || 'aucun');

/**
 * Vivier d'éleveurs. Ces assertions ne viennent pas du §12 : elles gardent la
 * dépendance du langage de décision, dont le bandeau de ressources demande
 * **trois grandeurs séparées**. Elles échouent si un futur remaniement les
 * ré-agrège, ce qui est exactement ce qu'on veut savoir.
 */
console.log('\nVivier d’éleveurs, en trois grandeurs (dépendance du langage de décision) :');
for (const { nom, r } of lignes) {
  console.log(
    `  ${nom.padEnd(26)} disponibles ${agrege(r, 'eleveursDisponibles').toFixed(1)} · ` +
      `engagés ${agrege(r, 'eleveursEngages').toFixed(1)} · perdus ${agrege(r, 'eleveursPerdus').toFixed(1)}`,
  );
}
verifier(
  lignes.every(({ r }) => r.every((x) => x.eleveursDisponibles + x.eleveursEngages <= 3 && x.eleveursPerdus >= 0)),
  'invariant · disponibles + engagés ne dépasse jamais le plafond de la profession',
);
verifier(
  agrege(mixte, 'eleveursEngages') > 0.5,
  'chez le joueur compétent, le vivier finit engagé (zéro disponible = succès)',
  `${agrege(mixte, 'eleveursEngages').toFixed(1)} engagés`,
);
verifier(
  agrege(rien, 'eleveursPerdus') > 0.5 && agrege(rien, 'eleveursEngages') === 0,
  'en ne faisant rien, le même zéro disponible est une déprise (levier mort)',
  `${agrege(rien, 'eleveursPerdus').toFixed(1)} perdus`,
);

console.log('\nTest de variabilité (§12) :');
const bati = mixte.map((x) => x.batiPct);
verifier(
  ecartType(bati) > 2 && Math.min(...bati) > 20,
  'les résultats varient sans qu’une bonne stratégie perde totalement',
  `écart-type ${ecartType(bati).toFixed(1)}, pire partie ${Math.min(...bati)}%`,
);

console.log(ko === 0 ? '\n✓ calibration conforme' : `\n✗ ${ko} critère(s) non tenu(s)`);
