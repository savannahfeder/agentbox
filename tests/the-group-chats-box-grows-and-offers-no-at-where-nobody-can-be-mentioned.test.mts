// THE GROUP CHAT'S BOX GROWS, AND OFFERS NO @ WHERE NOBODY CAN BE MENTIONED.
//
// The box under a teammate's chat, and under "New teammate", was a one-row
// <textarea> with no formatting bar. It never grew: a long message scrolled
// inside a box two lines tall, cut off at the top. The group chat on the same
// page uses RichReply with FormatBar and grows to its max-height. Measured by
// reading the Composer in TeammatesPage.tsx, which had `rows={1}` and no
// RichReply. The teammate box became the group chat's box, and then the thread
// reply box (a-teammates-reply-box-is-the-thread-reply-box); what holds for
// the group chat's own box is kept here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormatBar } from '../renderer/src/team/FormatBar.tsx';

const bar = (props = {}) => renderToStaticMarkup(React.createElement(FormatBar, { box: { current: null }, onChange: () => {}, ...props }));

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const page = read('renderer/src/teammates/TeammatesPage.tsx');
const rooms = read('renderer/src/team/rooms/rooms.css');

describe('the group chat\'s box', () => {
  it('grows as you write, up to the group box’s ceiling', () => {
    expect(rooms).toMatch(/\.rm-compose-input \{[^}]*max-height: 200px; overflow-y: auto;/);
  });
  it('offers no @ where there is nobody to mention', () => {
    expect(bar({ mention: false })).not.toMatch(/Mention someone/);
    expect(bar({ mention: false })).toMatch(/Add an emoji/);
  });
  it('keeps the @ in every other box', () => {
    expect(bar()).toMatch(/Mention someone/);
  });
  it('is not used for the job and voice fields, which stay plain text fields', () => {
    expect(page).toMatch(/<textarea className="tq-field" rows=\{6\}/);
    expect(page).toMatch(/<textarea className="tq-field tq-voice-own"/);
  });
});
