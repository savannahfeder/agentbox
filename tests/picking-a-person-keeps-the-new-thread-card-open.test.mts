// PICKING A PERSON NO LONGER THROWS THE CARD AWAY (w-c34591721f, 2026-10-17).
//
// What broke: `chooseTo` called `onOpenConversation` the moment you picked
// somebody you already had a conversation with, so the card closed and the
// chat opened instead. It fired on the PICK, before the card could know what
// you were making — which meant Send As could never be reached for anyone you
// already talk to, and the feature was unusable for exactly the people you
// talk to most.
//
// How it was measured: pressing N and picking Maya in the real app, with a
// conversation already on disk, left the chat open and the card gone.
//
// The fix is that the card composes and never navigates. Going back to a
// conversation is what the person's name, search and the palette are for. The
// card still SAYS the conversation exists, using the note it already had for
// the group case (`tc-continues`), so nothing is hidden — it just stops moving
// you without being asked.
//
// This reads the card as text because the jump was a side effect of a click
// handler, and the thing being pinned is its absence.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const card = fs.readFileSync(path.join(root, 'renderer/src/threads/ThreadComposer.tsx'), 'utf8');

// Everything between `const chooseTo` and the next top-level const.
const chooseTo = card.slice(card.indexOf('const chooseTo'), card.indexOf('const toMenu'));

describe('choosing who it is for', () => {
  it('does not open a conversation', () => {
    expect(chooseTo).not.toContain('onOpenConversation');
  });

  it('still sets who it is for', () => {
    expect(chooseTo).toContain('setTo(id)');
  });
});

describe('the conversation you already have', () => {
  // Said, not done: the note offers the way over, and the press is yours.
  it('is offered rather than opened', () => {
    expect(card).toContain('tc-continues');
    expect(card).toContain('Continues your conversation with');
  });

  // It used to need two or more people, because one person jumped instead.
  // With the jump gone, one person has to get the same note.
  it('is offered for one person too, not only for a group', () => {
    const line = card.split('\n').find((l) => l.includes('conversationWith(['));
    expect(line).toBeTruthy();
    expect(line).not.toContain('extra.length');
  });
});
