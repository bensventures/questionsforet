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
    'analyse-primaire'
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
    /**
     * Trois états de publication, et non deux.
     *
     * `brouillon` : la page n'est pas construite en production, elle n'existe
     * pas en ligne. `prive` : elle est construite et servie, mais elle
     * n'apparaît dans aucune liste et demande aux moteurs de l'ignorer. C'est
     * l'état d'une page qu'on donne à relire par son adresse, à quelques
     * personnes, avant de l'annoncer. Ni l'un ni l'autre : publiée et listée.
     */
    brouillon: z.boolean().default(false),
    prive: z.boolean().default(false),
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
 * Une affirmation d'un quiz vrai/faux. `reponse` sert au calcul du score ;
 * `verdict` porte la formulation nuancée (« vrai et faux », etc.) et `ton`
 * la couleur associée. `sources` justifie l'explication.
 */
const affirmation = z.object({
    id: z.string(),
    enonce: z.string(),
    reponse: z.boolean(),
    verdict: z.string(),
    ton: z.enum(['rouge', 'ambre', 'vert']),
    explication: z.string(),
    sources: z.array(reference('sources')).default([]),
});

/**
 * Carte de clôture d'un outil : non pas une affirmation de plus, mais un appel
 * à prolonger vers une page de fond. `lien` reste optionnel : tant qu'il est
 * absent, la carte s'affiche sans bouton ; renseigné, `reference('questions')`
 * garantit au build que la question cible existe.
 */
const cloture = z.object({
    question: z.string(),
    amorce: z.string(),
    lien: reference('questions').optional(),
    libelleLien: z.string().default('Lire la suite'),
});

/**
 * Objets interactifs : quiz, comparateurs, visualisations.
 */
const outils = defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/outils' }),
    schema: z.object({
        ...champsCommuns,
        format: z.enum(['quiz', 'comparateur', 'visualisation', 'carte', 'simulation']),
        /** Renseigné pour les outils de format `quiz`. */
        affirmations: z.array(affirmation).default([]),
        /** Carte d'appel à l'action fermant la série, sans note. */
        cloture: cloture.optional(),
    }),
});

export const collections = { sources, questions, dossiers, outils };
