// WHETHER ANYTHING IS HAPPENING ON THIS TASK, pinned.
//
// The failure this suite is really guarding is not a missing line, it is a
// CONFIDENT WRONG ONE. Every one of these sentences is a promise about a
// process she cannot see, so a row that says "queued" while nothing is going to
// spawn on it is worse than the silence it replaced. That exact confusion
// already happened once, on, and it is why `queued` in main/supervisor.mjs is
// filtered as narrowly as it is.

import { describe, it, expect } from 'vitest';
import { cameBackEmpty, liveLine, shortSpan, shortWord } from '../renderer/src/live-line.ts';
import { Name } from '../shared/product-name.mjs';

const NOW = Date.parse('2026-08-24T18:00:00Z');

function item(over = {}) {
  return {
    id: 'w-1', product: 'agentbox', productName: Name,
    status: 'open', title: 'A task', kind: 'directive', labels: ['founder'],
    priority: 5, epoch: 1, claim: null,
    createdAt: NOW - 600_000, updatedAt: NOW - 600_000,
    ...over,
  };
}

function session(over = {}) {
  return { itemId: 'w-1', product: 'agentbox', startedAt: NOW - 240_000, tail: [], ...over };
}

describe('a worker is on it', () => {
  it('says so, with how long it has been at it, in whole minutes', () => {
    const live = liveLine(item({ status: 'claimed' }), { session: session(), inProgress: true, now: NOW });
    expect(live.state).toBe('working');
    expect(live.line).toBe('The agent is working, 4 minutes in.');
  });

  // A run seconds old has nothing worth counting, so it gets a sentence with no
  // number in it at all.
  it('never prints a seconds counter', () => {
    const live = liveLine(item({ status: 'claimed' }), {
      session: session({ startedAt: NOW - 12_000 }), inProgress: true, now: NOW,
    });
    expect(live.line).toBe('The agent just started on this.');
    expect(live.line).not.toMatch(/second/);
  });

  // A live session is a fact about the row wherever the row is listed, so this
  // does not wait on the In progress rule to be allowed to say it.
  it('says it even off the In progress tab', () => {
    expect(liveLine(item(), { session: session(), inProgress: false, now: NOW }).state).toBe('working');
  });
});

describe('nothing is on it yet', () => {
  it('says queued only when the supervisor actually has it queued', () => {
    const live = liveLine(item(), { queued: ['w-1'], running: 2, capacity: 3, inProgress: true, now: NOW });
    expect(live.state).toBe('queued');
    expect(live.line).toBe('Queued. An agent starts on it as soon as one is free.');
    expect(shortWord(live.state)).toBe('Queued');
  });

  it('says agents are paused when they are', () => {
    const live = liveLine(item(), { paused: true, inProgress: true, now: NOW });
    expect(live.state).toBe('paused');
    expect(live.line).toMatch(/paused/);
  });

  // THE ADMISSION. In progress, no session, no place in the queue: the tick is
  // resting the row or another Agentbox holds the claim, and either way nothing is
  // going to touch it. Saying "queued" here is the lie the vocabulary exists to
  // stop telling.
  it('admits when nothing is coming rather than guessing', () => {
    const live = liveLine(item(), { queued: ['w-other'], running: 1, capacity: 3, inProgress: true, now: NOW });
    expect(live.state).toBe('idle');
    expect(live.line).toBe('No agent is on this, and none is waiting to start.');
  });
});

describe('what it refuses to say twice', () => {
  // Each of these already has its own bar above the conversation, with the
  // button that fixes it. A second sentence at the foot is the duplication this
  // pane keeps having to be rescued from.
  it('leaves a stopped agent to the stalled bar', () => {
    expect(liveLine(item({ answer: 'go on' }), { stalled: true, inProgress: true, now: NOW })).toBe(null);
  });

  it('leaves a parked row to the schedule bar', () => {
    expect(liveLine(item(), { scheduledUntil: NOW + 3_600_000, inProgress: true, now: NOW })).toBe(null);
  });

  it('says nothing at all on a row sitting in her inbox', () => {
    expect(liveLine(item(), { queued: [], inProgress: false, now: NOW })).toBe(null);
  });

  it('says nothing on a finished row, where the result is the news', () => {
    expect(liveLine(item({ status: 'done' }), { inProgress: true, now: NOW })).toBe(null);
  });

  // An imported Claude Code session is not one of ours: it is in none of these
  // lists, and AgentThread draws its own liveness off the process itself.
  it('says nothing on an imported agent row', () => {
    expect(liveLine(item({ agent: { pid: 4, sessionId: 's', cwd: '/tmp', name: 'x' } }), {
      session: session(), inProgress: true, now: NOW,
    })).toBe(null);
  });
});

describe('the one word', () => {
  it('has one for every state the line can be in', () => {
    expect(shortWord('working')).toBe('Working');
    expect(shortWord('queued')).toBe('Queued');
    expect(shortWord('paused')).toBe('Paused');
    expect(shortWord('idle')).toBe('Nothing running');
  });
});

describe('the timing beside it', () => {
  it('never counts seconds', () => {
    expect(shortSpan(0)).toBe('just now');
    expect(shortSpan(41_000)).toBe('just now');
    expect(shortSpan(59_999)).toBe('just now');
  });

  it('reads in whole minutes, then in hours', () => {
    expect(shortSpan(60_000)).toBe('1m');
    expect(shortSpan(4 * 60_000)).toBe('4m');
    expect(shortSpan(59 * 60_000)).toBe('59m');
    expect(shortSpan(2 * 3_600_000 + 7 * 60_000)).toBe('2h 7m');
  });

  it('never reads backwards from a clock that has slipped', () => {
    expect(shortSpan(-5_000)).toBe('just now');
  });
});

// HOW MANY SUBAGENTS ARE ON IT.
//
// `countHelpers` in main/supervisor.mjs only ever counts a `task_started` id,
// so the lead is never in the number, and a run measured on Claude Code 2.1.246
// has the lead issuing its own tool calls while a subagent is still open. So "1
// Agent Working" was drawn while two agents were working. The word names what
// it counts now, and the lead is the agent that "The agent" has always meant
// everywhere else on this line.
//
// The three tries before this one put the count BESIDE the word and she turned
// all three down, because the line already said working and they made it say it
// twice. So the guard here is not that a number appears, it is that NOTHING
// ELSE DOES: one word slot, one timing, and the same shape whether helpers are
// out or not.
describe('several agents on one task', () => {
  it('puts the count inside the word she already reads', () => {
    expect(shortWord('working', 4)).toBe('4 Subagents Working');
  });

  it('says one subagent rather than 1 Subagents', () => {
    expect(shortWord('working', 1)).toBe('1 Subagent Working');
  });

  // NO HYPHEN, HERS 2026-08-27: "4 Subagents Working -> remove the heiphen
  // (unless that's super unusual. If not then Sub-Agent is better." The
  // condition was measured rather than guessed, in the Claude Code build on her
  // own machine (2.1.246): `subagent` 1033, `Subagent` 393, `sub-agent` 25, and
  // `Sub-agent` / `Sub-Agent` zero. Unhyphenated is not unusual, so the hyphen
  // is gone and this keeps it gone, on the word AND on the spoken sentence.
  it('never draws the hyphen, in the word or the sentence', () => {
    expect(shortWord('working', 4)).not.toContain('-');
    expect(shortWord('working', 1)).not.toContain('-');
    const live = liveLine(item({ status: 'claimed' }), {
      session: session({ helpers: 4 }), inProgress: true, now: NOW,
    });
    expect(live.line).not.toContain('sub-agent');
  });

  // THE FAULT SHE CAUGHT, pinned so it cannot come back: the number counts
  // subagents, so it may never be the whole population of agents on the row.
  // The lead is the one the sentence names separately.
  it('never counts the lead agent in the number', () => {
    expect(shortWord('working', 1)).not.toContain('2');
    const live = liveLine(item({ status: 'claimed' }), {
      session: session({ helpers: 1 }), inProgress: true, now: NOW,
    });
    expect(live.line).toBe('The agent is working with one subagent, 4 minutes in.');
  });

  // The whole point of the number being absent rather than zero: every ordinary
  // run in Agentbox has no helpers, and every one of those has to read as it read
  // before this was built.
  it('says exactly what it said before when no helper is out', () => {
    expect(shortWord('working', 0)).toBe('Working');
    expect(shortWord('working')).toBe('Working');
  });

  // A count only ever means something while something is running. A queued or
  // resting row has no agents on it to count.
  it('never puts a count on a state that is not working', () => {
    expect(shortWord('queued', 4)).toBe('Queued');
    expect(shortWord('paused', 4)).toBe('Paused');
    expect(shortWord('silent', 4)).toBe('Nothing came back');
    expect(shortWord('idle', 4)).toBe('Nothing running');
  });

  // One number on the screen and a different one read aloud is the failure this
  // catches: `Live.tsx` hands the word the count and the sentence to whatever
  // reads the pane, and they come from two different functions.
  it('reads aloud the same number it draws', () => {
    const facts = { session: session({ helpers: 4 }), inProgress: true, now: NOW };
    const live = liveLine(item({ status: 'claimed' }), facts);
    expect(shortWord(live.state, 4)).toBe('4 Subagents Working');
    expect(live.line).toBe('The agent is working with 4 subagents, 4 minutes in.');
  });

  it('leaves the spoken sentence alone when no helper is out', () => {
    const live = liveLine(item({ status: 'claimed' }), { session: session(), inProgress: true, now: NOW });
    expect(live.line).toBe('The agent is working, 4 minutes in.');
  });
});

// A RUN ENDED AND SAID NOTHING, AND THE ROW ADMITS IT.
//
// Her pick, 2026-08-31: "Say it on the row. When a run ends having written
// nothing, the row says so in the same voice the four live words use... Small,
// honest, and it does not pretend to know what happened."
//
// The failure this guards is the one the whole file guards, in a new place: a
// CONFIDENT WRONG SENTENCE. This line must never appear on a row something is
// actually doing, and it must never claim to know what the quiet run achieved.
describe('a run ended and wrote nothing', () => {
  const quiet = (over = {}) => ({ runs: 1, endedAt: NOW - 600_000, until: NOW + 300_000, ...over });

  it('says so, with how long ago it went quiet', () => {
    const live = liveLine(item(), { silent: quiet(), inProgress: true, now: NOW });
    expect(live.state).toBe('silent');
    expect(live.line).toBe(
      'The last agent finished without saying anything, 10 minutes ago. Send it a message to find out what happened.',
    );
  });

  // THE HALF THAT MATTERS MOST, and the reason this test is not optional.A row
  // a run gave nothing back on is NOT in In progress, it is sitting in her
  // inbox looking untouched, so a check under the In progress gate would only
  // ever have fired on rows that did not need it.
  it('says it in her inbox, not only on the In progress tab', () => {
    expect(liveLine(item(), { silent: quiet(), inProgress: false, now: NOW }).state).toBe('silent');
  });

  // It does not pretend to know what happened, which is her sentence. The run
  // may have opened a pull request or done nothing at all; nothing on this side
  // can tell, so nothing here may imply either.
  it('never guesses what the quiet run did or did not do', () => {
    const { line } = liveLine(item(), { silent: quiet(), inProgress: true, now: NOW });
    expect(line).not.toMatch(/fail|error|crash|stuck|broke|succeed|finished the|did the work/i);
  });

  // Everything happening NOW outranks news about a run that has already ended.
  it('yields to a live session', () => {
    const live = liveLine(item({ status: 'claimed' }), {
      session: session(), silent: quiet(), inProgress: true, now: NOW,
    });
    expect(live.state).toBe('working');
  });

  // Stalled is a worker that DIED and the red bar above the conversation owns
  // it. Two sentences about one row on one screen is the duplication this pane
  // keeps having to be rescued from.
  it('yields to the stopped bar rather than saying it twice', () => {
    expect(liveLine(item(), { silent: quiet(), stalled: true, inProgress: true, now: NOW })).toBe(null);
  });

  it('yields to a schedule, which has its own bar', () => {
    expect(liveLine(item(), { silent: quiet(), scheduledUntil: NOW + 60_000, inProgress: true, now: NOW })).toBe(null);
  });

  // The ordinary row is untouched. This sentence is news precisely because it is
  // rare, and a version of it that appeared on every quiet row would be noise.
  it('says nothing of the kind on a row no run has been near', () => {
    expect(liveLine(item(), { inProgress: true, now: NOW }).state).toBe('idle');
  });

  // She was looking at a row carrying a finished result and three options,
  // waiting on her, with "Nothing came back" printed underneath. Both facts were
  // true and the pair was a lie: an agent HAD come back, at length.
  //
  // The cause is that a row waiting on her gets a run every so often that
  // correctly does nothing, because the next move is hers. So the rows likeliest
  // to be labelled were the ones with the most to read on them.
  it('says nothing of the kind on a row that already carries a result', () => {
    const live = liveLine(
      item({ result: 'Pick your way back out of an artifact: arrows, a back strip, or a trail.' }),
      { silent: quiet(), inProgress: true, now: NOW },
    );
    expect(live.state).not.toBe('silent');
  });

  // A checkpoint is something to read too, and it is drawn in the same thread.
  it('says nothing of the kind on a row that carries a checkpoint', () => {
    const live = liveLine(item({ note: 'Half way through the branch.' }), {
      silent: quiet(), inProgress: true, now: NOW,
    });
    expect(live.state).not.toBe('silent');
  });

  // A result she has TAKEN BACK is not something to read, and `(withdrawn)` is
  // the app's own word for exactly that. Without this the row would fall silent
  // for good the first time anything was withdrawn on it.
  it('still says it when the only thing on the row was withdrawn', () => {
    const live = liveLine(item({ result: '(withdrawn)' }), {
      silent: quiet(), inProgress: true, now: NOW,
    });
    expect(live.state).toBe('silent');
  });

  it('is finished when the row is finished', () => {
    expect(liveLine(item({ status: 'done' }), { silent: quiet(), inProgress: true, now: NOW })).toBe(null);
  });

  it('prints no seconds counter on a run that just went quiet', () => {
    const { line } = liveLine(item(), { silent: quiet({ endedAt: NOW - 12_000 }), inProgress: true, now: NOW });
    expect(line).toBe('The last agent finished without saying anything. Send it a message to find out what happened.');
    expect(line).not.toMatch(/second/);
  });

  it('says it in words a non-technical person reads once', () => {
    const { line } = liveLine(item(), { silent: quiet(), inProgress: true, now: NOW });
    expect(shortWord('silent')).toBe('Nothing came back');
    expect(line).not.toMatch(/silent|fruitless|empty run|no output|session|supervisor|spawn/i);
    // And it says what to do about it, because sending a message is genuinely
    // the fix: it is what the engineer did, and it is what got him his answer.
    expect(line).toMatch(/Send it a message/);
  });
});

// ONE PREDICATE, THREE SURFACES, AND THE REASON IT IS EXPORTED AT ALL.
//
// `liveLine` got her rule and the inbox row in List.tsx did not, so on the very
// first re-shoot the pane went quiet on a row carrying a result while the row
// beside it still read "nothing came back". A screenshot script caught it, not a
// test, which is why there is a test now.
//
// Two surfaces of one fact disagreeing on one screen is the failure this whole
// vocabulary exists to prevent, and the row is the one she reads first.
describe('may this row say that nothing came back', () => {
  const flag = { runs: 1, endedAt: 1, until: 2 };

  it('yes, when the row has nothing on it to read', () => {
    expect(cameBackEmpty({}, flag)).toBe(true);
    expect(cameBackEmpty({ result: '', note: '   ' }, flag)).toBe(true);
  });

  it('no, when an agent has already said something there', () => {
    expect(cameBackEmpty({ result: 'Pick a landing page: Ridge, Harbour or Orbit.' }, flag)).toBe(false);
    expect(cameBackEmpty({ note: 'Half way through the branch.' }, flag)).toBe(false);
  });

  // `(withdrawn)` is the app's own word for a field taken back, so it is not
  // something to read. Without this a row would fall silent for good the first
  // time anything on it was withdrawn.
  it('treats a withdrawn field as nothing to read', () => {
    expect(cameBackEmpty({ result: '(withdrawn)' }, flag)).toBe(true);
  });

  it('is no at all without the flag, whatever else is true', () => {
    expect(cameBackEmpty({}, null)).toBe(false);
    expect(cameBackEmpty({}, undefined)).toBe(false);
  });

  // The pane must agree with the predicate on every input, because the pane is
  // the surface she photographed and the row is the surface she reads first.
  it('agrees with the line the pane draws', () => {
    for (const row of [{}, { result: 'something' }, { note: 'a checkpoint' }, { result: '(withdrawn)' }]) {
      const live = liveLine(item(row), { silent: flag, inProgress: true, now: NOW });
      expect(live?.state === 'silent').toBe(cameBackEmpty(row, flag));
    }
  });
});
