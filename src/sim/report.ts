import type { GameState } from './types';
import type { FireRun } from './fire';
import type { LogMsg } from './tools';

/**
 * After-fire report (amendment §2.2): the core of the learning loop. Each line
 * attributes an outcome to the decision — or the absence of decision — that
 * explains it, so the player can connect what burned to what they chose.
 */
export function afterFireReport(state: GameState, run: FireRun, wasBigFire: boolean): LogMsg[] {
  const out: LogMsg[] = [];
  const plural = (n: number) => (n > 1 ? 's' : '');

  out.push({ text: wasBigFire ? '— Compte rendu du grand feu —' : '— Compte rendu —' });

  // The suppression paradox, said plainly — but only in retrospect, and only
  // after the fire that reveals it (amendment §5). Nothing warns of it before.
  if (wasBigFire && state.yearsAtCran1 >= 8 && state.suppressedCum > 0) {
    out.push({
      text:
        `Ce feu-là a couru sur ${state.yearsAtCran1} années de combustible que personne n'a enlevé. ` +
        `<b>${state.suppressedCum} départs éteints</b> depuis le début : autant de petits feux qui n'ont pas fait ` +
        `le travail d'entretien, et un paysage qui s'est refermé pendant que tout paraissait sous contrôle. ` +
        `L'extinction systématique n'a pas supprimé le risque, elle l'a différé et concentré.`,
      cls: 'hot',
    });
  }

  // Buildings held by zone 0.
  if (run.emberHeldHard > 0) {
    out.push({ text: `Bâti durci : ${run.emberHeldHard} braise${plural(run.emberHeldHard)} tombée${plural(run.emberHeldHard)} au contact sans trouver de quoi s'allumer. La zone 0 a tenu.`, cls: 'good' });
  }

  // Buildings lost to embers (hardening was the only thing that could have helped).
  if (run.emberBuiltIgn > 0) {
    out.push({ text: `${run.emberBuiltIgn} bâtiment${plural(run.emberBuiltIgn)} allumé${plural(run.emberBuiltIgn)} par des braises portées loin du front, faute de durcissement. La distance débroussaillée n'y pouvait rien.`, cls: 'hot' });
  }

  // Buildings lost to the front (defendability failed: depth or slope).
  if (run.frontBuiltIgn > 0) {
    out.push({ text: `${run.frontBuiltIgn} bâtiment${plural(run.frontBuiltIgn)} pris par le front : les secours n'ont pas pu tenir, profondeur traitée insuffisante compte tenu de la pente.`, cls: 'hot' });
  }

  // Severe reburn driven by closure (density above threshold, unmanaged).
  if (run.closedSevere > 0) {
    out.push({ text: `${run.closedSevere} parcelle${plural(run.closedSevere)} rebrûlée${plural(run.closedSevere)} sévèrement : densité au-dessus du seuil, peuplement laissé non géré. Le paysage fermé a porté le feu en cime.`, cls: 'hot' });
  }

  // Pin noir that will not return.
  if (run.pinNoirLost > 0) {
    out.push({ text: `${run.pinNoirLost} pinède${plural(run.pinNoirLost)} de pin noir ne repartira pas : feu de cime, aucun semencier survivant. La parcelle bascule vers la lande.`, cls: 'hot' });
  }

  // Grazed breaks that had lapsed.
  if (run.grazeFailed > 0) {
    out.push({ text: `${run.grazeFailed} coupure${plural(run.grazeFailed)} pâturée${plural(run.grazeFailed)} a cédé : le sous-bois s'y était reconstitué faute d'entretien.`, cls: 'hot' });
  }

  // A quiet fire that did useful work (the beneficial low-intensity regime).
  if (run.burnedThis > 0 && run.crownCells === 0 && run.structHit === 0) {
    out.push({ text: 'Feu courant de faible intensité : il a éclairci le sous-bois sans détruire les peuplements. C\'est le régime doux que la suppression systématique fait disparaître.', cls: 'good' });
  }

  // Nothing of value lost.
  if (run.structHit === 0 && run.emberBuiltIgn === 0 && run.frontBuiltIgn === 0) {
    out.push({ text: 'Aucune habitation perdue cette fois.', cls: 'good' });
  }

  return out;
}
