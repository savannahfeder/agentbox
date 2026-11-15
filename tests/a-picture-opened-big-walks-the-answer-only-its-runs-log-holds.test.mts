// A picture opened big walks the answer the thread shows, though only the
// run's log holds that answer.
//
// What broke (2026-11-10): an agent's last answer drew a picture, its -v2 and
// three more. A click on the first opened the big view with no arrows and no
// "v1 of 2", and from elsewhere the arrows walked an earlier answer's pictures:
// "it keeps showing me earlier versions of images, not adhering to order".
// Workers no longer write their answer onto the row; the thread draws it from
// the run's log, and the big view read only the row's history, so none of that
// answer's pictures were files of the thread. Measured on that thread: the
// five pictures the turn handed over came back as zero steps, and the agent's
// latest pictures were the round before. The Files line also drops a version it
// does not know unless it was the one pressed, so a picture the page drew is
// kept as well.
import { describe, it, expect } from 'vitest';
import { filesInLines, latestPicturesSaid, nextStep, stepsThrough, threadFiles, whereAPressLands, withFilesAsked } from '../shared/artifact-marks.mts';
import { withRunsSaid } from '../renderer/src/runs-said.ts';
import { picturesBeside } from '../renderer/src/picture-view.ts';

const D = '/Users/someone/store/designs/w-1';
const agent = (ts, result) => ({ id: `l${ts}`, ts, source: 'agent', patch: { result } });
const you = (ts, answer) => ({ id: `l${ts}`, ts, source: 'founder', patch: { answer } });

// The row's own history: an earlier round of five, then her notes and replies.
const ledger = [
  agent(1_000, ['inbox-1', 'inbox-2', 'inbox-3'].map((n) => `${D}/${n}.png`).join('\n\n') + `\n\n${D}/wash-2.png\n\n${D}/wash-2-v2.png`),
  you(2_000, `Notes on ${D}/inbox-2.png: show it unhovered`),
  you(9_000, 'the inbox button should only show in threads'),
];

// The run that answered, as its log reads. Its clock starts at its own start.
const startedAt = Date.UTC(2026, 10, 10, 0, 0, 0);
const at = (s) => `00:00:${String(s).padStart(2, '0')}`;
const run = {
  startedAt,
  text: [
    '# the thread',
    '',
    `${at(1)}  [Read] ${D}/inbox-2.png`,
    '#id t1',
    `${at(5)}  Here it is unhovered, the next version of inbox-2.png:`,
    `${D}/inbox-2-v2.png`,
    '',
    'Three quieter washes:',
    `${D}/wash-2-v3.png`,
    '',
    `${D}/wash-half.png`,
    '',
    `${D}/wash-title.png`,
    '',
    '# exited (0)',
  ].join('\n'),
};
// The run ended at second 5 of its clock; her later reply comes after it.
const lines = withRunsSaid(ledger.map((l, i) => (i === 2 ? { ...l, ts: startedAt + 60_000 } : l)), [run]);
// Files numbers only what the row's history named.
const numbers = { [`${D}/inbox-2.png`]: 1, [`${D}/wash-2.png`]: 1, [`${D}/wash-2-v2.png`]: 2 };

// What a click on the first picture of that turn hands the big view: the steps,
// and every picture the turn drew.
const drawn = [`${D}/inbox-2-v2.png`, `${D}/wash-2-v3.png`, `${D}/wash-half.png`, `${D}/wash-title.png`];
const click = picturesBeside([`${D}/inbox-2.png`, ...drawn].map((path) => ({ path, url: path, section: 'run' })), 0);
const turn = click.pictures.map((p) => p.path);
const keep = [...turn, ...click.drawn];

describe('a click on a picture in the turn', () => {
  it('steps through each picture once, from the one clicked', () => {
    expect(turn.map((p) => p.split('/').pop())).toEqual(['inbox-2.png', 'wash-2-v3.png', 'wash-half.png', 'wash-title.png']);
  });
  it('hands over every version the turn drew', () => {
    expect(click.drawn).toContain(`${D}/inbox-2-v2.png`);
  });
});

describe('the answer only the run\'s log holds', () => {
  const families = threadFiles(filesInLines(lines), numbers, { keep });
  const name = (s) => (s ? families[s.fi].versions[s.vi].path.split('/').pop() : null);

  it('counts the versions it drew', () => {
    const inbox = families.find((f) => f.versions.some((v) => v.name === 'inbox-2.png'));
    expect(inbox.versions.map((v) => v.name)).toEqual(['inbox-2.png', 'inbox-2-v2.png']);
  });

  it('gives the arrows every picture the turn drew, in its order', () => {
    expect(stepsThrough(families, turn).map(name)).toEqual(['inbox-2.png', 'wash-2-v3.png', 'wash-half.png', 'wash-title.png']);
  });

  it('steps from the first picture to the next, and stops at the ends', () => {
    const steps = stepsThrough(families, turn);
    const first = whereAPressLands(families, { path: `${D}/inbox-2.png` });
    expect(name(nextStep(families, steps, first, 1))).toBe('wash-2-v3.png');
    expect(nextStep(families, steps, first, -1)).toBeNull();
    expect(nextStep(families, steps, whereAPressLands(families, { path: `${D}/wash-title.png` }), 1)).toBeNull();
  });

  it('is the agent\'s latest pictures, not the round before', () => {
    expect(latestPicturesSaid(lines).map((p) => p.split('/').pop())).toEqual(['inbox-2.png', 'inbox-2-v2.png', 'wash-2-v3.png', 'wash-half.png', 'wash-title.png']);
  });
});

describe('a run\'s log, read as lines', () => {
  it('keeps what the agent said and leaves out what it only did', () => {
    const said = withRunsSaid([], [run]);
    expect(said.every((l) => l.source === 'agent')).toBe(true);
    expect(said.map((l) => l.patch.note).join('\n')).not.toMatch(/\[Read\]/);
  });

  it('sits in time order among the row\'s own lines', () => {
    expect(lines.map((l) => l.ts)).toEqual([...lines.map((l) => l.ts)].sort((a, b) => a - b));
  });

  it('adds nothing when there is no run', () => {
    expect(withRunsSaid(ledger, [])).toEqual(ledger);
  });
});

describe('a picture the page drew that the row\'s lines never name', () => {
  // The big view's fallback when the log has not been read yet.
  const files = withFilesAsked(filesInLines(ledger), [`${D}/inbox-2.png`, ...click.drawn]);
  const families = threadFiles(files, numbers, { keep });

  it('is still a step', () => {
    expect(stepsThrough(families, turn)).toHaveLength(4);
  });

  it('keeps the version beside the one clicked', () => {
    const inbox = families.find((f) => f.versions.some((v) => v.name === 'inbox-2.png'));
    expect(inbox.versions.map((v) => v.name)).toEqual(['inbox-2.png', 'inbox-2-v2.png']);
  });

  it('is kept though the Files line does not know it', () => {
    const wash = families.find((f) => f.versions.some((v) => v.name === 'wash-2.png'));
    expect(wash.versions.map((v) => v.name)).toEqual(['wash-2.png', 'wash-2-v2.png', 'wash-2-v3.png']);
  });

  it('is not added twice when the lines already name it', () => {
    expect(withFilesAsked(filesInLines(ledger), [`${D}/inbox-2.png`]).filter((f) => f.path.endsWith('/inbox-2.png'))).toHaveLength(1);
  });

  it('is only a file the big view can show', () => {
    expect(withFilesAsked([], ['notes about it', `${D}/x.zip`]).map((f) => f.path)).toEqual([]);
  });

  it('and a version neither the page nor the Files line knows is still left out', () => {
    const fams = threadFiles(withFilesAsked(filesInLines(ledger), [`${D}/wash-9.png`]), numbers, { keep });
    const wash = fams.find((f) => f.versions.some((v) => v.name === 'wash-2.png'));
    expect(wash.versions.map((v) => v.name)).not.toContain('wash-9.png');
  });
});
