// THE BOTTOM LEFT OF A MESSAGE TO A PERSON (w-a8e752a9f2, 2026-10-01).
//
// Two rules meet on this one corner, and together they settle what goes in it:
//
//  - "Only you and Maya see this" is implied in a direct message and wastes
//    space. Measured in the real renderer before this change: the new message
//    card reads TO / Theo Park one line above it, and the conversation's own
//    header reads MESSAGES · MAYA GAVE YOU THIS with both faces beside it. The
//    sentence was the third place on the screen saying the same thing.
//  - The bottom left of a message to a person must not then sit EMPTY. A bare
//    corner there reads as a control that failed to draw, so dropping the line
//    without putting anything in its place is the one outcome ruled out.
//
// So the corner says the thing the card does NOT already say: where the message
// goes. A message to a teammate is not a chat bubble, it becomes a thread in
// their inbox, which is the one app-specific fact about it.
//
// Nothing else can truthfully go there. A message to a person carries no
// project, priority, model or schedule: api.teamMessage(to, text) takes words
// and people and nothing else, so a chip for any of them would draw a field
// the send throws away.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { landsIn } from '../renderer/src/threads/composer-rules.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('where a message to a person lands', () => {
  it('names the one person whose inbox it goes to', () => {
    expect(landsIn(['Maya'])).toBe("Goes to Maya's inbox.");
  });

  // The possessive sits on the LAST name only, which is how a joint possessive
  // is written: "Maya and Jun's inboxes", never "Maya's and Jun's".
  it('names everyone when a message goes to more than one person', () => {
    expect(landsIn(['Maya', 'Jun'])).toBe("Goes to Maya and Jun's inboxes.");
    expect(landsIn(['Maya', 'Jun', 'Priya'])).toBe("Goes to Maya, Jun and Priya's inboxes.");
  });

  // The boundary either side: nobody addressed yet draws nothing, and the
  // corner is never the string "undefined".
  it('says nothing at all when nobody is addressed', () => {
    expect(landsIn([])).toBe('');
  });
});

describe('the line that was removed', () => {
  const files = [
    'renderer/src/components/Focus.tsx',
    'renderer/src/threads/ThreadComposer.tsx',
    'renderer/src/threads/composer-rules.ts',
  ];

  // Comments explaining the removal are allowed to quote it; drawn strings are
  // not, so both comment kinds come out before the check. JSX comments are
  // {/* ... */}, which the block pass takes with it.
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('is gone from every box that drew it', () => {
    for (const f of files) {
      expect(code(read(f)), `${f} still draws it`).not.toMatch(/Only you[^\n]*see this/);
    }
  });

  // THE CASE THAT MUST NOT MATCH. A thread's Private visibility row says "Only
  // you see it. It is not on the Team board.", which is a different sentence
  // about a different thing and stays exactly as it is.
  it('leaves the Private visibility row alone', () => {
    expect(code(read('renderer/src/threads/composer-rules.ts')))
      .toMatch(/Only you see it\. It is not on the Team board\./);
  });

  it('leaves no onlyYouAnd behind for a later box to pick up', () => {
    expect(read('renderer/src/threads/composer-rules.ts')).not.toMatch(/onlyYouAnd/);
  });
});

describe('the corner is filled, not emptied', () => {
  it('the new message card draws the line on a message to a person', () => {
    const src = read('renderer/src/threads/ThreadComposer.tsx');
    // The person branch of the bottom bar, which holds only this and Send.
    expect(src).toMatch(/landsIn\(/);
    expect(src).toMatch(/tc-only/);
  });

  it('the reply box draws it on a conversation with a person', () => {
    const src = read('renderer/src/components/Focus.tsx');
    expect(src).toMatch(/landsIn\(/);
  });

  // The agent's own clause is untouched: a message going into somebody's
  // terminal still says so, and these are not the same sentence.
  it('leaves a message to an agent saying where IT goes', () => {
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/Goes straight into/);
  });
});
