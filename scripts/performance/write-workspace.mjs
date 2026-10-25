// Reproducible Chromium benchmark; mocks all actions and blocks remote requests.
// Usage: node scripts/performance/write-workspace.mjs [output.json] [--styled]
// --styled requires `pnpm build` and adds PC layout checks/screenshots.
import { createRequire } from 'node:module';
import { readFile, readdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve('vitest/package.json'));
const { build } = await import(vitestRequire.resolve('vite'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = process.argv[2] ?? '/tmp/smart-writer-performance.json';
const styled = process.argv.includes('--styled');
const dir = await mkdtemp(path.join(tmpdir(), 'sw-write-perf-'));
const stubs = {
  name: 'local-only-actions', enforce: 'pre',
  async resolveId(id) {
    if (id === 'next/navigation') return '\0navigation';
    if (id.includes('/src/app/') || id.startsWith('@/app/')) {
      const filename = id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id;
      return '\0action:' + filename;
    }
  },
  async load(id) {
    if (id === '\0navigation') return 'export const useSearchParams = () => new URLSearchParams(location.search);';
    if (!id.startsWith('\0action:')) return;
    const filename = id.slice('\0action:'.length);
    const source = await readFile(filename.endsWith('.ts') ? filename : filename + '.ts', 'utf8');
    const names = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(m => m[1]);
    return names.map(name => `export async function ${name}(...args) {
      if (${JSON.stringify(name)} === 'saveChapter') window.saveCalls.push(args);
      if (${JSON.stringify(name)} === 'getSuggestionCount') return 0;
      return { error: null, entities: window.fixtureEntities ?? [], links: [], entityChapters: {}, entityFacts: {}, suggestions: [], items: [], facts: [], conflicts: [], job: null };
    }`).join('\n');
  },
};
let browser;
let server;
try {
  await build({ configFile: false, root, logLevel: 'error', plugins: [stubs],
    resolve: { alias: { '@': path.join(root, 'src') } },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { outDir: dir, emptyOutDir: false, lib: { entry: path.join(root, 'scripts/performance/write-fixture.tsx'), formats: ['iife'], name: 'Fixture', fileName: () => 'fixture.js' } },
  });
  const script = await readFile(path.join(dir, 'fixture.js'));
  // Optional layout verification uses the CSS emitted by `pnpm build`.
  const cssDir = path.join(root, '.next/static/chunks');
  const css = styled ? (await Promise.all((await readdir(cssDir)).filter(name => name.endsWith('.css')).map(name => readFile(path.join(cssDir, name), 'utf8')))).join('\n') : '';
  // The default benchmark remains independent of font/CDN/Tailwind compilation.
  const html = `<html><meta charset="utf-8"><style>body{margin:0}#root{display:flex;height:100vh}main>div{display:flex;flex-direction:column;flex:1;min-width:0}.write-editor-body{overflow:auto;flex:1;padding:24px}.tiptap{font:16px/1.82 serif;outline:none}.tiptap p{margin:0 0 10px}.write-bottom-bar{display:flex;gap:12px}nav[aria-label="집필 도구"]{display:none}</style>${styled ? '<link rel="stylesheet" href="/fixture.css">' : ''}<div id="root"></div><script src="/fixture.js"></script></html>`;
  server = createServer((req,res) => { const isScript = req.url === '/fixture.js'; const isCss = req.url === '/fixture.css'; res.setHeader('Content-Type', isScript ? 'text/javascript' : isCss ? 'text/css' : 'text/html'); res.end(isScript ? script : isCss ? css : html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const results = [];
  for (const [length, entities] of [[5000,100],[30000,500],[100000,500]]) {
    await page.goto(`http://127.0.0.1:${server.address().port}/?length=${length}&entities=${entities}${styled ? "&styled=1" : ""}`);
    const editor = page.getByRole('textbox', { name: '본문 편집기' });
    await editor.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-entity-id]'));
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    // Browser event → next animation frame includes synchronous editor + React work.
    await page.evaluate(() => {
      window.inputSamples = []; window.longTasks = [];
      new PerformanceObserver(list => window.longTasks.push(...list.getEntries().map(e => e.duration))).observe({ type: 'longtask', buffered: false });
      document.querySelector('.tiptap').addEventListener('beforeinput', () => {
        const start = performance.now(); requestAnimationFrame(() => window.inputSamples.push(performance.now()-start));
      });
    });
    await page.keyboard.type('abcdefghij'.repeat(8), { delay: 20 });
    const metrics = await page.evaluate(() => {
      const values = window.inputSamples.slice(10).sort((a,b) => a-b);
      return { samples: values.length, medianMs: values[Math.floor(values.length*.5)], p95Ms: values[Math.floor(values.length*.95)], longTasks: window.longTasks.length, maxLongTaskMs: Math.max(0,...window.longTasks), highlights: document.querySelectorAll('[data-entity-id]').length };
    });
    results.push({ length, entities, ...metrics });
  }
  // Smoke the actual workspace state ownership with Korean committed text.
  await page.goto(`http://127.0.0.1:${server.address().port}/?length=5000&entities=100${styled ? "&styled=1" : ""}`);
  const editor = page.getByRole('textbox', { name: '본문 편집기' });
  await editor.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-entity-id]'));
  await page.getByRole('textbox', { name: '회차 제목' }).fill('한글 저장 확인');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: '하', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '한글', selectionStart: 2, selectionEnd: 2 });
  await cdp.send('Input.insertText', { text: '한글 조합 확인' });
  await page.keyboard.insertText(' 붙여넣기 확인');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  const marker = '한글 조합 확인 붙여넣기 확인';
  if (!(await editor.innerText()).includes(marker)) throw new Error('Korean composition/paste/undo/redo lost text');
  await page.keyboard.press('ControlOrMeta+s');
  await page.waitForFunction(marker => window.saveCalls.some(args => args[0] === 'chapter-0' && args[2] === '한글 저장 확인' && args[3]?.includes(marker)), marker);
  await page.getByRole('button', { name: '노벨피아', exact: true }).click();
  if (!(await page.getByRole('group', { name: '선택 기준 글자 수' }).innerText()).includes('노벨피아 참고')) throw new Error('Selected count missing');
  await page.getByRole('button', { name: '기억 등록 상태 점검', exact: true }).click();
  await page.getByText('등록 상태에서 확인할 항목이 없습니다').waitFor();
  await page.getByRole('button', { name: /^02\s*2화$/ }).click();
  await page.getByRole('textbox', { name: '회차 제목' }).filter({ visible: true }).waitFor();
  await page.waitForFunction(() => location.search.includes('chapter=chapter-1'));
  if (await page.getByText('등록 상태에서 확인할 항목이 없습니다').count()) throw new Error('Old check results remained');
  await page.getByRole('button', { name: /^01\s*한글 저장 확인$/ }).click();
  await page.waitForFunction(() => location.search.includes('chapter=chapter-0'));
  if (!(await editor.innerText()).includes(marker)) throw new Error('Chapter navigation lost draft');
  const smoke = { koreanCdpComposition: 'PASS (synthetic, not physical IME)', pasteUndoRedo: 'PASS', manualSaveLatestDraft: 'PASS (mock action)', chapterRoundTrip: 'PASS', selectedCount: 'PASS', checkResultsReset: 'PASS' };
  const layout = [];
  if (styled) {
    for (const [width,height] of [[1280,800],[1440,900],[1920,1080]]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: output.replace(/\.json$/, '') + `-${width}.png` });
      const check = await page.evaluate(() => {
        const footer = document.querySelector('.write-bottom-bar');
        const rect = footer.getBoundingClientRect();
        const buttons = [...footer.querySelectorAll('button')].map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
        const overlap = buttons.some((a,i) => buttons.slice(i+1).some(b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
        return { horizontalOverflow: document.documentElement.scrollWidth > innerWidth, footerInViewport: rect.bottom <= innerHeight+1 && rect.top >= 0, buttonsOverlap: overlap };
      });
      if (check.horizontalOverflow || !check.footerInViewport || check.buttonsOverlap) throw new Error('PC layout failed: '+JSON.stringify({ width, ...check }));
      layout.push({ width, height, ...check });
    }
  }
  await editor.fill('인물');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.insertText('000');
  if (await editor.locator('[data-entity-id]').count()) throw new Error('Name incorrectly crosses Shift+Enter');
  await editor.fill('다른');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.insertText('인물000');
  const highlighted = editor.locator('[data-entity-id]');
  if (await highlighted.count() !== 1 || await highlighted.innerText() !== '인물000' || await highlighted.locator('br').count()) throw new Error('Name after Shift+Enter has an incorrect highlight range');
  smoke.hardBreakBoundaries = 'PASS';
  if (errors.length) throw new Error(errors.join('\n'));
  const report = { timestamp: new Date().toISOString(), styled, layout, browser: await browser.version(), method: 'production React, real workspace/editor, local mock actions; beforeinput to next rAF, 80 sequential ASCII keys (10 warmup), 20ms delay; no physical IME/DB/network measurement; fixture CSS approximates layout unless --styled loads build CSS; font files are not loaded', smoke, results };
  await writeFile(output, JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); await rm(dir,{recursive:true,force:true}); }
