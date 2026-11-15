// THE MORE MENU OFFERS WHAT YOU MAY DO TO A MESSAGE, AND NOTHING YOU MAY NOT.
//
// A message in a chat could be reacted to and replied to, and that was all:
// no edit, no delete, no copy, no way to mark a conversation unread. The bar's
// more button now opens a menu. Measured here: your own message offers edit
// and delete, a teammate's never does; copy and mark unread are on every
// message; delete comes last after a rule; and editing a message that carries
// a picture or a voice note changes the words and keeps the attachment.
import { describe, it, expect } from 'vitest';
import { messageMore, withEmbeds, wordsOf } from '../renderer/src/team/message-more.ts';

const labels = (items) => items.map((i) => (i === 'rule' ? '—' : i.label));
const all = { onEdit: () => {}, onDelete: () => {}, onMarkUnread: () => {} };

describe('the menu on a message', () => {
  it('offers edit, copy, mark unread and, after a rule, delete on your own', () => {
    expect(labels(messageMore({ mine: true, text: 'hi', ...all }))).toEqual(['Edit message', 'Copy text', 'Mark unread', '—', 'Delete message']);
  });

  it('never offers edit or delete on a teammate’s message', () => {
    expect(labels(messageMore({ mine: false, text: 'hi', ...all }))).toEqual(['Copy text', 'Mark unread']);
  });

  it('leaves out what the conversation cannot do', () => {
    expect(labels(messageMore({ mine: true, text: 'hi' }))).toEqual(['Copy text']);
  });

  it('offers no copy when there are no words, only a voice note', () => {
    const text = '[voice-note-3000ms.webm](attachments/a-voice-note-3000ms.webm)';
    expect(labels(messageMore({ mine: true, text, ...all }))).toEqual(['Mark unread', '—', 'Delete message']);
  });
});

describe('editing a message with something attached', () => {
  const sent = 'see this\n\n![shot.png](attachments/a-shot.png)\n[voice-note-3000ms.webm](attachments/b-voice-note-3000ms.webm)';

  it('edits only the words', () => {
    expect(wordsOf(sent)).toBe('see this');
  });

  it('keeps the attachments under the new words', () => {
    expect(withEmbeds(sent, 'look at this')).toBe('look at this\n\n![shot.png](attachments/a-shot.png)\n[voice-note-3000ms.webm](attachments/b-voice-note-3000ms.webm)');
  });

  it('leaves a message with nothing attached as just the words', () => {
    expect(withEmbeds('old words', 'new words')).toBe('new words');
  });
});
