// A THROWAWAY COPY'S NOTE SAYS WHAT THAT COPY WILL DO, NOT WHAT IS BROKEN.
//
// Found by the tester, 2026-10-23 (F-16). Opening Agentbox as a new user put up
// "Claude Code is not at ~/.local/bin/claude, so agents will not run in it." and
// took it away again on its own. Read cold that is a dead end with a file path
// in it: no link, no choice, nothing to press.
//
// It is read cold because it reads as a fault, and it is not one. The note is
// said in the window that RAN the command, about the copy it just opened, and
// that copy's own setup offers to install Claude Code or to sign in to ChatGPT
// instead -- which is exactly the "install link or use-Codex-only choice" the
// finding asks for. The sentence was describing the hole and not the door.
//
// AND IT ASKS THE SENTENCE, NOT THE COMPUTER. The first version of this file
// called `openFreshUser` and read the note out of its result, which only says
// anything about a missing Claude Code on a computer that has no Claude Code.
// It passed on the Linux box it was written on and failed all four on a Mac
// with Claude Code installed, which bounced the branch. `freshUserNotes` is
// the same sentences with the readings handed in.

import { describe, it, expect } from 'vitest';
import { freshUserNotes } from '../main/fresh-user.mjs';

/** A throwaway home with no Claude Code, no keychain and no agents in it. */
const NOTHING = { claudeBin: null, keychain: null, agents: null };
const about = (notes, what) => notes.find((n) => what.test(n));

describe('the note about a missing Claude Code', () => {
  const note = about(freshUserNotes(NOTHING, { withTools: true, withAgents: false }), /Claude Code/);

  it('says what that copy will do about it', () => {
    expect(note).toBeTruthy();
    expect(note).toMatch(/set one up|install/i);
    expect(note).toMatch(/ChatGPT/);
  });

  // THE CASE THAT MUST NOT MATCH. "agents will not run" was the whole of the
  // old sentence and it is the part that read as a dead end.
  it('no longer says agents will not run, because that copy can still set one up', () => {
    expect(note).not.toMatch(/will not run/);
  });

  it('is still about that copy and not about the computer it was opened from', () => {
    expect(note).toMatch(/copy/i);
  });

  // THE BOUNDARY EITHER SIDE. A copy that was given the tools has nothing to
  // say about them, and so does one whose home already has Claude Code in it.
  it('is not said when there is nothing missing to say it about', () => {
    expect(about(freshUserNotes(NOTHING, { withTools: false, withAgents: false }), /Claude Code of its own/)).toBeUndefined();
    const found = { ...NOTHING, claudeBin: '/usr/local/bin/claude' };
    expect(about(freshUserNotes(found, { withTools: true, withAgents: false }), /Claude Code of its own/)).toBeUndefined();
  });
});

describe('the notes that are not about a missing tool', () => {
  // THE CASE THAT MUST NOT MATCH, at the other end: the honest notes about a
  // throwaway home stay exactly as they were.
  it('still says when there is no keychain for Claude Code to read', () => {
    expect(about(freshUserNotes(NOTHING, { withTools: true, withAgents: false }), /Keychains/)).toBeTruthy();
  });

  it('still says when there is no ~/.claude to bring agents over from', () => {
    expect(about(freshUserNotes(NOTHING, { withTools: true, withAgents: true }), /\.claude/)).toBeTruthy();
    // And not when it was not asked for them.
    expect(about(freshUserNotes(NOTHING, { withTools: true, withAgents: false }), /agents to offer/)).toBeUndefined();
  });
});
