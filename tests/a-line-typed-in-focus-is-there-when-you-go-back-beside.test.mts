// A line typed into a document in Focus vanished when Esc took you back beside
// the thread. A power tester saw it six times; driving the browser copy the same
// way showed the file on disk had the line and the side view did not.
// The Notes column comes and goes with Focus, and the pane wrapped the editor
// in a div only while it showed, so React threw the editor away and built a new
// one from the text the pane read when it first opened.
// Measured here on the real pane and editor: before the fix the side view ended
// at "B. Which bug do they start on?".
import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());
let browser, page, bundle;

const PLAN = '# Week 1 plan\n\nStatus: draft 1\n\n## Questions for you\n\nA. Who is their buddy?\n\nB. Which bug do they start on?\n';

const DISK = `
  const file = window.disk = { text: ${JSON.stringify(PLAN)}, mtime: 1 };
  window.zero = {
    openArtifact: async () => ({ ok: true, opened: '/docs/week-1-plan.md' }),
    readDoc: async () => ({ ok: true, text: file.text, mtime: file.mtime }),
    writeDoc: async ({ text }) => { await new Promise(r => setTimeout(r, 50)); file.text = text; file.mtime += 1; return { ok: true, mtime: file.mtime }; },
  };`;

beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {DocPane} from './renderer/src/components/DocPane';
      function Page() {
        const [notes, setNotes] = useState(false);
        const [open, setOpen] = useState(true);
        return <>
          <button onClick={()=>setNotes(!notes)}>Toggle notes</button>
          <button onClick={()=>setOpen(!open)}>Toggle pane</button>
          {open && <DocPane doc={{ product: 'p', src: 'week-1-plan.md' }} roots={[]} split={0.5} onSplit={()=>{}}
            onClose={()=>{}} onNotice={()=>{}} aside={notes ? <div className="notes">Notes</div> : undefined} />}
        </>;
      }
      createRoot(document.getElementById('root')).render(<Page/>);`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' }, jsx: 'automatic',
    define: { 'import.meta.env': '{}' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); });
beforeEach(async () => {
  if (!browserAvailable) return;
  await page?.close();
  page = await browser.newPage();
  page.setDefaultTimeout(5_000);
  await page.route('http://doc.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://doc.test/');
  // The app decides whether it has a disk when its code loads, so the disk comes first.
  await page.addScriptTag({ content: DISK });
  await page.addScriptTag({ content: bundle });
  await page.locator('.ProseMirror').waitFor();
});

const words = () => page.locator('.ProseMirror').innerText();
// The editor saves after a 900 ms pause.
const onDisk = () => expect.poll(() => page.evaluate(() => window.disk.text), { timeout: 4_000 });
async function typeAtTheEnd(line) {
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(line);
}

it.skipIf(!browserAvailable)('keeps a line typed with Notes open once Notes close, straight away', async () => {
  await page.getByRole('button', { name: 'Toggle notes' }).click();
  await typeAtTheEnd('Answers: buddy is Sam.');
  await page.getByRole('button', { name: 'Toggle notes' }).click();
  expect(await words()).toContain('Answers: buddy is Sam.');
  await onDisk().toContain('Answers: buddy is Sam.');
});

it.skipIf(!browserAvailable)('keeps a line typed beside once Notes open', async () => {
  await typeAtTheEnd('Side line.');
  await page.getByRole('button', { name: 'Toggle notes' }).click();
  expect(await words()).toContain('Side line.');
});

it.skipIf(!browserAvailable)('a later edit beside keeps the line typed with Notes open', async () => {
  await page.getByRole('button', { name: 'Toggle notes' }).click();
  await typeAtTheEnd('Focus line.');
  await page.getByRole('button', { name: 'Toggle notes' }).click();
  await typeAtTheEnd('Side line.');
  await onDisk().toContain('Side line.');
  const disk = await page.evaluate(() => window.disk.text);
  expect(disk).toContain('Focus line.');
});

it.skipIf(!browserAvailable)('opens again on what was saved, not on what it first read', async () => {
  await typeAtTheEnd('Saved line.');
  await onDisk().toContain('Saved line.');
  await page.getByRole('button', { name: 'Toggle pane' }).click();
  await page.getByRole('button', { name: 'Toggle pane' }).click();
  await page.locator('.ProseMirror').waitFor();
  expect(await words()).toContain('Saved line.');
});

it.skipIf(!browserAvailable)('leaves the file alone when nothing was typed', async () => {
  await page.getByRole('button', { name: 'Toggle notes' }).click();
  await page.getByRole('button', { name: 'Toggle notes' }).click();
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.disk.text)).toBe(PLAN);
  expect(await words()).toContain('B. Which bug do they start on?');
});
