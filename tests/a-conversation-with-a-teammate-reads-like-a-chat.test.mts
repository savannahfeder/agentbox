// A CONVERSATION WITH A TEAMMATE READS LIKE A CHAT, NOT LIKE AN AGENT THREAD.
//
// Reported 2026-10-05 (w-2e8aa16f0f) with a screenshot of the first real
// conversation between two teammates: "It looks very ugly ... the dividers are
// weird." Measured in the built app with the same conversation: every `---`
// in a message drew the browser's own 2px grooved rule at full width (the
// message body had no rule style at all), the sender wore an 18px face beside a
// first name, and your own messages took the agent thread's "chapters" look,
// a hairline above and below each one and the text a step larger and bolder,
// which marks the turns in a conversation with an agent and means nothing
// between two people.
//
// Approved as drawing A of round two: a square face in a column on the left,
// the full name and the time once per run of messages, a run being one
// person's messages within ten minutes of each other, a quiet day line, a soft
// rule, and none of the agent thread's chapters.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chatLayout, RUN_GAP_MS } from '../renderer/src/team/chat-layout.ts';
import { Thread } from '../renderer/src/components/Thread.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';

const NOW = new Date(2026, 9, 5, 15, 0).getTime();
const at = (h, m, dayBack = 0) => new Date(2026, 9, 5 - dayBack, h, m).getTime();
const MIN = 60_000;
const ME = 'p-me', MAYA = 'p-maya';
const said = (by, when, text) => ({ at: when, who: 'you', by, text });
const act = (when) => ({ kind: 'work', at: when, verb: 'You shared it', subject: '', output: '', lines: 0, failed: false, yours: true, by: ME });

describe('the chat layout rule', () => {
  it('opens the first message with its day and a head', () => {
    expect(chatLayout([said(MAYA, at(4, 21), 'hi')], NOW)).toEqual([{ day: 'Today', head: true }]);
  });

  it('runs one person’s messages together inside ten minutes', () => {
    const slots = chatLayout([said(MAYA, at(4, 21), 'a'), said(MAYA, at(4, 25), 'b')], NOW);
    expect(slots[1]).toEqual({ day: null, head: false });
  });

  it('gives a message its own head at the boundary and past it', () => {
    const start = at(4, 0);
    expect(chatLayout([said(MAYA, start, 'a'), said(MAYA, start + RUN_GAP_MS, 'b')], NOW)[1].head).toBe(false);
    expect(chatLayout([said(MAYA, start, 'a'), said(MAYA, start + RUN_GAP_MS + MIN, 'b')], NOW)[1].head).toBe(true);
  });

  it('starts a new run when the other person speaks, however soon', () => {
    expect(chatLayout([said(MAYA, at(4, 21), 'a'), said(ME, at(4, 22), 'b')], NOW)[1].head).toBe(true);
  });

  it('starts a new day with its day line and a head, even for the same person', () => {
    const slots = chatLayout([said(MAYA, at(23, 58, 1), 'a'), said(MAYA, at(0, 1), 'b')], NOW);
    expect(slots).toEqual([{ day: 'Yesterday', head: true }, { day: 'Today', head: true }]);
  });

  it('lets something you did in between end the run', () => {
    const slots = chatLayout([said(MAYA, at(4, 21), 'a'), act(at(4, 22)), said(MAYA, at(4, 23), 'b')], NOW);
    expect(slots[2].head).toBe(true);
  });
});

const team = {
  state: {}, me: ME,
  byId: new Map([[ME, { id: ME, name: 'Sam Rivera', email: '', avatarUrl: null }], [MAYA, { id: MAYA, name: 'Maya Chen', email: '', avatarUrl: null }]]),
  products: new Map(),
};
const draw = (events, chat) => {
  // Launch QA found one failure after the fixture's day passed: the renderer
  // used the real clock while the layout assertions used NOW. Share its clock.
  const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
  try {
    return renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team },
      React.createElement(Thread, { events, chat, name: 'Claude Code', landOn: 'w-1', onWhole: () => {}, md: (t) => React.createElement('p', null, t) })));
  } finally { clock.mockRestore(); }
};
const conversation = [
  said(MAYA, at(4, 21), 'Sending my findings here.'),
  said(MAYA, at(4, 24), 'One more.'),
  said(ME, at(9, 12), 'Got them all, thank you.'),
];

describe('a conversation with a teammate, drawn', () => {
  const html = draw(conversation, true);

  it('puts a face in the column for each run, theirs and yours', () => {
    expect(html.match(/class="chat-gutter"><span class="tm-av lg"/g)).toHaveLength(1);
    expect(html.match(/class="chat-gutter"><span class="tm-av you lg"/g)).toHaveLength(1);
  });

  it('names a teammate in full and you as You, once per run', () => {
    expect(html.match(/class="msg-head"/g)).toHaveLength(2);
    expect(html).toContain('>Maya Chen<');
    expect(html).toContain('>You<');
  });

  it('draws the day once, above the first message', () => {
    expect(html.match(/class="chat-day"/g)).toHaveLength(1);
    expect(html).toContain('>Today<');
  });

  it('does not frame your messages as an agent thread’s chapters', () => {
    expect(html).not.toMatch(/class="msg [^"]*\b(turn|turn-end|yours)\b/);
  });

  it('leaves a thread with an agent as it was', () => {
    const agent = draw([said(undefined, at(9, 0), 'Do the thing.'), { at: at(9, 1), who: 'it', text: 'Done.' }], false);
    expect(agent).not.toContain('chat-msg');
    expect(agent).toMatch(/class="msg yours/);
  });
});

describe('the chat’s own rule line', () => {
  it('is a soft hairline, not the browser’s grooved default', () => {
    const css = fs.readFileSync(new URL('../renderer/src/team/chat.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.chat-msg \.msg-body hr \{[^}]*border: 0;[^}]*border-top: 1px solid var\(--line\)/);
  });
});
