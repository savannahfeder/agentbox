// THE WORDS OF A CHAT MESSAGE CAN BE HIGHLIGHTED (w-59b4e9f32a).
//
// "I can't highlight text ... It just treats itself as an image." The app sets
// `user-select: none` on the body and each reading surface opts back in. The
// agent's reading pane does, so a direct chat's own messages could be selected,
// but a room's chat, the Messages page and a direct chat's thread panel are all
// drawn outside it and never opted in. Measured on the built app signed in to a
// made-up team, in the room's chat panel: `.tx` computed `user-select: none`,
// a drag across a message selected "" and a double-click on a word selected "".
//
// The opt-in is on the name, the time and the words, never on the whole
// message or panel, so a face, a reaction chip or the bar's buttons still
// cannot be selected by a drag that starts on them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const rules = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, sel, body]) => ({ sel: sel.split(',').map((s) => s.trim()), body }));
const says = (body, value) => new RegExp(`(^|[;\\s])user-select:\\s*${value}`).test(body)
  && new RegExp(`-webkit-user-select:\\s*${value}`).test(body);
const setTo = (css, selector, value) => rules(css).some((r) => r.sel.includes(selector) && says(r.body, value));

const rooms = read('renderer/src/team/rooms/rooms.css');
const chat = read('renderer/src/team/chat.css');

describe('a message in a room or on the Messages page', () => {
  it('has words that can be selected', () => {
    expect(setTo(rooms, '.rm-cm .tx', 'text')).toBe(true);
  });

  it('has a name and time that can be selected with them', () => {
    expect(setTo(rooms, '.rm-cm .h', 'text')).toBe(true);
  });

  it('keeps the face in its head out of a selection, so its initials are never copied', () => {
    expect(setTo(rooms, '.rm-cm .rm-pic', 'none')).toBe(true);
  });
});

describe('a message in a direct chat’s thread panel', () => {
  it('has a name, time and words that can be selected', () => {
    expect(setTo(chat, '.chat-thread-body .msg-head', 'text')).toBe(true);
    expect(setTo(chat, '.chat-thread-body .msg-body', 'text')).toBe(true);
  });
});

describe('what stays unselectable', () => {
  it('is everything else: the opt-in is never on a whole message, list or panel', () => {
    for (const [css, selector] of [[rooms, '.rm-cm'], [rooms, '.rm-chat'], [rooms, '.rm-chat-list'], [rooms, '.rm-full'],
      [chat, '.chat-msg'], [chat, '.chat-thread-body'], [chat, '.chat-thread-panel'], [chat, '.chat-acts'], [chat, '.chat-chips']]) {
      expect(setTo(css, selector, 'text'), selector).toBe(false);
    }
  });
});
