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
//   began 28px in and "Waiting on Maya" 22px in;
// - "Updated 12 hours ago" sat on the column's right edge, away from its line;
// - the trail's line stopped 2px under one dot and 6px over the next, so it
//   read as dashes;
// - the comment box was a face, a two-line field and an outlined button with
//   no key, at the end of the scroll, where your own thread has the "Reply… R"
//   pill under the conversation that opens into the reply card.
// On the pictures of the fix: "everything, with the exception of 'Message
// Maya,' to go in the three dots", and About "should just be a component at
// the top, not on the side, and it also includes what Maya's agent already
// tried. It's basically a summary component ... not going to be toggleable".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommentBox, TeammateCorner, TeammateThread } from '../renderer/src/threads/TeammateThread.tsx';
import { ThreadMenuList, threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';
import { TeammateSummary } from '../renderer/src/threads/Summary.tsx';
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
const page = (over = {}) => renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team as never },
  React.createElement(FollowContext.Provider, { value: { is: () => false, follow() {}, unfollow() {} } },
    React.createElement(TeammateThread, {
      card: { ...card, ...over } as never, person: maya as never, now: NOW, syncedAt: null, backLabel: 'Inbox',
      onBack() {}, onMessage() {}, onContinue() {}, onOpenDoc() {}, onNotice() {},
    }))));
const corner = (props = {}) => renderToStaticMarkup(React.createElement(TeammateCorner, {
  person: maya as never, followed: false, onFollow() {}, onContinue() {}, onMessage() {}, ...props,
}));
const box = (props = {}) => renderToStaticMarkup(React.createElement(CommentBox, {
  owner: 'Maya', helping: false, draft: '', setDraft() {}, sending: false, onSend() {}, open: false, onOpen() {}, onFold() {}, ...props,
}));
const buttons = (html: string) => html.match(/<button[\s\S]*?<\/button>/g) ?? [];
const rows = (follow: 'on' | 'off' | null, carryOn: boolean) => threadMenuRows({ change: false, terminal: null, finish: false, follow, carryOn });

describe("a teammate's thread's corner", () => {
  it('keeps Message Maya in Done\'s box and the rest behind the ⋯, as a thread of your own does', () => {
    expect(corner()).toMatch(/^<span class="ts-top tp-acts">/);
    const all = buttons(corner());
    expect(all).toHaveLength(2);
    expect(all[0]).toMatch(/^<button type="button" class="ts-done ts-msgbtn">/);
    expect(all[0].replace(/<[^>]+>/g, '')).toBe('MCMessage Maya');
    expect(all[1]).toMatch(/class="ts-more" aria-label="More actions"/);
  });
  it('puts Follow and Continue in the menu in their full words, Follow ticked while it is on', () => {
    expect(rows('off', true).map((r) => [r.id, r.label])).toEqual([['follow', 'Tell me when it is done'], ['continue', 'Continue it yourself']]);
    const list = (r: ReturnType<typeof rows>) => renderToStaticMarkup(React.createElement(ThreadMenuList, { rows: r, onPick() {} }));
    expect(list(rows('on', false))).toContain('ts-more-tick');
    expect(list(rows('off', false))).not.toContain('ts-more-tick');
    expect(rows(null, false)).toEqual([]);
  });
  it('draws no ⋯ with nothing to put behind it', () => {
    expect(buttons(corner({ onFollow: null, onContinue: null }))).toHaveLength(1);
  });
  it('has no About to switch on and off', () => {
    expect(page()).not.toMatch(/>About</);
    expect(source).not.toMatch(/setAbout|tp-side/);
  });
});

describe('the summary at the top', () => {
  const html = page();
  const at = html.indexOf('<section class="ts-ticket tp-summary" aria-label="Summary">');
  it('is there without asking, under the lines that say whose it is and where it stands', () => {
    expect(at).toBeGreaterThan(html.indexOf('<p class="tp-standing">'));
    expect(at).toBeLessThan(html.indexOf('<div class="focus-dock">'));
  });
  it('says what it is about and what the agent already tried', () => {
    const part = html.slice(at, html.indexOf('</section>', at));
    expect(part).toContain('<p class="ts-tk-lead">It was the Mac sleeping.</p>');
    expect(part).toContain('What Maya&#x27;s agent already tried');
    expect(part.replace(/<[^>]+>/g, ' ')).toMatch(/Found the entry\s+Timed account discovery/);
    expect(part).not.toMatch(/>About</);
  });
  it('says nothing for a thread its owner keeps private', () => {
    expect(page({ visible: false })).not.toContain('tp-summary');
  });
  // The merge's browser test opened a card with no `blocks`, and the summary's
  // `card.blocks.length` threw, taking the whole page with it.
  it('still draws a card an older copy published without its links', () => {
    const { blocks: _b, blockedBy: _w, ...old } = card;
    expect(renderToStaticMarkup(React.createElement(TeammateSummary, { card: old as never, owner: 'Maya' }))).toContain('It was the Mac sleeping.');
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
  it('date the thread beside whose it is, not at the column\'s far edge', () => {
    expect(html).toMatch(/<p class="tp-whose">[\s\S]*?Maya&#x27;s thread in Agentbox testing[\s\S]*?Updated 12 hours ago<\/span><\/p>/);
    expect(pages).not.toMatch(/\.tp-ago \{[^}]*margin-left: auto/);
  });
});

describe('the trail of what was done', () => {
  for (const [where, css, prefix] of [['its plain size', summary, ''], ['the summary at the top', pages, '.tp-summary ']] as const) {
    it(`joins one dot to the next with the same gap at each end, at ${where}`, () => {
      const base = rule(summary, '.ts-step::before');
      const dot = { top: px(rule(css, `${prefix}.ts-step::before`) || base, 'top'), size: px(base, 'height') };
      const line = rule(css, `${prefix}.ts-step:not(:last-child)::after`) || rule(summary, '.ts-step:not(:last-child)::after');
      const step = Number((rule(css, `${prefix}.ts-step`) || rule(summary, '.ts-step')).match(/margin: 0 0 ([\d.]+)px/)?.[1]);
      const above = px(line, 'top') - (dot.top + dot.size);
      const below = step + dot.top + px(line, 'bottom');
      expect(above).toBeGreaterThan(0);
      expect(below).toBe(above);
    });
  }
  // Pinned on the light picture: "These little dots feel a little too indented". The page is
  // markdown, and `.markdown ol` (22px in) and `.markdown li` (3px) outranked the trail's
  // one-class rules, so the dots sat 25px in from the label over them.
  it('starts the summary\'s dots on the edge its label starts on, whatever the page\'s lists do', () => {
    expect(read('renderer/src/styles.css')).toMatch(/^\.markdown ul, \.markdown ol \{ margin: 8px 0 8px 22px; \}/m);
    expect(rule(pages, '.tp-summary .ts-trail')).toMatch(/margin: 0; padding: 0;/);
    expect(rule(pages, '.tp-summary .ts-step')).toMatch(/margin: 0 0 6px/);
    expect(rule(pages, '.tp-summary .ts-step::before')).toMatch(/(^|;)\s*left: 0;/);
    expect(px(rule(pages, '.tp-summary .ts-step:not(:last-child)::after'), 'left') + 0.5).toBe(2.5);
    expect(rule(pages, '.tp-summary .tp-files')).toMatch(/margin: 0;/);
  });
});

describe('what a teammate asked of you, on their thread', () => {
  const asks = read('renderer/src/team/asks.css');
  // Pinned on the asked-to-help picture: "visually really easy to miss. It's poorly
  // spaced, and it feels like part of the message". It sat 8px under the answer, unframed.
  it('stands apart from the answer above it, in the summary\'s card', () => {
    const card = rule(asks, '.ask-bar:not(.ask-under)');
    expect(Number(card.match(/margin: (\d+)px 0 0;/)?.[1])).toBeGreaterThanOrEqual(24);
    expect(card).toMatch(/border: 1px solid var\(--line\); border-radius: var\(--radius\); background: var\(--wash\);/);
    expect(card).toMatch(/padding: 18px 22px 20px;/);
    expect(rule(pages, '.ts-ticket.tp-summary')).toMatch(/padding: 18px 22px 20px;/);
  });
  it('leaves the answer drawn under a task\'s own message as it was', () => {
    expect(rule(asks, '.ask-bar.ask-under')).toBe(' margin: 0; ');
  });
});

describe("the box at the foot of a teammate's thread", () => {
  it('rests as the reply box\'s pill, with R on it, the way your own thread\'s does', () => {
    const html = box();
    expect(html).toMatch(/^<div class="dock-card tp-compose"><button type="button" class="dock-pill">/);
    expect(html).toContain('<span class="dock-pill-text">Reply to Maya…</span>');
    expect(html).toContain('<kbd>R</kbd>');
  });
  it('shows your unsent words on the pill rather than the invitation', () => {
    expect(box({ draft: 'Saw the same thing\n\non my Mac' })).toContain('<span class="dock-pill-text">Saw the same thing on my Mac</span>');
    expect(box({ draft: 'Saw it' })).toMatch(/class="dock-pill dock-pill-kept"/);
  });
  it('opens into the reply card: its field, who it goes to, and Send with the key and the arrow', () => {
    const html = box({ open: true });
    expect(html).toMatch(/^<form class="dock-card tp-compose tp-dock-form">/);
    expect(html).toMatch(/<textarea class="dock-input"[^>]*placeholder="Reply to Maya"/);
    expect(html).toContain('<span class="compose-clauses"><span class="dim">Goes to Maya.</span></span>');
    expect(html).toMatch(/>Send <kbd>↵<\/kbd><svg class="dock-send-arrow"/);
  });
  it('says the agent, not the owner, when you were asked to help', () => {
    const html = box({ open: true, helping: true });
    expect(html).toMatch(/placeholder="Write to Maya&#x27;s agent"/);
    expect(html).toContain('Goes to Maya&#x27;s agent.');
    expect(box({ helping: true })).toContain('Write to Maya&#x27;s agent…');
  });
  it('grows the way the reply box does', () => {
    expect(source).toMatch(/applyDockHeight\(field\.current\)/);
  });
  it('stays under the conversation, in the dock your own thread keeps its box in', () => {
    expect(page()).toMatch(/<div class="focus-scroll"[\s\S]*<\/div><div class="focus-dock"><div class="focus-dock-inner"><div class="dock-card tp-compose"><button type="button" class="dock-pill">/);
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
