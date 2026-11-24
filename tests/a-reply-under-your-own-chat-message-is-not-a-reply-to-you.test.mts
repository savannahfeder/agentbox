// A REPLY UNDER YOUR OWN CHAT MESSAGE IS NOT A "REPLY TO YOU".
//
// In a power test Lena opened the thread under her own message in the team
// chat, where Sam had answered, and the reply box read "Reply to You": the box
// named its thread's first message by how the chat names its writer, and the
// chat names you "You". She had to work out whether she was writing to herself.
// Measured on the box's words for a thread started by her, by Sam, and the
// main chat.
import { describe, it, expect } from 'vitest';
import { replyBoxWords } from '../renderer/src/team/rooms/room-chat-rules.ts';

const nameOf = (id: string | null) => (id === 'lena' ? 'You' : id === 'sam' ? 'Sam O.' : 'Someone');

describe('the reply box in a chat thread', () => {
  it('under your own message says Reply in thread', () => {
    expect(replyBoxWords({ by: 'lena' }, 'lena', nameOf)).toBe('Reply in thread');
  });
  it('under a teammate’s message still names them', () => {
    expect(replyBoxWords({ by: 'sam' }, 'lena', nameOf)).toBe('Reply to Sam O.');
  });
  it('signed out, a message nobody wrote as you still names its writer', () => {
    expect(replyBoxWords({ by: 'sam' }, null, nameOf)).toBe('Reply to Sam O.');
  });
});
