// A reply to a person sat unsent for eight minutes. Someone
// pressed Enter in a chat, as in every chat app, and the box added a line; the
// words stayed there with no name and no time, looking posted, and two replies
// glued into one draft before anyone noticed. Enter now sends with people,
// Shift+Enter is a new line, replies to agents keep their chord, and words waiting
// in a box say they have not gone.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { keyInTheReplyBox, sendKeyFor, unsentWords } from '../renderer/src/reply-keys';
import { chord } from '../renderer/src/this-keyboard';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('which key sends', () => {
  const press = (over) => keyInTheReplyBox({ toPeople: true, key: 'Enter', ...over });
  it('Enter sends to one person or a group', () => expect(press({})).toBe('send'));
  it('Shift+Enter is a new line with people', () => expect(press({ shift: true })).toBe('new line'));
  it('the chord still sends with people', () => {
    expect(press({ meta: true })).toBe('send');
    expect(press({ ctrl: true })).toBe('send');
  });
  it('Enter does NOT send to an agent', () => expect(press({ toPeople: false })).toBe('leave'));
  it('the chord sends to an agent', () => expect(press({ toPeople: false, meta: true })).toBe('send'));
  it('Enter while composing an accent or a kana is the composition', () => expect(press({ composing: true })).toBe('leave'));
  it('another key is left alone', () => expect(press({ key: 'a' })).toBe('leave'));
});

describe('every Send button names the key one way', () => {
  it('people: Enter; agents: the chord', () => {
    expect(sendKeyFor(true)).toBe(chord('↵'));
    expect(sendKeyFor(false)).toBe(chord('⌘↵'));
  });
  it('no box draws its own glyph any more', () => {
    for (const f of ['renderer/src/team/ThreadPanel.tsx', 'renderer/src/team/rooms/RoomChat.tsx']) {
      expect(read(f)).not.toContain('<kbd>↵</kbd>');
      expect(read(f)).toContain('sendKeyFor(true)');
    }
  });
});

describe('words waiting in a box look unsent', () => {
  it('says so when there are words or files', () => {
    expect(unsentWords({ words: 'hello', files: 0, sending: false })).toBe('Not sent yet');
    expect(unsentWords({ words: '', files: 1, sending: false })).toBe('Not sent yet');
  });
  it('says nothing on an empty box, or one with only spaces', () => {
    expect(unsentWords({ words: '', files: 0, sending: false })).toBeNull();
    expect(unsentWords({ words: '  \n', files: 0, sending: false })).toBeNull();
  });
  it('says nothing while it is on its way', () => expect(unsentWords({ words: 'hello', files: 0, sending: true })).toBeNull());
  it('all three boxes draw it', () => {
    for (const f of ['renderer/src/components/Focus.tsx', 'renderer/src/team/ThreadPanel.tsx', 'renderer/src/team/rooms/RoomChat.tsx']) {
      expect(read(f)).toContain('unsentWords(');
    }
  });
});
