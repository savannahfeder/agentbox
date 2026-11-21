// A MOVING PAGE BESIDE A THREAD REDRAWS ONLY ITSELF.
//
// "It's super laggy. Every time I scroll on this page, it lags. When I hit the
// N button, there is about a 1-second delay" (w-4440b5e845, 2026-11-21): a
// landing page with animated canvases open beside a thread, in the Dark look.
//
// The window's panel (`.workspace-layout::before`), the inbox card, an opened
// task, the settings column and Home's field all drew
// `backdrop-filter: blur(var(--skin-blur))`, and --skin-blur is 0px in every look
// offered today. Chromium still builds a backdrop pass for a blur of nothing, and
// redraws the whole of it whenever anything inside its box changes, so every
// frame of the page's animation redrew the whole window.
//
// Measured in the app's own Electron at 1440x900, 2x, drawing in software, with
// the page scrolled to its animated cards: 8 frames a second at 114 ms each,
// scroll frames of 117 ms (51 of 61 over 100 ms), N on screen after 800 ms.
// Without the zero blur: 24 frames a second at 12 ms, scroll frames of 17 ms.
//
// A blur of zero is now no backdrop-filter at all: the looks and applyTune set
// --skin-glass to `none` or to the blur, and the panes draw var(--skin-glass).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { applyTune } from '../renderer/src/skins.ts';

const src = new URL('../renderer/src/', import.meta.url);
const cssFiles = (dir: URL, at = ''): string[] => readdirSync(new URL(at, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? cssFiles(dir, `${at}${e.name}/`) : e.name.endsWith('.css') ? [`${at}${e.name}`] : []);
const read = (f: string) => readFileSync(new URL(f, src), 'utf8');
const sheets = cssFiles(src).map((f) => ({ f, text: read(f) }));

describe('a blur of nothing is not drawn', () => {
  it('no backdrop-filter is a blur that can be zero', () => {
    const zeroable: string[] = [];
    for (const { f, text } of sheets) {
      for (const m of text.matchAll(/(?:-webkit-)?backdrop-filter:\s*([^;}]+)/g)) {
        if (/var\(--skin-blur|blur\(\s*0(?:px)?\s*\)/.test(m[1])) zeroable.push(`${f}: ${m[0].trim()}`);
      }
    }
    expect(zeroable, 'write var(--skin-glass), which is none when the look has no blur').toEqual([]);
  });

  it('still lets a real blur through, which the rule above must not catch', () => {
    const all = sheets.map((s) => s.text).join('\n');
    expect(all).toMatch(/backdrop-filter:\s*var\(--skin-glass\)/);
    expect(all).toMatch(/backdrop-filter:\s*blur\(22px\)/);
  });

  it('gives every block that sets --skin-blur the glass that matches it', () => {
    const css = read('styles.css');
    const blocks = [...css.matchAll(/\{[^{}]*--skin-blur:\s*(\d+)px;[^{}]*\}/g)];
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const [body, px] of blocks) {
      expect(body, `a block with --skin-blur: ${px}px`).toContain(`--skin-glass: ${px === '0' ? 'none' : `blur(${px}px)`};`);
    }
  });

  it('applyTune turns a dial at zero into no glass, and one pixel into a blur', () => {
    const set = (blur: number) => {
      const seen: Record<string, string> = {};
      applyTune({ blur, dim: 0 }, { style: { setProperty: (k: string, v: string) => { seen[k] = v; } } });
      return seen;
    };
    expect(set(0)['--skin-glass']).toBe('none');
    expect(set(1)['--skin-glass']).toBe('blur(1px)');
    expect(set(30)['--skin-glass']).toBe('blur(30px)');
    expect(set(30)['--skin-blur']).toBe('30px');
  });
});

let chromium: { launch: (o: object) => Promise<Browser>; executablePath: () => string } | undefined;
type Browser = { newPage: (o?: object) => Promise<import('playwright').Page>; close: () => Promise<void> };
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* no browser here */ }
const can = !!chromium && existsSync(chromium.executablePath());

const appCss = ['styles.css', 'workspace-navigation.css'].map(read).join('\n');
const words = Array.from({ length: 50 }, (_, i) => `<p>Line ${i + 1} of an answer long enough to fill the thread, so the window has a lot to draw.</p>`).join('');
// The page beside the thread: one small box that changes colour, as a canvas or
// a spinner does.
const movingPage = '<style>body{margin:0;background:#202020}b{position:absolute;left:40px;top:40px;width:40px;height:40px;animation:m .4s steps(8) infinite}@keyframes m{50%{background:#06e}0%,100%{background:#e60}}</style><b></b>';
const window = (look: string, extra = '') => `<!doctype html><html ${look}><head><style>${appCss}</style><style>${extra}</style></head>
  <body><div class="app workspace-layout" style="height:100vh;width:100vw"><div class="body" style="height:100%;display:flex">
    <div style="flex:1;overflow:auto">${words}</div>
    <iframe style="flex:1;border:0" srcdoc="${movingPage.replace(/"/g, '&quot;')}"></iframe>
  </div></div></body></html>`;
const DARK = 'data-theme="dark" data-skin="ember-grid"';

let browser: Browser | undefined;
beforeAll(async () => { if (can) browser = await chromium!.launch({ headless: true, args: ['--disable-gpu'] }); }, 60_000);
afterAll(async () => { await browser?.close(); });

/** How many pieces the compositor draws per frame while the page beside the thread moves. */
async function piecesPerFrame(html: string): Promise<number> {
  const page = await browser!.newPage({ viewport: { width: 1200, height: 800 } });
  try {
    await page.setContent(html);
    await page.waitForTimeout(500);
    const cdp = await page.context().newCDPSession(page);
    const events: { name: string; ph: string; ts: number; dur?: number }[] = [];
    cdp.on('Tracing.dataCollected', (e: { value: typeof events }) => { events.push(...e.value); });
    const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['viz'] }, transferMode: 'ReportEvents' });
    await page.waitForTimeout(1200);
    await cdp.send('Tracing.end');
    await done;
    const frames = events.filter((e) => e.ph === 'X' && e.name === 'Display::DrawAndSwap');
    const quads = events.filter((e) => e.ph === 'X' && /::DoDrawQuad$/.test(e.name));
    const per = frames.map((f) => quads.filter((q) => q.ts >= f.ts && q.ts <= f.ts + (f.dur ?? 0)).length).sort((a, b) => a - b);
    return per[Math.floor(per.length / 2)] ?? 0;
  } finally { await page.close(); }
}

describe.skipIf(!can)('in Chromium, with the app\'s own stylesheets', () => {
  it('draws no backdrop pass under the panel in Dark, in plain dark and in light', async () => {
    for (const look of [DARK, 'data-theme="dark"', 'data-theme="light"']) {
      const page = await browser!.newPage();
      await page.setContent(`<html ${look}><head><style>${appCss}</style></head><body><div class="app workspace-layout"></div><div class="list-pane"></div></body></html>`);
      const got = await page.evaluate(() => ({
        panel: getComputedStyle(document.querySelector('.workspace-layout')!, '::before').backdropFilter,
        card: getComputedStyle(document.querySelector('.list-pane')!).backdropFilter,
      }));
      await page.close();
      expect(got, look).toEqual({ panel: 'none', card: 'none' });
    }
  }, 60_000);

  it('still blurs when a look turns the dial up', async () => {
    const page = await browser!.newPage();
    await page.setContent(`<html ${DARK} style="--skin-blur: 4px; --skin-glass: blur(4px)"><head><style>${appCss}</style></head><body><div class="app workspace-layout"></div><div class="list-pane"></div></body></html>`);
    const got = await page.evaluate(() => ({
      panel: getComputedStyle(document.querySelector('.workspace-layout')!, '::before').backdropFilter,
      card: getComputedStyle(document.querySelector('.list-pane')!).backdropFilter,
    }));
    await page.close();
    expect(got).toEqual({ panel: 'blur(4px)', card: 'blur(4px)' });
  }, 60_000);

  it('redraws only the moving page, not the window around it (the reported case)', async () => {
    const shipped = await piecesPerFrame(window(DARK));
    // The control: the same window with the zero blur put back under the panel.
    const zeroBlur = await piecesPerFrame(window(DARK, '.workspace-layout::before { backdrop-filter: blur(0px) !important; }'));
    expect(zeroBlur, 'the measurement saw nothing drawn at all').toBeGreaterThan(0);
    expect(zeroBlur).toBeGreaterThan(shipped * 4);
    const plain = await piecesPerFrame(window(DARK, '.workspace-layout::before { backdrop-filter: none !important; }'));
    expect(shipped).toBeLessThanOrEqual(plain);
  }, 60_000);
});
