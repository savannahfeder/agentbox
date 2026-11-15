// A MESSAGE IN A THREAD CAN DO WHAT A CHAT MESSAGE CAN (w-2b2832bc6d).
//
// "I can't seem to delete in a thread or perform a lot of functions. ... I was
// also trying to tag in a thread and hit Enter because I normally would expect
// it to propose names, but it actually ended up sending." Measured in the code
// before the change: a direct chat's thread panel gave each message a bar with
// React and nothing else (no Reply, no Hand to an agent, no more menu, so no
// edit, copy, mark unread or delete), and its reply box had no @ menu at all, so
// Enter after "@m" sent "Thanks @m".
//
// Their rule: "You should be able to do everything in a thread that can be done
// to a standard message", the one difference being the three quick emoji, which
// a thread has no room for. So the panel's bar is compared with the chat's own,
// message for message, and the panel's box is checked to hand its keys to the
// same @ and # menus the chat's box uses before Enter can send.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const seen = vi.hoisted(() => ({ bars: [], boxes: [], chat: [], named: [], open: { chat: false, named: false }, keys: [] }));

// Each bar records what it was handed; the box records its key handler.
vi.mock('../renderer/src/team/ChatActions.tsx', async (actual) => {
  const real = await actual();
  const { createElement } = await import('react');
  return { ...real, MessageActions: (p) => { seen.bars.push(p); return createElement('div', { className: 'bar-stub' }); } };
});
vi.mock('../renderer/src/team/RichReply.tsx', async () => {
  const { createElement } = await import('react');
  return { RichReply: (p) => { seen.boxes.push(p); return createElement('div', { className: p.className }); } };
});
// The menus stand in for the chat box's own: they take a key only while open.
const menu = (which, cls) => ({
  live: true, mentions: [], open: false, block: null, chips: null, card: null, over: '',
  menu: React.createElement('div', { className: cls }),
  keyDown: (e) => { seen.keys.push(`${which}:${e.key}`); if (!seen.open[which] || e.key !== 'Enter') return false; e.preventDefault(); return true; },
  track: () => {}, click: () => {}, encode: (w) => w, plain: (w) => w,
});
vi.mock('../renderer/src/team/ChatAgents.tsx', async (actual) => {
  const real = await actual();
  return { ...real, useChatMentions: (args) => { seen.chat.push(args); return menu('chat', 'mention-menu'); } };
});
vi.mock('../renderer/src/components/ThreadMentions.tsx', async (actual) => {
  const real = await actual();
  return { ...real, useThreadMentions: (args) => { seen.named.push(args); return menu('named', 'mention-menu thread-menu'); } };
});

const { Thread } = await import('../renderer/src/components/Thread.tsx');
const { ThreadPanel } = await import('../renderer/src/team/ThreadPanel.tsx');
const { TeamContext } = await import('../renderer/src/team/people.tsx');
const { DELETED_WORDS } = await import('../renderer/src/item-thread.ts');

const ME = 'p-sam', MAYA = 'p-maya';
const T = new Date(2026, 9, 21, 14, 0).getTime();
const team = {
  state: {}, me: ME, products: new Map(),
  byId: new Map([[ME, { id: ME, name: 'Sam Rivera', email: '', avatarUrl: null }], [MAYA, { id: MAYA, name: 'Maya Chen', email: '', avatarUrl: null }]]),
};
const inTeam = (el) => renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team }, el));
const md = (t) => React.createElement('p', null, t);
const noop = () => {};

const theirs = { at: T, who: 'you', by: MAYA, text: 'Did the Atlassian charge go through?', uid: 'u-ask' };
const mine = { at: T + 60_000, who: 'you', by: ME, text: 'Thanks @m', uid: 'u-mine' };
const theirReply = { at: T + 120_000, who: 'you', by: MAYA, text: 'It was the Loom plan.', uid: 'u-theirs' };

// Everything a chat with a teammate wires, the same calls for both places.
const calls = () => ({
  onReact: vi.fn(), onEdit: vi.fn(), onMarkUnread: vi.fn(), onHandToAgent: vi.fn(), onCopied: vi.fn(),
});

// What one bar offers, in words.
const offer = (p) => ({
  quick: p.quick !== false,
  react: typeof p.onReact === 'function',
  reply: typeof p.onQuote === 'function',
  hand: typeof p.onHandToAgent === 'function',
  more: (p.more ?? []).map((i) => (i === 'rule' ? '—' : i.label)),
});

const chatBars = () => {
  seen.bars.length = 0;
  inTeam(React.createElement(Thread, {
    events: [theirs, mine], chat: true, name: 'Maya', landOn: 'w-1', onWhole: noop, md,
    onQuote: noop, onOpenThread: noop, replies: {}, ...calls(),
  }));
  return [...seen.bars];
};
const panel = (extra = {}) => {
  seen.bars.length = 0;
  seen.boxes.length = 0;
  const c = calls();
  const html = inTeam(React.createElement(ThreadPanel, {
    product: 'direct-maya', id: 'w-1', people: ['Maya'],
    parent: theirs, replies: [mine, theirReply], md, width: 480,
    onSend: vi.fn(), onClose: noop, onResize: noop, ...c, ...extra,
  }));
  return { html, bars: [...seen.bars], box: seen.boxes[0], calls: c };
};

beforeEach(() => { seen.open.chat = false; seen.open.named = false; seen.keys.length = 0; seen.chat.length = 0; seen.named.length = 0; });

describe('the bar on a message in a thread', () => {
  it('is on the message the thread hangs off and on every reply', () => {
    expect(panel().bars).toHaveLength(3);
  });

  it('is the chat’s own bar for your message, without the quick emoji', () => {
    const [, chatMine] = chatBars();
    const [, panelMine] = panel().bars;
    expect(offer(panelMine).quick).toBe(false);
    expect({ ...offer(panelMine), quick: true }).toEqual(offer(chatMine));
  });

  it('is the chat’s own bar for a teammate’s message, without the quick emoji', () => {
    const [chatTheirs] = chatBars();
    const { bars } = panel();
    for (const p of [bars[0], bars[2]]) {
      expect(offer(p).quick).toBe(false);
      expect({ ...offer(p), quick: true }).toEqual(offer(chatTheirs));
    }
  });

  it('lets you edit, copy, mark unread and delete your own reply', () => {
    expect(offer(panel().bars[1]).more).toEqual(['Edit message', 'Copy text', 'Mark unread', '—', 'Delete message']);
  });

  it('never offers edit or delete on a teammate’s', () => {
    const { bars } = panel();
    expect(offer(bars[0]).more).toEqual(['Copy text', 'Mark unread']);
    expect(offer(bars[2]).more).toEqual(['Copy text', 'Mark unread']);
  });

  it('has Reply, React and Hand to an agent on every message', () => {
    for (const p of panel().bars) {
      const o = offer(p);
      expect([o.react, o.reply, o.hand]).toEqual([true, true, true]);
    }
  });

  it('marks the conversation unread from the message, and hands it to an agent', () => {
    const { bars, calls: c } = panel();
    bars[1].more.find((i) => i !== 'rule' && i.label === 'Mark unread').onClick();
    expect(c.onMarkUnread).toHaveBeenCalledWith(mine.at);
    bars[1].onHandToAgent();
    expect(c.onHandToAgent).toHaveBeenCalled();
  });

  // THE BOUNDARY: a conversation that cannot change its messages offers what
  // it can, as the chat does, rather than a menu of things that do nothing.
  it('leaves out what the conversation cannot do', () => {
    const { bars } = panel({ onEdit: undefined, onMarkUnread: undefined, onHandToAgent: undefined });
    expect(offer(bars[1]).more).toEqual(['Copy text']);
    expect(offer(bars[1]).hand).toBe(false);
  });

  it('draws no bar on a deleted message, and says it was deleted', () => {
    const { html, bars } = panel({ parent: { ...theirs, text: DELETED_WORDS, deleted: true } });
    expect(bars).toHaveLength(2);
    expect(html).toContain(`<div class="msg-body msg-deleted">${DELETED_WORDS}</div>`);
  });

  it('marks an edited reply as edited', () => {
    const { html } = panel({ replies: [{ ...mine, edited: T + 90_000 }] });
    expect(html.match(/class="msg-edited"/g)).toHaveLength(1);
  });
});

describe('the reply box in a thread', () => {
  it('opens the chat’s @ menu with the people in the conversation', () => {
    panel();
    expect(seen.chat.at(-1)).toMatchObject({ on: true, where: { product: 'direct-maya', id: 'w-1' }, people: ['Maya'] });
  });

  it('draws the @ and # menus over its own box', () => {
    const { html } = panel();
    expect(html).toMatch(/<div class="chat-thread-box"[^>]*>(?:(?!<\/aside>)[\s\S])*class="mention-menu"/);
    expect(html).toContain('class="mention-menu thread-menu"');
  });

  it('gives Enter to the @ menu while it is open, so a name is picked, not sent', () => {
    seen.open.chat = true;
    const { box } = panel();
    const e = { key: 'Enter', shiftKey: false, isComposing: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(box.onKeyDown(e)).toBe(true);
    expect(seen.keys).toEqual(['chat:Enter']);
  });

  it('gives Enter to the # menu while that one is open', () => {
    seen.open.named = true;
    const { box } = panel();
    expect(box.onKeyDown({ key: 'Enter', shiftKey: false, isComposing: false, preventDefault: vi.fn(), stopPropagation: vi.fn() })).toBe(true);
    expect(seen.keys).toEqual(['chat:Enter', 'named:Enter']);
  });

  // AND THE CASE THAT MUST NOT CHANGE: with no menu up, Enter is still Send.
  it('still sends on Enter with no menu open, and Shift+Enter is still a new line', () => {
    const { box } = panel();
    const enter = { key: 'Enter', shiftKey: false, isComposing: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(box.onKeyDown(enter)).toBe(true);
    expect(enter.preventDefault).toHaveBeenCalled();
    const shift = { key: 'Enter', shiftKey: true, isComposing: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    expect(box.onKeyDown(shift)).toBe(false);
    expect(shift.preventDefault).not.toHaveBeenCalled();
  });

  it('draws the mentions in the box as chips, as the chat’s box does', () => {
    expect(Array.isArray(panel().box.mentions)).toBe(true);
  });
});

// Measured in the built app: dragged to its narrowest (320px) the full bar was
// 229px over a 263px message and hid the name and time under it.
describe('a thread panel dragged narrow', () => {
  const css = fs.readFileSync(new URL('../renderer/src/team/chat.css', import.meta.url), 'utf8');

  it('keeps every button on the bar and drops only the words of Hand to an agent', () => {
    expect(css).toMatch(/\.chat-thread-panel \{ container: thread-panel \/ inline-size; \}/);
    expect(css).toMatch(/@container thread-panel \(max-width: 400px\) \{\s*\.chat-thread-panel \.chat-act-word \{ display: none; \}\s*\}/);
  });

  it('leaves the chat’s own bar its words at any width', () => {
    expect(css).not.toMatch(/(^|\n)\s*\.chat-act-word \{[^}]*display: none/);
  });
});
