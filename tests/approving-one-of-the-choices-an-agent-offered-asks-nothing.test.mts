// APPROVING ONE OF THE CHOICES AN AGENT OFFERED ASKS NOTHING.
//
// An agent offered three designs in one message: sky-in-the-header.png,
// sky-in-the-header-v4.png and sky-in-the-header-v5.png. They read as versions
// 1, 4 and 5 of one file, so Approve on option 1 asked "Approve v1? v5 is
// newer." The question sat over the picture, far from the button, and the
// presses looked like they did nothing; the thread never moved. Measured from
// the thread's record: no approval of v1 was ever written, only v5 once the
// question was noticed.
//
// What must still ask: a version the newest message no longer names.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { approveAsk, offeredTogether, threadFiles, filesInLines } from '../shared/artifact-marks.mts';

const dir = '/home/someone/docs/designs/w-1';
const said = (ts, text, source = 'agent') => ({ ts, source, by: 'me', patch: { [source === 'agent' ? 'result' : 'answer']: text } });
const lines = [
  said(1, `Option one: ${dir}/sky.png`),
  said(2, `Two more: ${dir}/sky-v2.png and ${dir}/sky-v3.png`),
  said(3, `Fixed the border: ${dir}/sky-v4.png`),
  said(4, `Which should I build?\n\n1. ${dir}/sky.png\n\n2. ${dir}/sky-v4.png\n\n3. ${dir}/sky-v5.png`),
];
const [fam] = threadFiles(filesInLines(lines));

describe('approving a choice', () => {
  it('reads the five versions the way the viewer does', () => {
    expect(fam.versions.map((v) => v.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it('names the versions the newest message offers', () => {
    expect([...offeredTogether(lines, fam)].sort()).toEqual(['sky-v4.png', 'sky-v5.png', 'sky.png']);
  });

  it('v1 offered beside v5 approves without asking', () => {
    expect(approveAsk(fam, 0, [], offeredTogether(lines, fam))).toBeNull();
  });

  it('v4 offered beside v5 approves without asking', () => {
    expect(approveAsk(fam, 3, [], offeredTogether(lines, fam))).toBeNull();
  });

  it('v2, which the newest message left out, still says v5 is newer', () => {
    expect(approveAsk(fam, 1, [], offeredTogether(lines, fam))?.text).toBe('Approve v2? v5 is newer.');
  });

  it('a comment still open on an offered version is still asked about', () => {
    const open = [{ id: 'a', file: 'sky.png', resolved: false }];
    expect(approveAsk(fam, 0, open, offeredTogether(lines, fam))).toMatchObject({ text: 'Approve v1? 1 comment is still open.', newest: null });
  });

  it('a later message naming only v5 makes v1 old again', () => {
    const later = [...lines, said(5, `Built option 3: ${dir}/sky-v5.png`)];
    expect(approveAsk(fam, 0, [], offeredTogether(later, fam))?.text).toBe('Approve v1? v5 is newer.');
  });

  it('a person repeating a bare name does not count as an offer', () => {
    const later = [...lines, said(5, `${dir}/sky-v5.png`), said(6, 'is sky.png the one?', 'founder')];
    expect(approveAsk(fam, 0, [], offeredTogether(later, fam))?.text).toBe('Approve v1? v5 is newer.');
  });

  it('the view passes what was offered to the question', () => {
    const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8');
    expect(view).toMatch(/approveAsk\([^)]*offeredTogether\(/);
  });
});
