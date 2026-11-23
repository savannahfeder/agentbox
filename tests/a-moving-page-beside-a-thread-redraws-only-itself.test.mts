// A MOVING PAGE BESIDE A THREAD REDRAWS ONLY ITSELF.
//
// "It's super laggy. Every time I scroll on this page, it lags. When I hit the
// N button, there is about a 1-second delay" (w-4440b5e845, 2026-11-21): a
// landing page with animated canvases open beside a thread, in the Dark look.
//
// The window's panel (`.workspace-layout::before`), the inbox card, an opened
// task, the settings column and Home's field all drew
// `backdrop-filter: blur(var(--skin-blur))` at a blur of 0px. Chromium still
// builds a backdrop pass for a blur of nothing, and redraws the whole of it
// whenever anything inside its box changes, so every frame of the page's
// animation redrew the whole window.
//
// Measured in the app's own Electron at 1440x900, 2x, drawing in software, with
// the page scrolled to its animated cards: 8 frames a second at 114 ms each,
// scroll frames of 117 ms (51 of 61 over 100 ms), N on screen after 800 ms.
// Without the zero blur, scroll frames of 17 ms.
//
// A look with no blur now writes no value at all, so blur(var(--skin-blur))
// computes to none (tests/a-look-with-no-blur-draws-no-backdrop-filter). This
// file checks every stylesheet for a zero blur and counts what the compositor
// draws while a page beside the thread moves.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { applyTune, TUNE_DEFAULT } from '../renderer/src/skins.ts';

const src = new URL('../renderer/src/', import.meta.url);
const cssFiles = (dir: URL, at = ''): string[] => readdirSync(new URL(at, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? cssFiles(dir, `${at}${e.name}/`) : e.name.endsWith('.css') ? [`${at}${e.name}`] : []);
const read = (f: string) => readFileSync(new URL(f, src), 'utf8');
const sheets = cssFiles(src).map((f) => ({ f, text: read(f) }));

describe('a blur of nothing is not drawn', () => {
  it('no stylesheet asks for a zero blur, or falls back to one', () => {
    const zero: string[] = [];
    for (const { f, text } of sheets) {
      for (const m of text.matchAll(/(?:-webkit-)?backdrop-filter:\s*([^;}]+)/g)) {
        if (/blur\(\s*0(?:px)?\s*\)|var\(--skin-blur\s*,/.test(m[1])) zero.push(`${f}: ${m[0].trim()}`);
      }
    }
    expect(zero, 'write blur(var(--skin-blur)) with no fallback, which is no filter when the look has no blur').toEqual([]);
  });

  it('still lets a real blur through, which the rule above must not catch', () => {
    const all = sheets.map((s) => s.text).join('\n');
    expect(all).toMatch(/backdrop-filter:\s*blur\(var\(--skin-blur\)\)/);
    expect(all).toMatch(/backdrop-filter:\s*blur\(22px\)/);
  });
});

let chromium: { launch: (o: object) => Promise<Browser>; executablePath: () => string } | undefined;
type Browser = { newPage: (o?: object) => Promise<import('playwright').Page>; close: () => Promise<void> };
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* no browser here */ }
const can = !!chromium && existsSync(chromium.executablePath());

const appCss = ['styles.css', 'workspace-navigation.css'].map(read).join('\n');
// Ember Grid's dials as main.tsx writes them on the root before the first paint.
const dials: string[] = [];
applyTune(TUNE_DEFAULT['ember-grid'], { style: { setProperty: (k: string, v: string) => { if (v) dials.push(`${k}: ${v}`); } } });
const DARK = `data-theme="dark" data-skin="ember-grid" style="${dials.join('; ')}"`;

const words = Array.from({ length: 50 }, (_, i) => `<p>Line ${i + 1} of an answer long enough to fill the thread, so the window has a lot to draw.</p>`).join('');
// The page beside the thread: one small box that changes colour, as a canvas or
// a spinner does.
const movingPage = '<style>body{margin:0;background:#202020}b{position:absolute;left:40px;top:40px;width:40px;height:40px;animation:m .4s steps(8) infinite}@keyframes m{50%{background:#06e}0%,100%{background:#e60}}</style><b></b>';
const aWindow = (look: string, extra = '') => `<!doctype html><html ${look}><head><style>${appCss}</style><style>${extra}</style></head>
  <body><div class="app workspace-layout" style="height:100vh;width:100vw"><div class="body" style="height:100%;display:flex">
    <div style="flex:1;overflow:auto">${words}</div>
    <iframe style="flex:1;border:0" srcdoc="${movingPage.replace(/"/g, '&quot;')}"></iframe>
  </div></div></body></html>`;

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
  it('redraws only the moving page, not the window around it (the reported case)', async () => {
    const shipped = await piecesPerFrame(aWindow(DARK));
    // The control: the same window with the zero blur put back under the panel.
    const zeroBlur = await piecesPerFrame(aWindow(DARK, '.workspace-layout::before { backdrop-filter: blur(0px) !important; }'));
    expect(zeroBlur, 'the measurement saw nothing drawn at all').toBeGreaterThan(0);
    expect(zeroBlur).toBeGreaterThan(shipped * 4);
    const plain = await piecesPerFrame(aWindow(DARK, '.workspace-layout::before { backdrop-filter: none !important; }'));
    expect(shipped).toBeLessThanOrEqual(plain);
  }, 60_000);
});
