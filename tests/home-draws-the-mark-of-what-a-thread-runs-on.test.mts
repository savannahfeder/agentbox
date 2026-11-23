// Home's Needs you and In progress rows drew every agent thread with the
// two-eyed agent face, while the Inbox had already moved to the mark of the
// harness the thread runs on (Claude Code's starburst, the OpenAI knot for
// Codex). On a home page of Claude Code threads that read as "icons not showing
// up". Measured by rendering HomePage with Home's real styles in a headless
// browser and reading which mark each row's face slot holds, and its size.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = ['styles.css', 'soft-corners.css', 'components/agent-face.css', 'components/harness-mark.css', 'home/home.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { HomePage } from './renderer/src/home/HomePage';
      const now = Date.now();
      const row = (key, more) => ({ key, letter: 'C', title: 'Thread ' + key, from: null, priority: null, project: 'Payments API', at: now - 60000, unread: false, ...more });
      const needs = [
        row('claude', { agent: true, engine: 'claude' }),
        row('codex', { agent: true, engine: 'codex', letter: 'X' }),
        row('other', { agent: true, engine: 'something-new' }),
        row('person', { letter: 'S', from: 'Sam' }),
      ];
      const progress = [
        { key: 'p1', letter: 'C', engine: 'claude', title: 'Fix the flaky test', line: 'Claude Code', at: now - 60000 },
        { key: 'p2', letter: 'X', engine: 'codex', title: 'Move the cache', line: 'Codex', at: now - 60000 },
      ];
      createRoot(document.getElementById('root')).render(
        <HomePage hello="Good morning" now={now} needs={needs} needsCount={needs.length} progressCount={2} team={null}
          progress={progress} slot={() => {}} onDoor={() => {}} onOpen={() => {}} onMember={() => {}} onTeam={() => {}} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function look() {
  const page = await browser.newPage({ viewport: { width: 1425, height: 884 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://home.test/**', (r) => r.fulfill({ contentType: 'text/html',
    body: `<html data-theme="dark"><style>${css}</style><div id="root" style="height:884px"></div></html>` }));
  await page.goto('http://home.test/');
  await page.addScriptTag({ content: 'window.zero = new Proxy({}, { get: () => () => Promise.resolve([]) });' });
  await page.addScriptTag({ content: bundle });
  await page.locator('.hm-two').waitFor();
  const m = await page.evaluate(() => {
    const face = (row) => {
      const f = row.querySelector('.hm-face');
      const mark = f.querySelector('.harness-mark');
      const size = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null);
      return { mark: mark ? [...mark.classList].find((c) => c !== 'harness-mark') : null, eyes: !!f.querySelector('.agent-face'), size: size(mark ?? f.querySelector('.agent-face')), slot: size(f), live: f.classList.contains('live') };
    };
    const [needs, progress] = [...document.querySelectorAll('.hm-card')];
    return { needs: [...needs.querySelectorAll('.hm-row')].map(face), progress: [...progress.querySelectorAll('.hm-row')].map(face) };
  });
  await page.close();
  return m;
}

describe.skipIf(!browserAvailable)('Home draws the mark of what an agent thread runs on', () => {
  it("draws Claude Code's mark on a Claude Code thread in Needs you, filling the 28px slot", async () => {
    expect((await look()).needs[0]).toEqual({ mark: 'claude', eyes: false, size: 28, slot: 28, live: false });
  }, 30_000);
  it("draws Codex's mark on a Codex thread", async () => {
    expect((await look()).needs[1]).toMatchObject({ mark: 'codex', eyes: false, size: 28 });
  }, 30_000);
  it('keeps the agent face for a harness that has no mark', async () => {
    expect((await look()).needs[2]).toMatchObject({ mark: null, eyes: true, size: 28 });
  }, 30_000);
  it("keeps a person's letter on a person's row", async () => {
    expect((await look()).needs[3]).toMatchObject({ mark: null, eyes: false });
  }, 30_000);
  it('draws the marks on In progress too, still marked as running', async () => {
    const { progress } = await look();
    expect(progress).toEqual([
      { mark: 'claude', eyes: false, size: 28, slot: 28, live: true },
      { mark: 'codex', eyes: false, size: 28, slot: 28, live: true },
    ]);
  }, 30_000);
});
