// THE SEARCH BOX AND STANDUP KEEP THEIR HEIGHT WHEN THE CHATS LIST IS LONG (w-537e968dc5).
//
// "Whenever I have anything open here, these bars get squished." With the AI
// teammates section open, the Chats list beside the Standup was taller than
// the window, and the Search box and the Standup row shrank to make room.
// Measured on a screenshot of a 2000 by 837 window: 17 and 18 points tall,
// where they are drawn 32 and 36. The list is a column that scrolls, and both
// had a height but were still allowed to shrink, so the column squeezed them
// before it scrolled. With the section folded the list fit, and they were whole.
//
// Rendered here with the app's own styles: in a 700 point column, the height
// of that window's list, and where the list just fits and just does not.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const browserAvailable = chromium && existsSync(chromium.executablePath());

const css = ['styles.css', 'workspace-navigation.css', 'soft-corners.css', 'team/rooms/rooms.css', 'teammates/teammates.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');

let browser, page;
beforeAll(async () => {
  if (!browserAvailable) return;
  const bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { flushSync } from 'react-dom';
      import { createRoot } from 'react-dom/client';
      import { ChatsContext, ChatsFrame } from './renderer/src/teammates/ChatsColumn';
      import { FOLD_KEY } from './renderer/src/teammates/chat-lines';
      const mate = (i) => ({ id: 'm' + i, name: 'Teammate ' + (i + 1), letter: 'T', role: null, job: null, goal: null,
        counted: null, asksFirst: null, works: null, worksLabel: null, product: 'lumen', engine: null, model: null, effort: null,
        limit: 1, paused: false, status: 'active', memory: [], createdAt: 0, waiting: [], now: null, running: null, queued: 0, done: [], runsThisWeek: 0 });
      const el = document.getElementById('root');
      const root = createRoot(el);
      let n = 0;
      window.draw = ({ height, mates, folded }) => {
        el.style.height = height + 'px';
        localStorage.setItem(FOLD_KEY, JSON.stringify(folded ? ['teammates'] : []));
        flushSync(() => root.render(
          <ChatsContext.Provider key={++n} value={{ teammates: Array.from({ length: mates }, (_, i) => mate(i)), groups: [], now: 0,
            onTeammate() {}, onNew() {}, onGroup() {}, onTeam() {}, persons: [{ id: 'p-dev', name: 'Dev Patel', url: null, waits: false }], onPerson() {} }}>
            <ChatsFrame current="team"><div className="team-page" /></ChatsFrame>
          </ChatsContext.Provider>));
      };`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 2000, height: 837 } });
  page.setDefaultTimeout(5_000);
  await page.route('http://chats.test/**', (r) => r.fulfill({ contentType: 'text/html',
    body: `<style>${css}</style><div class="app workspace-layout"><div id="root" style="width:1400px;display:flex;flex-direction:column"></div></div>` }));
  await page.goto('http://chats.test/');
  await page.addScriptTag({ content: bundle });
}, 60_000);
afterAll(async () => { await browser?.close(); });

async function measure(opts) {
  await page.evaluate((o) => window.draw(o), opts);
  return page.evaluate(() => {
    const list = document.querySelector('.cx-list');
    const box = (s) => document.querySelector(s).getBoundingClientRect();
    const last = list.lastElementChild;
    return {
      search: box('.cx-search').height,
      searchTop: box('.cx-search').top,
      standup: box('.cx-team').height,
      standupTop: box('.cx-team').top,
      rows: [...document.querySelectorAll('.cx-sec > .cx-row')].map((r) => r.getBoundingClientRect().height),
      list: list.getBoundingClientRect().height,
      // How tall the list's contents are when nothing in it gives way.
      contents: last.getBoundingClientRect().bottom + Number.parseFloat(getComputedStyle(last).marginBottom)
        + Number.parseFloat(getComputedStyle(list).paddingBottom) - list.getBoundingClientRect().top,
      scrolls: list.scrollHeight > list.clientHeight,
      pageScrolls: document.scrollingElement.scrollHeight > innerHeight,
    };
  });
}

describe.skipIf(!browserAvailable)('the Chats list beside the Standup, with 18 AI teammates open', () => {
  it('keeps the Search box 32 tall and the Standup row 36 in a 700 point column, and scrolls', async () => {
    const m = await measure({ height: 700, mates: 18, folded: false });
    expect(m.search).toBe(32);
    expect(m.standup).toBe(36);
    expect(m.rows).toHaveLength(19);
    expect(m.rows.every((h) => h === 36)).toBe(true);
    expect(m.scrolls).toBe(true);
  });

  it('keeps them whole where the list just fits, and where it is one point too long', async () => {
    const whole = await measure({ height: 3000, mates: 18, folded: false });
    const fits = await measure({ height: Math.ceil(whole.contents), mates: 18, folded: false });
    expect([fits.search, fits.standup, fits.scrolls]).toEqual([32, 36, false]);
    const over = await measure({ height: Math.floor(whole.contents) - 1, mates: 18, folded: false });
    expect([over.search, over.standup, over.scrolls]).toEqual([32, 36, true]);
  });

  it('draws them in the same place and size open as folded', async () => {
    const open = await measure({ height: 700, mates: 18, folded: false });
    const folded = await measure({ height: 700, mates: 18, folded: true });
    expect(folded.scrolls).toBe(false);
    expect([open.searchTop, open.search, open.standupTop, open.standup])
      .toEqual([folded.searchTop, folded.search, folded.standupTop, folded.standup]);
  });

  it('scrolls inside the window rather than growing past it', async () => {
    const m = await measure({ height: 700, mates: 18, folded: false });
    expect(m.list).toBe(700);
    expect(m.pageScrolls).toBe(false);
  });
});
