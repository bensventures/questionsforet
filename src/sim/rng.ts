/**
 * Seedable pseudo-random generator (mulberry32).
 *
 * The whole simulation draws its randomness from an injected `Rng` rather than
 * `Math.random()`. A game is then a pure function of (seed, decisions), which
 * lets us replay a game and, crucially, write headless tests for the
 * pedagogical guardrails of the brief (§8) — "verified by test, not intention".
 */

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
  };
}

/** A non-reproducible seed, for actual play sessions. */
export function randomSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}
