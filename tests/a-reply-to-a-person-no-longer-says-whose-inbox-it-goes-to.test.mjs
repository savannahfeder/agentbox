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
// THE NEW MESSAGE CARD HAS SINCE LEFT THIS RULE BEHIND (w-7ba439c883,
// 2026-10-05), and it left it by satisfying it. A message now carries a level,
// so that card's corner holds the priority chip; the corner is not bare, and
// the sentence beside it was repeating the To field one line above. The reply
// box has no level to carry — a level belongs to the message that OPENS a
// conversation — so the line stayed the whole of its corner.
//
// AND THEN THE REPLY BOX LOST IT TOO (w-140ac855b1, 2026-10-13), at the
// person's own request: "I think it's best to remove the 'text goes to
// [their teammate]'s inbox' part." Measured on their screen before the change: the
// reply box's footer read the formatting bar, then "Goes to …'s inbox.", then
// Send. The corner is not bare without it, because the formatting bar sits
// there. What is left of the old rule is that the slot still speaks when an
// agent in the message has no project and Send is waiting.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('whose inbox a reply goes to', () => {
  it('is not said in any box', () => {
    for (const f of ['renderer/src/components/Focus.tsx', 'renderer/src/threads/ThreadComposer.tsx', 'renderer/src/threads/composer-rules.ts']) {
      expect(code(read(f)), `${f} still says it`).not.toMatch(/Goes to \$\{|inboxes?\./);
      expect(code(read(f)), `${f} still says it`).not.toMatch(/landsIn/);
    }
  });

  // THE CASE THAT MUST STAY: the same slot still says why Send is waiting
  // when an agent named in the message has no project.
  it('still says why Send waits when an agent in the message has no project', () => {
    expect(code(read('renderer/src/components/Focus.tsx'))).toMatch(/chat\.block \? <span className="dim">\{chat\.block\}<\/span> : null/);
  });

  it('keeps the formatting bar in the corner, so the corner is not bare', () => {
    expect(code(read('renderer/src/components/Focus.tsx'))).toMatch(/talkTo\?\.length \? <FormatBar/);
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
  // The card's corner is filled by the priority chip now, and what pins that is
  // tests/a-message-to-a-teammate-carries-the-level-you-picked. What this one
  // still holds is that the corner never went empty on the way.
  it('the new message card draws a control where the line was', () => {
    const src = read('renderer/src/threads/ThreadComposer.tsx');
    const from = src.indexOf("{person && sendAs === 'message' ? (");
    const bar = src.slice(from, src.indexOf('\n        ) : (', from));
    expect(bar).toMatch(/\{priorityChip\}/);
  });

  // The agent's own clause is untouched: a message going into somebody's
  // terminal still says so, and these are not the same sentence.
  it('leaves a message to an agent saying where IT goes', () => {
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/Goes straight into/);
  });
});
