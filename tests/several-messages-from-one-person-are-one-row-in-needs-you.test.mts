// SEVERAL MESSAGES IN ONE GROUP ARE ONE ROW IN NEEDS YOU (w-c25981f113).
//
// Four messages a teammate sent in one room, each naming you, were four rows
// at the top of Needs you and counted four times, though opening any of them
// opened the same room. Measured off the inbox screenshot attached to the
// task: four Maya C. rows in # Astral, sent 13, 12, 5 and 3 minutes ago. A Mac's
// rooms now give one row a group; a phone's still give one a message, and this
// folds them.
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
  it('are one row for four messages in one group, saying the newest', () => {
    const rows = mentionRows([said(4), said(3), said(2), said(1)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'room-mention:r-astral', roomId: 'r-astral', by: 'u-maya', body: 'message 4', at: NOW - 16 * MIN, messageId: 'm4' });
  });

  it('do not depend on the order the messages arrive in', () => {
    expect(mentionRows([said(1), said(3), said(4), said(2)])[0]).toMatchObject({ body: 'message 4' });
  });

  it('are one row for two people in one group, and it names whoever wrote last', () => {
    const rows = mentionRows([said(2), said(1, { by: 'u-theo', byName: 'Theo B.' })]);
    expect(rows.map((r) => r.byName)).toEqual(['Maya C.']);
  });

  it('keep two groups apart, since each row opens its own', () => {
    const rows = mentionRows([said(3), said(2, { roomId: 'r-general', roomName: 'General' }), said(1)]);
    expect(rows.map((r) => r.roomName)).toEqual(['Astral', 'General']);
  });

  it('put the group spoken in last on top', () => {
    const rows = mentionRows([said(4, { roomId: 'r-general', roomName: 'General' }), said(3)]);
    expect(rows.map((r) => r.roomName)).toEqual(['General', 'Astral']);
  });

  it('keep a stable key while more messages arrive, so the row does not flash', () => {
    expect(mentionRows([said(1), said(2)])[0].id).toBe(mentionRows([said(1), said(2), said(3)])[0].id);
  });
});

describe('a mention row', () => {
  it('shows the newest words and who wrote them, not a count', () => {
    const html = draw(mentionRows([said(3), said(2), said(1)]));
    expect(html).toContain('<b class="th-msg-who">Maya C.</b><span class="th-msg-text">message 3</span>');
    expect(html).not.toContain('sent you');
  });
});
