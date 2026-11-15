// A REPLY BESIDE AN OPEN FILE KEEPS ITS WORDS WHOLE (w-61415acc87).
//
// With a file open beside a thread, the conversation sits at its 400px floor at
// most window sizes (1280 and 1440 both measured). Typing a reply there, the
// built app showed the mode chip as "A" and the model as "Opu": "Send ⌘↵" took
// the room. Every option read "Introducing Agent…", cut to one line, and the
// title ran to six lines at 27px.
//
// Then the bar's padding: 16px on the left of the first chip and 12px on the
// right of Send, read off the founder's screenshot of the fixed box.
//
// Rendered here with the app's own styles at 400 and at 900, with a draft typed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = ['styles.css', 'workspace-navigation.css', 'threads/thread-composer.css', 'one-thing-at-a-time.css', 'narrow-conversation.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');
const body = [
  '**Your idea is in the doc as four phrasings of the hook.**',
  '',
  '## Options',
  '1. "Introducing Agent Docs: docs you and swarms of agents can edit together" (recommended)',
  '2. "Introducing Agent Docs: docs that agents and people write in together"',
  '3. "Introducing Agent Docs: one doc, and every agent on your team in it"',
  '4. "Introducing Agent Docs: docs, written by your whole team and its agents"',
].join('\n');
const title = 'Bring the day\'s product update: the hook, the whole tweet, and one line on what the clip would show';

// Every call answers "done, nothing here", except the thread's history, which is the message above.
const stand_in = `
  const said = { id: 'w-0123456789', ts: Date.now() - 60000, source: 'agent', patch: { title: ${JSON.stringify(title)}, body: ${JSON.stringify(body)}, status: 'open', kind: 'review' } };
  const call = () => Promise.resolve(Object.assign([], { ok: true }));
  const history = () => Promise.resolve({ ok: true, lines: [said] });
  window.zero = new Proxy({}, { get: (_, k) => (k === 'itemHistory' ? history : typeof k === 'string' && k.startsWith('on') ? () => () => {} : call) });`;

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { Focus } from './renderer/src/components/Focus';
      const now = Date.now();
      const item = { product: 'site', id: 'w-0123456789', title: ${JSON.stringify(title)}, body: ${JSON.stringify(body)}, status: 'open', kind: 'review', labels: [], priority: 5, createdAt: now - 60000, updatedAt: now - 60000 };
      createRoot(document.getElementById('root')).render(
        <Focus item={item} onePage replyOpen live={{}} session={null} runningMode="auto" runningEngine="claude"
          engines={[{ id: 'claude', label: 'Claude Code' }]} items={[item]}
          onClose={() => {}} onReply={() => {}} onReplyClose={() => {}} onNotice={() => {}} onStop={() => {}} onReplySend={() => {}} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function measure(width, viewport = { width: 1200, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(5_000);
  await page.route('http://fits.test/**', (r) => r.fulfill({ contentType: 'text/html',
    body: `<style>${css} #root > * { min-width: 0; }</style><div id="root" style="width:${width}px;height:900px;display:flex;overflow:hidden"></div>` }));
  await page.goto('http://fits.test/');
  await page.addScriptTag({ content: stand_in });
  await page.addScriptTag({ content: bundle });
  await page.locator('.dock-input').fill('these are all the same format, with the colon');
  await page.locator('.dock-send:not(:disabled)').waitFor();
  await page.locator('.one-choices .opt-text').first().waitFor();
  await page.locator('.one-sum .one-title').waitFor();
  const m = await page.evaluate(() => {
    const box = (e) => e.getBoundingClientRect();
    const card = box(document.querySelector('.dock-card'));
    const bar = [...document.querySelectorAll('.dock-bar .tc-chip, .dock-bar .dock-clip, .dock-bar .dock-send, .dock-bar .dock-send-later')];
    const words = [...document.querySelectorAll('.dock-chips .tc-chip')].filter((e) => !e.querySelector('.tc-prio'));
    const lines = (e) => Math.round(e.clientHeight / parseFloat(getComputedStyle(e).lineHeight));
    const t = document.querySelector('.one-sum .one-title');
    const send = document.querySelector('.dock-send');
    const word = document.createRange();
    word.selectNodeContents(send.firstChild);
    const ends = bar.map(box);
    return {
      edges: [Math.round(Math.min(...ends.map((r) => r.left)) - card.left), Math.round(card.right - Math.max(...ends.map((r) => r.right)))],
      sendWord: word.getBoundingClientRect().width > 0,
      sendArrow: !!send.querySelector('svg')?.getBoundingClientRect().width,
      barRows: new Set(bar.map((e) => Math.round(box(e).top + box(e).height / 2))).size,
      barFits: bar.every((e) => box(e).left >= card.left && box(e).right <= card.right),
      wordsCut: words.filter((e) => {
        const text = document.createRange();
        text.selectNodeContents(e);
        return text.getBoundingClientRect().right > box(e).right - 2;
      }).map((e) => e.innerText),
      sendKey: !!document.querySelector('.dock-send kbd')?.offsetWidth,
      sendName: document.querySelector('.dock-send').title,
      optionLines: [...document.querySelectorAll('.one-choices .opt-text')].map(lines),
      titleSize: parseFloat(getComputedStyle(t).fontSize),
    };
  });
  await page.close();
  return m;
}

describe.skipIf(!browserAvailable)('a reply typed beside an open file, 400px wide', () => {
  let m;
  beforeAll(async () => { m = await measure(400); }, 30_000);
  it('shows the mode and the model whole, on one row, inside the box', () => {
    expect(m.wordsCut).toEqual([]);
    expect(m.barRows).toBe(1);
    expect(m.barFits).toBe(true);
  });
  it('has as much room left of the first chip as right of Send', () => {
    expect(Math.abs(m.edges[0] - m.edges[1])).toBeLessThanOrEqual(1);
  });
  it('shows Send as an arrow, with its word and key kept in its name', () => {
    expect(m.sendKey).toBe(false);
    expect(m.sendWord).toBe(false);
    expect(m.sendArrow).toBe(true);
    expect(m.sendName).toMatch(/^Send · /);
  });
  it('gives each long option a second line', () => {
    expect(m.optionLines.every((n) => n === 2)).toBe(true);
  });
  it('sets the title smaller than on a full-width thread', () => {
    expect(m.titleSize).toBeLessThan(27);
  });
});

describe.skipIf(!browserAvailable)('the same reply with room, 900px wide', () => {
  let m;
  beforeAll(async () => { m = await measure(900); }, 30_000);
  it('keeps the word Send and its key, one line per option and the full-size title', () => {
    expect(m.wordsCut).toEqual([]);
    expect(m.sendKey).toBe(true);
    expect(m.sendWord).toBe(true);
    expect(m.sendArrow).toBe(false);
    expect(m.optionLines.every((n) => n === 1)).toBe(true);
    expect(m.titleSize).toBe(27);
  });
  it('pads the bar evenly here too', () => {
    expect(Math.abs(m.edges[0] - m.edges[1])).toBeLessThanOrEqual(1);
  });
});

// The phone's web layout is as narrow and keeps its own look (phone.css).
describe.skipIf(!browserAvailable)('the same reply on a phone, 390px wide', () => {
  let m;
  beforeAll(async () => { m = await measure(390, { width: 390, height: 844 }); }, 30_000);
  it('leaves the phone\'s title, choices and Send as they were', () => {
    expect(m.sendWord).toBe(true);
    expect(m.optionLines.every((n) => n === 1)).toBe(true);
    expect(m.titleSize).toBe(27);
  });
});
