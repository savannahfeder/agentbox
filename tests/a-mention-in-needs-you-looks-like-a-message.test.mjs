// A MENTION IN NEEDS YOU LOOKS LIKE A MESSAGE FROM A TEAMMATE.
//
// The row for a room message that names you was reported as looking buggy.
// Photographed in the built renderer beside a teammate's message row: its face
// was the room wall's 18px square with 5.5px letters, pushed 4px below the
// line, where the message row draws a 20px face with 9px letters on the line;
// its Status cell was empty where the message row says Waiting; it had no new
// mark though it only exists while unread; and the hairline under it was
// missing, because the threads below sit in their own group box and
// `.row + .row` never sees the mention above them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MentionRows } from '../renderer/src/team/rooms/MentionRows.tsx';

const NOW = Date.UTC(2026, 9, 21, 12, 0);
const mention = (over = {}) => ({
  id: 'room-mention:m1', messageId: 'm1', roomId: 'r-astral', roomName: 'Astral', by: 'u-maya', byName: 'Maya C.',
  body: '@Sam R. im visible now. my card says NOT RUNNING tho', at: NOW - 60_000, ...over,
});
const draw = (mentions, faces = new Map()) => renderToStaticMarkup(React.createElement(MentionRows, { mentions, faces, now: NOW, onOpen: () => {} }));

describe('a mention row', () => {
  it('draws the face a message row draws, not the room wall’s small square', () => {
    const html = draw([mention()]);
    expect(html).toMatch(/<span class="tm-av"[^>]*>Ma<\/span>/);
    expect(html).not.toContain('rm-pic');
  });

  it('draws their photo the way a message row does when they have one', () => {
    const html = draw([mention()], new Map([['u-maya', 'https://example.com/maya.png']]));
    expect(html).toContain('class="tm-av tm-ph" src="https://example.com/maya.png"');
  });

  it('says Waiting in the Status column, like a message waiting on you', () => {
    expect(draw([mention()])).toMatch(/class="th-cell-state"[^>]*>Waiting</);
  });

  it('wears the new mark, because it only shows while unread', () => {
    expect(draw([mention()])).toMatch(/class="row rm-mention unread"/);
  });

  it('names someone who left no name as Someone, and draws their face from that word', () => {
    const html = draw([mention({ by: null, byName: '' })]);
    expect(html).toContain('<b class="th-msg-who">Someone</b>');
    expect(html).toMatch(/<span class="tm-av"[^>]*>So<\/span>/);
  });
});

describe('the hairline under a mention', () => {
  const css = fs.readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');

  it('is drawn over the first thread below it, which sits in its own group', () => {
    expect(css).toMatch(/\.th-table \.rm-mention \+ div > \.row:first-child::after\s*\{[^}]*content: ''/);
  });
});
