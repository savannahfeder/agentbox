// THE QUICK EMOJI ARE YOUR LATEST THREE ON EVERY MESSAGE (w-59b4e9f32a).
//
// "For the quick emojis ... those are the three most recent ones you've used,
// right? If not they should be." They were read once, when a message was first
// drawn. Measured on the built app with a made-up team, on the Messages page:
// recent was 👍 🎉 👀; reacting ❤️ from the plate stored ❤️ 👍 🎉 👀, and every
// message's bar still offered 👍 🎉 👀 until the chat was opened again.
//
// Now the row is read again each time the pointer arrives on a message. It is
// not read while the pointer stays, so the emoji just pressed does not jump to
// the front under it and send a second press to a different one.
import { describe, it, expect } from 'vitest';
import { rememberEmoji, onArrival } from '../renderer/src/team/recent-emoji.ts';
import { latestQuick } from '../renderer/src/team/ChatActions.tsx';

const storeOf = (recent) => {
  const data = { 'agentbox.recentEmoji': JSON.stringify(recent) };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } };
};

describe('the quick row', () => {
  it('is your three latest, newest first', () => {
    expect(latestQuick(storeOf(['❤️', '👍', '🎉', '👀']))).toEqual(['❤️', '👍', '🎉']);
  });

  it('fills from the usual ones while you have used fewer than three', () => {
    expect(latestQuick(storeOf(['🔥']))).toEqual(['🔥', '👍', '🙏']);
  });
});

describe('a message’s quick row after you react somewhere else', () => {
  const setUp = () => {
    const store = storeOf(['👍', '🎉', '👀']);
    const message = new EventTarget();
    let row = latestQuick(store);
    const stop = onArrival(message, () => { row = latestQuick(store); });
    return { store, message, row: () => row, stop };
  };

  it('shows the new one first the next time the pointer arrives', () => {
    const { store, message, row } = setUp();
    rememberEmoji('❤️', store);
    message.dispatchEvent(new Event('pointerenter'));
    expect(row()).toEqual(['❤️', '👍', '🎉']);
  });

  it('does not reorder while the pointer is still on it', () => {
    const { store, row } = setUp();
    rememberEmoji('👀', store);
    expect(row()).toEqual(['👍', '🎉', '👀']);
  });

  it('stops listening once the message is gone', () => {
    const { store, message, row, stop } = setUp();
    stop();
    rememberEmoji('❤️', store);
    message.dispatchEvent(new Event('pointerenter'));
    expect(row()).toEqual(['👍', '🎉', '👀']);
  });
});
