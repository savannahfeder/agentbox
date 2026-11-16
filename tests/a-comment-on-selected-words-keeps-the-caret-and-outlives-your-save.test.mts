// Reported: after highlighting words in a document and pressing Comment, the
// cursor was not in the note box. Measured in the real file view in Chromium on
// Linux, the box did take the caret, so the press now lets go of the page's
// words before the box takes the caret, and the box takes it after the redraw.
//
// Measured on the same view, a worse loss on the way there: type in the
// document, highlight words, press Comment, write the note, and the document's
// save (30 seconds after typing, or on leaving the window) made the next
// version and wiped the note's words and its quote. The comment being written
// now moves onto the version your save made.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

let browser, page, bundle;

beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { ArtifactView } from './renderer/src/components/ArtifactView';
      const call = () => Promise.resolve(Object.assign([], { ok: true }));
      // No live room: the document is one person's, typed into here.
      window.zero = new Proxy({}, { get: (_, k) => (k === 'liveRoom' ? () => Promise.resolve(null) : typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });
      const DOC = '# Answers\\n\\nCoding agents work on your computer, next to your code.\\n\\nThe platforms kept banning our accounts.\\n';
      const first = [{ id: 'l1', ts: 1, source: 'agent', patch: { note: 'Here: [answers.md](yc/answers.md)' } },
        ...(location.hash === '#two' ? [{ id: 'l2', ts: 2, source: 'agent', patch: { note: 'Again: [answers-v2.md](yc/answers-v2.md)' } }] : [])];
      window.saves = 0;
      function App() {
        const [lines, setLines] = useState(first);
        return <ArtifactView product="p" thread="t" lines={lines} marks={{ notes: [], approvals: [], seen: {} }} me="me"
          people={[]} open={{ path: location.hash === '#two' ? 'yc/answers-v2.md' : 'yc/answers.md', at: 1 }} ownerOfRow="me" withAgent write={async () => ({ ok: true })}
          onNewVersion={async () => {
            window.saves += 1;
            const n = window.saves + 1;
            setTimeout(() => setLines((was) => [...was, { id: 'e' + n, ts: n, source: 'founder', by: 'me', patch: { artifact: { do: 'edit', file: 'answers.md', path: 'yc/answers-v' + n + '.md' } } }]), 50);
            return null;
          }}
          onClose={() => {}} files={{ find: async (p) => p, readText: async () => DOC }} />;
      }
      createRoot(document.getElementById('root')).render(<App />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });
const open = async (hash = '') => {
  await page?.close();
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://doc.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto(`http://doc.test/${hash}`);
  await page.addScriptTag({ content: bundle });
  await page.locator('.ProseMirror').waitFor();
};
beforeEach(async () => { if (browserAvailable) await open(); });

const selectAndComment = async (words) => {
  await page.evaluate((words) => {
    const walk = document.createTreeWalker(document.querySelector('.ProseMirror'), NodeFilter.SHOW_TEXT);
    let t;
    while ((t = walk.nextNode())) if (t.textContent.includes(words)) break;
    const at = t.textContent.indexOf(words);
    const r = document.createRange();
    r.setStart(t, at); r.setEnd(t, at + words.length);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    document.dispatchEvent(new MouseEvent('mouseup'));
  }, words);
  await page.locator('.selection-bar-comment').click();
};
const box = () => page.locator('.av-write textarea');
const chip = () => page.locator('.av-chip-words');

describe.skipIf(!browserAvailable)('Comment on highlighted words', () => {
  it('puts the caret in the note box, so keys typed next land there', async () => {
    await selectAndComment('Coding agents work');
    await expect.poll(() => page.evaluate(() => document.activeElement?.matches('.av-write textarea'))).toBe(true);
    await page.keyboard.press('o'); await page.keyboard.press('k');
    expect(await box().inputValue()).toBe('ok');
    expect(await chip().textContent()).toContain('Coding agents work');
  });

  it('the note and its quote outlive the save your typing makes', async () => {
    await page.locator('.ProseMirror p').last().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Really.');
    await selectAndComment('Coding agents work');
    await page.keyboard.type('Need more detail');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(() => page.evaluate(() => window.saves)).toBe(1);
    await page.waitForTimeout(300);
    expect(await box().inputValue()).toBe('Need more detail');
    expect(await chip().textContent()).toContain('Coding agents work');
  });

  it('stepping to another version yourself leaves the quote on the version it was about', async () => {
    await open('#two');
    await selectAndComment('Coding agents work');
    await page.keyboard.type('About v2');
    await page.getByRole('button', { name: 'Older version' }).click();
    await expect.poll(() => page.locator('.av-of').textContent()).toBe('v1 of 2');
    expect(await chip().count()).toBe(0);
  });
});
