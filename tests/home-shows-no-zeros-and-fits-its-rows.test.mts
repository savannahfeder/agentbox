// Home looked unfinished with little on it. The doors said "In progress 0", a
// teammate who had finished nothing got a dashed strip of grey stubs and
// "0 done", and Needs you and Team this week stood about 300px tall around a
// single row with a fade over empty glass. The two cards also set the same
// role in different type (14.5/20 titles beside 14/19, 12.5 beside 12), and
// the project under a title was 10.5px mono capitals. An agent's thread wore
// its engine's letter in a circle ("X" for Codex), which read as a close
// button; it now wears the agent face used across the app. Measured by rendering
// HomePage with Home's real styles in a headless browser.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { doors } from '../renderer/src/home/home-model.ts';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = ['styles.css', 'soft-corners.css', 'components/agent-face.css', 'threads/thread-composer.css', 'home/home.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');

describe('the doors', () => {
  it('show no number when nothing is behind them', () => {
    expect(doors({ needs: 0, progress: 0, team: true }).map((d) => d.count)).toEqual([null, null, null]);
  });
  it('show the number from one up', () => {
    expect(doors({ needs: 1, progress: 1, team: false }).map((d) => d.count)).toEqual([1, 1]);
  });
});

let browser, bundle;
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { HomePage } from './renderer/src/home/HomePage';
      const now = Date.now();
      const { needsRows, teamRows, done, solo } = window.SHAPE;
      const needs = Array.from({ length: needsRows }, (_, i) => ({ key: 'n' + i, letter: i === 0 ? 'X' : 'S', agent: i === 0, title: 'Add an idempotency key ' + i, from: null, priority: null, project: 'Payments API', at: now - 60000, unread: false }));
      const team = Array.from({ length: teamRows }, (_, i) => ({ key: 'p' + i, name: 'Theo ' + i, letter: 'T', ai: false, line: 'Nothing running', state: 'quiet',
        week: [0, 0, 0, 0, 0, 0, done], total: done }));
      const slot = (el) => { if (el) el.innerHTML = '<div class="tc-card tc-inline"><textarea class="tc-text" style="height:74px"></textarea><div class="tc-bar" style="height:46px"><button class="tc-chip">Agent</button></div></div>'; };
      createRoot(document.getElementById('root')).render(
        <HomePage hello="Good morning" now={now} needs={needs} needsCount={needs.length} progressCount={solo ? 1 : 0} team={solo ? null : team}
          progress={solo ? [{ key: 'w1', letter: 'C', title: 'Fix the flaky test', line: 'Claude Code', at: now - 60000 }] : []}
          slot={slot} onDoor={() => {}} onOpen={() => {}} onMember={() => {}} onTeam={() => {}} />);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function look({ needsRows = 1, teamRows = 1, done = 0, theme = 'dark', solo = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1425, height: 884 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://home.test/**', (r) => r.fulfill({ contentType: 'text/html',
    body: `<html data-theme="${theme}"><style>${css}</style><div id="root" style="height:884px"></div></html>` }));
  await page.goto('http://home.test/');
  await page.addScriptTag({ content: `window.zero = new Proxy({}, { get: () => () => Promise.resolve([]) }); window.SHAPE = ${JSON.stringify({ needsRows, teamRows, done, solo })};` });
  await page.addScriptTag({ content: bundle });
  await page.locator('.hm-two').waitFor();
  const m = await page.evaluate(() => {
    const st = (el, pseudo = null) => getComputedStyle(el, pseudo);
    const box = (el) => el.getBoundingClientRect();
    const [needsCard, teamCard] = [...document.querySelectorAll('.hm-card')];
    const lastRow = (card) => [...card.querySelectorAll('.hm-row')].pop();
    const door = document.querySelector('.hm-door');
    const mate = document.querySelector('.hm-mate');
    const needsRow = needsCard.querySelector('.hm-row');
    const tag = needsCard.querySelector('.hm-tag');
    const week = mate?.querySelector('.hm-week > span');
    const face = (row) => { const f = row.querySelector('.hm-face'); const a = f.querySelector('.agent-face');
      return { agent: !!a, letter: f.textContent, size: a ? Math.round(box(a).width) : null, live: f.classList.contains('live') }; };
    const type = (el) => `${st(el).fontSize}/${st(el).lineHeight}`;
    return {
      faces: [...needsCard.querySelectorAll('.hm-row')].map(face),
      progressFaces: teamCard.getAttribute('aria-label') === 'In progress' ? [...teamCard.querySelectorAll('.hm-row')].map(face) : null,
      doors: [...document.querySelectorAll('.hm-door')].map((d) => d.textContent),
      doorCorner: st(door).borderTopLeftRadius,
      chipCorner: st(document.querySelector('.tc-chip')).borderTopLeftRadius,
      icon: [door.querySelector('svg').getAttribute('width'), door.querySelector('svg').getAttribute('stroke-width')],
      cards: box(needsCard).height,
      roomUnderNeeds: box(needsCard).bottom - box(lastRow(needsCard)).bottom,
      roomUnderTeam: box(teamCard).bottom - box(lastRow(teamCard)).bottom,
      fade: !['none', 'normal'].includes(st(needsCard, '::after').content),
      week: !!mate?.querySelector('.hm-week'),
      weekLevel: week ? box(week).bottom - box(mate.querySelector('.hm-text small')).bottom : null,
      needsTitle: type(needsRow.querySelector('.hm-text b')),
      mateTitle: mate && type(mate.querySelector('.hm-text b')),
      mateLine: mate && type(mate.querySelector('.hm-text small')),
      tag: { type: type(tag), caps: st(tag).textTransform, mono: st(tag).fontFamily === st(document.documentElement).getPropertyValue('--mono').trim(), colour: st(tag).color },
      faint: (() => { const p = document.createElement('i'); p.style.color = 'var(--text-faint)'; document.body.append(p); const c = st(p).color; p.remove(); return c; })(),
    };
  });
  await page.close();
  return m;
}

describe.skipIf(!browserAvailable)('Home with little on it', () => {
  it('shows no zero on a door, and the Inbox its one', async () => {
    const m = await look();
    expect(m.doors).toEqual(['Inbox1', 'In progress', 'Team']);
  }, 30_000);
  it('gives the doors the corner and the icons the line of the buttons beside them', async () => {
    const m = await look();
    expect(m.doorCorner).toBe(m.chipCorner);
    expect(m.icon).toEqual(['16', '1.4']);
  }, 30_000);
  it('fits each card to its one row, with no fade', async () => {
    const m = await look();
    expect(m.cards).toBeLessThan(120);
    expect(m.roomUnderNeeds).toBeLessThanOrEqual(6);
    expect(m.fade).toBe(false);
  }, 30_000);
  it('still fits three rows', async () => {
    const m = await look({ needsRows: 3, teamRows: 2 });
    expect(m.roomUnderNeeds).toBeLessThanOrEqual(6);
    expect(m.cards).toBeLessThan(240);
  }, 30_000);
  it('stops at its full height from four rows, with the fade', async () => {
    const m = await look({ needsRows: 4, teamRows: 1 });
    expect(m.cards).toBe(300);
    expect(m.fade).toBe(true);
  }, 30_000);
  it('draws no week for a teammate who finished nothing', async () => {
    expect((await look()).week).toBe(false);
  }, 30_000);
  it('draws the week once they finish one, its count level with their second line', async () => {
    const m = await look({ done: 1 });
    expect(m.week).toBe(true);
    expect(Math.abs(m.weekLevel)).toBeLessThanOrEqual(0.5);
  }, 30_000);
  it('sets a title and its second line in one size on both cards', async () => {
    const m = await look();
    expect(m.needsTitle).toBe('14px/20px');
    expect(m.mateTitle).toBe('14px/20px');
    expect(m.mateLine).toBe('12.5px/17px');
    expect(m.tag.type).toBe('12.5px/17px');
  }, 30_000);
  it("draws an agent's thread with the agent face, not its engine's letter, and keeps a person's letter", async () => {
    const m = await look({ needsRows: 2 });
    expect(m.faces).toEqual([{ agent: true, letter: '', size: 28, live: false }, { agent: false, letter: 'S', size: null, live: false }]);
  }, 30_000);
  it('draws the In progress rows with the agent face, still marked as running', async () => {
    const m = await look({ solo: true });
    expect(m.progressFaces).toEqual([{ agent: true, letter: '', size: 28, live: true }]);
  }, 30_000);
  for (const theme of ['dark', 'light']) {
    it(`writes the project in plain faint text, not mono capitals (${theme})`, async () => {
      const m = await look({ theme });
      expect(m.tag.caps).toBe('none');
      expect(m.tag.mono).toBe(false);
      expect(m.tag.colour).toBe(m.faint);
    }, 30_000);
  }
});
