// A REPLY IN A THREAD SITS BESIDE THE CHAT, NOT IN IT.
//
// Asked for on 2026-10-05 (w-920461cbe6): "Let's add threads in convos with
// teammates, like in Slack." Before this, Reply on a message only quoted it into
// the reply box, so a side question ("two tiers or three?") and everyone's
// answers to it were spliced into the main conversation, and the chat about the
// launch video had the pricing argument running through the middle of it.
//
// Three shapes were drawn in the real app; the pick, in the person's words:
// "Yeah, definitely agree with the panel beside the chat. I think in Slack you
// can resize this so we might want to allow resizing."
//
// So, measured here, end to end:
// - a reply is an ordinary message line that also names the message it answers
//   (`inReplyTo`, that message's line uid, the same name a reaction uses);
// - it is a mark on ONE line, never a value the row keeps;
// - it crosses to a teammate in a conversation, and nowhere else;
// - the chat draws it out of the main column, under a "3 replies" line on the
//   message it answers, and an orphan whose message is unknown stays in the chat
//   rather than vanish;
// - the panel draws the message, the replies and its own reply box, and can be
//   resized, within limits that always leave the chat readable;
// - a thread with an agent is untouched.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { foldWorkItems, pickFields } from '../shared/work-items.mjs';
import { whatATeammateMaySet } from '../shared/team-rules.mjs';
import { itemThread } from '../renderer/src/item-thread.ts';
import { threadLine, clampThreadWidth, THREAD_WIDTH } from '../renderer/src/team/chat-threads.ts';
import { Thread } from '../renderer/src/components/Thread.tsx';
import { ThreadPanel } from '../renderer/src/team/ThreadPanel.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
import { Store } from '../main/store.mjs';

const ID = 'w-1234567890';
const ME = 'p-me', MAYA = 'p-maya', THEO = 'p-theo', JUN = 'p-jun';
const T0 = new Date(2026, 9, 5, 16, 0).getTime();
const MIN = 60_000;

const line = (by, at, patch, uid) => ({ id: ID, ts: T0 + at * MIN, source: 'founder', by, uid, patch });
const LEDGER = [
  line(MAYA, 0, { title: 'Launch', body: 'The launch cut is on the drive.', status: 'open', kind: 'directive' }, 'u-open'),
  line(MAYA, 5, { answer: 'Separate thing: two tiers or three?' }, 'u-ask'),
  line(THEO, 9, { answer: 'Three.', inReplyTo: 'u-ask' }, 'u-r1'),
  line(JUN, 14, { answer: 'Two.', inReplyTo: 'u-ask' }, 'u-r2'),
  line(THEO, 20, { answer: 'Press list is done.' }, 'u-press'),
  line(MAYA, 31, { answer: 'Sam, your call?', inReplyTo: 'u-ask' }, 'u-r3'),
];

describe('a reply on the ledger', () => {
  it('keeps the message it answers', () => {
    expect(pickFields({ answer: 'Three.', inReplyTo: 'u-ask' })).toEqual({ answer: 'Three.', inReplyTo: 'u-ask' });
  });

  it('refuses a reply that names no message', () => {
    expect(pickFields({ inReplyTo: '' })).toBe(null);
    expect(pickFields({ inReplyTo: 42 })).toBe(null);
    expect(pickFields({ inReplyTo: { on: 'u-ask' } })).toBe(null);
  });

  // A MARK ON ONE LINE, NEVER A VALUE THE ROW KEEPS. As an ordinary field the
  // row would carry "the latest reply's parent", which means nothing, and the
  // next plain message would inherit it in every reader that looked.
  it('never becomes something the whole conversation carries', () => {
    const item = foldWorkItems(LEDGER).get(ID);
    expect(item.inReplyTo).toBeUndefined();
    expect(item.wrote.inReplyTo).toBeUndefined();
  });

  // It is still a message, so it still decides whose turn it is: Maya's reply
  // in the thread puts the conversation back in everybody else's inbox.
  it('still counts as the newest thing said in the conversation', () => {
    const item = foldWorkItems(LEDGER).get(ID);
    expect(item.answer).toBe('Sam, your call?');
    expect(item.wrote.answer.by).toBe(MAYA);
  });
});

describe('a reply reaching a teammate', () => {
  const theirs = { id: ID, ts: 1, source: 'founder', by: THEO, uid: 'u-r1', patch: { answer: 'Three.', inReplyTo: 'u-ask' } };

  it('arrives in a conversation still knowing which message it answers', () => {
    expect(whatATeammateMaySet(theirs, { direct: true }).patch).toEqual({ answer: 'Three.', inReplyTo: 'u-ask' });
  });

  it('is dropped whole on an ordinary shared task, where a teammate may not speak', () => {
    expect(whatATeammateMaySet(theirs)).toBe(null);
  });
});

describe('the chat, with a thread in it', () => {
  const built = itemThread(LEDGER, [], null, { chat: true });
  const texts = built.events.map((e) => e.text);

  it('keeps the replies out of the main column', () => {
    expect(texts).toEqual(['The launch cut is on the drive.', 'Separate thing: two tiers or three?', 'Press list is done.']);
  });

  it('hands them over under the message they answer, oldest first', () => {
    expect(built.replies['u-ask'].map((e) => e.text)).toEqual(['Three.', 'Two.', 'Sam, your call?']);
    expect(built.replies['u-ask'].map((e) => e.by)).toEqual([THEO, JUN, MAYA]);
    expect(built.replies['u-ask'].every((e) => e.uid)).toBe(true);
  });

  // THE CASE THAT MUST NOT VANISH. A reply whose message is not in this
  // conversation (a line from a newer build, a page that has not arrived yet)
  // is still somebody's words; it stays in the chat where it can be read.
  it('leaves a reply to a message it cannot find in the chat', () => {
    const odd = [...LEDGER, line(JUN, 40, { answer: 'About that?', inReplyTo: 'u-nowhere' }, 'u-odd')];
    const out = itemThread(odd, [], null, { chat: true });
    expect(out.events.map((e) => e.text)).toContain('About that?');
    expect(out.replies['u-nowhere']).toBeUndefined();
  });

  it('leaves a thread with an agent exactly as it was', () => {
    const agent = itemThread(LEDGER, [], null, {});
    expect(agent.events.map((e) => e.text)).toContain('Three.');
    expect(agent.replies ?? {}).toEqual({});
  });
});

describe('the line under a message with replies', () => {
  const people = new Map([[THEO, { name: 'Theo Park' }], [JUN, { name: 'Jun Ito' }], [MAYA, { name: 'Maya Chen' }]]);
  const replies = itemThread(LEDGER, [], null, { chat: true }).replies?.['u-ask'] ?? [];

  it('counts them, names who replied once each, and says when the last came in', () => {
    const l = threadLine(replies, T0 + 64 * MIN);
    expect(l.count).toBe('3 replies');
    expect(l.faces).toEqual([THEO, JUN, MAYA]);
    expect(l.last).toBe('Last reply 33 min ago');
    expect(people.size).toBe(3);
  });

  it('says one reply in the singular', () => {
    expect(threadLine(replies.slice(0, 1), T0 + 10 * MIN).count).toBe('1 reply');
  });

  it('shows at most three faces, the most recent people', () => {
    const five = [THEO, JUN, MAYA, ME, 'p-ana'].map((by, n) => ({ at: T0 + n * MIN, who: 'you', by, text: 'x', uid: `u-${n}` }));
    expect(threadLine(five, T0 + 10 * MIN).faces).toEqual([MAYA, ME, 'p-ana']);
  });

  it('reads yesterday in the middle of a sentence', () => {
    expect(threadLine(replies, T0 + 31 * MIN + 30 * 3600_000).last).toBe('Last reply yesterday');
  });
});

describe('the panel width', () => {
  // 440 in the drawing; 480 since w-140ac855b1 asked for "a little bigger",
  // so the reply box holds the chat's formatting bar and Send.
  it('starts a little wider than the drawn width', () => {
    expect(THREAD_WIDTH.start).toBe(480);
  });

  it('holds what you dragged it to when there is room', () => {
    expect(clampThreadWidth(520, 1400)).toBe(520);
  });

  it('never goes narrower than a reply can be read in', () => {
    expect(clampThreadWidth(120, 1400)).toBe(THREAD_WIDTH.min);
  });

  // THE BOUNDARY ON THE OTHER SIDE. Dragged all the way left, the panel would
  // eat the conversation it sits beside; the chat always keeps its own room.
  it('never takes the room the chat needs', () => {
    expect(clampThreadWidth(1300, 1100)).toBe(1100 - THREAD_WIDTH.chat);
    expect(clampThreadWidth(1300, 3000)).toBe(THREAD_WIDTH.max);
  });

  it('still opens at its narrowest in a window too small for both', () => {
    expect(clampThreadWidth(500, 600)).toBe(THREAD_WIDTH.min);
  });
});

const team = {
  state: {}, me: ME,
  byId: new Map([
    [ME, { id: ME, name: 'Sam Rivera', email: '', avatarUrl: null }],
    [MAYA, { id: MAYA, name: 'Maya Chen', email: '', avatarUrl: null }],
    [THEO, { id: THEO, name: 'Theo Park', email: '', avatarUrl: null }],
    [JUN, { id: JUN, name: 'Jun Ito', email: '', avatarUrl: null }],
  ]),
  products: new Map(),
};
const md = (t) => React.createElement('p', null, t);
const inTeam = (el) => renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team }, el));

describe('the message a thread hangs off, in the chat', () => {
  const built = itemThread(LEDGER, [], null, { chat: true });
  const draw = (extra = {}) => inTeam(React.createElement(Thread, {
    events: built.events, chat: true, name: 'The agent', landOn: ID, onWhole: () => {}, md,
    onReact: () => {}, onQuote: () => {}, replies: built.replies, onOpenThread: () => {}, ...extra,
  }));

  it('carries one line saying how many replies, under that message only', () => {
    const html = draw();
    expect(html.match(/class="chat-thread-line[ "]/g)).toHaveLength(1);
    expect(html).toContain('>3 replies<');
  });

  it('marks the message whose thread is open', () => {
    expect(draw()).not.toContain('is-thread-open');
    expect(draw({ openThread: 'u-ask' }).match(/is-thread-open/g)).toHaveLength(1);
  });

  // REPLY OPENS THE THREAD, where there is one to open. Without one (the
  // single-person app), it quotes, as it always did.
  it('turns Reply on the bar into Reply in thread', () => {
    expect(draw()).toContain('aria-label="Reply in thread"');
    expect(draw({ onOpenThread: undefined })).not.toContain('aria-label="Reply in thread"');
  });
});

describe('the panel', () => {
  const built = itemThread(LEDGER, [], null, { chat: true });
  const parent = built.events.find((e) => e.uid === 'u-ask');
  const html = inTeam(React.createElement(ThreadPanel, {
    parent, replies: built.replies?.['u-ask'] ?? [], md, width: 440,
    onSend: () => {}, onClose: () => {}, onResize: () => {},
  }));

  it('is headed Thread and has a way to close it', () => {
    expect(html).toContain('>Thread<');
    expect(html).toContain('aria-label="Close thread"');
  });

  it('holds the message, then the replies under a count', () => {
    const at = (s) => html.indexOf(s);
    expect(at('two tiers or three?')).toBeGreaterThan(-1);
    expect(at('>3 replies<')).toBeGreaterThan(at('two tiers or three?'));
    expect(at('Three.')).toBeGreaterThan(at('>3 replies<'));
    expect(at('Sam, your call?')).toBeGreaterThan(at('Two.'));
  });

  it('has a reply box of its own', () => {
    // The chat's editor since w-0d55a2b160, which draws its words, and so its
    // placeholder, only once it is in a window.
    expect(html).toContain('class="chat-thread-input rich-reply"');
    expect(fs.readFileSync(new URL('../renderer/src/team/ThreadPanel.tsx', import.meta.url), 'utf8')).toContain('placeholder="Reply in thread…"');
  });

  it('can be dragged wider or narrower from its left edge', () => {
    expect(html).toMatch(/role="separator"[^>]*aria-orientation="vertical"|aria-orientation="vertical"[^>]*role="separator"/);
    expect(html).toContain('aria-label="Resize thread"');
  });
});

describe('where the panel sits, and its look', () => {
  const css = fs.readFileSync(new URL('../renderer/src/team/chat.css', import.meta.url), 'utf8');

  it('narrows the chat and its reply box rather than covering them', () => {
    expect(css).toMatch(/\.focus-pane\[data-thread="open"\] > \.focus-scroll,\s*\.focus-pane\[data-thread="open"\] > \.focus-dock \{ margin-right: var\(--chat-thread-w\)/);
  });

  it('is square, like everything else in a chat', () => {
    const rule = (name) => { const s = css.slice(css.indexOf(`${name} {`)); return s.slice(0, s.indexOf('}')); };
    expect(rule('.chat-thread-panel')).toContain('border-radius: 0');
    expect(rule('.chat-thread-box')).toContain('border-radius: 0');
  });
});

describe('a reply written on this Mac', () => {
  let root, store;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'thread-'));
    const dir = path.join(root, 'kestrel');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'kestrel', name: 'kestrel' }));
    store = await new Store({ accountRoot: root, products: [] }).init();
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  // ONE LINE, WORDS AND THREAD TOGETHER. Written as two lines, a teammate's pull
  // could land between them and draw the reply in the chat for a moment, and the
  // reply's own uid (the one its reactions hang off) would not be the line that
  // says where it belongs.
  it('goes on the ledger as one line holding both the words and the message it answers', () => {
    const made = store.composeItem('kestrel', { title: 'Launch', body: 'Two tiers or three?' });
    store.answerItem('kestrel', made.id, { answer: 'Three.', inReplyTo: 'u-ask' });
    const mine = store.readHistory('kestrel', made.id).filter((l) => l.patch?.answer);
    expect(mine).toHaveLength(1);
    expect(mine[0].patch).toMatchObject({ answer: 'Three.', inReplyTo: 'u-ask' });
  });

  it('writes a plain message exactly as before', () => {
    const made = store.composeItem('kestrel', { title: 'Launch', body: 'Two tiers or three?' });
    store.answerItem('kestrel', made.id, { answer: 'Morning.' });
    const mine = store.readHistory('kestrel', made.id).filter((l) => l.patch?.answer);
    expect(mine[0].patch).toEqual({ answer: 'Morning.' });
  });
});
