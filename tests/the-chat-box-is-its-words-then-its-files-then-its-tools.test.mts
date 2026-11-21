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
import { AttachRow, nameEnds } from '../renderer/src/components/AttachRow.tsx';
import { MessageEditor } from '../renderer/src/team/MessageMore.tsx';
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

  it('is the same arrow in a chat thread’s reply box and in a thread with a person', () => {
    expect(read('renderer/src/team/ThreadPanel.tsx')).toMatch(/<ChatSend /);
    expect(roomChat).toMatch(/<ChatSend /);
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/talkTo\?\.length \? \(\s*<ChatSend ready=\{hasDraft\}/);
  });

  it('leaves a reply to an agent its word and its key, which is not Return', () => {
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/<>Send <kbd>\{sendKeyFor\(enterSends\)\}<\/kbd><\/>/);
  });

  it('sits at the right end of the bar, with "Sending" beside it while a file goes up', () => {
    expect(ruleIn(chatCss, '.chat-send-at')).toMatch(/margin-left: auto;/);
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

  // A tester who works with the mouse opened the link tool and found only
  // "Paste a link, then Return", with nothing to press.
  it('add a link with a button as well as with Return', () => {
    const bar = read('renderer/src/team/FormatBar.tsx');
    expect(bar).toMatch(/<button type="button" className="fmt-link-add" disabled=\{!href\.trim\(\)\} onMouseDown=\{hold\} onClick=\{\(\) => linkDone\(true\)\}>Add link<\/button>/);
    expect(bar).toMatch(/if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); linkDone\(true\); \}/);
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
    expect(html).toMatch(/<span class="attach-name"><span class="attach-head">quarterly-numbers-<\/span><span class="attach-tail">final-v3.pdf<\/span><\/span>/);
    expect(html).toMatch(/<span class="attach-meta">234 KB<\/span>/);
    expect(html).not.toContain('attach-chip');
    expect(html.match(/aria-label="Remove quarterly-numbers-final-v3.pdf"/g)).toHaveLength(1);
    expect(html).toMatch(/<button type="button" class="attach-x"[^>]*aria-label="Remove quarterly-numbers-final-v3.pdf"/);
  });

  // A tester attached ten files and could not tell them apart: every long name
  // was cut at its end, where "final-v3" and "final-v2" differ.
  it('cuts a long name in its middle on one line, keeping the end that tells files apart', () => {
    expect(ruleIn(stylesCss, '.attach-tiles .attach-head')).toMatch(/min-width: 0; overflow: hidden; text-overflow: ellipsis;/);
    expect(ruleIn(stylesCss, '.attach-tiles .attach-tail')).toMatch(/flex: none;/);
    expect(nameEnds('quarterly-numbers-final-v3.pdf')).toEqual(['quarterly-numbers-', 'final-v3.pdf']);
    expect(nameEnds('Customer interview recording with the design team.m4a')).toEqual(['Customer interview recording with the ', 'design team.m4a']);
    expect(nameEnds('averyveryverylongnamewithnobreaks.txt')).toEqual(['averyveryverylongnamewith', 'nobreaks.txt']);
  });

  it('leaves a short name whole', () => {
    expect(nameEnds('notes.txt')).toEqual(['notes.txt', '']);
    expect(nameEnds('launch-plan-draft.md')).toEqual(['launch-plan-draft.md', '']);
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

  // A tester attached a picture and typed on, and the words went nowhere: the
  // file picker had taken the cursor out of the box and nothing gave it back.
  it('puts the cursor back in the box once files are picked', () => {
    expect(roomChat).toMatch(/e\.target\.value = ''; ref\.current\?\.focus\(\);/);
    expect(read('renderer/src/team/ThreadPanel.tsx')).toMatch(/e\.target\.value = '';\s*box\.current\?\.focus\(\);/);
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/e\.target\.value = '';\s*ref\.current\?\.focus\(\);/);
  });
});

// Both testers attached a file to a message, looked at another chat and came
// back: the words were there and the file was gone, so the message would have
// gone out without it. The box kept its words in the draft store and its files
// only in memory.
describe('a half-written message', () => {
  const mem = new Map<string, string>();
  const fake = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); } };
  it('keeps its files when you leave the chat and come back', async () => {
    const { saveDraftAttachments, readDraftAttachments } = await import('../renderer/src/drafts.ts');
    (globalThis as { localStorage?: unknown }).localStorage = fake;
    try {
      saveDraftAttachments({ product: 'room:with:p-l', id: 'Message Lena' }, [{ name: 'launch-plan.md', image: false, srcPath: '/x/launch-plan.md', size: 1200 }]);
      const html = box();
      expect(html).toMatch(/<span class="attach-head">launch-plan.md<\/span>/);
      expect(readDraftAttachments({ product: 'room:with:p-l', id: 'Message Lena' })).toHaveLength(1);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('writes its files down as they change, beside its words', () => {
    expect(roomChat).toMatch(/useState<PendingAttachment\[\]>\(\(\) => readDraftAttachments\(draftAt\)\.map\(staged\)\)/);
    expect(roomChat).toMatch(/setTooBig\(saveDraftAttachments\(draftAt, next\)\.dropped\.length\);/);
  });
});

// The same tester opened that quote to edit it and found a ">" before the
// words: editing a sent message was a plain text field showing the marks.
describe('editing a sent message', () => {
  it('is the chat box’s own editor, so a quote is edited as a quote', () => {
    const html = renderToStaticMarkup(h(MessageEditor, { text: '> a quote', onSave: () => {}, onCancel: () => {}, onEmpty: () => {} }));
    expect(html).toContain('class="chat-edit-box rich-reply"');
    expect(html).not.toContain('<textarea');
  });
});

// A tester sent a customer's words as a quote, and it arrived as plain text: a
// sent message drew no quote at all, a list's bullets hung out past the words to
// their left, and a block of code wore the inline code's tint line by line.
describe('a formatted message, once sent', () => {
  it('draws its list, quote and code as the box drew them while they were written', () => {
    expect(ruleIn(rooms, '.rm-cm .tx ul, .rm-cm .tx ol')).toMatch(/padding-left: 22px;/);
    expect(ruleIn(chatCss, '.rich-reply .ProseMirror ul, .rich-reply .ProseMirror ol')).toMatch(/padding-left: 22px;/);
    expect(ruleIn(rooms, '.rm-cm .tx blockquote')).toMatch(/border-left: 2px solid var\(--line-strong\); color: var\(--text-dim\);/);
    expect(ruleIn(rooms, '.rm-cm .tx pre')).toMatch(/background: var\(--wash\); border-radius: var\(--artifact-corner-small\);/);
    expect(ruleIn(rooms, '.rm-cm .tx pre code')).toMatch(/background: none; padding: 0;/);
  });
});
