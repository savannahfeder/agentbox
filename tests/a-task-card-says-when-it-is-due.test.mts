// A TASK CARD SAYS WHEN IT IS DUE.
//
// Two testers gave a task a due date ("Due Thu" on the task page, "Due Fri" in
// the person's panel) and then looked for it on the In progress board, where
// the card said only WITH DEV. "In Linear the due date is on the card."
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const pages = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/threads/Pages.tsx'), 'utf8');

describe('a task card on the board', () => {
  it('carries the due words beside its state', () => {
    expect(pages).toContain("{e.task && dueWords(e.item?.due) && <span className=\"p tm-due-word\">{dueWords(e.item?.due)}</span>}");
  });
  it('takes them from the one rule every other place uses', () => {
    expect(pages).toMatch(/import \{ Face, TeamContext, dueWords, firstName, personOf \} from '\.\.\/team\/people';/);
  });
});
