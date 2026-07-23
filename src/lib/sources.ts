import type { CollectionEntry } from 'astro:content';

/** Resolved data of one bibliographic entry. */
export type Source = CollectionEntry<'sources'>['data'];
export type SourceType = Source['type'];
export type Theme = Source['themes'][number];

/**
 * Editorial metadata for each source type. `rank` reflects methodological
 * solidity (1 = strongest) and drives the default ordering; `description`
 * feeds the badge tooltip and the legend, so the rigor is visible, not buried.
 */
export const TYPE_META: Record<
  SourceType,
  { label: string; description: string; rank: number }
> = {
  pair: {
    label: 'évalué par les pairs',
    description: 'article évalué par les pairs dans une revue scientifique',
    rank: 1,
  },
  ouvrage: {
    label: 'ouvrage',
    description: "livre ou chapitre d'ouvrage académique",
    rank: 2,
  },
  rapport: {
    label: 'rapport',
    description: 'rapport technique, revue professionnelle ou actes',
    rank: 3,
  },
  institutionnel: {
    label: 'institutionnel',
    description: "publication d'une agence publique ou d'un organisme officiel",
    rank: 4,
  },
  vulgarisation: {
    label: 'vulgarisation',
    description: 'presse, blog ou site de vulgarisation',
    rank: 5,
  },
  plaidoyer: {
    label: 'plaidoyer',
    description: 'organisation portant une position affirmée',
    rank: 6,
  },
};

/** Types from strongest to softest, for legends and filter controls. */
export const TYPE_ORDER = (Object.keys(TYPE_META) as SourceType[]).sort(
  (a, b) => TYPE_META[a].rank - TYPE_META[b].rank,
);

/** Human-readable French labels for the theme slugs. */
export const THEME_LABELS: Record<Theme, string> = {
  'regime-feu': 'régime de feu',
  combustible: 'combustible',
  essences: 'essences',
  bati: 'bâti',
  debroussaillement: 'débroussaillement',
  hydrologie: 'hydrologie',
  pastoralisme: 'pastoralisme',
  'brulage-dirige': 'brûlage dirigé',
  'post-incendie': 'post-incendie',
  climat: 'climat',
};

export const THEME_ORDER = Object.keys(THEME_LABELS) as Theme[];

/**
 * Default bibliographic ordering: by solidity, then most recent, then title.
 * Undated entries sort after dated ones within the same type.
 */
export function sortSources(
  a: CollectionEntry<'sources'>,
  b: CollectionEntry<'sources'>,
): number {
  const byRank = TYPE_META[a.data.type].rank - TYPE_META[b.data.type].rank;
  if (byRank !== 0) return byRank;
  const byYear = (b.data.annee ?? -Infinity) - (a.data.annee ?? -Infinity);
  if (byYear !== 0) return byYear;
  return a.data.titre.localeCompare(b.data.titre, 'fr');
}
