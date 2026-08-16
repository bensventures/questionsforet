import { HACHURE_BRAISE, JETONS as J, LARGEUR_PANNEAU, POLICES } from './jetons';

/**
 * Feuille du panneau de décision. Chaîne exportée plutôt que fichier `.css`
 * pour que la planche de vérification (Node) et l'îlot Astro lisent la même
 * source ; le CSS scoped du site reste inline de toute façon, la CSP
 * n'interdisant que les scripts.
 *
 * Rien de tricolore, aucune ombre portée, aucun dégradé décoratif : le seul
 * dégradé de la feuille est la hachure braise, à ses deux emplois autorisés.
 */
export const STYLES_PANNEAU = `
/*
 * Les jetons sont posés sur **deux** sélecteurs : le panneau, et une classe
 * neutre que porte tout fragment rendu hors du panneau (une fiche seule, un
 * écran de fin, une bande de coupe). Sans elle, un fragment sorti du panneau
 * perd ses variables et rend ses aplats en transparent : les crans d'adoption
 * disparaissaient sans erreur, exactement comme le sous-bois derrière un
 * sprite masqué par \`display:none\`. Le même piège, une couche plus haut.
 */
.pan, .decision {
  --parchemin: ${J.parchemin};
  --rang: ${J.parcheminRang};
  --encre: ${J.encre};
  --encre2: ${J.encre2};
  --encre3: ${J.encre3};
  --braise: ${J.braise};
  --braise-texte: ${J.braiseTexte};
  --braise-plein: ${J.braisePlein};
  --braise-leger: ${J.braiseLeger};
  --pin: ${J.pin};
  --pin-clair: ${J.pinClair};
  --filet: ${J.filet};
  --filet-bloc: ${J.filetBloc};
  color: var(--encre);
  font-family: ${POLICES.interface};
  font-size: 15px;
  line-height: 1.45;
}
.pan {
  width: ${LARGEUR_PANNEAU}px;
  flex: 0 0 ${LARGEUR_PANNEAU}px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--parchemin);
}
.pan h2 {
  margin: 0;
  font: 500 10.5px/1.2 ${POLICES.interface};
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--encre3);
}
.pan__bloc { padding: 14px 20px; border-bottom: 1px solid var(--filet); }
.pan__bloc--rendu { flex: 1 1 auto; min-height: 0; }
.pan__bloc--gestes { border-bottom: 0; margin-top: auto; background: var(--rang); }

/* ---- les trois zones du panneau -------------------------------------------
   Le bandeau et le pied ne bougent jamais ; entre eux, le corps porte la pile
   courante et reçoit le tiroir du secteur. */
.pan__corps { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.pan__pile { position: absolute; inset: 0; display: flex; flex-direction: column; overflow-y: auto; }

/* ---- tiroir du secteur choisi ---------------------------------------------
   Il **couvre la colonne** plutôt que de changer un bloc en son milieu : c'est
   ce qui rend la sélection évidente. Il glisse depuis la droite, d'où la carte
   l'appelle, et se referme par sa propre croix, qui désélectionne. */
.pan__tiroir {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--parchemin);
  border-left: 4px solid var(--braise);
  overflow-y: auto;
}
@media (prefers-reduced-motion: no-preference) {
  .pan__tiroir { animation: pan-glisse 220ms ease-out both; }
}
@keyframes pan-glisse { from { transform: translateX(14%); opacity: 0 } to { transform: none; opacity: 1 } }
.tiroir__tete {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 12px;
  align-items: start;
  padding: 14px 20px 10px 12px;
  background: var(--rang);
  border-bottom: 1px solid var(--filet);
}
.tiroir__fermer {
  width: 28px; height: 28px;
  font: 15px/1 ${POLICES.interface};
  color: var(--braise-texte);
  background: none;
  border: 1px solid var(--braise);
  cursor: pointer;
}
.tiroir__corps { padding: 14px 20px; }
.secteur__nom { margin: 4px 0 2px; font-family: ${POLICES.titre}; font-size: 24px; font-weight: 500; line-height: 1.15; }
.secteur__sous { margin: 0; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--encre3); }
.pan__attente { display: block; font-size: 11.5px; color: var(--pin); }


/* ---- bandeau de ressources (planche 5) ------------------------------------
   L'ordre est décisionnel et non celui des tableaux de bord : ce qui plafonne
   d'abord, ce qui manque ensuite, l'argent après. */
.res { display: grid; grid-template-columns: 1.45fr 1.5fr 0.8fr 0.75fr 0.9fr; gap: 14px; align-items: start; }
.res__t { font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--encre3); margin-bottom: 6px; }
.res__n { font-family: ${POLICES.titre}; font-size: 25px; line-height: 1; font-weight: 500; }
.res__u { font-size: 11.5px; color: var(--encre2); }

.jauge { position: relative; height: 14px; background: var(--rang); border: 1px solid var(--filet); }
.jauge__p { position: absolute; inset: 0 auto 0 0; background: var(--pin); }
.jauge__d { position: absolute; inset: 0 0 0 auto; background-image: ${HACHURE_BRAISE}; }
.jauge__s { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--encre); }

.eleveurs { display: flex; gap: 12px; }
.elv { display: flex; align-items: center; gap: 4px; }
.elv__d { width: 15px; height: 15px; border-radius: 50%; }
.elv__d--dispo { border: 1.5px dashed ${J.encre2}; }
.elv__d--engage { background: var(--pin); }
.elv__d--perdu { border: 1.5px solid var(--braise); position: relative; }
.elv__d--perdu::after {
  content: ''; position: absolute; left: -1px; right: -1px; top: 6px;
  border-top: 1.5px solid var(--braise); transform: rotate(-35deg);
}
.elv__vide { color: var(--encre3); font-size: 15px; }
.deprise { display: flex; gap: 2px; margin-top: 6px; }
.deprise i { width: 4px; height: 9px; border: 1px solid var(--braise); }
.deprise i.plein { background: var(--braise); }

.budget--braise { color: var(--braise-texte); }
.budget--coupe { background: var(--braise-plein); color: ${J.encreInverse}; padding: 0 6px; }
.equipes { display: flex; gap: 5px; }
.equipes i { width: 5px; height: 26px; background: var(--encre2); }
.reserve { border-left: 1px dashed var(--encre3); padding-left: 10px; min-height: 44px; color: var(--encre3); font-size: 11px; }

/* ---- doctrine (planche 2) --------------------------------------------------
   Trois lignes empilées, pas un curseur : un curseur suggère un continuum et
   une position médiane raisonnable, quand il s'agit de trois doctrines. */
.doc { display: flex; flex-direction: column; margin-top: 8px; }
/* Boutons remis à plat : ce sont des commandes, elles doivent l'être pour le
   clavier, mais elles gardent le dessin de la planche 2. */
.doc__c, .geste, .secteurs__b {
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;
}
.doc__c { display: grid; grid-template-columns: 16px 1fr auto; gap: 10px; align-items: baseline; padding: 7px 8px; border-left: 2px solid transparent; }
.doc__n, .doc__s, .geste__n, .geste__e, .secteurs__n, .secteurs__e { display: block; }
.doc__c--on { background: ${J.parcheminRang}; border-left-color: var(--braise); }
.doc__p { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid ${J.braise}; margin-top: 5px; }
.doc__c--on .doc__p { background: oklch(0.58 0.15 44); }
.doc__n { font-size: 15px; }
.doc__s { font-size: 12px; color: var(--encre2); }
.doc__x { font-size: 15px; color: var(--encre); font-variant-numeric: tabular-nums; }
.doc__note { font-size: 12px; color: var(--encre2); margin-top: 8px; }
/* La fenêtre post-incendie est une **interaction possible** : c'est l'un des
   trois emplois de la braise, et le seul moment où réformer est facile. */
.doc__note--fenetre { color: var(--braise-texte); }
.doc__note--vise { color: var(--pin); }
.doc__etat { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--encre3); }
.doc__c--vise { border-left-color: var(--pin-clair); }
.doc__c--demande { border-left-color: var(--encre3); }
.tranquillite { display: flex; gap: 1px; margin-top: 8px; }
.tranquillite i { width: 3px; height: 12px; background: var(--filet); }
.tranquillite i.cran1 { background: oklch(0.58 0.15 44); }

/* ---- fiche de politique (planche 1) ---------------------------------------
   Le filet gauche est le **seul** porteur des cinq états : la couleur du nom,
   le fond et la graisse ne les redisent pas. */
.fiche { position: relative; padding: 12px 14px 12px 18px; margin-bottom: 10px; background: var(--parchemin); border: 1px solid var(--filet); }
.fiche::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
.fiche--activable::before { background: repeating-linear-gradient(to bottom, ${J.activable} 0 7px, transparent 7px 13px); }
.fiche--montee::before { background: ${J.pinClair}; }
.fiche--vigueur::before { background: ${J.pin}; }
.fiche--levee::before { background: ${J.levee}; }
.fiche--levee { color: var(--encre3); }
.fiche--abandon::before { width: 6px; background: var(--braise); }
.fiche--abandon { background: var(--braise-leger); }
.fiche--abandon .fiche__n { text-decoration: line-through; }
.fiche__h { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.fiche__p { font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--encre3); }
.fiche__d { font-size: 11px; color: var(--encre2); white-space: nowrap; }
.fiche__n { font-family: ${POLICES.titre}; font-size: 27px; line-height: 1.1; font-weight: 500; margin: 2px 0 4px; }
.fiche__c { font-size: 14.5px; color: var(--encre2); }
.fiche__prix { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.fiche__prix b { font-family: ${POLICES.titre}; font-size: 23px; font-weight: 500; display: block; line-height: 1.1; }
.fiche__prix span { font-size: 12px; color: var(--encre2); }
.fiche__prix .aucune { color: var(--pin); }
.crans { display: flex; gap: 4px; margin-top: 10px; }
.crans i { width: 26px; height: 6px; background: var(--pin); }
.crans i.vide { background: transparent; border-top: 2px dashed var(--encre3); height: 4px; }
.fiche__pied { font-size: 12px; color: var(--encre2); margin-top: 8px; }
.fiche__cond { margin-top: 10px; padding: 7px 9px; border: 1px solid var(--braise); color: var(--braise-texte); font-size: 12.5px; }
.fiche__appel { margin-top: 10px; font-size: 13px; color: var(--braise-texte); border: 0; background: none; padding: 0; font-family: inherit; cursor: pointer; }
.fiche__refus { margin-top: 10px; font-size: 12.5px; color: var(--braise-texte); }
/* Une décision prise mais pas encore appliquée : le noyau n'a qu'une porte,
   et l'été suivant est le seul moment où elle s'ouvre. */
.fiche__attente { margin-top: 10px; font-size: 12.5px; color: var(--pin); }

/* ---- compte rendu (planche 6) ---------------------------------------------
   Aucun tri : les lignes gardent l'ordre du tour, remonter les chaudes en tête
   casserait la chaîne causale. */
.cr { list-style: none; margin: 8px 0 0; padding: 0; }
.cr li { display: grid; grid-template-columns: 14px 1fr; gap: 10px; padding: 7px 0; }
.cr li + li { border-top: 1px solid var(--filet); }
.cr li.chaud { background: oklch(0.945 0.026 78); }
.cr__m { margin-top: 5px; }
.cr__m--bon { width: 9px; height: 9px; border-radius: 50%; background: var(--pin); }
.cr__m--neutre { width: 9px; height: 9px; border-radius: 50%; border: 1.5px dashed var(--encre3); }
.cr__m--chaud { width: 3px; height: 15px; background: var(--braise); }
.cr__a { font-size: 12.5px; color: var(--encre3); margin-top: 2px; }
.cr__lien { font-size: 12.5px; color: var(--braise-texte); background: none; border: 0; padding: 0; font-family: inherit; cursor: pointer; text-decoration: underline; }
.cr__muet { font-style: italic; color: var(--encre2); }
/* Bande de coupe : seul fond braise pleine largeur de l'interface, seule ligne
   du compte rendu composée en serif. Elle ne s'annonce pas autrement, et elle
   ne se répète jamais au tour suivant. */
.cr li.cr__coupe { display: block; background: var(--braise-plein); color: ${J.encreInverse}; padding: 16px 18px; margin: 4px -20px; }
.cr__coupe h3 { margin: 0 0 6px; font-family: ${POLICES.titre}; font-size: 25px; font-weight: 500; line-height: 1.15; text-transform: none; letter-spacing: 0; color: ${J.encreInverse}; }
.cr__coupe p { margin: 6px 0 0; font-size: 13.5px; }
.cr__vous { font-size: 15px !important; }
.cr__coupe > div > div { font-size: 13.5px; opacity: 0.92; }
.cr__pied { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--filet); font-size: 12.5px; color: var(--encre2); }

/* ---- gestes (planche 3) ----------------------------------------------------
   Horizontal et sans filet d'état : une ponctuelle n'a aucun état à porter.
   Le contraste des deux registres est l'enseignement. */
.geste { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: baseline; padding: 8px 0; }
.geste + .geste { border-top: 1px solid var(--filet); }
.geste--arme { box-shadow: inset 3px 0 0 var(--braise); padding-left: 9px; }
.geste--refus { background-image: ${HACHURE_BRAISE}; }
.geste__n { font-size: 14.5px; }
.geste__e { font-size: 12px; color: var(--encre2); }
.geste__c { font-family: ${POLICES.titre}; font-size: 19px; font-weight: 500; }
.geste__r { grid-column: 1 / -1; font-size: 12px; color: var(--braise-texte); }

/* ---- liste des secteurs ---------------------------------------------------
   Le chemin clavier vers la sélection, et le seul sommaire du versant depuis
   que les étiquettes de la carte ne s'affichent qu'au survol. */
.secteurs { list-style: none; margin: 8px 0 0; padding: 0; }
.secteurs li + li { border-top: 1px solid var(--filet); }
.secteurs__b { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: baseline; padding: 7px 8px; border-left: 2px solid transparent; }
.secteurs__b--on { background: var(--rang); border-left-color: var(--braise); }
.secteurs__n { font-size: 14px; }
.secteurs__e { font-size: 11.5px; color: var(--encre3); }

/* ---- prise du clavier -----------------------------------------------------
   Un plancher, pas un raffinement : sans anneau de focus visible, on ne sait
   plus où l'on est dès qu'on lâche la souris. */
.pan :focus-visible, .ouv :focus-visible, .ecran__carte:focus-visible {
  outline: 2px solid var(--braise);
  outline-offset: 2px;
}

/* ---- pied de panneau ------------------------------------------------------ */
.pan__tour { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-top: 1px solid var(--filet); }
.pan__tour b { font-family: ${POLICES.titre}; font-size: 17px; font-weight: 500; }
.pan__suivant { font-family: inherit; font-size: 14px; padding: 8px 16px; color: ${J.encreInverse}; background: var(--braise-plein); border: 0; cursor: pointer; }

/* ---- écran de fin de partie (planche 7) -----------------------------------
   Un relevé de terrain : filets et colonnes de chiffres, pas une carte à ombre
   portée. Tout tient sans défilement, et rien n'est coloré parce qu'il est
   haut ou bas. */
.fin { background: var(--parchemin); padding: 28px 32px; display: flex; flex-direction: column; gap: 22px; }
.fin__sur { font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--encre3); margin: 0; }
.fin__titre { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
.fin__titre p { margin: 0; font-family: ${POLICES.titre}; font-size: 34px; line-height: 1.15; font-weight: 500; }
.fin h3 { margin: 0 0 10px; font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--encre3); }
.fin__grille { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; border-top: 1px solid var(--filet); padding-top: 18px; }
.fin__cause { display: grid; grid-template-columns: 130px 1fr 28px; gap: 10px; align-items: center; margin-bottom: 6px; font-size: 13.5px; }
.fin__barre { height: 10px; background: var(--rang); }
.fin__barre i { display: block; height: 100%; background: var(--braise); }
.fin__cause b { font-family: ${POLICES.titre}; font-size: 17px; font-weight: 500; text-align: right; }
.fin__rangs { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }
.fin__rang { font-size: 12.5px; color: var(--encre2); display: grid; gap: 4px; }
.fin__rang > span:first-child { font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--encre3); }
.fin__marques { display: flex; gap: 6px; }
.fin__marques i { width: 15px; height: 15px; }
/* Le contour épais est celui du bâti équipé. */
.fin__marques i.durci { border: 3px solid var(--encre); }
.fin__marques i.nu { border: 1.5px solid var(--braise); }
.fin__marques i.conforme { background: var(--pin); }
.fin__marques i.nonconforme { border: 1.5px dashed var(--braise); }
.fin__liste { margin: 0; display: flex; flex-direction: column; gap: 7px; }
.fin__liste > div { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; border-bottom: 1px dotted var(--filet); padding-bottom: 5px; }
.fin__liste dt { font-size: 13.5px; color: var(--encre2); margin: 0; }
.fin__liste dd { margin: 0; font-family: ${POLICES.titre}; font-size: 19px; font-weight: 500; }
/* Une seule ligne en braise : la conversion irréversible. */
.fin__liste .irr dd, .fin__liste .irr dt { color: var(--braise-texte); }
.fin__note { margin: 0 0 12px; font-size: 13px; color: var(--encre2); max-width: 46em; }
.fin__regle { position: relative; height: 34px; margin-top: 6px; }
.fin__plage { position: absolute; left: 20%; width: 60%; top: 0; height: 14px; background: var(--rang); }
.fin__valeur { position: absolute; top: -4px; height: 22px; width: 2px; background: var(--encre); }
.fin__cotes { position: absolute; top: 18px; left: 0; right: 0; display: block; }
.fin__cotes i { position: absolute; font-size: 11px; font-style: normal; color: var(--encre3); }
.fin__cotes i:nth-child(1) { left: 0 }
.fin__cotes i:nth-child(2) { left: 20% }
.fin__cotes i:nth-child(3) { left: 80% }
.fin__cotes i:nth-child(4) { right: 0 }
.fin__releve { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; border-top: 1px solid var(--filet); padding-top: 16px; }
.fin__releve span { display: block; font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--encre3); margin-bottom: 4px; }
.fin__releve b { font-family: ${POLICES.titre}; font-size: 21px; font-weight: 500; }
.fin__releve b.braise { color: var(--braise-texte); }

/* ---- révélation, unique animation du panneau ------------------------------ */
@media (prefers-reduced-motion: no-preference) {
  .cr li { animation: pan-apparait 220ms ease-out both; }
  .cr li:nth-child(1) { animation-delay: 0ms }
  .cr li:nth-child(2) { animation-delay: 90ms }
  .cr li:nth-child(3) { animation-delay: 180ms }
  .cr li:nth-child(4) { animation-delay: 270ms }
  .cr li:nth-child(5) { animation-delay: 360ms }
  .cr li:nth-child(6) { animation-delay: 450ms }
  .cr li:nth-child(7) { animation-delay: 540ms }
  .cr li:nth-child(8) { animation-delay: 630ms }
  .cr li:nth-child(9) { animation-delay: 720ms }
}
/* Sans mouvement : la ligne apparaît, elle ne se déplace pas. */
@keyframes pan-apparait { from { opacity: 0 } to { opacity: 1 } }
`;
