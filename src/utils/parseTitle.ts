export type ParsedTitle = {
  /** 标题是否带 [AI] 标记 */
  isAI: boolean;
  /** 去掉 [AI] 后用于展示/SEO 的标题 */
  displayTitle: string;
};

/**
 * 解析 frontmatter title 里的 [AI] 前缀。
 * 例："[AI]我是如何选择基金的" → { isAI: true, displayTitle: "我是如何选择基金的" }
 */
export function parseTitle(raw: string): ParsedTitle {
  const match = raw.match(/^\[AI\]\s*(.*)$/i);
  if (!match) {
    return { isAI: false, displayTitle: raw };
  }
  return {
    isAI: true,
    displayTitle: match[1].trim() || raw,
  };
}
