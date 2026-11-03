// RESOLVE SETTLES THE COMMENT WHERE YOU CAN SEE IT, WITH AN UNDO.
//
// Sofia, on launch-teaser-v8.mp4: "After Resolve nothing on
// screen changed that I could see (all comments still listed, no 'resolved'
// mark, no undo)." Measured in ArtifactView: Resolve wrote the mark and waited
// for the file's marks to come back before anything moved, which from Files is a
// round trip through main and, for a teammate's copy, through the cloud; and a
// comment carried from v7 that was resolved left the carried list without ever
// reaching the resolved fold. Now the press settles the card at once (struck,
// greyed, "Resolved" with Undo for a few seconds), then it folds under
// "Show resolved" with the count, carried ones included, and its pin leaves.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { carriedNotes } from '../shared/artifact-marks.mjs';
import { commentsInList, settleLocally, UNDO_MS } from '../renderer/src/note-saving.ts';
import { pinsToDraw } from '../renderer/src/artifact-pins.ts';

const note = (id, ts, over = {}) => ({ id, file: 'v8', ts, place: { kind: 'pin', x: 0.5, y: 0.5 }, text: id, by: 's', ...over });

describe('the press, before the app answers', () => {
  it('resolves the comment on screen at once', () => {
    const out = settleLocally([note('a', 1), note('b', 2)], { a: true });
    expect(out.map((n) => [n.id, !!n.resolved])).toEqual([['a', true], ['b', false]]);
  });
  it('an undo, or a reopen, wins over what the marks still say', () => {
    expect(settleLocally([note('a', 1, { resolved: true })], { a: false })[0].resolved).toBe(false);
  });
  it('leaves every other comment as the marks say', () => {
    const notes = [note('a', 1, { resolved: true }), note('b', 2)];
    expect(settleLocally(notes, {})).toBe(notes);
  });
});

describe('where each comment sits in the list', () => {
  const notes = [note('a', 1), note('b', 2, { resolved: true }), note('c', 3, { resolved: true })];
  it('a just-resolved one stays in place while its undo is offered', () => {
    const { open, resolved } = commentsInList(notes, 'b');
    expect(open.map((n) => n.id)).toEqual(['a', 'b']);
    expect(resolved.map((n) => n.id)).toEqual(['c']);
  });
  it('once the undo has gone, it folds with the other resolved ones, in the order said', () => {
    const { open, resolved } = commentsInList(notes, null);
    expect(open.map((n) => n.id)).toEqual(['a']);
    expect(resolved.map((n) => n.id)).toEqual(['b', 'c']);
  });
  it('an undo window for an open comment moves nothing', () => {
    expect(commentsInList(notes, 'a').open.map((n) => n.id)).toEqual(['a']);
  });
  it('offers the undo for a few seconds, not for good', () => {
    expect(UNDO_MS).toBeGreaterThanOrEqual(4000);
    expect(UNDO_MS).toBeLessThanOrEqual(8000);
  });
});

describe('a comment carried from an earlier version', () => {
  const family = { versions: [{ id: 'v7', n: 7 }, { id: 'v8', n: 8 }] };
  const notes = [note('m', 1, { file: 'v7', resolved: true }), note('o', 2, { file: 'v7' })];
  it('is still carried open, as before', () => {
    expect(carriedNotes(family, 1, notes).map((n) => n.id)).toEqual(['o']);
  });
  it('resolved, it is found for the fold, with the version it was said on', () => {
    const all = carriedNotes(family, 1, notes, { resolved: true });
    expect(all.map((n) => [n.id, n.from])).toEqual([['m', 'v7'], ['o', 'v7']]);
  });
});

describe('its pin', () => {
  it('stays on the picture, greyed, while the undo is offered, then leaves', () => {
    const notes = [note('a', 1, { resolved: true })];
    expect(pinsToDraw(notes, [], null, { keep: 'a' }).map((p) => [p.id, p.settled])).toEqual([['a', true]]);
    expect(pinsToDraw(notes, [], null)).toEqual([]);
  });
});

describe('the wiring', () => {
  const view = fs.readFileSync(new URL('../renderer/src/components/ArtifactView.tsx', import.meta.url), 'utf8')
    + fs.readFileSync(new URL('../renderer/src/components/FileNoteCard.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../renderer/src/components/artifact-view.css', import.meta.url), 'utf8');
  it('the card says Resolved and offers Undo while it settles', () => {
    expect(view).toMatch(/is-just-settled/);
    expect(view).toMatch(/>Undo</);
    expect(css).toMatch(/\.av-note\.is-just-settled \.av-note-text \{[^}]*line-through/);
  });
  it('settles before the write answers', () => {
    const settle = view.slice(view.indexOf('const settle = async'));
    expect(settle.indexOf('setSettling(')).toBeGreaterThan(-1);
    expect(settle.indexOf('setSettling(')).toBeLessThan(settle.indexOf('await write('));
  });
});
