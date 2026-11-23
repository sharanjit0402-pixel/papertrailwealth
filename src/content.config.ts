import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['Budgeting', 'Saving', 'Bills', 'Investing', 'Retirement', 'Money History']),
    date: z.coerce.date(),
    icon: z.string().default('$'),
    featured: z.boolean().default(false),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    // Which money challenge to promote at the end of this article (optional)
    challenge: z.enum(['52-week', 'emergency-fund', 'savings-streak']).optional(),
  }),
});
const newsletter = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/newsletter' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    issue: z.number(),
    week: z.string(),
    weekStart: z.coerce.date(),
    weekEnd: z.coerce.date(),
    date: z.coerce.date(),
    summary: z.array(z.string()),
    teaser: z.array(z.string()),
    scoreboard: z.array(z.object({ name: z.string(), value: z.string(), change: z.string(), up: z.boolean().default(false) })),
  }),
});
export const collections = { posts, newsletter };
