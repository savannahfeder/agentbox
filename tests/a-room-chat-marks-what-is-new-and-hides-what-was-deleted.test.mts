// A ROOM'S CHAT MARKS WHAT IS NEW AND HIDES WHAT WAS DELETED.
//
// A room's chat had no New line, so opening a busy room gave no hint where you
// had read to, and messages could not be deleted at all. Measured here: the
// New line sits above the first message someone else wrote after your read
// point, never above your own or a reply in a thread; a deleted message is
// drawn only while replies hang off it; an @name becomes a mention link and an
// address that merely contains a name does not; and a stored file keeps its
// own name at the end so the voice note's length survives.
import { describe, it, expect } from 'vitest';
import { drawnRoots, holdsRead, mentionMarkdown, myNewest, newLineAt, storedName } from '../renderer/src/team/rooms/room-chat-rules.ts';
import { voiceNoteOf } from '../renderer/src/team/voice-note.ts';

const ME = 'p-me', MAYA = 'p-maya';
const m = (id, by, at, extra = {}) => ({ id, roomId: 'r', by, body: id, inReplyTo: null, mentions: [], at, ...extra });

describe('the New line', () => {
  const msgs = [m('a', MAYA, 100), m('b', ME, 200), m('c', MAYA, 300, { inReplyTo: 'a' }), m('d', MAYA, 400), m('e', MAYA, 500)];

  it('sits above the first message from someone else after your read point', () => {
    expect(newLineAt(msgs, 150, ME)).toBe('d');
  });

  it('is not drawn above your own message or a reply in a thread', () => {
    expect(newLineAt([m('b', ME, 200), m('c', MAYA, 300, { inReplyTo: 'a' })], 150, ME)).toBeNull();
  });

  it('is not drawn when you have read everything, or never had a read point', () => {
    expect(newLineAt(msgs, 500, ME)).toBeNull();
    expect(newLineAt(msgs, null, ME)).toBeNull();
  });
});

describe('a deleted message', () => {
  it('is drawn while replies hang off it, and not otherwise', () => {
    const msgs = [m('a', MAYA, 1, { deleted: true, body: '' }), m('r', ME, 2, { inReplyTo: 'a' }), m('b', MAYA, 3, { deleted: true, body: '' }), m('c', MAYA, 4)];
    expect(drawnRoots(msgs).map((x) => x.id)).toEqual(['a', 'c']);
  });
});

describe('an @name', () => {
  it('becomes a mention link', () => {
    expect(mentionMarkdown('hi @Maya Chen, see this', ['Maya Chen'])).toBe('hi [@Maya Chen](#mention), see this');
  });

  it('leaves words without one alone', () => {
    expect(mentionMarkdown('mail maya@example.com', ['Theo Park'])).toBe('mail maya@example.com');
  });
});

describe('a file sent in a room', () => {
  it('is stored under a unique name that still ends in its own', () => {
    const name = storedName('voice-note-12400ms.webm', 1_000_000, 'abc123');
    expect(name).toBe(`${(1_000_000).toString(36)}-abc123-voice-note-12400ms.webm`);
    expect(voiceNoteOf(`attachments/${name}`)).toEqual({ ms: 12_400 });
  });

  it('carries no path or odd characters, whatever it was called', () => {
    expect(storedName('../../etc/pass wd', 1, 'x')).toBe('1-x-etc-pass-wd');
    expect(storedName('', 1, 'x')).toBe('1-x-file');
  });
});

// Codex found the open room stayed held after "Mark as read" undid a "Mark as
// unread", so new messages went on arriving unread while you read them.
describe('whether the open room reads itself', () => {
  it('holds once it is marked unread, from a message or from the list', () => {
    expect(holdsRead(false, false, true)).toBe(true);
  });
  it('lets go when it is marked read again', () => {
    expect(holdsRead(true, true, false)).toBe(false);
  });
  it('does not hold a room that was already marked when you opened it', () => {
    expect(holdsRead(false, true, true)).toBe(false);
  });
  it('keeps holding while nothing about the mark changes', () => {
    expect(holdsRead(true, false, false)).toBe(true);
  });
});

describe('the up arrow in an empty box', () => {
  it('finds your newest message in the chat, or in the open thread', () => {
    const msgs = [m('a', ME, 1), m('b', MAYA, 2), m('c', ME, 3, { inReplyTo: 'b' }), m('d', ME, 4, { deleted: true })];
    expect(myNewest(msgs, ME)?.id).toBe('a');
    expect(myNewest(msgs, ME, 'b')?.id).toBe('c');
    expect(myNewest(msgs, MAYA, 'a')).toBeNull();
  });
});
