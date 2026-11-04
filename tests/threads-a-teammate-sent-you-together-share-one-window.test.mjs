// "They don't really look to me like our elements in the inbox and they don't
// really have that feel." Round 11 drew what a teammate sent you as bare rows
// under its message, and the pictures showed the teammate's name in a grey box
// (the chat's bold style reached into the row) and rows 10px shorter than the
// inbox's. Of five looks drawn from the inbox's own parts (round 12) the
// founder picked look 2: a window onto the inbox, the tab the thread is in
// over its inbox row. Measured on the stage against the inbox: the same
// 19/15px row padding, and the name with no fill behind it.
//
// 2026-11-01: the owner, on the team version, called the embedded row clutter,
// so the window is now quiet lines
// (a-thread-a-teammate-sent-you-is-one-quiet-line-in-its-chat). What stays from
// here: threads sent one after another share one window, split only by a
// message or a day.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { runLines, statusOf, teammateLabel } from '../shared/teammates.mjs';

vi.mock('../renderer/src/api', () => ({ api: new Proxy({}, { get: () => async () => ({ ok: false }) }) }));
const { TeammatesPage } = await import('../renderer/src/teammates/TeammatesPage.tsx');
const { TeammatesContext } = await import('../renderer/src/teammates/row-lead.tsx');

const MIN = 60_000;
// ON A CLOCK OF ITS OWN, because the chat starts a new window where a day ends.
// The two threads here are 20 and 14 minutes old, so off `Date.now()` they
// straddled midnight for seven minutes a day and the day heading landed between
// them. Measured at 00:17 in the suite's Pacific zone: two windows; at noon: one.
const NOON = Date.parse('2026-10-30T19:00:00Z');
const JUST_PAST_MIDNIGHT = Date.parse('2026-10-30T07:17:00Z');
const mate = { id: 't-a1a1a1a1a1', name: 'Marketing lead', letter: 'M', product: 'kestrel', status: 'active', paused: false, served: '', limit: 40, works: null, memory: [], playbooks: [], duties: [] };
const sent = (now, id, said, ago) => ({
  id, product: 'kestrel', status: 'open', kind: 'directive', labels: ['founder', teammateLabel(mate.id), 'hop:0'], priority: null, title: 'Launch video',
  result: `**${said}**\n\nMore words.`, createdAt: now - ago - MIN, updatedAt: now - ago, wrote: { result: { ts: now - ago, source: 'agent' } },
});
const itemsAt = (now, apart = [20 * MIN, 14 * MIN]) => [
  sent(now, 'w-cuts', 'Two cuts of the launch video are ready', apart[0]),
  sent(now, 'w-posts', 'Three posts for tomorrow are ready', apart[1]),
];
const products = [{ slug: 'kestrel', name: 'Kestrel' }];

function draw({ chat = [], tabOf = () => 'inbox', now = NOON, apart } = {}) {
  const items = itemsAt(now, apart);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  try {
    const view = { list: [{ ...mate, ...statusOf(mate, items, now) }], chat, runs: runLines(items, [mate]), playbooks: [] };
    // The app hands every row its teammates, as it does the inbox's.
    return renderToStaticMarkup(React.createElement(TeammatesContext.Provider, { value: new Map([[mate.id, mate]]) }, React.createElement(TeammatesPage, {
      view, items, open: mate.id, products, engines: [], me: 'Sam', onOpen() {}, onOpenThread() {}, onChanged() {}, tabOf, onOpenList() {},
    })));
  } finally { clock.mockRestore(); }
}

describe('a thread a teammate sent you, in its chat', () => {
  it('puts threads sent one after another in one window, and a message between them starts a new one', () => {
    expect(draw().match(/class="tq-sent"/g)).toHaveLength(1);
    const between = { id: 'c1', kind: 'msg', from: mate.id, to: [], text: 'I wrote three posts.', ts: NOON - 16 * MIN };
    const html = draw({ chat: [between] });
    expect(html.match(/class="tq-sent"/g)).toHaveLength(2);
    // The window stands on its own, so the message after it names who wrote it.
    expect(html).toMatch(/<div class="rm-cm tq-m"><div class="h">[\s\S]*?<span>Marketing lead<\/span>[\s\S]*?I wrote three posts\./);
  });

  it('starts a second window where a day ends, and only there', () => {
    // 00:17: the older thread is yesterday, the newer today, so each sits
    // under its own day. This is the split that read as a broken test.
    const over = draw({ now: JUST_PAST_MIDNIGHT });
    expect(over.match(/class="tq-sent"/g)).toHaveLength(2);
    expect(over).toMatch(/rm-label">Yesterday<[\s\S]*?class="tq-sent"[\s\S]*?rm-label">Today<[\s\S]*?class="tq-sent"/);
    // The other side of the same boundary: both threads after midnight, one window.
    expect(draw({ now: JUST_PAST_MIDNIGHT, apart: [12 * MIN, 6 * MIN] }).match(/class="tq-sent"/g)).toHaveLength(1);
  });

});
