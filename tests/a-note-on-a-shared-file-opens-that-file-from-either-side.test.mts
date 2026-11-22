// A NOTE ON A SHARED FILE OPENS THAT FILE, FROM EITHER SIDE.
//
// Two synthetic testers on one team (2026-11-11): a note on
// payments-auth-audit.md opened "audit.md could not be found" (3 times), and a
// note on bookings-empty-states.html opened "states.html could not be found"
// (2 times). A shared thread's copy is named `<sha12>-<name>`, and shownName
// also cut a saved attachment's stamp (`<time>-<random>-`) off the front of
// what was left, so "payments-auth-" and "bookings-empty-" read as a stamp. The
// teammate's view called the file audit.md, the note was stored on audit.md,
// and the owner's view, which knows it as payments-auth-audit.md, made up a
// file called audit.md to open the note on. Measured with threadFiles over the
// owner's lines and over the lines their copy publishes: ids
// payments-auth-audit.md and audit.md for one file.
//
// Pinned: both sides give one file one id; a note stored under the old name
// still lands on its file; a note named by its place on the version line (`@2`)
// or as a second copy (`#2`) lands on that version; a real stamp is still cut;
// and an id that names some other file is never moved onto this one.
import { describe, it, expect } from 'vitest';
import { marksOnVersions, shownName, threadFiles, versionNamed, withFilesAsked, filesInLines } from '../shared/artifact-marks.mts';
import { otherFilesOpen } from '../renderer/src/artifact-pins.ts';

const SHA = '39f73afdfe6c';
const owner = (path) => [{ path, by: 'lena', at: 1 }];
const copy = (name) => [{ path: `attachments/${SHA}-${name}`, by: null, at: 1 }];
const idsOf = (files, numbers = null) => threadFiles(files, numbers).flatMap((f) => f.versions.map((v) => v.id));

describe('one file, one name, on both computers', () => {
  it('keeps the whole name of a copy whose first words only look like a stamp', () => {
    expect(shownName(`attachments/${SHA}-payments-auth-audit.md`)).toBe('payments-auth-audit.md');
    expect(shownName(`attachments/${SHA}-bookings-empty-states.html`)).toBe('bookings-empty-states.html');
    expect(shownName('attachments/settings-mobile-hero.png')).toBe('settings-mobile-hero.png');
  });

  it('still cuts the stamp off a saved attachment and off a copy of one', () => {
    expect(shownName('attachments/mw94aqml-7ooz52-rows.csv')).toBe('rows.csv');
    expect(shownName(`attachments/${SHA}-mw94aqml-7ooz52-rows.csv`)).toBe('rows.csv');
    expect(shownName('attachments/mvwy9999-ab-late.png')).toBe('late.png');
  });

  it('gives the owner and a teammate the same id for the file', () => {
    expect(idsOf(copy('payments-auth-audit.md'))).toEqual(idsOf(owner('docs/payments-auth-audit.md')));
    expect(idsOf(copy('payments-auth-audit.md'))).toEqual(['payments-auth-audit.md']);
  });
});

describe('a note finds its version', () => {
  const ownSide = threadFiles(owner('docs/payments-auth-audit.md'));
  const theirSide = threadFiles(copy('payments-auth-audit.md'));

  it('by its id', () => {
    expect(versionNamed(ownSide, 'payments-auth-audit.md')?.path).toBe('docs/payments-auth-audit.md');
  });

  it('by the name a teammate\'s copy gave it before, on both sides', () => {
    expect(versionNamed(ownSide, 'audit.md')?.path).toBe('docs/payments-auth-audit.md');
    expect(versionNamed(theirSide, 'audit.md')?.path).toBe(`attachments/${SHA}-payments-auth-audit.md`);
    const states = threadFiles(owner('designs/w-1/bookings-empty-states.html').concat(owner('designs/w-1/a.png')));
    expect(versionNamed(states, 'states.html')?.name).toBe('bookings-empty-states.html');
  });

  it('by its place on the version line, and as the second copy of a name', () => {
    const two = threadFiles([...owner('designs/r1/states.png'), ...owner('designs/r2/states.png')], { 'designs/r1/states.png': 1, 'designs/r2/states.png': 2 });
    expect(versionNamed(two, 'states.png@2')?.path).toBe('designs/r2/states.png');
    expect(versionNamed(two, 'states.png#2')?.path).toBe('designs/r2/states.png');
    expect(versionNamed(two, 'states.png@3')).toBeNull();
  });

  it('never moves a note onto another file', () => {
    const both = threadFiles([...owner('audit.md'), ...owner('docs/payments-auth-audit.md')]);
    expect(versionNamed(both, 'audit.md')?.path).toBe('audit.md');
    expect(versionNamed(ownSide, 'other.md')).toBeNull();
    expect(versionNamed(ownSide, 'payments-auth-audit.md@2')).toBeNull();
    expect(versionNamed(threadFiles(owner('bookings-empty-states.png')), 'states.html')).toBeNull();
  });

  it('moves stored notes and approvals onto the id the view uses, and leaves the rest alone', () => {
    const note = (id, file) => ({ id, file, place: { kind: 'whole' }, text: 'Seen', by: 'theo', ts: 1, mentions: [], owner: null, uid: null });
    const marks = { notes: [note('n1', 'audit.md'), note('n2', 'payments-auth-audit.md'), note('n3', 'other.md')], approvals: [{ file: 'audit.md', by: 'theo', ts: 2, owner: null }], seen: {} };
    const out = marksOnVersions(marks, ownSide);
    expect(out.notes.map((n) => n.file)).toEqual(['payments-auth-audit.md', 'payments-auth-audit.md', 'other.md']);
    expect(out.approvals[0].file).toBe('payments-auth-audit.md');
    expect(marksOnVersions({ notes: [marks.notes[1]], approvals: [], seen: {} }, ownSide).notes[0]).toBe(marks.notes[1]);
  });
});

describe('opening a note asks for no file of its own when the thread has it', () => {
  const lines = [{ ts: 1, source: 'agent', patch: { result: 'Wrote [the audit](docs/payments-auth-audit.md) and ![a](designs/a.png)' } }];

  it('under the old name', () => {
    const said = filesInLines(lines);
    const asked = versionNamed(threadFiles(said), 'audit.md') ? [] : ['audit.md'];
    expect(withFilesAsked(said, asked).map((f) => f.path)).toEqual(['docs/payments-auth-audit.md', 'designs/a.png']);
  });

  it('for a page beside a picture, named in the note by its old name or a copy\'s', () => {
    const pages = [{ path: 'designs/w-1/bookings-empty-states.html' }, { path: `attachments/${SHA}-checkout.html` }, { path: 'designs/w-1/other.html' }];
    expect(otherFilesOpen(pages, null, [{ file: 'states.html' }]).map((f) => f.path)).toEqual(['designs/w-1/bookings-empty-states.html']);
    expect(otherFilesOpen(pages, null, [{ file: 'checkout.html' }]).map((f) => f.path)).toEqual([`attachments/${SHA}-checkout.html`]);
    expect(otherFilesOpen(pages, null, [{ file: 'nothing.html' }])).toEqual([]);
  });
});
