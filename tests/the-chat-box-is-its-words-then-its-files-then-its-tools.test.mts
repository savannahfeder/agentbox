// THE CHAT BOX IS ITS WORDS, THEN ITS FILES, THEN ITS TOOLS (w-f689c07680, 2026-11-21).
//
// The founder, on a person's chat: "This chat message component is really
// messy. ... when I add text to it, it looks [like] the content [is] on the
// right, and that's nothing like how Slack works." Since 53424aa8 a person's or
// a group's box was a grid: the words in a left column, the five tools and Send
// in a right one. Measured on the demo team's copy at 1512 wide: the words
// wrapped at 662px of an 860px box beside an empty column; a pasted picture
// was 48px tall and as wide as it happened to be, a tall one 20px; every other
// file was a chip that took itself out when pressed, and a long name wrapped
// the row. In a room's side panel Aa lit up and showed nothing, because the
// marks were hidden there.
//
// Now every chat box is Slack's: the words across the whole box, what is
// attached under them as tiles of one size, and the tools along the bottom
// with Send at the right. Aa puts the marks in a row along the top.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FirstChatBox } from '../renderer/src/team/rooms/RoomChat.tsx';
import { AttachRow } from '../renderer/src/components/AttachRow.tsx';
globalThis.React = React;

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rooms = read('renderer/src/team/rooms/rooms.css');
const chatCss = read('renderer/src/team/chat.css');
const stylesCss = read('renderer/src/styles.css');
const roomChat = read('renderer/src/team/rooms/RoomChat.tsx');
const ruleIn = (css: string, sel: string) => {
  const m = new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(css);
  return m ? m[2] : '';
};

const box = () => renderToStaticMarkup(h(FirstChatBox, {
  person: { id: 'p-l', name: 'Lena Ortiz', avatarUrl: null, me: false }, placeholder: 'Message Lena',
  open: async () => 'r-1', send: async () => null, putFile: async () => null, putFileFrom: async () => null,
}));
const tiles = (attachments: Parameters<typeof AttachRow>[0]['attachments']) =>
  renderToStaticMarkup(h(AttachRow, { attachments, onRemove: () => {}, look: 'tiles' }));

describe('the words', () => {
  it('take the whole box on every page, with nothing in a column beside them', () => {
    expect(rooms).not.toMatch(/\.rm-compose[^{]*\{[^}]*grid-template-columns/);
    expect(rooms).not.toMatch(/\.rm-compose-bar[^{]*\{[^}]*grid-column: 2/);
    expect(ruleIn(rooms, '.rm-compose')).toMatch(/display: flex; flex-direction: column;/);
  });

  it('grow as you write, to two fifths of the window, then scroll with the tools still under them', () => {
    expect(ruleIn(rooms, '.rm-compose-input')).toMatch(/max-height: min\(40vh, 360px\); overflow-y: auto;/);
  });

  it('come first, then what is attached, then the tools, with the marks row above them all', () => {
    const order = ['fmt-marks-slot', 'className="rm-compose-input"', '<AttachRow', 'className="rm-compose-bar"'].map((s) => roomChat.indexOf(s));
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const html = box();
    expect(html.indexOf('fmt-marks-slot')).toBeLessThan(html.indexOf('rm-compose-input'));
    expect(html.indexOf('rm-compose-input')).toBeLessThan(html.indexOf('rm-compose-bar'));
  });
});

describe('Send', () => {
  it('is an arrow at the bottom right with no key inside it', () => {
    const html = box();
    const send = /<button type="button" class="dock-send chat-send"[^>]*>([\s\S]*?)<\/button>/.exec(html);
    expect(send?.[0]).toMatch(/aria-label="Send"/);
    expect(send?.[1]).toMatch(/<svg/);
    expect(send?.[1]).not.toMatch(/<kbd/);
    expect(html.lastIndexOf('chat-send')).toBeGreaterThan(html.indexOf('aria-label="Formatting marks"'));
  });

  it('is the same arrow in a chat thread’s reply box', () => {
    expect(read('renderer/src/team/ThreadPanel.tsx')).toMatch(/<ChatSend /);
    expect(roomChat).toMatch(/<ChatSend /);
  });
});

describe('the formatting marks', () => {
  it('go in a row along the top of the box when Aa is on', () => {
    const bar = read('renderer/src/team/FormatBar.tsx');
    expect(bar).toMatch(/createPortal\(/);
    for (const f of ['renderer/src/team/rooms/RoomChat.tsx', 'renderer/src/team/ThreadPanel.tsx', 'renderer/src/components/Focus.tsx']) {
      expect(read(f), f).toMatch(/className="fmt-marks-slot"/);
      expect(read(f), f).toMatch(/marksAt=\{/);
    }
  });

  it('show in a room’s side panel too, which used to hide them while Aa was lit', () => {
    expect(rooms).not.toMatch(/\.rm-chat \.rm-compose-bar \.fmt-mark/);
  });
});

describe('what is attached, as tiles', () => {
  it('draws a picture as a square that opens large, with its own ×', () => {
    const html = tiles([{ name: 'shot.png', image: true, dataBase64: 'iVBORw0KGgo=' }]);
    expect(html).toMatch(/<div class="attach-row attach-tiles">/);
    expect(html).toMatch(/class="attach-tile attach-picture"/);
    expect(html).toMatch(/aria-label="Open shot.png large"/);
    expect(html).toMatch(/<button type="button" class="attach-x" title="Remove" aria-label="Remove shot.png">/);
    expect(ruleIn(stylesCss, '.attach-tiles .attach-picture img')).toMatch(/width: 56px; height: 56px; object-fit: cover;/);
  });

  it('draws any other file as a card with its kind, its name and its size, which a press does not take out', () => {
    const html = tiles([{ name: 'quarterly-numbers-final-v3.pdf', image: false, srcPath: '/x/q.pdf', size: 240_000 }]);
    expect(html).toMatch(/<span class="attach-kind">PDF<\/span>/);
    expect(html).toMatch(/<span class="attach-name">quarterly-numbers-final-v3.pdf<\/span>/);
    expect(html).toMatch(/<span class="attach-meta">234 KB<\/span>/);
    expect(html).not.toContain('attach-chip');
    expect(html.match(/aria-label="Remove quarterly-numbers-final-v3.pdf"/g)).toHaveLength(1);
    expect(html).toMatch(/<button type="button" class="attach-x"[^>]*aria-label="Remove quarterly-numbers-final-v3.pdf"/);
  });

  it('cuts a long name short on one line rather than wrapping the row', () => {
    expect(ruleIn(stylesCss, '.attach-tiles .attach-name')).toMatch(/white-space: nowrap; overflow: hidden; text-overflow: ellipsis;/);
  });

  it('names a file with no kind by the word File', () => {
    expect(tiles([{ name: 'Makefile', image: false, srcPath: '/x/Makefile' }])).toMatch(/<span class="attach-kind">FILE<\/span>/);
  });

  it('says on the card when a file is too big to send', () => {
    const html = tiles([{ name: 'film.mov', image: false, srcPath: '/x/film.mov', size: 1.5 * 1024 ** 3 }]);
    expect(html).toMatch(/class="attach-tile attach-file attach-too-big"/);
    expect(html).toMatch(/<span class="attach-meta">Too big to send<\/span>/);
  });

  it('keeps a voice note playable, with the same ×', () => {
    const html = tiles([{ name: 'voice-note-12000ms.webm', image: false, dataBase64: 'AA==' }]);
    expect(html).toMatch(/class="attach-tile attach-voice"/);
    expect(html).toContain('aria-label="Play voice note"');
    expect(html).toMatch(/class="attach-x"[^>]*aria-label="Remove voice note"/);
  });

  it('shows the × on the tile you point at or tab to, and always on a touch screen', () => {
    expect(stylesCss).toMatch(/\.attach-tile:hover > \.attach-x, \.attach-tile:focus-within > \.attach-x \{ opacity: 1; \}/);
    expect(stylesCss).toMatch(/@media \(hover: none\) \{ \.attach-tiles \.attach-x \{ opacity: 1; \} \}/);
  });

  it('is what every chat box shows, and the other boxes keep theirs', () => {
    expect(roomChat).toMatch(/<AttachRow look="tiles"/);
    expect(read('renderer/src/team/ThreadPanel.tsx')).toMatch(/<AttachRow look="tiles"/);
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/<AttachRow look=\{talkTo\?\.length \? 'tiles' : undefined\}/);
    expect(read('renderer/src/threads/ThreadComposer.tsx')).not.toMatch(/look="tiles"/);
  });
});

describe('the bar', () => {
  it('has tools big enough to hit', () => {
    expect(ruleIn(chatCss, '.fmt-btn')).toMatch(/width: 28px; height: 28px;/);
  });
});
