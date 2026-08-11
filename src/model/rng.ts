/**
 * Générateur pseudo-aléatoire à graine (mulberry32).
 *
 * Tout l'aléa du modèle passe par un `Rng` injecté, jamais par `Math.random()`.
 * Une partie est donc une fonction pure de (graine, décisions), ce qui rend le
 * harnais de calibration du §12 possible : sans reproductibilité, les
 * assertions ne sont pas vérifiables.
 */
export interface Rng {
  /** Flottant dans [0, 1). */
  suivant(): number;
  /** Flottant dans [min, max). */
  entre(min: number, max: number): number;
  /** Entier dans [0, n). */
  entier(n: number): number;
  /** Vrai avec la probabilité p. */
  chance(p: number): boolean;
}

export function creerRng(graine: number): Rng {
  let a = graine >>> 0;
  const suivant = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    suivant,
    entre: (min, max) => min + suivant() * (max - min),
    entier: (n) => Math.floor(suivant() * n),
    chance: (p) => suivant() < p,
  };
}
