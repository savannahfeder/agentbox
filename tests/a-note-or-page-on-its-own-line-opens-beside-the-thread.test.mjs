// A note or page on its own line opens beside the thread.
//
// Nothing opened on the side by itself any more, and from the Needs you page a
// file could only go inline or full screen, so an answer's draft could not sit
// beside the thread while it was being worked on. The agent now decides: a
// .md or .html path on a line of its own opens beside, one named in a sentence
// stays inline, and a picture always stays inline.
import { describe, it, expect } from 'vitest';
import { besideDocument } from '../renderer/src/message-artifacts.ts';

describe('which file an answer opens beside the thread', () => {
  it('opens the draft the answer sets on its own line', () => {
    expect(besideDocument('Tightened the middle.\n\napplication-draft.md\n')).toBe('application-draft.md');
    expect(besideDocument('Three options.\n\ndesigns/w-1/options.html')).toBe('designs/w-1/options.html');
  });

  it('reads a path in backticks, bold or a link the same way', () => {
    expect(besideDocument('`scripts/launch-video.md`')).toBe('scripts/launch-video.md');
    expect(besideDocument('**designs/w-1/round-2.html**')).toBe('designs/w-1/round-2.html');
    expect(besideDocument('[the draft](drafts/script.md)')).toBe('drafts/script.md');
  });

  it('reads a full path inside the product folder as its short path', () => {
    expect(besideDocument('/home/a/docs/agentbox/designs/w-1/a.html', '/home/a/docs/agentbox')).toBe('designs/w-1/a.html');
  });

  it('leaves a file named inside a sentence inline, which is how a settled one is named', () => {
    expect(besideDocument("It's saved in the draft: application-draft.md")).toBeNull();
    expect(besideDocument('Those are approved, see designs/w-1/options.html for the record.')).toBeNull();
  });

  it('never opens a picture, a code file or our own bookkeeping', () => {
    expect(besideDocument('designs/w-1/the-row.png')).toBeNull();
    expect(besideDocument('renderer/src/App.tsx')).toBeNull();
    expect(besideDocument('STATE.md')).toBeNull();
    expect(besideDocument('CLAUDE.md')).toBeNull();
  });

  it('takes the first one when the answer sets out more than one', () => {
    expect(besideDocument('designs/w-1/a.html\ndesigns/w-1/b.html')).toBe('designs/w-1/a.html');
  });

  it('opens nothing for an empty answer', () => {
    expect(besideDocument(undefined)).toBeNull();
    expect(besideDocument('')).toBeNull();
  });
});
