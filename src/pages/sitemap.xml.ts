import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';

type SitemapEntry = {
  loc: string;
  lastmod?: Date;
  priority?: string;
};

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const formatDate = (date: Date) => date.toISOString().split('T')[0];

const renderUrl = ({ loc, lastmod, priority }: SitemapEntry) => {
  const lastmodTag = lastmod ? `\n    <lastmod>${formatDate(lastmod)}</lastmod>` : '';
  const priorityTag = priority ? `\n    <priority>${priority}</priority>` : '';

  return `  <url>
    <loc>${escapeXml(loc)}</loc>${lastmodTag}${priorityTag}
  </url>`;
};

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site?.toString() ?? 'https://bugkiwi.github.io/';
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );

  const entries: SitemapEntry[] = [
    {
      loc: new URL('/', baseUrl).toString(),
      priority: '1.0',
    },
    ...posts.map((post) => ({
      loc: new URL(`/posts/${post.data.slug ?? post.id}/`, baseUrl).toString(),
      lastmod: post.data.date,
      priority: '0.8',
    })),
  ];

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(renderUrl).join('\n')}
</urlset>
`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    }
  );
};
