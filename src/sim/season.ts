import type { Cell, GameState } from './types';
import type { Rng } from './rng';
import type { LogMsg } from './tools';
import { TYPES, DENSITY, REGEN, SUPPRESS, DOCTRINE, isWooded } from './params';
import { clamp, idx, inb } from './util';
import { ignitability } from './model';
import { tickPolicies } from './policies';

export interface SummerResult {
  messages: LogMsg[];
  fireStarted: boolean;
}

/** Chebyshev distance from a cell to the nearest standing building. */
function distToBuilt(grid: Cell[], c: Cell): number {
  let best = Infinity;
  for (const b of grid) {
    if (b.t !== 'bati' || b.destroyed) continue;
    const d = Math.max(Math.abs(b.x - c.x), Math.abs(b.y - c.y));
    if (d < best) best = d;
  }
  return best;
}

/** Grazing upkeep, climate drift, wind, and ignitions. Sets igniting cells to
 *  fs=1 and reports whether a fire actually took. */
export function startSummer(state: GameState, rng: Rng): SummerResult {
  const { grid } = state;
  const messages: LogMsg[] = [];

  // Grazing upkeep.
  let need = 0;
  for (const c of grid) if (c.graze > 0) need++;
  const cost = Math.ceil(need / 9);
  if (cost > 0) {
    if (state.pa >= cost) {
      state.pa -= cost;
      state.spentCum += cost;
      for (const c of grid) if (c.graze > 0) { c.grazeOn = true; c.sous = Math.min(c.sous, 0.15); }
      messages.push({ text: `Contractualisation éleveurs : ${cost} PA. Coupures entretenues.` });
    } else {
      for (const c of grid) if (c.graze > 0) { c.grazeOn = false; c.sous = Math.min(1, c.sous + 0.3); }
      messages.push({ text: 'Pâturage non reconduit faute de moyens : des poches de combustible se reforment dans les coupures.', cls: 'hot' });
    }
  }

  // Climate: a rising trend plus interannual noise. The scheduled great-fire
  // year overrides it with extreme conditions (and forces ignition below).
  const bigFire = state.year >= state.bigFireYear && !state.bigFireDone;
  state.lastDrought = state.drought;
  if (bigFire) {
    state.drought = clamp(rng.range(0.9, 1), 0.9, 1);
    state.wind = { a: rng.range(0, Math.PI * 2), s: rng.range(1.1, 1.3) };
    state.bigFireDone = true;
    messages.push({ text: "<b>L'année du grand feu.</b> Sécheresse extrême, vent violent : ce feu-là arrivait, quoi qu'on fasse. Reste ce qu'on lui aura laissé.", cls: 'hot' });
  } else {
    state.drought = clamp(0.3 + state.year * 0.016 + rng.range(-0.22, 0.28), 0.05, 1);
    const wa = rng.range(0, Math.PI * 2);
    const ws = clamp(0.35 + state.drought * 0.7 + rng.range(-0.2, 0.3), 0.2, 1.3);
    state.wind = { a: wa, s: ws };
    messages.push({
      text: `Été : indice de sécheresse <b>${state.drought.toFixed(2)}</b>, vent ${ws > 0.85 ? 'fort' : ws > 0.55 ? 'soutenu' : 'faible'}.`,
      cls: state.drought > 0.7 ? 'hot' : undefined,
    });
  }

  // Ignitions.
  const litCells: Cell[] = [];
  if (bigFire) {
    // Guaranteed multiple starts in the most flammable stands: this fire runs.
    const candidates = grid
      .filter((c) => c.t !== 'rocher' && c.t !== 'brule' && c.t !== 'bati')
      .sort((a, b) => ignitability(b, state.drought) - ignitability(a, state.drought));
    for (const c of candidates.slice(0, 4)) { c.fs = 1; litCells.push(c); }
  } else {
    let nfire = state.drought > 0.75 ? 3 : state.drought > 0.5 ? 2 : 1;
    if (rng.chance(0.2 - state.drought * 0.15)) nfire = 0;
    if (!nfire) {
      messages.push({ text: 'Aucun départ significatif cette année.', cls: 'good' });
      return { messages, fireStarted: false };
    }
    for (let k = 0; k < nfire * 4 && litCells.length < nfire; k++) {
      const c = grid[rng.int(grid.length)];
      if (c.t !== 'rocher' && c.t !== 'brule' && ignitability(c, state.drought) > 0.18) { c.fs = 1; litCells.push(c); }
    }
  }
  if (litCells.length === 0) {
    messages.push({ text: "Départs sans reprise : le paysage n'était pas en état de porter le feu.", cls: 'good' });
    return { messages, fireStarted: false };
  }

  // Doctrine de lutte (§5). Départs are fought or let run according to the cran
  // in force. A fire that is fought never thins the fuel — the deferred, quiet
  // cost of cran 1. No doctrine holds against the great fire: those conditions
  // are beyond any intervention. The standing cost is levied in endSeason.
  if (!bigFire) {
    const D = DOCTRINE[state.doctrine];
    const wind = state.wind?.s ?? 0.6;
    const manageable = state.drought <= D.letRunDrought && wind <= D.letRunWind;
    const pSup = clamp(
      SUPPRESS.base - state.drought * SUPPRESS.droughtK - wind * SUPPRESS.windK,
      0,
      SUPPRESS.maxProb,
    );
    let suppressed = 0;
    let letRun = 0;
    for (const c of litCells) {
      // Close to housing, a fire is fought whatever the doctrine says.
      const nearBuilt = distToBuilt(grid, c) < D.keepOut;
      if (manageable && !nearBuilt) { letRun++; continue; }
      if (rng.chance(pSup)) { c.fs = 0; suppressed++; }
    }
    state.suppressedCum += suppressed;
    if (suppressed > 0) {
      messages.push({ text: `${suppressed} départ${suppressed > 1 ? 's' : ''} maîtrisé${suppressed > 1 ? 's' : ''} par les secours.`, cls: 'good' });
    }
    if (letRun > 0) {
      messages.push({ text: `${letRun} départ${letRun > 1 ? 's' : ''} laissé${letRun > 1 ? 's' : ''} courir sous surveillance : conditions maîtrisables, loin des enjeux.` });
    }
  }

  const remaining = litCells.filter((c) => c.fs === 1).length;
  if (remaining === 0) return { messages, fireStarted: false };
  messages.push({ text: `${remaining} départ${remaining > 1 ? 's' : ''} de feu.`, cls: 'hot' });
  return { messages, fireStarted: true };
}

export interface EndResult {
  messages: LogMsg[];
  finished: boolean;
  /** A prescribed burn got away: the caller runs a fire before handing back. */
  escaped?: boolean;
}

/** Reset the fire, run regrowth/regeneration/growth, advance the year and
 *  refresh action points. */
export function endSeason(state: GameState, rng: Rng): EndResult {
  const { grid } = state;
  const messages: LogMsg[] = [];

  for (const c of grid) {
    c.fs = 0;
    c.crown = false;
    if (c.burn > 0) c.burn++;
    if (c.pb > 0) c.pb--;

    // Differentiated post-fire regeneration (brief §3).
    if (c.t === 'brule' && c.burn >= REGEN.years && !c.plant) {
      const was = c.wasT;
      const sp = c.wasSpecies;
      if (was === 'feuillu' || was === 'mixte') {
        // Oaks resprout vigorously from the stump: the stand comes back.
        c.t = was;
        c.can = TYPES[was].can;
        c.sous = 0.4;
        c.density = 320;
        c.age = 4;
        c.species = undefined;
        messages.push({ text: `Les feuillus rejettent de souche en (${c.x},${c.y}) : la parcelle repart.`, cls: 'good' });
      } else if (was === 'pin' && sp === 'alep') {
        // Serotinous cones reseed massively: the pinède returns, dense.
        c.t = 'pin';
        c.species = 'alep';
        c.can = TYPES.pin.can;
        c.sous = 0.5;
        c.density = 480;
        c.age = 3;
        messages.push({ text: `Le pin d'Alep se ressème en masse en (${c.x},${c.y}) : la pinède revient, dense.` });
      } else if (was === 'pin') {
        // Pin noir: no serotiny, near-zero regeneration after crown fire. It
        // does NOT come back — the parcel converts to shrubland. The lesson.
        c.t = rng.chance(0.55) ? 'garrigue' : 'friche';
        c.can = TYPES[c.t].can;
        c.sous = 0.5;
        c.density = 120;
        c.age = 0;
        c.species = undefined;
        messages.push({ text: `Le pin noir ne se reconstitue pas en (${c.x},${c.y}) : la parcelle bascule en ${TYPES[c.t].n.toLowerCase()}.`, cls: 'hot' });
      } else {
        // Riparian recovers if still wet; otherwise it opens up.
        c.t = was === 'ripi' && c.wet > 0 ? 'ripi' : rng.chance(0.6) ? 'garrigue' : 'friche';
        c.can = TYPES[c.t].can;
        c.sous = 0.5;
        c.density = isWooded(c.t) ? 260 : 120;
        c.age = isWooded(c.t) ? 4 : 0;
      }
      c.managedFor = 0;
      c.wasSpecies = undefined;
    }

    // Plantations maturing (a fresh, low-density, managed stand).
    if (c.plant) {
      c.plantT--;
      if (c.plantT <= 0) {
        c.t = c.plant === 'pin' ? 'pin' : 'mixte';
        if (c.plant === 'pin') c.plantedPin = true;
        c.can = TYPES[c.t].can;
        c.sous = 0.3;
        c.density = 230;
        c.species = c.t === 'pin' ? 'noir' : undefined; // reboisement RTM = pin noir
        c.age = 2;
        c.managedFor = DENSITY.managedYears;
        c.burn = 0;
        c.plant = null;
        c.disturb = 0;
      }
    }

    // Understorey growth.
    if (c.t !== 'bati' && c.t !== 'rocher') {
      let g = 0.11;
      if (c.graze > 0 && c.grazeOn) g = 0;
      if (c.ecl > 1) g = 0.19;
      c.sous = clamp(c.sous + g * (TYPES[c.t].can > 0 ? 1 : 0.7), 0, 1);
    }

    // Stem density: spontaneous recruitment (the closure of the landscape),
    // slowed where a flock browses. Managed memory fades.
    if (isWooded(c.t)) {
      const g = c.graze > 0 && c.grazeOn ? DENSITY.growth * 0.5 : DENSITY.growth;
      c.density = clamp(c.density + g, 0, DENSITY.gameMax + 250);
      c.age++; // stands age; older = thicker bark = more fire-resistant
    }
    if (c.managedFor > 0) c.managedFor--;

    if (c.graze > 0 && c.grazeOn && c.t === 'garrigue' && rng.chance(0.12)) { c.t = 'mixte'; c.can = 0.6; c.density = 280; c.age = 4; }
  }

  // Pin d'Alep invasion: mature stands colonise adjacent open ground.
  const invaded = new Set<number>();
  for (const c of grid) {
    if (c.t !== 'pin' || c.species !== 'alep' || c.age <= 5) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || !inb(c.x + dx, c.y + dy)) continue;
        const i = idx(c.x + dx, c.y + dy);
        const n = grid[i];
        if ((n.t === 'friche' || n.t === 'pelouse' || n.t === 'garrigue') && !invaded.has(i) && rng.chance(0.04)) {
          invaded.add(i);
        }
      }
    }
  }
  for (const i of invaded) {
    const n = grid[i];
    n.t = 'pin';
    n.species = 'alep';
    n.can = TYPES.pin.can;
    n.sous = 0.4;
    n.density = 300;
    n.age = 1;
    n.managedFor = 0;
  }

  state.year++;
  let bonus = 0;
  for (const c of grid) if (c.t === 'pin' && c.plantedPin) bonus++;
  state.pa = 8 + Math.min(4, bonus);
  // The doctrine is a standing cost in both currencies, taken up front so the
  // player feels the arbitrage (fewer PA to act with this turn).
  const D = DOCTRINE[state.doctrine];
  const cost = Math.min(D.pa, state.pa);
  state.pa -= cost;
  state.spentCum += cost;
  state.accept = clamp(state.accept - D.social, 0, 100);
  if (state.doctrine === 1) state.yearsAtCran1++;

  // Policies in force run once the new budget is set: upkeep is levied first,
  // so a programme the commune can no longer carry lapses visibly (§3.4).
  const pol = tickPolicies(state, rng);
  for (const m of pol.messages) messages.push(m);

  return { messages, finished: state.year > state.maxYears, escaped: pol.escaped };
}
