// A 175-line .txt file opened beside a thread showed its first 33 lines and
// would not scroll, so the rest could not be read or selected to copy. The
// scroll rule was `.doc-card > .code-scroll`, and since the notes sidebar the
// text view sits inside DocPane's `Beside` wrapper (display: contents, or the
// notes split), so the rule never matched and the card's overflow: hidden cut
// the file off. Measured here with the app's real styles: before the fix the
// box was as tall as the file and scrolled 0px.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const read = (f: string) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');
const css = ['styles.css', 'components/file-views.css', 'components/notes-sidebar.css'].map(read).join('\n');

const file = (n: number) => `<div class="code-file">${Array.from({ length: n }, (_, i) =>
  `<div class="code-file-line"><span class="code-file-n" data-n="${i + 1}"></span><code class="code-file-text">- line ${i + 1}\n</code></div>`).join('')}</div>`;

// The markup DocPane and FileSheet draw around a text file.
const plain = (n: number) => `<div class="doc-card"><div class="doc-head" style="height:56px"></div>
  <div style="display:contents"><div class="code-scroll">${file(n)}</div></div></div>`;
const withNotes = (n: number) => `<div class="doc-card"><div class="doc-head" style="height:56px"></div>
  <div class="doc-notes-split"><div class="code-scroll">${file(n)}</div><aside class="sb"></aside></div></div>`;
const sheet = (n: number) => `<div class="file-sheet-card" style="display:flex;flex-direction:column;height:100%">
  <div class="file-sheet-head" style="height:50px;flex:none"></div><div class="file-sheet-body"><div class="code-scroll">${file(n)}</div></div></div>`;

let browser;
beforeAll(async () => { if (browserAvailable) browser = await chromium.launch({ headless: true }); }, 60_000);
afterAll(async () => { await browser?.close(); });

async function measure(markup: string) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  await page.setContent(`<style>${css}</style><div style="height:700px;display:flex;flex-direction:column">${markup}</div>`);
  const m = await page.evaluate(() => {
    const box = document.querySelector('.code-scroll') as HTMLElement;
    const before = box.scrollTop;
    box.scrollTop = 100_000;
    return { tall: box.clientHeight, reach: box.scrollTop - before, overflow: box.scrollHeight - box.clientHeight };
  });
  await page.close();
  return m;
}

describe('the text view in the file pane', () => {
  it('is still wrapped by Beside, which is what the scroll rule has to survive', () => {
    expect(read('components/DocPane.tsx')).toContain('<Beside aside={aside}><div className="code-scroll" ref={setCodeBox}>');
  });
});

describe.skipIf(!browserAvailable)('a long text file beside a thread', () => {
  it('scrolls to its last line (the reported case: 175 lines, no notes open)', async () => {
    const m = await measure(plain(175));
    expect(m.tall).toBeLessThan(700);
    expect(m.reach).toBeGreaterThan(0);
    expect(m.reach).toBe(m.overflow);
  }, 30_000);

  it('scrolls with the notes sidebar open', async () => {
    const m = await measure(withNotes(175));
    expect(m.tall).toBeLessThan(700);
    expect(m.reach).toBeGreaterThan(0);
  }, 30_000);

  it('scrolls in the file sheet too', async () => {
    const m = await measure(sheet(175));
    expect(m.tall).toBeLessThan(700);
    expect(m.reach).toBeGreaterThan(0);
  }, 30_000);

  it('does not scroll a file that already fits', async () => {
    const m = await measure(plain(5));
    expect(m.reach).toBe(0);
  }, 30_000);
});
