// SEVERAL MESSAGES FROM ONE PERSON ARE ONE ROW IN NEEDS YOU (w-c25981f113).
//
// Four messages a teammate sent in one room, each naming you, were four rows
// at the top of Needs you and counted four times, though opening any of them
// opened the same room. Measured off the inbox screenshot attached to the
// task: four Maya C. rows in # Astral, sent 13, 12, 5 and 3 minutes ago.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mentionRows } from '../renderer/src/team/rooms/room-rules.ts';
import { MentionRows } from '../renderer/src/team/rooms/MentionRows.tsx';

const NOW = Date.UTC(2026, 9, 23, 12, 0);
const MIN = 60_000;
const said = (n, over = {}) => ({
  id: `room-mention:m${n}`, messageId: `m${n}`, roomId: 'r-astral', roomName: 'Astral', by: 'u-maya', byName: 'Maya C.',
  body: `message ${n}`, at: NOW - (20 - n) * MIN, ...over,
});
const draw = (rows) => renderToStaticMarkup(React.createElement(MentionRows, { mentions: rows, faces: new Map(), now: NOW, onOpen: () => {} }));

describe('mention rows', () => {
  it('are one row for four messages from one person in one room, saying the newest and how many', () => {
    const rows = mentionRows([said(4), said(3), said(2), said(1)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ roomId: 'r-astral', by: 'u-maya', body: 'message 4', at: NOW - 16 * MIN, messageId: 'm4', count: 4 });
  });

  it('do not depend on the order the messages arrive in', () => {
    expect(mentionRows([said(1), said(3), said(4), said(2)])[0]).toMatchObject({ body: 'message 4', count: 4 });
  });

  it('keep one message alone as it always was', () => {
    expect(mentionRows([said(1)])).toEqual([{ ...said(1), id: 'room-mention:r-astral:u-maya', count: 1 }]);
  });

  it('keep two people in one room apart', () => {
    const rows = mentionRows([said(2), said(1, { by: 'u-theo', byName: 'Theo B.' })]);
    expect(rows.map((r) => [r.byName, r.count])).toEqual([['Maya C.', 1], ['Theo B.', 1]]);
  });

  it('keep one person in two rooms apart, since each row opens its own room', () => {
    const rows = mentionRows([said(3), said(2, { roomId: 'r-general', roomName: 'General' }), said(1)]);
    expect(rows.map((r) => [r.roomName, r.count])).toEqual([['Astral', 2], ['General', 1]]);
  });

  it('put the person who spoke last on top', () => {
    const rows = mentionRows([said(4, { by: 'u-theo', byName: 'Theo B.' }), said(3), said(2, { by: 'u-theo', byName: 'Theo B.' }), said(1)]);
    expect(rows.map((r) => [r.byName, r.count])).toEqual([['Theo B.', 2], ['Maya C.', 2]]);
  });

  it('keep a stable key while more messages arrive, so the row does not flash', () => {
    expect(mentionRows([said(1), said(2)])[0].id).toBe(mentionRows([said(1), said(2), said(3)])[0].id);
  });
});

describe('a mention row with several messages', () => {
  it('says who sent how many, in place of what they said', () => {
    const html = draw(mentionRows([said(3), said(2), said(1)]));
    expect(html).toContain('<b class="th-msg-who">Maya C.</b><span class="th-msg-text">sent you 3 messages</span>');
    expect(html).not.toContain('>message 3<');
  });

  it('says it for two', () => {
    expect(draw(mentionRows([said(2), said(1)]))).toContain('>sent you 2 messages<');
  });

  it('shows the message itself when there is one', () => {
    const html = draw(mentionRows([said(1)]));
    expect(html).toContain('<span class="th-msg-text">message 1</span>');
    expect(html).not.toContain('sent you');
  });
});
