// A REVIEW TASK IS ANSWERED FROM ITS REPLY BOX (2026-11-21).
//
// Theo, asked by Lena to review her pricing page, opened the task. Pressing
// Needs changes opened a second box in the page, above the reply box at the
// foot: two places to type, and the one that sent the answer was not the one
// a person types in. You approved the proposal: the reply box is where the
// words go, and its option strip offers "Looks good, hand back to Lena" and
// "Needs changes, hand back to Lena" (help: "Hand back to Sam"), which hand
// back with what the box holds. Rendered in Chromium with the app's own
// components.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TeamRouteStrip } from './renderer/src/team/TeamFocus';
import { AskBar } from './renderer/src/team/AskBar';
import { TeamContext } from './renderer/src/team/people';
import { saveDraft } from './renderer/src/drafts';
window.mount = (kind, typed) => {
  const task = { product: 'dm', id: 'k1', title: 'Mock up the pricing page', status: 'open', assignee: 'u-theo', labels: ['given-task'],
    ask: { kind, owner: 'u-lena', thread: 'w-1', product: 'web' } };
  if (typed) saveDraft(task, typed);
  const team = { me: 'u-theo', byId: new Map([['u-lena', { id: 'u-lena', name: 'Lena Fischer', email: '' }]]), products: new Map() };
  createRoot(document.getElementById('root')).render(
    <TeamContext.Provider value={team}>
      <AskBar task={task} owner={team.byId.get('u-lena')} under onOpenThread={() => {}} onHandBack={async () => true} />
      <TeamRouteStrip item={task} />
    </TeamContext.Provider>);
};`;
const stub = `
  window.backs = [];
  const call = () => Promise.resolve(Object.assign([], { ok: true }));
  window.zero = new Proxy({}, { get: (_, k) => (k === 'teamHandBack' ? (p) => { window.backs.push(p); return Promise.resolve({ ok: true }); } : typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });`;

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function page(kind, typed = '') {
  const p = await browser.newPage();
  p.setDefaultTimeout(4000);
  await p.route('http://p.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await p.goto('http://p.test/');
  await p.addScriptTag({ content: stub });
  await p.addScriptTag({ content: bundle });
  await p.evaluate(([k, t]) => window.mount(k, t), [kind, typed]);
  return p;
}
const rows = (p) => p.locator('.opt-row .opt-text').allTextContents();

describe.skipIf(!browserAvailable)('a review task', () => {
  it('offers the verdicts on the reply box, and not as buttons in the page', async () => {
    const p = await page('review');
    expect(await rows(p)).toEqual(['Looks good, hand back to Lena', 'Needs changes, hand back to Lena']);
    expect(await p.getByRole('button', { name: 'Needs changes', exact: true }).count()).toBe(0);
    expect(await p.locator('.ask-bar textarea').count()).toBe(0);
    await p.close();
  });
  it('hands back with what the reply box holds: the reported case', async () => {
    const p = await page('review', 'Love it. Make the Team price say per seat.');
    await p.getByText('Needs changes, hand back to Lena').click();
    await p.waitForFunction(() => window.backs.length === 1);
    expect(await p.evaluate(() => window.backs)).toEqual([{ product: 'dm', id: 'k1', verdict: 'changes', words: 'Love it. Make the Team price say per seat.' }]);
    await p.close();
  });
  it('asks for the words before Needs changes goes with none', async () => {
    const p = await page('review');
    await p.getByText('Needs changes, hand back to Lena').click();
    await p.getByText('Write what Lena should change below, then pick this.').waitFor();
    expect(await p.evaluate(() => window.backs)).toEqual([]);
    await p.close();
  });
});

describe.skipIf(!browserAvailable)('a help task', () => {
  it('offers one hand-back on the reply box', async () => {
    const p = await page('help');
    expect(await rows(p)).toEqual(['Hand back to Lena']);
    await p.close();
  });
});
