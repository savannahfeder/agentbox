// A MENU OPENED OVER THE SKY WEARS NO HALO (w-10f989fba7, 2026-11-23).
//
// Words in the sky band sit in a soft patch of the sky's dark (home.css), and
// the rule reached every button in the header and every word in the Files
// bar. The filters menu opens inside the header, so each of its chips wore
// five dark text shadows, up to 16px, on a solid card with no sky behind it:
// "a black glow over some of the buttons". Measured in the stand-in app under
// the dark orange sky: all 19 buttons in that menu had the halo and none of
// its labels did; after the fix none had it. The cloud menu and the Files
// menus open in the same places and had the same rule.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from 'playwright';

type Browser = { newPage: (o?: object) => Promise<Page>; close: () => Promise<void> };
let chromium: { launch: (o: object) => Promise<Browser>; executablePath: () => string } | undefined;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* no browser here */ }
const can = !!chromium && existsSync(chromium.executablePath());

const homeCss = readFileSync(new URL('../renderer/src/home/home.css', import.meta.url), 'utf8');

// The header and the Files bar as App.tsx, Pages.tsx and FilesPlace.tsx draw
// them, with each menu open.
const page = (app: string) => `<style>${homeCss}</style>
<div class="${app}" style="--sky-under: rgb(27, 25, 23)">
  <header class="topbar">
    <h1 class="workspace-title" id="title">Inbox</h1>
    <div class="th-right">
      <button type="button" class="th-new" id="new-thread">New thread</button>
      <span><button type="button" class="th-disp th-cloud" id="cloud">7</button>
        <div class="th-pop th-cloud-pop" role="dialog"><div class="line"><span class="lab">Cloud</span><span class="opts">
          <button type="button" class="on picked" id="cloud-on">On</button><button type="button">Off</button></span></div></div></span>
      <span><button type="button" class="th-disp" id="filters">Filters</button>
        <div class="th-pop" role="dialog">
          <div class="line"><span class="lab" id="view-label">View</span><span class="opts">
            <button type="button" class="on" id="list">List</button><button type="button" id="board">Board</button></span></div>
          <div class="foot"><span id="showing">Showing 36 of 36</span><button type="button" id="clear">Clear filters</button></div>
        </div></span>
    </div>
    <div class="th-right" id="fp-head-slot"><div class="fp-new-box">
      <button type="button" class="th-new" id="files-new">New</button>
      <div class="fp-menu" role="menu"><button type="button" role="menuitem" class="fp-menu-item" id="new-document">Document</button></div>
    </div></div>
  </header>
  <div class="fp-bar">
    <nav class="fp-crumbs"><button type="button" class="fp-crumb is-on" id="crumb">Agentbox Team</button></nav>
    <div class="fp-views">
      <div class="fp-total-box"><button type="button" class="fp-total" id="total">2 GB on this Mac</button>
        <div class="fp-menu fp-total-menu" role="menu">
          <div class="fp-menu-head" id="total-head">Agentbox Team uses 2 GB of this Mac</div>
          <button type="button" role="menuitem" class="fp-menu-item" id="biggest">Show the biggest first</button>
        </div></div>
      <div class="fp-switch"><button type="button" class="fp-kind is-on" id="recent">Recent</button></div>
    </div>
  </div>
</div>`;

const HALO = /^rgb\(27, 25, 23\) 0px 0px 1px, .*0px 0px 16px$/;
const inMenus = ['cloud-on', 'view-label', 'list', 'board', 'showing', 'clear', 'new-document', 'total-head', 'biggest'];
const overSky = ['title', 'new-thread', 'cloud', 'filters', 'files-new', 'crumb', 'total', 'recent'];

async function shadows(app: string): Promise<Record<string, string>> {
  const browser = await chromium!.launch({ headless: true });
  try {
    const tab = await browser.newPage();
    await tab.setContent(page(app));
    return await tab.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, getComputedStyle(document.getElementById(id)!).textShadow])), [...inMenus, ...overSky]);
  } finally { await browser.close(); }
}

describe('a menu opened over the sky', () => {
  it.skipIf(!can)('the filters menu, the cloud menu and the Files menus wear no halo, on the Inbox and on Files', async () => {
    for (const app of ['app sky-shown', 'app sky-shown sky-place']) {
      const got = await shadows(app);
      for (const id of inMenus) expect(`${id}: ${got[id]}`).toBe(`${id}: none`);
    }
  }, 60_000);

  it.skipIf(!can)('the words and buttons on the sky itself keep it', async () => {
    const got = await shadows('app sky-shown');
    for (const id of overSky) expect(`${id}: ${got[id]}`).toMatch(new RegExp(`^${id}: ${HALO.source.slice(1)}`));
  }, 60_000);

  it.skipIf(!can)('with no sky, and on Home, nothing wears it', async () => {
    for (const app of ['app', 'app sky-shown home-shown']) {
      const got = await shadows(app);
      for (const id of [...inMenus, ...overSky]) expect(`${id}: ${got[id]}`).toBe(`${id}: none`);
    }
  }, 60_000);
});
