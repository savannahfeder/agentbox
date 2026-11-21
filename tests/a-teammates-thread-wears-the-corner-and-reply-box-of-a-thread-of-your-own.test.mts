// A TEAMMATE'S THREAD WEARS THE CORNER AND THE REPLY BOX OF A THREAD OF YOUR OWN (w-8a8eac7620, 2026-11-21).
//
// The founder, on a teammate's thread: "very messy and chaotic ... those
// buttons lack icons and they're not clean ... The chat bar is much worse than
// our usual chat input field. It's almost a different component ... It doesn't
// expand and, again, the send button is lacking an icon." Measured on the
// stage (the built renderer with a made-up team, 1728x1080, dark):
// - the corner was four outlined words with no mark, where your own thread's
//   corner is boxes of a mark and a word (Done) beside the dots;
// - under the title the face was 20px and the ring 12px, so "Maya's thread"
//   began 28px in, "Waiting on Maya" 22px in and the trail's steps 18px in;
// - "Updated 12 hours ago" sat on the column's right edge, away from its line;
// - the trail's line stopped 2px under one dot and 6px over the next, so it
//   read as dashes;
// - the comment box was a face, a two-line field and an outlined "Send to
//   Maya" with no key, at the end of the scroll, where your own thread has the
//   "Reply… R" pill under the conversation that opens into the reply card.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommentBox, TeammateCorner, TeammateThread } from '../renderer/src/threads/TeammateThread.tsx';
import { endWasInView } from '../renderer/src/threads/teammate-thread.ts';
import { TeamContext } from '../renderer/src/team/people.tsx';
import { FollowContext } from '../renderer/src/team/following.ts';
globalThis.React = React;

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pages = read('renderer/src/threads/pages.css');
const summary = read('renderer/src/threads/summary.css');
const app = read('renderer/src/App.tsx');
const source = read('renderer/src/threads/TeammateThread.tsx');

/** The body of the rule with exactly this selector, at the start of a line. */
const rule = (css: string, sel: string) => css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';
const px = (body: string, prop: string) => {
  const m = body.match(new RegExp(`(?:^|;)\\s*${prop}:\\s*(-?[\\d.]+)px`));
  if (!m) throw new Error(`no ${prop} in { ${body} }`);
  return Number(m[1]);
};

const NOW = Date.parse('2026-11-08T08:00:00');
const me = { id: 'p-me', name: 'Sam Rivera', email: 'sam@example.test', avatarUrl: null };
const maya = { id: 'p-maya', name: 'Maya Chen', email: 'maya@example.test', avatarUrl: null };
const team = { state: { signedIn: true, people: [me, maya] }, me: me.id, byId: new Map([[me.id, me], [maya.id, maya]]), products: new Map() };
const card = {
  personId: maya.id, threadId: 'w-1', visible: true, title: 'Fix account discovery freeze', project: 'Agentbox testing',
  state: 'waiting', priority: 5, problem: 'It was the Mac sleeping.', progress: 'Found the entry\nTimed account discovery',
  solution: null, blockedBy: [], blocks: [], people: null, updatedAt: NOW - 12 * 3600_000,
};
const page = () => renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team as never },
  React.createElement(FollowContext.Provider, { value: { is: () => false, follow() {}, unfollow() {} } },
    React.createElement(TeammateThread, {
      card: card as never, person: maya as never, now: NOW, syncedAt: null, backLabel: 'Inbox',
      onBack() {}, onMessage() {}, onContinue() {}, onOpenDoc() {}, onNotice() {},
    }))));
const corner = (props = {}) => renderToStaticMarkup(React.createElement(TeammateCorner, {
  owner: 'Maya', person: maya as never, followed: false, onFollow() {}, onContinue() {}, onMessage() {}, about: false, onAbout() {}, ...props,
}));
const box = (props = {}) => renderToStaticMarkup(React.createElement(CommentBox, {
  owner: 'Maya', helping: false, draft: '', setDraft() {}, sending: false, onSend() {}, open: false, onOpen() {}, onFold() {}, ...props,
}));
const buttons = (html: string) => html.match(/<button[\s\S]*?<\/button>/g) ?? [];

describe("a teammate's thread's corner", () => {
  it('is the boxes your own thread\'s corner wears, each a mark and a word', () => {
    const all = buttons(corner());
    expect(all.map((b) => b.replace(/<[^>]+>/g, ''))).toEqual(['Follow', 'Continue', 'MaMessage Maya', 'About']);
    for (const b of all) {
      expect(b).toMatch(/^<button[^>]*class="ts-done[ "]/);
      expect(b).toMatch(/<svg|class="tm-av/);
    }
  });
  it('wears the corner\'s own row, the one the dots and Done sit in', () => {
    expect(corner()).toMatch(/^<span class="ts-top tp-acts">/);
  });
  it('says a pressed Follow and About as pressed, the way the code button does', () => {
    expect(corner({ followed: true })).toMatch(/aria-pressed="true"[^>]*>(<svg[\s\S]*?<\/svg>)Following</);
    expect(corner({ about: true })).toMatch(/aria-pressed="true"[^>]*>(<svg[\s\S]*?<\/svg>)About</);
    expect(summary).toMatch(/\.ts-done\[aria-pressed="true"\] \{[^}]*background: var\(--wash-strong\)/);
  });
  it('keeps the long words for whoever points at the short ones', () => {
    expect(source).toContain("'Tell me when it is done'");
    expect(source).toContain('`Start a thread of your own with ${owner}\'s conversation and files.`');
  });
  it('draws no outlined word without a mark any more', () => {
    expect(page()).not.toContain('th-follow');
    expect(pages).not.toMatch(/\.th-follow\b/);
  });
});

describe('the lines under its name', () => {
  const html = page();
  it('give the face and the state mark one slot, so their words start together', () => {
    expect(html).toMatch(/<p class="tp-whose"><span class="tp-mark"><span class="tm-av"/);
    expect(html).toMatch(/<p class="tp-standing"><span class="tp-mark"><span class="ts-st /);
    const slot = rule(pages, '.tp-mark');
    expect(px(slot, 'width')).toBe(20);
    expect(px(slot, 'height')).toBe(20);
    expect(slot).toMatch(/justify-content: center/);
    expect(rule(pages, '.tp-whose, .tp-standing')).toMatch(/gap: 0 8px/);
  });
  it('set the steps the agent tried on that same slot: dots on its middle, words where the lines\' words start', () => {
    const words = px(rule(pages, '.tp-mark'), 'width') + 8;
    expect(px(rule(pages, '.tp-tried .ts-step'), 'padding-left')).toBe(words);
    const dot = rule(pages, '.tp-tried .ts-step::before');
    expect(px(dot, 'left') + 5 / 2).toBe(10);
    expect(px(rule(pages, '.tp-tried .ts-step:not(:last-child)::after'), 'left') + 1 / 2).toBe(10);
  });
  it('date the thread beside whose it is, not at the column\'s far edge', () => {
    expect(html).toMatch(/<p class="tp-whose">[\s\S]*?Maya&#x27;s thread in Agentbox testing[\s\S]*?Updated 12 hours ago<\/span><\/p>/);
    expect(pages).not.toMatch(/\.tp-ago \{[^}]*margin-left: auto/);
  });
});

describe('the trail of what was done', () => {
  // The dot's top and height, the line's top and bottom, and the gap to the next step, on each trail.
  for (const [where, css, prefix] of [['the card beside the thread', summary, ''], ["the page's own list", pages, '.tp-tried ']] as const) {
    it(`joins one dot to the next with the same gap at each end, on ${where}`, () => {
      const base = rule(summary, '.ts-step::before');
      const dot = { top: px(rule(css, `${prefix}.ts-step::before`) || base, 'top'), size: px(base, 'height') };
      const line = rule(css, `${prefix}.ts-step:not(:last-child)::after`);
      const step = Number(rule(summary, '.ts-step').match(/margin: 0 0 ([\d.]+)px/)?.[1]);
      const above = px(line, 'top') - (dot.top + dot.size);
      const below = step + dot.top + px(line, 'bottom');
      expect(above).toBeGreaterThan(0);
      expect(below).toBe(above);
    });
  }
});

describe("the box at the foot of a teammate's thread", () => {
  it('rests as the reply box\'s pill, with R on it, the way your own thread\'s does', () => {
    const html = box();
    expect(html).toMatch(/^<div class="dock-card tp-compose"><button type="button" class="dock-pill">/);
    expect(html).toContain('<span class="dock-pill-text">Comment to Maya…</span>');
    expect(html).toContain('<kbd>R</kbd>');
  });
  it('shows your unsent words on the pill rather than the invitation', () => {
    expect(box({ draft: 'Saw the same thing\n\non my Mac' })).toContain('<span class="dock-pill-text">Saw the same thing on my Mac</span>');
    expect(box({ draft: 'Saw it' })).toMatch(/class="dock-pill dock-pill-kept"/);
  });
  it('opens into the reply card: its field, its bar and its Send with the key and the arrow', () => {
    const html = box({ open: true });
    expect(html).toMatch(/^<form class="dock-card tp-compose">/);
    expect(html).toMatch(/<textarea class="dock-input"[^>]*placeholder="Comment to Maya"/);
    expect(html).toContain('<div class="compose-sentence dock-bar"><span class="dock-send-pair solo"><button type="submit" class="dock-send"');
    expect(html).toMatch(/>Send to Maya <kbd>↵<\/kbd><svg class="dock-send-arrow"/);
  });
  it('says the agent, not the owner, when you were asked to help', () => {
    const html = box({ open: true, helping: true });
    expect(html).toMatch(/placeholder="Write to Maya&#x27;s agent"/);
    expect(html).toMatch(/>Send to the agent <kbd>↵<\/kbd>/);
    expect(box({ helping: true })).toContain('Write to Maya&#x27;s agent…');
  });
  it('grows the way the reply box does', () => {
    expect(source).toMatch(/applyDockHeight\(field\.current\)/);
  });
  it('stays under the conversation, outside what scrolls, starting where its words start', () => {
    expect(rule(pages, '.tp-page')).toMatch(/display: flex; flex-direction: column; height: 100%/);
    expect(rule(pages, '.tp-scroll')).toMatch(/flex: 1; min-height: 0; overflow-y: auto/);
    expect(rule(pages, '.tp-dock')).toMatch(/flex: none/);
    const left = (body: string) => body.match(/padding: [^;]*? (max\([^;]*\));/)?.[1] ?? body.match(/padding-left: ([^;]*);/)?.[1];
    expect(left(rule(pages, '.tp-dock'))).toBe(left(rule(pages, '.tp-grid')));
    expect(rule(pages, '.tp-dock.tp-with-about').match(/padding-left: ([^;]*);/)?.[1]).toBe(rule(pages, '.tp-grid.tp-with-about').match(/padding-left: ([^;]*);/)?.[1]);
    expect(page()).toMatch(/<div class="tp-scroll">[\s\S]*<\/div><div class="tp-dock"><div class="dock-card tp-compose"><button type="button" class="dock-pill">/);
  });
  // Opened under the last message on the stage, the 150px card covered it.
  it('keeps the end of the conversation in view as it opens, when you were reading the end', () => {
    // 2000px of words in an 800px window, the box 106px taller: the window is 694px now.
    const atEnd = { scrollHeight: 2000, clientHeight: 694, scrollTop: 1200 };
    expect(endWasInView(atEnd, 106)).toBe(true);
    expect(endWasInView({ ...atEnd, scrollTop: 1193 }, 106)).toBe(true);
    expect(endWasInView({ ...atEnd, scrollTop: 1192 }, 106)).toBe(false);
    expect(endWasInView({ ...atEnd, scrollTop: 0 }, 106)).toBe(false);
    expect(endWasInView(atEnd, -106)).toBe(false);
    expect(source).toMatch(/if \(endWasInView\(scroll, by\)\) scroll\.scrollTop = scroll\.scrollHeight;/);
  });
  it('opens on R, which the page\'s own keys pass on', () => {
    expect(app).toMatch(/if \(openCard && teamShown\) \{[\s\S]*?else if \(e\.key === 'r' \|\| e\.key === 'R'\) \{ e\.preventDefault\(\); window\.dispatchEvent\(new Event\(TEAMMATE_REPLY\)\); \}/);
    expect(source).toMatch(/window\.addEventListener\(TEAMMATE_REPLY, /);
  });
});
