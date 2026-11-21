// A LOOK WITH NO BLUR STILL ASKED THE WINDOW TO BLUR, AND EVERY FRAME PAID FOR IT.
// Ember Grid, the look a new Mac starts on, has a blur of 0, and every glass
// surface still drew `backdrop-filter: blur(0px)`. Chromium does not skip a
// zero blur: the card under the whole workspace made the window redraw all of
// itself on every frame, so scrolling a doc, or an agent's "working" shimmer
// on screen, cost a full-window redraw each frame. Measured in Chromium
// (software compositing, 1720x713 at 2x) with a 26 KB doc open beside a
// thread: 32 ms to draw each frame while scrolling, 5 ms without it; with the
// shimmer on screen and nothing else moving, 32 ms a frame against 0.3 ms.
// A thread of 30 code blocks scrolled at 51 ms a frame, and at 5.6 ms once its
// code blocks stopped blurring as well: on Ember Grid they are 90% opaque, and
// taking the blur away changed no pixel by more than 1 of 255.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { applyTune, TUNE_DEFAULT } from '../renderer/src/skins.ts';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const read = (f: string) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');
const css = ['styles.css', 'workspace-navigation.css'].map(read).join('\n');

const blurWritten = (blur: number) => {
  const seen: Record<string, string> = {};
  applyTune({ blur, dim: 0 }, { style: { setProperty: (k: string, v: string) => { seen[k] = v; } } });
  return seen['--skin-blur'];
};

// The first `--skin-blur` declared after a block's selector.
const declaredAfter = (selector: string) => {
  const at = css.indexOf(selector);
  expect(at, `${selector} is gone`).toBeGreaterThan(-1);
  return css.slice(at).match(/--skin-blur:\s*([^;]+);/)?.[1].trim();
};

describe('the blur a look writes', () => {
  it('is no value at all when the look has none, so blur(var(--skin-blur)) draws nothing', () => {
    expect(TUNE_DEFAULT['ember-grid'].blur).toBe(0);
    expect(blurWritten(0)).toBe('initial');
  });

  it('is a length from 1px up, so the dial still blurs', () => {
    expect(blurWritten(1)).toBe('1px');
    expect(blurWritten(30)).toBe('30px');
  });

  it('is no value at all in a window with no picture, light or dark', () => {
    expect(declaredAfter(':root {')).toBe('initial');
    expect(declaredAfter(':root[data-theme="dark"],')).toBe('initial');
  });

  it('has no fallback anywhere, since a fallback is the zero blur again', () => {
    expect(css).not.toMatch(/blur\(var\(--skin-blur\s*,/);
  });
});

let browser;
beforeAll(async () => { if (browserAvailable) browser = await chromium.launch({ headless: true }); }, 60_000);
afterAll(async () => { await browser?.close(); });

// The workspace card, the inbox's pane and a code block in an agent's message,
// as Chromium computes them under a look and a written blur.
async function drawn(attrs: Record<string, string>, blur: number | null) {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await page.setContent(`<style>${css}</style>
    <div class="app workspace-layout"><div class="list-pane"></div>
    <div class="focus-body markdown agent-thread"><pre>npm test</pre></div></div>`);
  const written = blur === null ? null : blurWritten(blur);
  const got = await page.evaluate(({ attrs, written }) => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(attrs)) root.setAttribute(k, v);
    if (written !== null) root.style.setProperty('--skin-blur', written);
    const q = (s: string) => document.querySelector(s) as Element;
    return {
      card: getComputedStyle(q('.workspace-layout'), '::before').backdropFilter,
      list: getComputedStyle(q('.list-pane')).backdropFilter,
      code: getComputedStyle(q('.agent-thread pre')).backdropFilter,
    };
  }, { attrs, written });
  await page.close();
  return got;
}

describe.skipIf(!browserAvailable)('what the window is asked to blur', () => {
  it('is nothing on Ember Grid as it ships (the reported case)', async () => {
    const got = await drawn({ 'data-theme': 'dark', 'data-skin': 'ember-grid' }, TUNE_DEFAULT['ember-grid'].blur);
    expect(got).toEqual({ card: 'none', list: 'none', code: 'none' });
  }, 30_000);

  it('is the card and the pane once the dial is turned up to 1px, and still not its opaque code blocks', async () => {
    const got = await drawn({ 'data-theme': 'dark', 'data-skin': 'ember-grid' }, 1);
    expect(got).toEqual({ card: 'blur(1px)', list: 'blur(1px)', code: 'none' });
  }, 30_000);

  it('is unchanged on a picture that blurs, frosted code blocks included', async () => {
    const blur = TUNE_DEFAULT['gouache-valley'].blur;
    expect(blur).toBeGreaterThan(0);
    const got = await drawn({ 'data-theme': 'dark', 'data-skin': 'gouache-valley' }, blur);
    expect(got).toEqual({ card: `blur(${blur}px)`, list: `blur(${blur}px)`, code: 'blur(18px) saturate(1.15)' });
  }, 30_000);

  it('is nothing behind the card in plain dark, whose see-through code blocks keep their frost', async () => {
    const got = await drawn({ 'data-theme': 'dark' }, null);
    expect(got.card).toBe('none');
    expect(got.code).toBe('blur(18px) saturate(1.15)');
  }, 30_000);
});
