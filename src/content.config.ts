import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  // 同时加载 .md 和 .mdx 文章
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // 可选：指定干净的英文短链（分享友好）。不填则用文件名。
    slug: z.string().optional(),
  }),
});

export const collections = { blog };
