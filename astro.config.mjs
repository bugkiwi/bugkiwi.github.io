import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';

/** 给 Markdown 表格包一层，便于整站统一样式与横向滚动 */
function rehypeTableWrapper() {
  return (tree) => {
    transform(tree);
  };

  function transform(node) {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      if (child.type === 'element') {
        transform(child);
        if (child.tagName === 'table') {
          return {
            type: 'element',
            tagName: 'div',
            properties: { className: ['table-wrap'] },
            children: [child],
          };
        }
      }
      return child;
    });
  }
}

// https://astro.build
export default defineConfig({
  site: 'https://gkiwi.dev',
  integrations: [mdx(), react()],
  markdown: {
    rehypePlugins: [rehypeTableWrapper],
  },
});
