// a tester, on the onboarding call of 2026-08-24, at the top of the founder's
// list on a line of its own. The wiring was real end to end and had been
// measured working. What was wrong is that the walk read ~/.claude/agents ONCE
// and kept whatever came back, so a Mac with no Claude Code on it — which is
// exactly a Mac with no ~/.claude/agents on it — answered "none", and none was
// final. Claude Code was then installed in front of her, she pressed Check
// again, the gate opened on the binary, and the offer stayed empty for the
// rest of the walk because the read could never happen a second time.
//
// And with nothing found, the card drew no offer at all: no list, no switch,
// no sentence. A promised feature that leaves no mark on the screen cannot be
// told apart from one that is broken.

import { describe, expect, it } from 'vitest';
import {
  anyAgents, finishCard, forgetAgentsWhileLookingAgain, forgetFoldersWhileLookingAgain,
  keepSecondRead, readAgentsAgain,
} from '../renderer/src/onboarding.ts';

const none = { user: [], project: [] };
const some = { user: [{ name: 'a', title: 'A', line: '', scope: 'all', path: '/h/.claude/agents/a.md' }], project: [] };

describe('reading her agents again', () => {
  it('looks when nothing has been read yet', () => {
    expect(readAgentsAgain(null)).toBe(true);
  });

  it('looks again after an empty answer, because that was a Mac with no Claude Code on it', () => {
    expect(readAgentsAgain(none)).toBe(true);
  });

  it('never looks again once it has really found something', () => {
    expect(readAgentsAgain(some)).toBe(false);
  });

  it('a second read that finds agents replaces the empty card', () => {
    expect(keepSecondRead(none, some)).toBe(true);
  });

  it('a second read that finds nothing leaves the card alone, so it cannot loop', () => {
    expect(keepSecondRead(none, none)).toBe(false);
  });

  it('the first read is always kept, even when it is empty', () => {
    expect(keepSecondRead(null, none)).toBe(true);
  });
});

// AND THE DISK SCAN LATCHES THE SAME WAY, which only became half of the answer
// on 2026-08-27, when made the last card of the walk the ⌘K import card. That
// card asks a second question — every OTHER folder on the Mac with agents in it
// — and that scan looks for folders holding agent FILES, so on a Mac with no
// Claude Code it comes back empty for exactly the reason the file read does.
// Forgetting one and keeping the other would have left the walk still ending
// itself on the press that was meant to fill it.
describe('the disk scan behind the same card', () => {
  const nowt = [{ path: '/Users/e/Desktop/dev/thing', count: 0 }];
  const has = [{ path: '/Users/e/Desktop/dev/thing', count: 4 }];

  it('forgets an empty scan when Claude Code turns up', () => {
    expect(forgetFoldersWhileLookingAgain(nowt, false)).toBe(null);
    expect(forgetFoldersWhileLookingAgain([], false)).toBe(null);
  });

  it('keeps a scan that really found folders with agents in them', () => {
    expect(forgetFoldersWhileLookingAgain(has, false)).toBe(has);
  });

  it('changes nothing while Claude Code is still missing', () => {
    expect(forgetFoldersWhileLookingAgain(nowt, true)).toBe(nowt);
    expect(forgetFoldersWhileLookingAgain(null, true)).toBe(null);
  });

  it('and a card that has forgotten either read draws nothing yet', () => {
    expect(anyAgents(none)).toBe(false);
    const card = finishCard({ missing: false }, { read: false, some: false });
    expect(card.show).toBe(false);
  });
});

// AND THE HALF THE FIRST ROUND MISSED, found on 2026-08-25 by driving the built
// renderer through a tester's own case instead of trusting the helpers above.
// The second read really was taken and her agents still never appeared: the
// card sends a Mac with no agent files STRAIGHT IN, and on the press that
// turned Claude Code up it was still holding the empty answer read moments
// earlier on a Mac that had no Claude Code on it. The walk ended on that press
// and the fresh read came back to a card that was gone.
describe('the press that turns Claude Code up', () => {
  it('forgets an empty answer, so the card cannot end the walk before the new read lands', () => {
    expect(forgetAgentsWhileLookingAgain(none, false)).toBe(null);
  });

  it('and a card with nothing read yet draws nothing', () => {
    const card = finishCard({ missing: false }, { read: false, some: false });
    expect(card.show).toBe(false);
  });

  // AND THE STALE EMPTY ANSWER NO LONGER ENDS THE WALK, because nothing does.
  // A read that came back empty now draws the card with its empty answer on
  // it, which is a screen somebody can stand on while Claude Code finishes
  // installing and press Look again.
  it('draws the card on an empty answer rather than walking her past it', () => {
    const stale = finishCard({ missing: false }, { read: true, some: false });
    expect(stale.show).toBe(true);
    expect(stale.blocked).toBe(false);
  });

  it('keeps a real answer, because that one was about a Mac that had Claude Code on it', () => {
    expect(forgetAgentsWhileLookingAgain(some, false)).toBe(some);
  });

  it('changes nothing when Claude Code is still missing', () => {
    expect(forgetAgentsWhileLookingAgain(none, true)).toBe(none);
    expect(forgetAgentsWhileLookingAgain(null, true)).toBe(null);
  });
});
