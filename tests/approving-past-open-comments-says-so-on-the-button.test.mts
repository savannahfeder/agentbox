// APPROVING PAST OPEN COMMENTS SAYS SO ON THE BUTTON (2026-11-20).
//
// On a synthetic team, Priya answered Lena's note on bookings-option-1 v2 with
// "Yes from me, build this one" and pressed Approve. Two buttons came up,
// "Approve v2 anyway" and "Not yet". The line before them said two comments
// were still open, but the button did not, and her clear yes read as
// overriding something she could not name. Measured from approveAsk and the
// view: the button was "Approve v{n} anyway" whatever the reason.
//
// The button now names what approving goes past: the comments left open, the
// newer version, or both.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { approveAsk, threadFiles } from '../shared/artifact-marks.mts';

const [fam] = threadFiles(['bookings-option-1.html', 'bookings-option-1-v2.html', 'bookings-option-1-v3.html'].map((path, i) => ({ path, at: i })));
const note = (id: string, file: string, resolved = false) => ({ id, file, resolved });

describe('the button that approves past what the line names', () => {
  it('says the comments it leaves open, the reported one', () => {
    const ask = approveAsk(fam, 2, [note('a', 'bookings-option-1-v3.html'), note('b', 'bookings-option-1-v3.html')]);
    expect(ask).toMatchObject({ text: 'Approve v3? 2 comments are still open.', yes: 'Approve with 2 comments open' });
  });

  it('says one comment in the singular', () => {
    expect(approveAsk(fam, 2, [note('a', 'bookings-option-1-v3.html')])?.yes).toBe('Approve with 1 comment open');
  });

  it('says it is the older version when a newer one is there', () => {
    expect(approveAsk(fam, 1, [])?.yes).toBe('Approve v2, not v3');
  });

  it('says both when both are so', () => {
    expect(approveAsk(fam, 1, [note('a', 'bookings-option-1.html')])?.yes).toBe('Approve v2 with 1 comment open');
  });

  it('asks nothing for the newest with nothing open', () => {
    expect(approveAsk(fam, 2, [note('a', 'bookings-option-1-v3.html', true)])).toBeNull();
  });

  it('is the words the view draws, and "anyway" is gone', () => {
    const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
    expect(view).toContain('{approveAsked.yes}');
    expect(view).not.toMatch(/anyway</);
  });
});
