// A CHAT THAT ENDED ON A QUESTION COMES IN AS WAITING ON YOU.
//
// Setup's last screen (w-62228098e6, the drawing the founder approved as R1)
// offers only the chats you were in the middle of, each with its last
// question, and sends the finished ones to Done. Before this the card had no
// idea which was which: every chat from the last ten days arrived ticked and
// every imported row landed in Needs you, measured on the fixture list of
// nine chats where seven had plainly finished.
//
// The rule reads the agent's last reply: a chat is waiting when that reply
// ends on a question, or on a question followed by the choices it offers.

import { describe, it, expect } from 'vitest';
import { howTheChatEnded } from '../shared/agent-import.mjs';

describe('how a chat ended', () => {
  it('ends on a question, so it is waiting and the question is what it asks', () => {
    const got = howTheChatEnded('Found it. The test waits a fixed 200ms.\n\nMocking the clock is the real fix. Which one?');
    expect(got).toEqual({ waiting: true, ask: 'Mocking the clock is the real fix. Which one?' });
  });

  it('ends on the choices after a question, so it is waiting on that question', () => {
    const got = howTheChatEnded('Two ways to fix it. Which do you want?\n\n1. Mock the clock\n2. Retry the request once');
    expect(got).toEqual({ waiting: true, ask: 'Two ways to fix it. Which do you want?' });
  });

  it('reads through markdown around the question', () => {
    expect(howTheChatEnded('Done with the draft.\n\n**Can I run the migration on staging?**')).toEqual({
      waiting: true, ask: 'Can I run the migration on staging?',
    });
    expect(howTheChatEnded('(Want me to ship it?)').waiting).toBe(true);
  });

  // Drawn for the founder: a long last message came down to "Shall I do that?",
  // which says nothing without the sentence it follows.
  it('keeps the sentence before a short question at the end of a long message', () => {
    const said = 'Found it. The test waits a fixed 200ms for the retry timer, and on a busy CI box the timer fires late. Mocking the clock is the real fix. Shall I do that?';
    expect(howTheChatEnded(said).ask).toBe('Mocking the clock is the real fix. Shall I do that?');
    // A question long enough to stand alone stays alone.
    const long = `${'Some context about the work. '.repeat(5)}Should the cache be shared across every instance with redis?`;
    expect(howTheChatEnded(long).ask).toBe('Should the cache be shared across every instance with redis?');
  });

  // The power test's first find: "an index on (account_id, created_at)" came
  // out as "accountid, createdat", because every underscore was read as markdown.
  it('keeps the underscores inside names, and drops only the ones that mark emphasis', () => {
    expect(howTheChatEnded('An index on (account_id, created_at) helps. Shall I add it?').ask)
      .toBe('An index on (account_id, created_at) helps. Shall I add it?');
    expect(howTheChatEnded('Should `MAX_RETRIES` go to 5?').ask).toBe('Should MAX_RETRIES go to 5?');
    expect(howTheChatEnded('Is _this_ the one you meant?').ask).toBe('Is this the one you meant?');
    expect(howTheChatEnded('__Ready to merge?__').ask).toBe('Ready to merge?');
  });

  it('keeps the end of a long line, because the question is at the end', () => {
    const story = `${'This was a long explanation of the change. '.repeat(5)}Shall I ship it?`;
    expect(howTheChatEnded(story)).toEqual({ waiting: true, ask: 'This was a long explanation of the change. Shall I ship it?' });

    const { waiting, ask } = howTheChatEnded(`${'word '.repeat(60)}ok?`);
    expect(waiting).toBe(true);
    expect(ask.length).toBeLessThanOrEqual(141);
    expect(ask.startsWith('…')).toBe(true);
    expect(ask.endsWith('word ok?')).toBe(true);
  });

  it('is finished when the question was answered in the same reply', () => {
    expect(howTheChatEnded('Why did it fail? The timer fired late. Fixed, and the tests pass.')).toEqual({ waiting: false, ask: '' });
  });

  it('is finished when it ends on a statement', () => {
    expect(howTheChatEnded('Renamed the page and updated the links. Tests pass.')).toEqual({ waiting: false, ask: '' });
  });

  it('is finished when the only question mark is in a link or code at the end', () => {
    expect(howTheChatEnded('The docs are at https://example.com/search?q=1').waiting).toBe(false);
    expect(howTheChatEnded('Run this:\n\n```\nls -la | grep "?"\n```').waiting).toBe(false);
  });

  it('is finished when there is no reply at all', () => {
    expect(howTheChatEnded('')).toEqual({ waiting: false, ask: '' });
    expect(howTheChatEnded(null)).toEqual({ waiting: false, ask: '' });
  });

  it('does not reach past a list that follows a statement', () => {
    expect(howTheChatEnded('Is this right? Yes. Here is what changed:\n\n1. The timer\n2. The test').waiting).toBe(false);
  });
});
