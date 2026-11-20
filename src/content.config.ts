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
  }),
});
export const collections = { posts };
