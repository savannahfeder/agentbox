// A TEAMMATE'S REPLY BOX IS THE GROUP CHAT'S BOX.
//
// The box under a teammate's chat, and under "New teammate", was a one-row
// <textarea> with no formatting bar. It never grew: a long message scrolled
// inside a box two lines tall, cut off at the top. The group chat on the same
// page uses RichReply with FormatBar and grows to its max-height. Measured by
// reading the Composer in TeammatesPage.tsx, which had `rows={1}` and no
// RichReply.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormatBar } from '../renderer/src/team/FormatBar.tsx';

const bar = (props = {}) => renderToStaticMarkup(React.createElement(FormatBar, { box: { current: null }, onChange: () => {}, ...props }));

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const page = read('renderer/src/teammates/TeammatesPage.tsx');
const css = read('renderer/src/teammates/teammates.css');
const rooms = read('renderer/src/team/rooms/rooms.css');
const composer = /function Composer\([\s\S]*?\n}\n/.exec(page)?.[0] ?? '';

describe('the reply box in a teammate chat', () => {
  it('is the editor the group chat uses, with its formatting bar', () => {
    expect(composer).toMatch(/<RichReply className="rm-compose-input tq-input"/);
    expect(composer).toMatch(/<FormatBar /);
    expect(composer).not.toMatch(/<textarea/);
  });
  it('grows as you write, up to the group box’s ceiling', () => {
    expect(rooms).toMatch(/\.rm-compose-input \{[^}]*max-height: 200px; overflow-y: auto;/);
    const own = /\.rm-compose-input\.tq-input \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(own).not.toMatch(/(^|[\s;])(max-|min-)?height:/);
    expect(own).not.toMatch(/overflow/);
  });
  it('still sends on Enter and keeps Shift+Enter for a new line', () => {
    expect(composer).toMatch(/e\.key === 'Enter' && !e\.shiftKey\) \{ e\.preventDefault\(\); void send\(\); return true; \}/);
  });
  it('offers no @, since a teammate chat has nobody to mention', () => {
    expect(composer).toMatch(/<FormatBar [^>]*mention=\{false\}/);
    expect(bar({ mention: false })).not.toMatch(/Mention someone/);
    expect(bar({ mention: false })).toMatch(/Add an emoji/);
  });
  it('keeps the @ in every other box', () => {
    expect(bar()).toMatch(/Mention someone/);
  });
  it('leaves the job and voice fields as plain text fields', () => {
    expect(page).toMatch(/<textarea className="tq-field" rows=\{6\}/);
    expect(page).toMatch(/<textarea className="tq-field tq-voice-own"/);
  });
});
