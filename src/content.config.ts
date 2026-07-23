import { defineCollection, reference, z } from 'astro:content';
import { file, glob } from 'astro/loaders';

/**
 * Qualification de la solidité d'une source.
 * Cet enum est le cœur du dispositif éditorial : il rend visible au lecteur
 * la différence entre un article évalué par les pairs et un billet de blog.
 */
const typeSource = z.enum([
  'pair',
  'ouvrage',
  'rapport',
  'institutionnel',
  'vulgarisation',
  'plaidoyer',
]);

const themes = z.enum([
  'regime-feu',
  'combustible',
  'essences',
  'bati',
  'debroussaillement',
  'hydrologie',
  'pastoralisme',
  'brulage-dirige',
  'post-incendie',
  'climat',
]);

/**
 * Bibliographie. Collection de données : elle ne génère pas de pages,
 * elle est référencée par les autres collections.
 */
const sources = defineCollection({
  loader: file('src/data/sources.yaml'),
  schema: z.object({
    id: z.string(),
    auteurs: z.string(),
    annee: z.number().int().nullable(),
    titre: z.string(),
    support: z.string(),
    url: z.string().url(),
    /** Instantané Wayback Machine, renseigné par scripts/archive-sources.ts */
    archive: z.string().url().optional(),
    type: typeSource,
    langue: z.enum(['fr', 'en']).default('fr'),
    themes: z.array(themes).default([]),
    /** Réserve méthodologique à afficher avec la citation le cas échéant */
    reserve: z.string().optional(),
  }),
});

const champsCommuns = {
  titre: z.string(),
  chapo: z.string().max(300),
  publie: z.coerce.date(),
  modifie: z.coerce.date().optional(),
  themes: z.array(themes).min(1),
  sources: z.array(reference('sources')).default([]),
  brouillon: z.boolean().default(false),
};

/**
 * Porte d'entrée du site : une question, une réponse courte.
 */
const questions = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/questions' }),
  schema: z.object({
    ...champsCommuns,
    /** Verdict synthétique, volontairement nuançable */
    verdict: z.string().optional(),
    approfondit: z.array(reference('dossiers')).default([]),
  }),
});

/**
 * Synthèses longues, structurées en parties.
 */
const dossiers = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/dossiers' }),
  schema: z.object({
    ...champsCommuns,
    /** Mention rappelant qu'un dossier ne remplace pas un diagnostic de terrain */
    avertissement: z.string().optional(),
    territoire: z.string().optional(),
  }),
});

/**
 * Objets interactifs : quiz, comparateurs, visualisations.
 */
const outils = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/outils' }),
  schema: z.object({
    ...champsCommuns,
    format: z.enum(['quiz', 'comparateur', 'visualisation', 'carte']),
  }),
});

export const collections = { sources, questions, dossiers, outils };
