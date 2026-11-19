// Reported: "the commented text doesn't highlight but sometimes it does".
// Measured in Chromium on the real file view: a comment on words inside one
// line of a document lit up, and one on words running from one paragraph,
// list item or line break into the next never did. The page's words were read
// as one run with nothing between blocks ("feedback.It gives"), and the saved
// quote has a space there ("feedback. It gives"), so it was never found.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const PAGE = `<div class="ProseMirror">
  <h1>Answers</h1>
  <p>Next, an agent finished a fix from <strong>last we</strong>ek's feedback.</p>
  <p>It gives me a few options.</p>
  <ul><li><p>One item</p></li><li><p>Two item</p></li></ul>
  <p>A line<br>broken here.</p>
</div>`;

let browser, page;
beforeAll(async () => {
  if (!browserAvailable) return;
  const bundle = (await build({
    stdin: { contents: `
      import { paintQuotes } from './renderer/src/paint-quotes';
      window.lit = (quotes) => {
        paintQuotes(document.querySelector('.ProseMirror'), quotes.map((text, i) => ({ id: 'n' + i, text })), null, null);
        return [...CSS.highlights.get('av-quote')].map((r) => r.toString().replace(/\\s+/g, ''));
      };`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'iife', logLevel: 'error',
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  await page.setContent(PAGE);
  await page.addScriptTag({ content: bundle });
}, 60_000);
afterAll(async () => { await browser?.close(); });

// The page's words come back with their spaces taken out, so line breaks between tags do not count.
const lit = (...quotes: string[]) => page.evaluate((q) => (window as unknown as { lit: (q: string[]) => string[] }).lit(q), quotes);

describe.skipIf(!browserAvailable)('a commented quote is lit', () => {
  it('inside one line, as before', async () => {
    expect(await lit('finished a fix')).toEqual(['finishedafix']);
  });
  it('across two paragraphs', async () => {
    expect(await lit('feedback. It gives')).toEqual(['feedback.Itgives']);
  });
  it('from a heading into the paragraph under it', async () => {
    expect(await lit('Answers Next, an agent')).toEqual(['AnswersNext,anagent']);
  });
  it('across two list items', async () => {
    expect(await lit('One item Two')).toEqual(['OneitemTwo']);
  });
  it('across a line break', async () => {
    expect(await lit('A line broken')).toEqual(['Alinebroken']);
  });
  it('across bold inside a word, with no space put into the word', async () => {
    expect(await lit("last week's feedback")).toEqual(["lastweek'sfeedback"]);
    expect(await lit("last we ek's")).toEqual([]);
  });
  it('not for words that are not next to each other on the page', async () => {
    expect(await lit('feedback. Two item')).toEqual([]);
  });
});
