// A COPY ACROSS A REMOVED LINE TAKES WHAT WAS SELECTED, NEVER THE OLD CLIPBOARD.
//
// Found by the GPT-6.1-Sol tester on 2026-10-04: selecting a removed import
// and the line that replaced it, then copying, pasted the PREVIOUS six-line
// block. The pane drops removed lines from a copy, which left one line, and one
// line was handed to the browser as "nothing to improve". But the selection
// started in a removed row, so the browser copied nothing of use and the
// clipboard kept what was on it before. Copying went quietly wrong, which is
// worse than not working.
//
// The rule now looks at every row the selection touches, removed or not.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { linesToCopy } from '../renderer/src/code-copy.ts';

const tsx = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer', 'src', 'components', 'CodeArtifact.tsx'), 'utf8');

describe('which rows a copy takes', () => {
  it('takes the surviving line when a removed one is selected with it', () => {
    // The reported case: [removed, added]. The copy is built here, not left to the browser.
    expect(linesToCopy([true, false])).toEqual([1]);
    expect(linesToCopy([false, true])).toEqual([0]);
  });

  it('leaves a selection inside one row to the browser', () => {
    expect(linesToCopy([false])).toBeNull();
    expect(linesToCopy([true])).toBeNull();
    expect(linesToCopy([])).toBeNull();
  });

  it('skips removed rows in the middle of a block, as before', () => {
    expect(linesToCopy([false, true, true, false, false])).toEqual([0, 3, 4]);
  });

  it('takes the removed rows when they are all that was selected', () => {
    // She chose deleted code on purpose; handing back nothing would be the same bug.
    expect(linesToCopy([true, true])).toEqual([0, 1]);
  });

  it('is what the pane asks before it decides to stand aside', () => {
    expect(tsx).toMatch(/linesToCopy\(/);
  });
});
