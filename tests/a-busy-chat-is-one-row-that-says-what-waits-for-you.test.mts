// A BUSY CHAT IS ONE ROW, AND THE ROW SAYS WHAT IS WAITING FOR YOU.
//
// Asked on 2026-10-05 (w-920461cbe6), the day threads shipped: "what happens in
// the event where a chat is very active? Let's say you're in a chat, and three
// people reply to your thread, and some other people respond in the chat
// itself. What ends up in your inbox? We don't want to overcrowd the user...
// it's easy to miss threads. You also don't want a bunch of messages for one
// concept." Then, approving the advice: "as the chat evolves the ticket you see
// should evolve (and the preview in the board/inbox). build it".
//
// WHAT WAS WRONG, measured on the rule as it stood (`lastSpeaker`, the newest
// answer on the row, whoever wrote it, wherever):
//   - a reply in a thread you are not in pulled the whole chat into your inbox;
//   - your own reply in the main chat took the chat OUT of your inbox while
//     three people were still waiting on you in your thread;
//   - the row read only the newest line, so a thread reply hid behind the chat
//     or the chat behind a thread reply.
//
// THE RULE NOW, all of it read off who spoke where, with nothing new stored:
//   1. still one row per chat;
//   2. a thread counts only for the people in it (who wrote the message it
//      hangs off, and who replied);
//   3. the chat waits on you while someone else spoke last in the main chat, or
//      in any thread you are in;
//   4. the row and the board card say what is waiting, in words, and change as
//      the chat does;
//   5. opening the chat marks the threads with replies to you, and when one
//      thread is the only news it opens by itself.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { foldWorkItems } from '../shared/work-items.mjs';
import { inMyInbox, iSpokeLast, whatWaits } from '../shared/team-rules.mjs';
import { messageLine } from '../renderer/src/threads/page-rules.ts';
import { threadToOpen } from '../renderer/src/team/chat-threads.ts';
import { ThreadLine } from '../renderer/src/team/ThreadPanel.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';

const ID = 'w-abcdef1234';
const ME = 'p-me', MAYA = 'p-maya', THEO = 'p-theo', JUN = 'p-jun', ANA = 'p-ana';
const NAMES = { [ME]: 'Sam', [MAYA]: 'Maya', [THEO]: 'Theo', [JUN]: 'Jun', [ANA]: 'Ana' };
const nameOf = (id) => NAMES[id] ?? 'Someone';
const DIRECT = { slug: 'direct-c0ffee01', name: 'Direct', team: { projectId: 'c0ffee01', teamId: 't1', people: [ME, MAYA, THEO, JUN, ANA], sharedBy: ME, direct: true } };
const SHARED = { slug: 'northwind', name: 'Northwind', team: { projectId: 'nw', teamId: 't1', people: [], sharedBy: ME } };

let clock = 1_000_000;
const tick = () => (clock += 60_000);
const open = (by, text) => ({ id: ID, ts: tick(), source: 'founder', by, uid: `u-open`, patch: { title: 'Launch', body: text, status: 'open', kind: 'directive', people: [ME, MAYA, THEO, JUN, ANA] } });
const say = (by, uid, text, inReplyTo) => ({ id: ID, ts: tick(), source: 'founder', by, uid, patch: inReplyTo ? { answer: text, inReplyTo } : { answer: text } });
const fold = (lines) => foldWorkItems(lines).get(ID);

// Her example: you ask the pricing question, three people answer it in the
// thread, and the chat carries on about other things meanwhile.
const BUSY = () => [
  open(MAYA, 'The launch cut is on the drive.'),
  say(ME, 'u-ask', 'Two tiers or three for the pricing page?'),
  say(THEO, 'u-r1', 'Three.', 'u-ask'),
  say(ANA, 'u-c1', 'Press list is done.'),
  say(JUN, 'u-r2', 'Two.', 'u-ask'),
  say(MAYA, 'u-r3', 'Sam, your call?', 'u-ask'),
  say(ANA, 'u-c2', 'Sending it to the agent.'),
  say(THEO, 'u-c3', 'Logo swapped on the last frame.'),
];

describe('what the chat remembers about who spoke where', () => {
  it('keeps the main chat and each thread apart', () => {
    const talk = fold(BUSY()).talk;
    expect(talk.chat.map((s) => s.by)).toEqual([MAYA, ME, ANA, ANA, THEO]);
    expect(talk.threads['u-ask'].by).toBe(ME);
    expect(talk.threads['u-ask'].text).toBe('Two tiers or three for the pricing page?');
    expect(talk.threads['u-ask'].replies.map((s) => s.by)).toEqual([THEO, JUN, MAYA]);
  });

  it('keeps the newest line of each, for the row to say', () => {
    const talk = fold(BUSY()).talk;
    expect(talk.chat.at(-1).text).toBe('Logo swapped on the last frame.');
    expect(talk.threads['u-ask'].replies.at(-1).text).toBe('Sam, your call?');
  });

  // ONLY ON A CONVERSATION. An agent's task has no people on it, and carrying
  // a record of every line of every task to the window would be pure weight.
  it('is not kept on a row that has no people on it', () => {
    const task = [
      { id: ID, ts: tick(), source: 'founder', by: ME, uid: 'u-t', patch: { title: 'Fix the build', body: 'It is red.' } },
      { id: ID, ts: tick(), source: 'founder', by: ME, uid: 'u-t2', patch: { answer: 'Any luck?' } },
    ];
    expect(fold(task).talk).toBeUndefined();
  });
});

describe('whose inbox a busy chat is in', () => {
  it('is yours when three people answered your thread and others carried on in the chat', () => {
    expect(inMyInbox(fold(BUSY()), DIRECT, ME)).toBe(true);
  });

  // THE THREAD YOU WOULD HAVE MISSED. Today's rule reads only the newest
  // message, so this reply put the chat in Done with your thread unanswered.
  it('stays yours after you reply in the chat, because your thread still waits on you', () => {
    const lines = [...BUSY(), say(ME, 'u-m1', 'Ship Friday.')];
    expect(inMyInbox(fold(lines), DIRECT, ME)).toBe(true);
    expect(iSpokeLast(fold(lines), DIRECT, ME)).toBe(false);
  });

  it('leaves your inbox once you have answered both the chat and your thread', () => {
    const lines = [...BUSY(), say(ME, 'u-m1', 'Ship Friday.'), say(ME, 'u-r4', 'Three it is.', 'u-ask')];
    expect(inMyInbox(fold(lines), DIRECT, ME)).toBe(false);
    expect(iSpokeLast(fold(lines), DIRECT, ME)).toBe(true);
  });

  // THE CASE THAT MUST NOT PULL YOU IN. Ana and Jun talking in Ana's thread is
  // not yours to process, and you see it whenever you open the chat.
  it('is not yours because of a thread you are not in', () => {
    const lines = [
      open(MAYA, 'Morning.'),
      say(ANA, 'u-q', 'Who has the press list?'),
      say(ME, 'u-m', 'Ship Friday.'),
      say(JUN, 'u-a', 'I do.', 'u-q'),
    ];
    expect(inMyInbox(fold(lines), DIRECT, ME)).toBe(false);
    // ...and it is Ana's, whose thread got the answer.
    expect(inMyInbox(fold(lines), DIRECT, ANA)).toBe(true);
  });

  it('is yours again when someone answers in a thread you replied in', () => {
    const lines = [
      open(MAYA, 'Morning.'),
      say(ANA, 'u-q', 'Who has the press list?'),
      say(ME, 'u-a1', 'Not me.', 'u-q'),
      say(ME, 'u-m', 'Ship Friday.'),
      say(JUN, 'u-a2', 'I do.', 'u-q'),
    ];
    expect(inMyInbox(fold(lines), DIRECT, ME)).toBe(true);
  });

  it('is nobody’s once it is put away', () => {
    const lines = [...BUSY(), { id: ID, ts: tick(), source: 'founder', by: ME, uid: 'u-done', patch: { status: 'done' } }];
    expect(inMyInbox(fold(lines), DIRECT, ME)).toBe(false);
  });

  it('reads a conversation from before threads exactly as it always did', () => {
    const old = { id: ID, status: 'open', createdBy: MAYA, wrote: { answer: { ts: 5, by: MAYA } } };
    expect(inMyInbox(old, DIRECT, ME)).toBe(true);
    expect(inMyInbox(old, DIRECT, MAYA)).toBe(false);
  });

  it('leaves an ordinary shared task to its own rule', () => {
    const task = { ...fold(BUSY()), assignee: THEO };
    expect(inMyInbox(task, SHARED, ME)).toBe(false);
  });
});

describe('what is waiting, counted', () => {
  it('counts the chat since you last spoke in it, and each of your threads since you last spoke in it', () => {
    const waits = whatWaits(fold(BUSY()), ME);
    expect(waits.chat).toBe(3);
    expect(waits.threads).toEqual([{ uid: 'u-ask', mine: true, fresh: 3, people: [THEO, JUN, MAYA], text: 'Two tiers or three for the pricing page?', last: 'Sam, your call?', lastBy: MAYA }]);
  });

  it('counts nothing in a chat you have answered', () => {
    const waits = whatWaits(fold([...BUSY(), say(ME, 'u-m1', 'Ship Friday.'), say(ME, 'u-r4', 'Three.', 'u-ask')]), ME);
    expect(waits).toEqual({ chat: 0, threads: [] });
  });
});

describe('the row in the inbox and the card on the board', () => {
  const line = (lines, me = ME) => messageLine(fold(lines), DIRECT, me, nameOf).text;

  // PICKED 2026-10-05, her words: "I prefer Maya in your thread, Sam, your
  // call." One clause, the newest reply and who wrote it. The shipped line
  // before it joined two things with a dot ("Theo, Jun and Maya replied in your
  // thread · 3 new in the chat") and she found it messy.
  it('says who wrote the newest reply in your thread, and what they said', () => {
    expect(line(BUSY())).toBe('Maya in your thread: Sam, your call?');
  });

  // THE CASE THAT MUST NOT COME BACK: no second clause about the chat.
  it('never joins the chat’s news onto the thread’s', () => {
    expect(line(BUSY())).not.toMatch(/·|new in the chat/);
  });

  it('says the same when your thread is the only news', () => {
    const lines = [...BUSY(), say(ME, 'u-m1', 'Ship Friday.')];
    expect(line(lines)).toBe('Maya in your thread: Sam, your call?');
  });

  // The main chat's newest line, never a thread reply standing in for it.
  it('says the chat’s newest line when the chat is the only news', () => {
    const lines = [...BUSY(), say(ME, 'u-r4', 'Three it is.', 'u-ask'), say(ANA, 'u-c4', 'Deck is updated.'), say(JUN, 'u-r5', 'Fine by me.', 'u-ask'), say(ME, 'u-r6', 'Great.', 'u-ask')];
    expect(line(lines)).toBe('Deck is updated.');
  });

  it('says "a thread" for one you are in but did not start', () => {
    const lines = [open(MAYA, 'Morning.'), say(ANA, 'u-q', 'Who has the press list?'), say(ME, 'u-a1', 'Not me.', 'u-q'), say(ME, 'u-m', 'Ship Friday.'), say(JUN, 'u-a2', 'I do.', 'u-q')];
    expect(line(lines)).toBe('Jun in a thread: I do.');
  });

  it('takes the newest reply when several of your threads wait', () => {
    const lines = [...BUSY(), say(ME, 'u-ask2', 'And the launch date?'), say(ANA, 'u-r9', 'The 14th.', 'u-ask2')];
    expect(line(lines)).toBe('Ana in your thread: The 14th.');
  });

  it('names only the person whose words it shows', () => {
    const lines = [open(MAYA, 'Morning.'), say(ME, 'u-ask', 'Lunch?'), say(THEO, 'a', 'Yes', 'u-ask'), say(JUN, 'b', 'Yes', 'u-ask'), say(MAYA, 'c', 'No', 'u-ask'), say(ANA, 'd', 'Yes', 'u-ask')];
    expect(line(lines)).toBe('Ana in your thread: Yes');
  });

  // AS THE CHAT EVOLVES, SO DOES THE ROW. The same row, read after each
  // message, says what is newest of what waits on you.
  it('changes as the chat does', () => {
    const lines = [open(MAYA, 'Morning.'), say(ME, 'u-ask', 'Two tiers or three?')];
    const said = [];
    for (const next of [say(THEO, 'r1', 'Three.', 'u-ask'), say(JUN, 'r2', 'Two.', 'u-ask'), say(ANA, 'c1', 'Deck is up.'), say(ME, 'r3', 'Three it is.', 'u-ask')]) {
      lines.push(next);
      said.push(line(lines));
    }
    expect(said).toEqual([
      'Theo in your thread: Three.',
      'Jun in your thread: Two.',
      'Jun in your thread: Two.',
      'Deck is up.',
    ]);
  });

  it('keeps saying your own newest line once nothing waits on you', () => {
    const lines = [...BUSY(), say(ME, 'u-r4', 'Three it is.', 'u-ask'), say(ME, 'u-m1', 'Ship Friday.')];
    const said = messageLine(fold(lines), DIRECT, ME, nameOf);
    expect(said.text).toBe('Ship Friday.');
    expect(said.fromMe).toBe(true);
  });

  // ONE LINE AT MOST, her words: "condense it so it always only takes up one
  // line at most." The words are not cut here (the width decides where); the
  // line under the names in the list and on the board card stops at its edge
  // with an ellipsis.
  it('is drawn on one line with an ellipsis, in the list and on the board', () => {
    const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
    const rule = (sel) => { const at = css.indexOf(`${sel} {`); expect(at).toBeGreaterThan(-1); return css.slice(at, css.indexOf('}', at)); };
    // The list's cell already held its line; the board card's wrapped.
    for (const sel of ['.th-cell-title', '.th-card .th-msg-text']) {
      expect(rule(sel)).toContain('white-space: nowrap');
      expect(rule(sel)).toContain('overflow: hidden');
      expect(rule(sel)).toContain('text-overflow: ellipsis');
    }
  });
});

describe('opening a busy chat', () => {
  it('opens the thread by itself when it is the only news', () => {
    expect(threadToOpen(whatWaits(fold([...BUSY(), say(ME, 'u-m1', 'Ship Friday.')]), ME))).toBe('u-ask');
  });

  it('leaves the chat in front when the chat has news too', () => {
    expect(threadToOpen(whatWaits(fold(BUSY()), ME))).toBe(null);
  });

  it('leaves the choice to you when two threads wait', () => {
    const lines = [...BUSY(), say(ME, 'u-m1', 'Ship Friday.'), say(ME, 'u-ask2', 'And the date?'), say(ANA, 'u-r9', 'The 14th.', 'u-ask2')];
    expect(threadToOpen(whatWaits(fold(lines), ME))).toBe(null);
  });

  it('marks a thread with replies to you by how many are new', () => {
    const team = { me: ME, byId: new Map(), products: new Map(), state: {} };
    const replies = [{ at: 1, who: 'you', by: THEO, text: 'Three.' }, { at: 2, who: 'you', by: JUN, text: 'Two.' }];
    const draw = (fresh) => renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
      React.createElement(ThreadLine, { replies, open: false, onOpen: () => {}, fresh })));
    expect(draw(2)).toContain('>2 new replies<');
    expect(draw(2)).toContain('chat-thread-line fresh');
    expect(draw(0)).toContain('>2 replies<');
    expect(draw(0)).not.toContain('fresh');
  });
});
