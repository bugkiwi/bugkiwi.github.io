/**
 * 从 FundMaster 每日推荐页截取配图：紧凑裁切 + 足够信息量。
 * 用法: node scripts/capture-fund-screenshots.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '../public/images/how-i-choose-funds');
const BASE = 'https://fund.gkiwi.dev/recommendations';

const VIEWPORT = { width: 840, height: 900 };
const DPR = 2;

async function screenshotClip(page, clip, filename) {
  if (!clip || clip.width <= 0 || clip.height <= 0) {
    throw new Error(`Invalid clip for ${filename}: ${JSON.stringify(clip)}`);
  }
  await page.screenshot({
    path: path.join(OUT_DIR, filename),
    clip,
    type: 'png',
  });
  console.log(`✓ ${filename} (${Math.round(clip.width)}×${Math.round(clip.height)})`);
}

/** 横向滚动表格，使目标列完整落入视口 */
async function scrollTableToColumns(page, columnLabels) {
  await page.evaluate((labels) => {
    const wrap = document.querySelector('.recommendation-table-wrap');
    const table = document.querySelector('.recommendation-table');
    if (!wrap || !table) return;

    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const indices = labels.map((label) => headers.findIndex((h) => h.includes(label)));
    if (indices.some((i) => i < 0)) return;

    const ths = table.querySelectorAll('thead th');
    const first = ths[indices[0]];
    const last = ths[indices[indices.length - 1]];

    const groupLeft = first.offsetLeft;
    const groupRight = last.offsetLeft + last.offsetWidth;
    const groupWidth = groupRight - groupLeft;
    const padding = 16;

    wrap.scrollLeft = Math.max(0, groupLeft - padding);
    if (groupWidth > wrap.clientWidth - padding * 2) {
      wrap.scrollLeft = Math.max(0, groupRight - wrap.clientWidth + padding);
    }
  }, columnLabels);

  await page.waitForTimeout(200);
}

async function clipTableColumns(page, columnLabels, rowCount, padding = 14) {
  return page.evaluate(
    ({ columnLabels, rowCount, padding }) => {
      const table = document.querySelector('.recommendation-table');
      if (!table) return null;

      const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
      const indices = columnLabels.map((label) => headers.findIndex((h) => h.includes(label)));
      if (indices.some((i) => i < 0)) return null;

      const boxes = [];
      for (const idx of indices) {
        boxes.push(table.querySelectorAll('thead th')[idx].getBoundingClientRect());
      }

      const rows = [...table.querySelectorAll('tbody tr')].slice(0, rowCount);
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        for (const idx of indices) {
          if (cells[idx]) boxes.push(cells[idx].getBoundingClientRect());
        }
      }

      const minX = Math.min(...boxes.map((b) => b.left));
      const minY = Math.min(...boxes.map((b) => b.top));
      const maxX = Math.max(...boxes.map((b) => b.right));
      const maxY = Math.max(...boxes.map((b) => b.bottom));

      return {
        x: Math.max(0, minX - padding),
        y: Math.max(0, minY - padding),
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
      };
    },
    { columnLabels, rowCount, padding }
  );
}

async function captureTableSlice(page, columnLabels, rowCount, filename) {
  await scrollTableToColumns(page, columnLabels);
  const clip = await clipTableColumns(page, columnLabels, rowCount);
  await screenshotClip(page, clip, filename);
}

/** 开篇概览：页面介绍 + tab + 快照头 + 表格前 3 行（表格滚到左侧） */
async function screenshotOverview(page, filename) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const wrap = document.querySelector('.recommendation-table-wrap');
    if (wrap) wrap.scrollLeft = 0;
  });
  await page.waitForTimeout(150);

  const clip = await page.evaluate((padding) => {
    const intro = document.querySelector('.section--page-intro');
    const content = document.querySelector('.recommendation-page .section:nth-of-type(2)');
    const rows = [...document.querySelectorAll('.recommendation-table tbody tr')].slice(0, 3);
    if (!intro || !content || rows.length < 3) return null;

    const contentRect = content.getBoundingClientRect();
    const minY = intro.getBoundingClientRect().top;
    const maxY = rows[2].getBoundingClientRect().bottom;

    return {
      x: Math.max(0, contentRect.left - padding),
      y: Math.max(0, minY - padding),
      width: contentRect.width + padding * 2,
      height: maxY - minY + padding * 2,
    };
  }, 12);

  await screenshotClip(page, clip, filename);
}

/** 日期栏：展开历史日期内容后截取 */
async function screenshotDateBar(page, filename) {
  await page.locator('.recommendation-panel').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  const toggle = page.locator('.recommendation-date-bar__toggle').first();
  await toggle.waitFor({ state: 'visible', timeout: 20000 });
  await toggle.click();

  await page.waitForSelector(
    '.recommendation-date-popover, .recommendation-date-bar__options, .snapshot-calendar',
    { state: 'visible', timeout: 15000 }
  );
  await page.waitForTimeout(500);

  const clip = await page.evaluate((padding) => {
    const panel = document.querySelector('.recommendation-panel');
    const bar = document.querySelector('.recommendation-date-bar.is-expanded');
    const popover =
      document.querySelector('.recommendation-date-popover') ||
      document.querySelector('.recommendation-date-bar__options') ||
      document.querySelector('.snapshot-calendar');
    if (!panel || !bar || !popover) return null;

    const panelRect = panel.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const minY = Math.min(barRect.top, popoverRect.top);
    const maxY = Math.max(barRect.bottom, popoverRect.bottom);

    return {
      x: Math.max(0, panelRect.left - padding),
      y: Math.max(0, minY - padding),
      width: panelRect.width + padding * 2,
      height: maxY - minY + padding * 2,
    };
  }, 12);

  await screenshotClip(page, clip, filename);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: DPR,
  });

  // 1. 开篇概览（有实际内容的 hero 图）
  await page.goto(`${BASE}?tab=mixed`, { waitUntil: 'networkidle' });
  await screenshotOverview(page, 'overview.png');

  // 2. 四分位：收益 + 两列圆点（相邻列，3 行）
  await page.goto(`${BASE}?tab=mixed`, { waitUntil: 'networkidle' });
  await captureTableSlice(
    page,
    ['近一年 / 近六月', '累计四分位', '季度四分位'],
    3,
    'quartiles.png'
  );

  // 3. 选基逻辑：基金名 + 经理 + 推荐指标（相邻列，3 行）
  await page.goto(`${BASE}?tab=mixed`, { waitUntil: 'networkidle' });
  await captureTableSlice(
    page,
    ['基金名称', '基金经理', '推荐指标'],
    3,
    'metrics.png'
  );

  // 4. 稳健纯债：四分位 + 风险（相邻列，3 行）
  await page.goto(`${BASE}?tab=bond`, { waitUntil: 'networkidle' });
  await captureTableSlice(
    page,
    ['累计四分位', '季度四分位', '风险指标'],
    3,
    'bond.png'
  );

  // 5. 快照日期栏
  await page.goto(`${BASE}?tab=mixed`, { waitUntil: 'networkidle' });
  await screenshotDateBar(page, 'dates.png');

  await browser.close();
  console.log('\nDone →', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
