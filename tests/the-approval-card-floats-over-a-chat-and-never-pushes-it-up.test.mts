// THE APPROVAL CARD PUSHED A CHAT UP INSTEAD OF FLOATING OVER IT (w-d4bac2245a).
//
// With a card in the corner, a teammate's chat drew its message box a card's
// height above the foot of the window, with empty space under it, and its top
// message slid under the header. The inbox's trailing room for the card was a
// block after every pane but your own opened thread. A chat, a group, a
// person's page or a teammate's thread fills its pane instead of scrolling it,
// so that block squeezed the page (a flex pane) or let the whole page scroll
// up by its height. Measured in the demo copy at 1710x1107: Lena's chat lost
// 191px at its foot, and a teammate's thread could scroll 191px past its end.
//
// Rendered here with the app's own styles: each page that fills its pane
// keeps its reply box at the foot and cannot scroll with the card up, while the
// inbox, and the Standup list that scrolls itself, still get room to bring
// their last rows out from under the card.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import type { Browser } from 'playwright';

const require = createRequire(import.meta.url);
let chromium: typeof import('playwright').chromium | undefined;
try { ({ chromium } = require('playwright')); } catch { /* no browser here */ }
const browserAvailable = !!chromium && existsSync(chromium.executablePath());

// Component styles load before styles.css, as App's imports do in main.tsx.
const css = ['team/rooms/rooms.css', 'teammates/teammates.css', 'team/everything/everything.css', 'threads/pages.css',
  'team/team.css', 'team/today.css', 'styles.css', 'workspace-navigation.css']
  .map((f) => readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8')).join('\n');

const ROOM = 220;
const fills = '<div style="flex:1;min-height:0;height:100%;display:flex;flex-direction:column"><div style="flex:1"></div><textarea class="reply" style="height:60px"></textarea></div>';
const rows = Array.from({ length: 30 }, (_, i) => `<div class="r" style="height:60px">Row ${i}</div>`).join('');

/** Each page as App.tsx nests it: the body, the pane and what fills it. */
const PAGES: Record<string, string> = {
  'your own opened thread': `<div class="body"><main class="list-pane pinned">${fills}</main></div>`,
  "a teammate's thread": `<div class="body tm-body"><main class="list-pane"><div class="tm-team-pane th-pane"><div class="tp-thread" style="flex:1;display:flex;flex-direction:column"><div style="flex:1"></div><textarea class="reply" style="height:60px"></textarea></div></div></main></div>`,
  'a group or a chat opened from the inbox': `<div class="body"><main class="list-pane rm-open">${fills}</main></div>`,
  "a person's page in Chats": `<div class="body"><main class="list-pane tq-open pl-open">${fills}</main></div>`,
  'an AI teammate': `<div class="body"><main class="list-pane tq-open">${fills}</main></div>`,
};

let browser: Browser | undefined;
beforeAll(async () => { if (browserAvailable) browser = await chromium!.launch({ headless: true }); }, 60_000);
afterAll(async () => { await browser?.close(); });

/** The page drawn with and without a card up, scrolled as far down as it goes. */
async function measure(inner: string) {
  const page = await browser!.newPage({ viewport: { width: 1600, height: 900 } });
  await page.setContent(`<style>${css}</style><style>html,body{margin:0;height:100%}.body{display:flex;height:900px}</style>
    <div class="app workspace-layout">${inner}</div>`);
  const look = (asking: boolean, room: number) => page.evaluate(({ asking, room }) => {
    document.documentElement.style.setProperty('--approval-room', `${room}px`);
    document.querySelector('.app')!.classList.toggle('asking', asking);
    const pane = document.querySelector('.list-pane') as HTMLElement;
    const list = document.querySelector('.team-page') as HTMLElement | null;
    for (const el of [pane, list]) if (el) el.scrollTop = 1e6;
    const reply = document.querySelector('.reply');
    return {
      replyFoot: reply ? Math.round(pane.getBoundingClientRect().bottom - reply.getBoundingClientRect().bottom) : null,
      paneScrolls: pane.scrollHeight - pane.clientHeight,
      listScrolls: list ? list.scrollHeight - list.clientHeight : null,
      listHeight: list ? list.clientHeight : null,
    };
  }, { asking, room });
  const without = await look(false, ROOM);
  const withCard = await look(true, ROOM);
  await page.close();
  return { without, withCard };
}

describe.skipIf(!browserAvailable)('a page that fills its pane, with an approval card up', () => {
  for (const [name, inner] of Object.entries(PAGES)) {
    it(`${name} keeps its reply box at the foot and cannot be scrolled up`, async () => {
      const { without, withCard } = await measure(inner);
      expect(without.replyFoot).toBe(0);
      expect(withCard).toEqual(without);
    });
  }
});

describe.skipIf(!browserAvailable)('a list, with an approval card up', () => {
  it('the inbox scrolls its last rows clear of the card', async () => {
    const { without, withCard } = await measure(`<div class="body"><main class="list-pane">${rows}</main></div>`);
    expect(withCard.paneScrolls - without.paneScrolls).toBe(ROOM + 16);
  });

  it('the Standup list scrolls its own last rows clear, and is not squeezed', async () => {
    const { without, withCard } = await measure(`<div class="body"><main class="list-pane tq-open"><div class="team-page">${rows}</div></main></div>`);
    expect(withCard.paneScrolls).toBe(0);
    expect(withCard.listHeight).toBe(without.listHeight);
    expect(withCard.listScrolls! - without.listScrolls!).toBe(ROOM + 16);
  });
});
