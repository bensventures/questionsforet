import type { Doctrine } from '../../model/types';
import { HORIZON } from '../../model/params';
import { POLICES } from './jetons';
import { CRANS_DOCTRINE } from './vue';

/**
 * Écran d'ouverture (patch « posture héritée, réforme fenêtrée », §1).
 *
 * **Le territoire pratique déjà une doctrine.** L'ouverture ne propose donc pas
 * un choix neutre mais un héritage à confirmer ou à réformer, et le statu quo
 * est le défaut : c'est voulu, il recrute le joueur naïf dans le piège que le
 * dossier veut défaire. Le joueur informé réforme ici, gratuitement : c'est de
 * la maîtrise exprimée, pas un trou dans la règle.
 *
 * **Cadrage par le caractère immédiat seulement.** L'écran dit ce que chaque
 * posture fait *maintenant*, jamais ce qu'elle coûte plus tard : le paradoxe de
 * la suppression doit survivre à l'écran de départ, sinon il n'y a plus de
 * paradoxe, seulement une consigne.
 *
 * Il porte aussi le **choix du versant**. Le modèle étant déterministe à graine
 * fixée, un numéro désigne un versant et un seul : on peut y revenir, le
 * comparer, le donner à quelqu'un d'autre. C'est une propriété du noyau, autant
 * la rendre lisible.
 */
export function rendreOuverture(o: { graine: number; cran: Doctrine }): string {
  const crans = CRANS_DOCTRINE.map(
    (d) => `<button type="button" class="ouv__cran${d.cran === o.cran ? ' ouv__cran--on' : ''}" data-cran="${d.cran}"${
      d.cran === o.cran ? ' aria-current="true"' : ''
    }>
      <span class="doc__p"></span>
      <span>
        <span class="doc__n">${d.nom}${d.cran === 1 ? ' <span class="doc__etat">héritée</span>' : ''}</span>
        <span class="doc__s">${d.seuils}</span>
      </span>
      <span class="doc__x">${d.cout}<span class="doc__u">par été</span></span>
    </button>`,
  ).join('');

  return `<div class="ouv decision" role="dialog" aria-modal="true" aria-label="Ouverture de partie">
  <div class="ouv__carte">
    <h2>Un versant du Diois, ${HORIZON.long} étés</h2>
    <p class="ouv__texte">
      Vous ne pourrez pas empêcher le grand feu. Vous déciderez de ce qu'il emporte.
    </p>

    <h3 class="ouv__t">La doctrine que pratique le territoire</h3>
    <p class="ouv__texte">
      Les secours éteignent aujourd'hui <strong>tout départ de feu</strong>. Vous pouvez conserver
      cette posture ou la réformer maintenant : c'est le seul moment où cela ne coûte rien.
      Ensuite, changer demande des étés et de l'argent, sauf après un incendie.
    </p>
    <div class="ouv__crans">${crans}</div>

    <h3 class="ouv__t">Le versant</h3>
    <p class="ouv__texte">
      Chaque numéro désigne un versant et un seul : le relief, les essences, les hameaux en
      découlent. Le même numéro redonne le même terrain.
    </p>
    <div class="ouv__graine">
      <label for="ouv-graine">Versant n°</label>
      <input id="ouv-graine" type="number" min="1" step="1" value="${o.graine}" data-graine>
      <button type="button" class="ouv__autre" data-tirer>En tirer un autre</button>
    </div>

    <button type="button" class="pan__suivant ouv__commencer" data-commencer>Commencer</button>
  </div>
</div>`;
}

/** Feuille de l'écran d'ouverture. Il se pose **par-dessus le versant**, qui
 *  reste visible derrière : « le territoire pratique déjà » se montre. */
export const STYLES_OUVERTURE = `
.ouv {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  padding: 24px;
  background: oklch(0.26 0.03 62 / 0.45);
}
.ouv__carte {
  width: min(560px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 28px 32px 32px;
  background: var(--parchemin);
  border-left: 4px solid var(--braise);
}
.ouv h2 { margin: 0 0 10px; font-family: ${POLICES.titre}; font-size: 30px; font-weight: 500; line-height: 1.15; }
.ouv__t { margin: 22px 0 6px; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--encre3); }
.ouv__texte { margin: 0; font-size: 14.5px; color: var(--encre2); }
.ouv__crans { margin-top: 10px; }
.ouv__cran {
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  display: grid;
  grid-template-columns: 16px 1fr auto;
  gap: 10px;
  align-items: baseline;
  padding: 8px;
  border-left: 2px solid transparent;
  cursor: pointer;
}
.ouv__cran--on { background: var(--rang); border-left-color: var(--braise); }
.ouv__cran--on .doc__p { background: oklch(0.58 0.15 44); }
.ouv__graine { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.ouv__graine label { font-size: 13px; color: var(--encre2); }
.ouv__graine input {
  width: 7em;
  padding: 6px 8px;
  font: 15px ${POLICES.interface};
  color: var(--encre);
  background: var(--parchemin);
  border: 1px solid var(--filet-bloc);
}
.ouv__autre {
  font: 12.5px ${POLICES.interface};
  color: var(--braise-texte);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
}
.ouv__commencer { margin-top: 24px; }
`;
