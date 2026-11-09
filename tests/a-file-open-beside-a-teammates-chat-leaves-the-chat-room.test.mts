// A FILE OPEN BESIDE A TEAMMATE'S CHAT LEAVES THE CHAT ROOM (w-6ed44b5baa).
//
// Opening a file from an AI teammate's chat on the Team page squeezes that page
// to the 400px floor the beside layout gives it. The page kept its 272px column
// of Job, Waiting on you and Finished this week, plus the 40px gap, so the chat
// was left about 80px: its reply box drew one letter of the placeholder over a
// Send button, and the teammate's job blurb filled the space. "Give a task"
// wrapped onto two lines and the role under the name was cut to "AI tea…".
// With the column gone the name still lost to the two buttons, so Settings,
// which leaves the page anyway, steps aside while the file is open.
//
// Rendered here with the app's own styles, in a 400px pane with a file open,
// and at full width with no file (where the column must stay).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = ['styles.css', 'workspace-navigation.css', 'team/everything/everything.css', 'teammates/teammates.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');
const job = 'I run our own YC-style program for you and act as its partner. Cohort 1 lasts 6 weeks, and the program runs again if it works. '.repeat(4);

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { Place, PlaceAction, PlaceList, JobBlock, SendBox } from './renderer/src/team/everything/PlacePage';
      const now = Date.now();
      const m = { key: 'mate:yc', kind: 'mate', name: 'YC Partner', letter: 'Y', agents: 0 };
      const rows = [{ key: 'a', title: "For this week I'd aim for 50 Looms, 5 replies, 2 teams set up and 1 paying", word: '', at: now - 3600000, tone: 'done', onOpen: () => {} }];
      createRoot(document.getElementById('root')).render(
        <Place m={m} about="AI teammate" onBack={undefined}
          actions={<><PlaceAction onClick={() => {}}>Give a task</PlaceAction><PlaceAction quiet onClick={() => {}}>Settings</PlaceAction></>}
          chat={<SendBox placeholder="Message YC Partner" onSend={async () => null} />}
          side={<><JobBlock job={${JSON.stringify(job)}} onSave={async () => null} /><PlaceList title="Finished this week" now={now} rows={rows} /></>} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function measure(width, docOpen) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://fits.test/**', (r) => r.fulfill({ contentType: 'text/html',
    body: `<style>${css}</style><div class="app workspace-layout${docOpen ? ' doc-open' : ''}"><div class="list-pane pl-open" id="root" style="width:${width}px;height:900px"></div></div>` }));
  await page.goto('http://fits.test/');
  await page.addScriptTag({ content: bundle });
  await page.locator('.pl-chat .rm-compose-input').waitFor();
  const m = await page.evaluate(() => {
    const box = (s) => document.querySelector(s).getBoundingClientRect();
    const fits = (s) => { const e = document.querySelector(s); return e.scrollWidth <= e.clientWidth; };
    const btns = [...document.querySelectorAll('.pl-btn')].filter((b) => b.offsetWidth > 0);
    return {
      buttons: btns.map((b) => b.textContent),
      chat: Math.round(box('.pl-chat').width),
      side: Math.round(box('.pl-side').width),
      nameWhole: fits('.pl-name h2'),
      buttonsOneLine: btns.every((b) => {
        const words = document.createRange();
        words.selectNodeContents(b);
        const lines = new Set([...words.getClientRects()].map((r) => Math.round(r.top)));
        return lines.size === 1 && words.getBoundingClientRect().right <= b.getBoundingClientRect().right;
      }),
      headInside: box('.pl-acts').right <= box('.pl').right + 0.5,
    };
  });
  await page.close();
  return m;
}

describe.skipIf(!browserAvailable)("an AI teammate's page beside an open file, 400px wide", () => {
  let m;
  beforeAll(async () => { m = await measure(400, true); }, 30_000);
  it('gives the chat the width of the page', () => {
    expect(m.side).toBe(0);
    expect(m.chat).toBeGreaterThan(300);
  });
  it('keeps the header on one line, with the name whole and Give a task beside it', () => {
    expect(m.buttons).toEqual(['Give a task']);
    expect(m.buttonsOneLine).toBe(true);
    expect(m.headInside).toBe(true);
    expect(m.nameWhole).toBe(true);
  });
});

describe.skipIf(!browserAvailable)('the same page with no file open, full width', () => {
  let m;
  beforeAll(async () => { m = await measure(1300, false); }, 30_000);
  it('keeps the job and its lists in their column beside the chat, and Settings in the header', () => {
    expect(m.buttons).toEqual(['Give a task', 'Settings']);
    expect(m.side).toBe(272);
    expect(m.chat).toBeGreaterThan(800);
    expect(m.nameWhole).toBe(true);
  });
});
