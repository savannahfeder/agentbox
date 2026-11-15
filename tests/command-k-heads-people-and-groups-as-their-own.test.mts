// COMMAND K HEADS PEOPLE AND GROUPS AS THEIR OWN.
//
// Typing "Sofia" in the command bar found Sofia's page, under the heading
// THREADS, beside the threads the words also found. A person or a group is not
// a thread; the heading over them now says what they are.
import { describe, it, expect } from 'vitest';
import { paletteOrder } from '../renderer/src/components/Palette.tsx';

const row = (id, label) => ({ id, label, run() {} });
const sofia = row('chat-person-p-so', 'Sofia');
const thread = row('t-1', 'Sofia’s onboarding screens');
const command = row('wait', 'Mark done');

describe('the command bar with a name typed', () => {
  it('heads the people and groups found, then the threads', () => {
    const { rows, labels } = paletteOrder([command], [sofia, thread], false, 'Sofia', 1);
    expect(rows.map((r) => r.id)).toEqual(['chat-person-p-so', 't-1', 'wait']);
    expect([...labels.entries()]).toEqual([[0, 'People and groups'], [1, 'Threads'], [2, 'Commands']]);
  });
  it('heads only people and groups when no thread was found', () => {
    const { labels } = paletteOrder([command], [sofia], false, 'Sofia', 1);
    expect([...labels.entries()]).toEqual([[0, 'People and groups'], [1, 'Commands']]);
  });
  it('is as before with no person or group found', () => {
    const { labels } = paletteOrder([command], [thread], false, 'Sofia');
    expect([...labels.entries()]).toEqual([[0, 'Threads'], [1, 'Commands']]);
  });
  it('on a phone too', () => {
    const { labels } = paletteOrder([command], [sofia, thread], true, 'Sofia', 1);
    expect([...labels.entries()]).toEqual([[0, 'People and groups'], [1, 'Threads'], [2, 'Commands']]);
  });
});
