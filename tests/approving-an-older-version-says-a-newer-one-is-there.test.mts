// APPROVING AN OLDER VERSION SAYS A NEWER ONE IS THERE.
//
// Maya: Approve on
// group-seat-picker v2 turned into "Approved" at once while v3 existed and two
// pins from v1 were still open, and nothing said so. Today then listed the
// approval under v3's name. Measured from the view: approve() wrote the mark
// with no look at the versions after it or the comments on it.
//
// What must NOT ask: the newest version with nothing open on it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { approveAsk, threadFiles } from '../shared/artifact-marks.mts';

const [fam] = threadFiles(['seat.png', 'seat-v2.png', 'seat-v3.png'].map((path, i) => ({ path, at: i })));
const pin = (id, file, resolved = false) => ({ id, file, resolved, place: { kind: 'pin', x: 0.5, y: 0.5 } });

describe('approving', () => {
  it('v2 when v3 is there offers v3, and says the pins still open', () => {
    const ask = approveAsk(fam, 1, [pin('a', 'seat.png'), pin('b', 'seat.png')]);
    expect(ask.text).toBe('Approve v2? v3 is newer. 2 comments are still open.');
    expect(ask.newest.name).toBe('seat-v3.png');
  });

  it('the newest with a comment open on it asks only about the comment', () => {
    const ask = approveAsk(fam, 2, [pin('a', 'seat-v3.png')]);
    expect(ask).toMatchObject({ text: 'Approve v3? 1 comment is still open.', newest: null });
  });

  it('the newest with nothing open on it asks nothing', () => {
    expect(approveAsk(fam, 2, [pin('a', 'seat.png', true)])).toBeNull();
  });

  it('the view asks before it approves', () => {
    const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
    expect(view).toMatch(/approveAsk\(/);
    expect(view).toMatch(/anyway/);
  });
});
