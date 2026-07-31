import type { GameState } from './types';
import { TYPES, isWooded } from './params';
import { biodiversity } from './model';

export interface Gauge {
  key: string;
  label: string;
  value: number; // 0–100
  note: string;
  quality: string; // qualitative comment on this gauge (amendment §2.1)
}

export interface Bilan {
  gauges: Gauge[];
  spentCum: number;
  burnedPct: number;
}

/**
 * Brief §6: no single aggregate score. Several gauges that cannot be maximised
 * together, so the player faces a real dilemma rather than an optimisation:
 *  - protecting the built area and lives costs action points and clearing;
 *  - keeping the landscape able to recover rewards mosaic and broadleaves, not
 *    a pine monoculture that converts to shrubland after fire;
 *  - biodiversity and pastoral value punish "raze everything";
 *  - cumulative cost makes maintenance a real arbitrage.
 */
export function bilan(state: GameState): Bilan {
  const { grid } = state;

  // Built & lives: share of households still housed (weights by size).
  let hab = 0;
  let habOk = 0;
  let built = 0;
  let builtOk = 0;
  for (const c of grid) {
    if (c.t !== 'bati') continue;
    built++;
    const h = c.hab ?? 3;
    hab += h;
    if (!c.destroyed) { builtOk++; habOk += h; }
  }
  const bati = hab ? Math.round((habOk / hab) * 100) : 100;

  // Landscape resilience: capacity to recover after fire. Resprouters and
  // mosaic score high; degraded shrubland/friche and pine monoculture score low.
  const recovery: Partial<Record<string, number>> = {
    feuillu: 100, mixte: 100, ripi: 95, garrigue: 45, pelouse: 45,
    pin: 35, rocher: 50, friche: 12, brule: 5,
  };
  let rSum = 0;
  let rN = 0;
  for (const c of grid) {
    if (c.t === 'bati') continue;
    // A stand that burnt and did not come back as forest is a conversion, not a
    // neutral change of cover. Scoring it on its new type alone would make a
    // pinède destroyed by a crown fire an *improvement* (garrigue outranks pin),
    // which is precisely the outcome the dossier warns about.
    const lostCover = c.wasT !== undefined && isWooded(c.wasT) && !isWooded(c.t) && c.t !== 'brule';
    rSum += lostCover ? 15 : recovery[c.t] ?? 50;
    rN++;
  }
  const resilience = rN ? Math.round(rSum / rN) : 0;

  // Biodiversity & pastoral value maintained.
  const bio = biodiversity(grid);
  let pastoral = 0;
  for (const c of grid) if (c.graze > 0 && c.grazeOn) pastoral++;
  const biodiv = Math.round(Math.min(100, bio + Math.min(15, pastoral)));

  // Cumulative cost as a gauge (economical = high). Referenced to a rough
  // "one meaningful action every other year" budget over the horizon.
  const budget = state.maxYears * 4;
  const cout = Math.round(clamp(100 - (state.spentCum / budget) * 100, 0, 100));

  // Share of the map that burnt at least once. burnedCum counts every pass,
  // so over a long game it exceeds 100% and means nothing to the player.
  const burnedPct = Math.round((state.burnedEver / grid.length) * 100);

  const gauges: Gauge[] = [
    { key: 'bati', label: 'Bâti & vies préservées', value: bati, note: `${builtOk}/${built} bâtiments debout`, quality: qualBati(bati) },
    { key: 'resilience', label: 'Résilience du paysage', value: resilience, note: 'capacité à se reconstituer après feu', quality: qualResilience(resilience) },
    { key: 'biodiv', label: 'Biodiversité & pastoral', value: biodiv, note: `${pastoral} parcelle${pastoral > 1 ? 's' : ''} pâturée${pastoral > 1 ? 's' : ''}`, quality: qualBiodiv(biodiv) },
    { key: 'cout', label: 'Économie de moyens', value: cout, note: `${state.spentCum} PA engagés sur la partie`, quality: qualCout(cout) },
  ];

  return { gauges, spentCum: state.spentCum, burnedPct };
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

// Per-gauge qualitative comments (amendment §2.1): no single aggregate verdict,
// each axis gets its own reading so the player sees the trade-offs they made.
function qualBati(v: number): string {
  if (v >= 85) return "Le village a tenu : c'était la priorité, elle est atteinte.";
  if (v >= 60) return 'La plupart des maisons ont tenu, mais des foyers ont été perdus.';
  if (v >= 30) return 'Pertes lourdes sur le bâti : la protection au contact a manqué.';
  return 'Le village a été dévasté : durcissement et défendabilité insuffisants.';
}
function qualResilience(v: number): string {
  if (v >= 65) return "Le paysage sait renaître : mosaïque et feuillus qui rejettent.";
  if (v >= 45) return 'Une reconstitution possible, mais fragile par endroits.';
  return 'Un paysage qui ne repart pas seul : pinèdes converties, friches installées.';
}
function qualBiodiv(v: number): string {
  if (v >= 60) return 'Vivant et valeur pastorale maintenus.';
  if (v >= 40) return 'Biodiversité entamée mais pas effondrée.';
  return 'Un paysage appauvri : à trop raser, on éteint aussi le vivant.';
}
function qualCout(v: number): string {
  if (v >= 75) return 'Peu de moyens engagés — reste à voir ce que cela a coûté ailleurs.';
  if (v >= 40) return 'Un effort soutenu, à la mesure des enjeux.';
  return 'Des moyens considérables : est-ce tenable dans la durée ?';
}
