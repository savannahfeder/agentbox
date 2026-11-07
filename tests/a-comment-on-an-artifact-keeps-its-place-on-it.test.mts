// A COMMENT ON AN ARTIFACT KEEPS ITS PLACE ON IT.
//
// A designer reviewed a picture by typing "the empty round
// radio on the Full rows" and "row 12:00 to 13:00", because nothing could be
// pinned; a video was reviewed by writing "0:07 text too small" in a chat; two
// people crossed with the same note on a draft; nothing said which of three
// pictures was approved. Measured against the ledger: no line could name a place
// on a file, so a comment had nowhere to live.
import { it, expect, describe } from 'vitest';
import {
  cleanMark, fileNewsFor, filesInLines, findQuote, marksOf, nextVersionName, notesForTheAgent, placeWords, threadFiles, whoseIsTheFile,
} from '../shared/artifact-marks.mjs';
import { foldWorkItems, buildLine } from '../shared/work-items.mjs';
import { whatATeammateMaySet } from '../shared/team-rules.mjs';
import { threadEvents } from '../renderer/src/thread-history';

const MAYA = 'p-maya';
const SOFIA = 'p-sofia';
const note = (id, file, place, text, over = {}) => ({ do: 'note', id, file, place, text, ...over });
const line = (artifact, by, ts = 1000, uid = `u-${ts}`) => ({ id: 'w-1', ts, source: 'founder', by, uid, patch: { artifact } });
const fold = (...lines) => foldWorkItems(lines).get('w-1');

describe('what a mark may carry', () => {
  it('keeps each kind of place', () => {
    expect(cleanMark(note('n1', 'a.png', { kind: 'pin', x: 0.25, y: 0.5 }, 'Lower')).place).toEqual({ kind: 'pin', x: 0.25, y: 0.5 });
    expect(cleanMark(note('n1', 'a.mp4', { kind: 'time', s: 12.4 }, 'Cut')).place).toEqual({ kind: 'time', s: 12.4 });
    expect(cleanMark(note('n1', 'a.pdf', { kind: 'page', n: 3, word: 'Slide' }, 'Fix')).place).toEqual({ kind: 'page', n: 3, word: 'Slide' });
    expect(cleanMark(note('n1', 'a.md', { kind: 'quote', text: 'Set-up is three steps' }, 'Wrong')).place).toEqual({ kind: 'quote', text: 'Set-up is three steps' });
    expect(cleanMark(note('n1', 'a.md', { kind: 'whole' }, 'Good')).place).toEqual({ kind: 'whole' });
  });
  it('holds a pin to the picture, either side of its edges', () => {
    expect(cleanMark(note('n1', 'a.png', { kind: 'pin', x: 0, y: 1 }, 'x')).place).toEqual({ kind: 'pin', x: 0, y: 1 });
    expect(cleanMark(note('n1', 'a.png', { kind: 'pin', x: -0.01, y: 0.5 }, 'x'))).toBeUndefined();
    expect(cleanMark(note('n1', 'a.png', { kind: 'pin', x: 0.5, y: 1.01 }, 'x'))).toBeUndefined();
  });
  it('refuses a note with no words, no file, a made-up place or a path for a file', () => {
    expect(cleanMark(note('n1', 'a.png', { kind: 'whole' }, '   '))).toBeUndefined();
    expect(cleanMark(note('n1', '', { kind: 'whole' }, 'x'))).toBeUndefined();
    expect(cleanMark(note('n1', 'a.png', { kind: 'nowhere' }, 'x'))).toBeUndefined();
    expect(cleanMark(note('n1', '../../secret.png', { kind: 'whole' }, 'x'))).toBeUndefined();
    expect(cleanMark({ do: 'delete everything' })).toBeUndefined();
    expect(cleanMark(null)).toBeUndefined();
  });
});

describe('how a place reads', () => {
  it('says the place in a person\'s words', () => {
    const notes = marksOf([
      { ...note('a', 'x.png', { kind: 'pin', x: 0.1, y: 0.1 }, 'one'), by: MAYA, ts: 1 },
      { ...note('b', 'x.png', { kind: 'pin', x: 0.2, y: 0.2 }, 'two'), by: MAYA, ts: 2 },
      { ...note('c', 'y.png', { kind: 'pin', x: 0.2, y: 0.2 }, 'other file'), by: MAYA, ts: 3 },
    ]).notes;
    expect(notes.map(placeWords)).toEqual(['Pin 1', 'Pin 2', 'Pin 1']);
    expect(placeWords({ place: { kind: 'time', s: 12.9 } })).toBe('0:12');
    expect(placeWords({ place: { kind: 'time', s: 75 } })).toBe('1:15');
    expect(placeWords({ place: { kind: 'page', n: 3, word: 'Slide' } })).toBe('Slide 3');
    expect(placeWords({ place: { kind: 'page', n: 3 } })).toBe('Page 3');
    expect(placeWords({ place: { kind: 'quote', text: 'Set-up is three steps' } })).toBe('“Set-up is three steps”');
    expect(placeWords({ place: { kind: 'whole' } })).toBe('Whole file');
  });
  it('keeps a pin\'s number when an earlier one is resolved', () => {
    const { notes } = marksOf([
      { ...note('a', 'x.png', { kind: 'pin', x: 0.1, y: 0.1 }, 'one'), by: MAYA, ts: 1 },
      { ...note('b', 'x.png', { kind: 'pin', x: 0.2, y: 0.2 }, 'two'), by: MAYA, ts: 2 },
      { do: 'resolve', on: 'a', by: SOFIA, ts: 3 },
    ]);
    expect(notes.find((n) => n.id === 'b').pin).toBe(2);
  });
});

describe('on the ledger', () => {
  it('folds every comment, and two people\'s comments survive each other', () => {
    const row = fold(
      line(note('n1', 'a.png', { kind: 'pin', x: 0.5, y: 0.5 }, 'From Maya'), MAYA, 1),
      line(note('n2', 'a.png', { kind: 'whole' }, 'From Sofia'), SOFIA, 2),
    );
    expect(row.artifacts.notes.map((n) => [n.id, n.by, n.text])).toEqual([['n1', MAYA, 'From Maya'], ['n2', SOFIA, 'From Sofia']]);
    expect(row.artifact).toBeUndefined();
  });
  it('a line pressed twice is one comment, the first one', () => {
    const row = fold(
      line(note('n1', 'a.png', { kind: 'whole' }, 'First'), MAYA, 1),
      line(note('n1', 'a.png', { kind: 'whole' }, 'Forged over it'), SOFIA, 2),
    );
    expect(row.artifacts.notes.map((n) => n.text)).toEqual(['First']);
  });
  it('resolving folds a comment and reopening brings it back', () => {
    const open = line(note('n1', 'a.png', { kind: 'whole' }, 'Words'), MAYA, 1);
    expect(fold(open).artifacts.notes[0].resolved).toBeFalsy();
    const done = fold(open, line({ do: 'resolve', on: 'n1' }, SOFIA, 2));
    expect(done.artifacts.notes[0]).toMatchObject({ resolved: true, resolvedBy: SOFIA });
    expect(fold(open, line({ do: 'resolve', on: 'n1' }, SOFIA, 2), line({ do: 'reopen', on: 'n1' }, MAYA, 3)).artifacts.notes[0].resolved).toBeFalsy();
  });
  it('leaves a row with no marks with no artifacts at all', () => {
    const row = foldWorkItems([{ id: 'w-1', ts: 1, source: 'founder', patch: { title: 'T' } }]).get('w-1');
    expect(row.artifacts).toBeUndefined();
  });
  it('a press of seen does not move the row up the list', () => {
    const made = { id: 'w-1', ts: 1, source: 'founder', by: MAYA, patch: { title: 'T' } };
    const row = fold(made, line({ do: 'seen', on: ['n1'] }, MAYA, 99));
    expect(row.updatedAt).toBe(1);
  });
  it('writes a real line through the one line builder', () => {
    const built = buildLine({ id: 'w-abc123', patch: { artifact: note('n1', 'a.png', { kind: 'whole' }, 'Words') }, source: 'founder' });
    expect(built.patch.artifact.id).toBe('n1');
  });
  it('crosses to a teammate only in a conversation', () => {
    const pulled = line(note('n1', 'a.png', { kind: 'whole' }, 'Words'), SOFIA);
    expect(whatATeammateMaySet(pulled, { direct: true }).patch.artifact.id).toBe('n1');
    expect(whatATeammateMaySet(pulled, { direct: false })).toBeNull();
  });
});

describe('approving', () => {
  const approve = (file, by = MAYA, ts = 5) => line({ do: 'approve', file }, by, ts);
  it('holds for the version approved and not the next one', () => {
    const { approvals } = fold(approve('onboarding-a-v2.png')).artifacts;
    expect(approvals.some((a) => a.file === 'onboarding-a-v2.png' && a.by === MAYA)).toBe(true);
    expect(approvals.some((a) => a.file === 'onboarding-a-v3.png')).toBe(false);
  });
  it('can be taken back, by the person who gave it', () => {
    expect(fold(approve('a.png'), line({ do: 'unapprove', file: 'a.png' }, MAYA, 6)).artifacts.approvals).toEqual([]);
  });
  it('another person cannot take back Maya\'s approval', () => {
    const { approvals } = fold(approve('a.png'), line({ do: 'unapprove', file: 'a.png' }, SOFIA, 6)).artifacts;
    expect(approvals.map((a) => a.by)).toEqual([MAYA]);
  });
  it('is one state however many times it is pressed', () => {
    expect(fold(approve('a.png', MAYA, 1), approve('a.png', MAYA, 2)).artifacts.approvals).toHaveLength(1);
  });
});

describe('versions', () => {
  const names = (paths) => threadFiles(paths.map((path) => ({ path }))).map((f) => f.versions.map((v) => v.name));
  it('reads a newer file with the same name as the next version', () => {
    for (const newer of ['onboarding-a-v2.png', 'onboarding-a_v2.png', 'onboarding-a (2).png', 'onboarding-a-final.png', 'onboarding-a FINAL.png']) {
      const [family] = threadFiles([{ path: 'designs/onboarding-a.png' }, { path: `designs/${newer}` }]);
      expect(family.versions.map((v) => v.n)).toEqual([1, 2]);
    }
  });
  it('reads a (2) that an attachment\'s name has been cleaned of', () => {
    expect(names(['attachments/mg1abcde-x1y2z3-a.png', 'attachments/mg1abcdf-x1y2z4-a-2-.png'])).toEqual([['a.png', 'a-2-.png']]);
  });
  it('does not take different files for versions', () => {
    expect(names(['a.png', 'b.png'])).toEqual([['a.png'], ['b.png']]);
    expect(names(['shot-3.png', 'shot-4.png'])).toEqual([['shot-3.png'], ['shot-4.png']]);
    expect(names(['onboarding-a.png', 'onboarding-b.png'])).toEqual([['onboarding-a.png'], ['onboarding-b.png']]);
    expect(names(['deck.pdf', 'deck.md'])).toEqual([['deck.pdf'], ['deck.md']]);
    expect(names(['report-final.md', 'report-final-notes.md'])).toEqual([['report-final.md'], ['report-final-notes.md']]);
  });
  it('sends the same file again as one version, and the same name attached again as a new one', () => {
    expect(names(['designs/a.png', 'designs/a.png', './designs/a.png'])).toEqual([['a.png']]);
    const [family] = threadFiles([{ path: 'attachments/mg1abcde-x1y2z3-a.png' }, { path: 'attachments/mg1abcdf-x1y2z4-a.png' }]);
    expect(family.versions.map((v) => v.id)).toEqual(['a.png', 'a.png#2']);
  });
  it('gives the same version the same name on the owner\'s computer and a teammate\'s', () => {
    const owner = threadFiles([{ path: 'designs/onboarding-a-v2.png' }])[0].versions[0];
    const copy = threadFiles([{ path: 'attachments/0123456789ab-onboarding-a-v2.png' }])[0].versions[0];
    expect(copy.id).toBe(owner.id);
    expect(copy.name).toBe('onboarding-a-v2.png');
  });
  it('keeps a word in the middle of a name', () => {
    expect(threadFiles([{ path: 'final-design.png' }])[0].versions[0].name).toBe('final-design.png');
  });
  it('names what the agent should hand back', () => {
    expect(nextVersionName('onboarding-a.png', 1)).toBe('onboarding-a-v2.png');
    expect(nextVersionName('onboarding-a-v2.png', 2)).toBe('onboarding-a-v3.png');
    expect(nextVersionName('a-final.png', 2)).toBe('a-v3.png');
    // Only v7 on the thread: the next is v8, and a count past the name still wins.
    expect(nextVersionName('launch-teaser-v7.mp4', 1)).toBe('launch-teaser-v8.mp4');
    expect(nextVersionName('launch-teaser-v2.mp4', 4)).toBe('launch-teaser-v5.mp4');
  });
});

describe('which files a thread holds', () => {
  const said = (patch, by, ts = 1) => ({ id: 'w', ts, source: 'founder', by, patch });
  it('finds them in the order they were said, with who said it', () => {
    const files = filesInLines([
      said({ body: 'See ![a](attachments/mg1abcde-x1y2z3-a.png)' }, MAYA, 1),
      said({ result: 'Made `designs/cut.mp4` and designs/deck.pdf and reports/plan.md' }, SOFIA, 2),
    ]);
    expect(files.map((f) => [f.path, f.by])).toEqual([
      ['attachments/mg1abcde-x1y2z3-a.png', MAYA], ['designs/cut.mp4', SOFIA], ['designs/deck.pdf', SOFIA], ['reports/plan.md', SOFIA],
    ]);
  });
  it('does not take code, a web address or a source file for an artifact', () => {
    expect(filesInLines([said({ result: '```\ndesigns/in-a-fence.png\n```\nsee https://x.test/a.png and main/a.mjs' })])).toEqual([]);
  });
  it('does not take the file the notes ask an agent to make for a version, until the agent names it', () => {
    const version = { id: 'x.png', name: 'x.png', n: 1, path: 'designs/x.png' };
    const notes = marksOf([{ ...note('a', 'x.png', { kind: 'whole' }, 'Darker'), by: MAYA, ts: 1 }]);
    const { text } = notesForTheAgent(notes, version, 1);
    const asked = [
      { id: 'w', ts: 1, source: 'agent', patch: { result: 'Made designs/x.png' } },
      said({ answer: text }, MAYA, 2),
    ];
    expect(threadFiles(filesInLines(asked))[0].versions.map((v) => v.name)).toEqual(['x.png']);
    const back = [...asked, { id: 'w', ts: 3, source: 'agent', patch: { result: 'Saved designs/x-v2.png' } }];
    expect(threadFiles(filesInLines(back))[0].versions.map((v) => v.name)).toEqual(['x.png', 'x-v2.png']);
  });
  it('knows whose a file is', () => {
    const lines = [said({ body: '[a](attachments/mg1abcde-x1y2z3-a.png)' }, MAYA)];
    expect(whoseIsTheFile(filesInLines(lines), 'a.png')).toBe(MAYA);
    expect(whoseIsTheFile(filesInLines(lines), 'b.png')).toBeNull();
  });
});

describe('what waits on a person', () => {
  const row = (lines, over = {}) => ({ ...foldWorkItems(lines).get('w-1'), createdBy: MAYA, ...over });
  const named = note('n1', 'a.png', { kind: 'whole' }, 'Look @Sofia', { mentions: [SOFIA] });
  it('a teammate\'s approval waits on the file\'s owner, and not on the one who pressed it', () => {
    const r = row([line({ do: 'approve', file: 'a.png' }, SOFIA)]);
    expect(fileNewsFor(r, MAYA).map((n) => [n.kind, n.by, n.file])).toEqual([['approved', SOFIA, 'a.png']]);
    expect(fileNewsFor(r, SOFIA)).toEqual([]);
  });
  it('a teammate\'s note waits on the owner', () => {
    const r = row([line(note('n1', 'a.png', { kind: 'whole' }, 'Hm'), SOFIA)]);
    expect(fileNewsFor(r, MAYA).map((n) => n.id)).toEqual(['n1']);
    expect(fileNewsFor(r, SOFIA)).toEqual([]);
  });
  it('a note names who it names, and nobody else who is merely on the thread', () => {
    const r = row([line(named, MAYA)]);
    expect(fileNewsFor(r, SOFIA).map((n) => n.id)).toEqual(['n1']);
    expect(fileNewsFor(r, 'p-jun')).toEqual([]);
    expect(fileNewsFor(r, MAYA)).toEqual([]);
  });
  it('goes away once opened, for that person alone', () => {
    const both = note('n1', 'a.png', { kind: 'whole' }, 'Look', { mentions: [SOFIA, 'p-jun'] });
    const r = row([line(both, MAYA, 1), line({ do: 'seen', on: ['n1'] }, SOFIA, 2)]);
    expect(fileNewsFor(r, SOFIA)).toEqual([]);
    expect(fileNewsFor(r, 'p-jun').map((n) => n.id)).toEqual(['n1']);
  });
  it('goes away once resolved, and an approval once taken back', () => {
    expect(fileNewsFor(row([line(named, MAYA, 1), line({ do: 'resolve', on: 'n1' }, MAYA, 2)]), SOFIA)).toEqual([]);
    expect(fileNewsFor(row([line({ do: 'approve', file: 'a.png' }, SOFIA, 1), line({ do: 'unapprove', file: 'a.png' }, SOFIA, 2)]), MAYA)).toEqual([]);
  });
  it('is nothing with nobody signed in', () => {
    expect(fileNewsFor(row([line({ do: 'approve', file: 'a.png' }, SOFIA)]), null)).toEqual([]);
  });
  it('goes to who sent the file in a conversation someone else started', () => {
    const r = row([line({ do: 'approve', file: 'a.png', owner: 'p-jun' }, SOFIA)]);
    expect(fileNewsFor(r, 'p-jun')).toHaveLength(1);
    expect(fileNewsFor(r, MAYA)).toEqual([]);
  });
});

describe('sending notes to the agent', () => {
  const marks = marksOf([
    { ...note('a', 'x.png', { kind: 'pin', x: 0.25, y: 0.5 }, 'Move this down'), by: MAYA, ts: 1 },
    { ...note('b', 'x.png', { kind: 'whole' }, 'Darker overall'), by: SOFIA, ts: 2 },
    { ...note('c', 'x.png', { kind: 'whole' }, 'Already done'), by: SOFIA, ts: 3 },
    { do: 'resolve', on: 'c', by: MAYA, ts: 4 },
    { ...note('d', 'other.png', { kind: 'whole' }, 'Another file'), by: SOFIA, ts: 5 },
  ]);
  const version = { id: 'x.png', name: 'x.png', n: 1, path: 'designs/x.png' };
  it('says each open note with its place, the file and the name to hand back', () => {
    const { text, ids } = notesForTheAgent(marks, version, 1, { nameOf: (p) => (p === MAYA ? 'Maya' : 'Sofia') });
    expect(ids).toEqual(['a', 'b']);
    expect(text).toContain('designs/x.png');
    expect(text).toContain('Pin 1, 25% across and 50% down: Move this down (Maya)');
    expect(text).toContain('Whole file: Darker overall (Sofia)');
    expect(text).toContain('x-v2.png');
    expect(text).not.toContain('Already done');
    expect(text).not.toContain('Another file');
  });
  it('does not send a note twice', () => {
    const later = marksOf([...marks.notes.filter((n) => !n.resolved).map((n) => ({ do: 'note', ...n })), { do: 'sent', on: ['a'], by: MAYA, ts: 9 }]);
    expect(notesForTheAgent(later, version, 1, { nameOf: () => 'M' }).ids).toEqual(['b']);
  });
  it('a note starts no agent on its own: it answers nothing and changes no status', () => {
    const made = { id: 'w-1', ts: 1, source: 'founder', by: MAYA, patch: { title: 'T', status: 'done' } };
    const row = fold(made, line(note('n1', 'a.png', { kind: 'whole' }, 'Words'), SOFIA, 2));
    expect(row.status).toBe('done');
    expect(row.answer).toBeUndefined();
  });
});

describe('finding a quoted passage', () => {
  it('finds it across a line break and a change of spacing', () => {
    expect(findQuote('Set-up is\nthree   steps today', 'Set-up is three steps')).toEqual({ start: 0, end: 23 });
    expect(findQuote('Before. Set-up is three steps.', 'three steps')).toEqual({ start: 18, end: 29 });
  });
  it('finds nothing where the words have gone', () => {
    expect(findQuote('Set-up is two steps', 'three steps')).toBeNull();
    expect(findQuote('anything', '  ')).toBeNull();
  });
});

describe('in the thread', () => {
  it('draws a comment as a message that links to its place, and an approval as a line', () => {
    const lines = [
      { id: 'w-1', ts: 1, source: 'founder', by: MAYA, uid: 'u1', patch: { title: 'T', body: 'See it' } },
      line(note('n1', 'a.png', { kind: 'pin', x: 0.5, y: 0.5 }, 'Lower'), SOFIA, 2),
      line({ do: 'approve', file: 'a.png' }, MAYA, 3),
      line({ do: 'resolve', on: 'n1' }, MAYA, 4),
      line({ do: 'seen', on: ['n1'] }, MAYA, 5),
    ];
    const said = threadEvents(lines).filter((e) => e.fileMark);
    expect(said.map((e) => [e.fileMark.kind, e.fileMark.file, e.fileMark.place ?? null, e.by])).toEqual([
      ['note', 'a.png', 'Pin 1', SOFIA],
      ['approved', 'a.png', null, MAYA],
    ]);
    expect(said[0].words).toBe('Lower');
  });
});
