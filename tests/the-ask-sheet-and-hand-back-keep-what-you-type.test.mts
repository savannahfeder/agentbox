// THE ASK SHEET AND HAND-BACK KEEP WHAT YOU TYPE (2026-11-21).
//
// Found by a review of the Ask or hand off screens, each reproduced in a live
// page:
//   - In the ask sheet's note, Tab closed the whole sheet and lost the note,
//     the arrows could not move through its lines, and ⌘↵ sent nothing: the
//     menu took every key on the window's capture and let only an INPUT type.
//   - "Needs changes" with an empty box could still be handed back with ⌘↵,
//     though its button was disabled, so the owner got "asked for changes"
//     with no words.
//   - The helper's options picker stayed after a pick, so a second click sent
//     a contradicting answer to the owner's agent; and its rows showed 1-9
//     that did nothing.
//   - A teammate's thread page was one component reused from card to card,
//     so a reply still sending on one thread cleared the next one's box.
// Rendered in Chromium with the app's own components.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
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
import { flushSync } from 'react-dom';
import { ThreadMenu } from './renderer/src/threads/ThreadMenu';
import { AskBar } from './renderer/src/team/AskBar';
import { TeammateThread } from './renderer/src/threads/TeammateThread';
window.calls = [];
window.mountMenu = () => {
  const root = createRoot(document.getElementById('menu'));
  flushSync(() => root.render(<ThreadMenu giveTo={[{ id: 'u-maya', name: 'Maya Lin' }]} onFinish={() => {}}
    onGive={(to, note) => window.calls.push(['give', to.id, note])}
    onAsk={(to, kind, note) => window.calls.push(['ask', to.id, kind, note])} />));
};
window.mountAsk = () => {
  const task = { product: 'p', id: 'w-1', title: 't', ask: { kind: 'review', owner: 'u-o', thread: 'w-o' }, assignee: 'me' };
  createRoot(document.getElementById('ask')).render(<AskBar task={task} owner={{ id: 'u-o', name: 'Omar Q', email: '' }}
    onHandBack={async (v, w) => { window.calls.push(['back', v, w]); return true; }} />);
};
window.mountMate = () => {
  const card = { personId: 'u-o', threadId: 'w-o', title: 'Payments', visible: true, progress: [], state: 'open' };
  const ask = { product: 'dm', id: 'k1', title: 'Payments', status: 'open', assignee: 'me', ask: { kind: 'help', owner: 'u-o', thread: 'w-o', product: 'api' } };
  createRoot(document.getElementById('mate')).render(<TeammateThread card={card} person={{ id: 'u-o', name: 'Omar Q', email: '' }} now={Date.now()}
    ask={ask} onHandBack={async () => true} syncedAt={null} onOpenDoc={() => {}} onNotice={() => {}} backLabel="Inbox" onBack={() => {}} onMessage={() => {}} />);
};`;
const stub = `
  const call = () => Promise.resolve(Object.assign([], { ok: true }));
  const lines = [
    { id: 'w-o', ts: 1, source: 'founder', patch: { title: 'Payments', body: 'Check the routes' } },
    { id: 'w-o', ts: 2, source: 'agent', patch: { result: 'Which way?\\n\\n## Options\\n1. Ship it (recommended)\\n2. Wait' } },
  ];
  const teamComment = (p) => { window.calls.push(['comment', p.text]); return Promise.resolve({ ok: true }); };
  window.zero = new Proxy({}, { get: (_, k) => (k === 'teamComment' ? teamComment : k === 'teamThreadWork' ? () => Promise.resolve({ shared: true, lines, earlier: 0, product: 'p', dir: '/x' }) : typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });`;

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

async function page() {
  const p = await browser.newPage();
  p.setDefaultTimeout(4000);
  // A real origin, for the draft store's localStorage.
  await p.route('http://p.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<div id="menu"></div><div id="ask"></div><div id="mate"></div>' }));
  await p.goto('http://p.test/');
  await p.addScriptTag({ content: stub });
  await p.addScriptTag({ content: bundle });
  return p;
}
const calls = (p) => p.evaluate(() => window.calls.splice(0));

describe.skipIf(!browserAvailable)('the ask sheet', () => {
  it('keeps the note and the sheet on Tab, moves through lines with the arrows, and sends on ⌘↵', async () => {
    const p = await page();
    await p.evaluate(() => window.mountMenu());
    await p.click('button[aria-label="More actions"]');
    await p.click('text=Ask or hand off…');
    await p.click('text=Maya Lin');
    const note = p.locator('textarea.sh-note');
    await note.fill('line one\nline two');
    const end = await note.evaluate((t) => t.selectionStart);
    await note.press('ArrowUp');
    expect(await note.evaluate((t) => t.selectionStart)).toBeLessThan(end);
    await note.press('Tab');
    expect(await note.count()).toBe(1);
    expect(await note.inputValue()).toBe('line one\nline two');
    await note.focus();
    await note.press('Control+Enter');
    expect((await calls(p)).filter((c) => c[0] === 'ask' || c[0] === 'give')).toHaveLength(1);
    await p.close();
  });
});

describe.skipIf(!browserAvailable)('handing a review back', () => {
  it('does not send Needs changes with no words, by ⌘↵ any more than by its button', async () => {
    const p = await page();
    await p.evaluate(() => window.mountAsk());
    await p.click('text=Needs changes');
    await p.locator('#ask textarea').press('Control+Enter');
    expect((await calls(p)).filter((c) => c[0] === 'back')).toEqual([]);
    await p.locator('#ask textarea').fill('Rename the column.');
    await p.locator('#ask textarea').press('Control+Enter');
    expect((await calls(p)).filter((c) => c[0] === 'back')).toEqual([['back', 'changes', 'Rename the column.']]);
    await p.close();
  });
});

describe.skipIf(!browserAvailable)("the helper's options", () => {
  it('go once one is picked, and 1-9 pick them', async () => {
    const p = await page();
    await p.evaluate(() => window.mountMate());
    await p.locator('#mate .opt-row').first().waitFor();
    expect(await p.locator('#mate .opt-row').count()).toBe(2);
    await p.locator('body').press('2');
    await p.waitForTimeout(100);
    expect((await calls(p)).filter((c) => c[0] === 'comment')).toEqual([['comment', 'Wait']]);
    expect(await p.locator('#mate .opt-row').count()).toBe(0);
    await p.close();
  });
});

describe("a teammate's thread page", () => {
  it('is drawn afresh for each thread, so a reply still sending cannot clear the next box', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('<TeammateThread key={`${openCard.personId}/${openCard.threadId}`} card={openCard}');
  });
});
