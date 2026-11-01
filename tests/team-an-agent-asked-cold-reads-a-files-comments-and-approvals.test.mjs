// AN AGENT ASKED COLD READS A FILE'S COMMENTS AND APPROVALS, AND A COMMENT STILL
// OPEN ON V1 FOLLOWS THE FILE TO V2.
//
// Sofia reviewed cancel-dialog.png with five numbered notes and an
// agent asked to "do the notes" had no way to read them; its only tool read a
// thread's words. A person then had to retype the notes. And when the picture
// came back as v2, every note was still on v1: a person had to carry each over
// by hand to see whether it was dealt with.
//
// Measured: team_read on a thread returned messages and nothing of the marks on
// its files (0 of 5 notes), and the v2 page of the viewer listed 0 comments.
//
// What must NOT happen: a resolved comment coming along, a comment crossing to
// a different file, and an earlier version showing a later version's comments.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { teamRead } from '../mcp/core/reach.mjs';
import { carriedNotes, marksOf, threadFiles } from '../shared/artifact-marks.mjs';

let t; let chief; let run;
const onRun = (id) => { process.env.ZERO_ITEM = id; process.env.ZERO_PRODUCT = t.product.id; };

const note = (id, file, text, extra = {}) => ({ do: 'note', id, file, place: { kind: 'pin', x: 0.2, y: 0.3 }, text, ...extra });

beforeEach(async () => {
  t = await aTeamWithAgents();
  chief = t.maya.store.teammates.create({ starter: 'chief' });
  run = t.maya.store.composeItem(t.product.id, { title: 'Review the dialog', body: 'Redo the dialog from the notes.', labels: [`teammate:${chief.id}`] });
  onRun(run.id);
  await t.tick();
});
afterEach(() => t.stop());

const mark = (dir, id, artifact, by) => t.maya.on(() => disk.updateWorkItem(dir, id, { artifact }, { source: 'system' })).then(() => by);

describe('the viewer', () => {
  const families = threadFiles([{ path: 'designs/cancel-dialog.png', by: 'm' }, { path: 'designs/cancel-dialog-v2.png', by: 'm' }, { path: 'designs/other.png', by: 'm' }]);
  const marks = marksOf([
    { ...note('n1', 'cancel-dialog.png', 'Dim the page'), by: 'sofia', ts: 1 },
    { ...note('n2', 'cancel-dialog.png', 'Error text too loud'), by: 'sofia', ts: 2 },
    { ...note('n3', 'cancel-dialog.png', 'Grey vs white'), by: 'sofia', ts: 3 },
    { do: 'resolve', on: 'n3', by: 'dev', ts: 4 },
    { ...note('n4', 'other.png', 'Unrelated'), by: 'sofia', ts: 5 },
    { ...note('n5', 'cancel-dialog-v2.png', 'New on v2'), by: 'sofia', ts: 6 },
  ]);
  const dialog = families.find((f) => f.versions[0].name === 'cancel-dialog.png');

  it('shows what is still open on v1 on v2, named as from v1', () => {
    const carried = carriedNotes(dialog, 1, marks.notes);
    expect(carried.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(carried.every((n) => n.from === 'v1')).toBe(true);
    expect(carried[0].text).toBe('Dim the page');
  });

  it('does not carry a resolved comment, a comment on another file, or one backwards', () => {
    expect(carriedNotes(dialog, 1, marks.notes).map((n) => n.id)).not.toContain('n3');
    expect(carriedNotes(dialog, 1, marks.notes).map((n) => n.id)).not.toContain('n4');
    expect(carriedNotes(dialog, 0, marks.notes)).toEqual([]);
  });

  it('is the same comment, so resolving it on v2 settles it on v1', () => {
    const after = marksOf([
      { ...note('n1', 'cancel-dialog.png', 'Dim the page'), by: 'sofia', ts: 1 },
      { do: 'resolve', on: 'n1', by: 'dev', ts: 9 },
    ]);
    expect(carriedNotes(dialog, 1, after.notes)).toEqual([]);
  });

  it('is drawn in the notes list with the words "From v1, still open", and settles by the original id', () => {
    const source = fs.readFileSync(path.resolve('renderer/src/components/ArtifactView.tsx'), 'utf8');
    expect(source).toMatch(/carriedNotes\(family, at\.vi, allNotes/);
    expect(source).toMatch(/From \{note\.from\}, still open/);
    expect(source).toMatch(/do: resolved \? 'resolve' : 'reopen', on: note\.id/);
  });
});

describe('team_read', () => {
  it('returns the files of a thread with every version, who approved it and each comment', async () => {
    const dir = t.product.dir ?? t.maya.store.productDir(t.product.id);
    await t.maya.on(() => disk.updateWorkItem(dir, run.id, { note: 'v1 is [cancel-dialog.png](designs/cancel-dialog.png)' }, { source: 'agent' }));
    await mark(dir, run.id, note('n1', 'cancel-dialog.png', 'Dim the page behind it'));
    await mark(dir, run.id, note('n2', 'cancel-dialog.png', 'Error text too loud', { place: { kind: 'whole' } }));
    await mark(dir, run.id, { do: 'approve', file: 'cancel-dialog.png' });
    const got = teamRead({});
    expect(got.title).toBe('Review the dialog');
    const v1 = got.files.find((f) => f.file === 'cancel-dialog.png');
    expect(v1).toMatchObject({ version: 'v1', versions: 1 });
    expect(v1.comments.map((c) => c.text)).toEqual(['Dim the page behind it', 'Error text too loud']);
    expect(v1.comments[0]).toMatchObject({ status: 'open', where: 'Pin 1' });
    expect(v1.approvedBy.length).toBe(1);
  });

  it('reads the replies under a comment, so an answer on the pin is not read as no answer', async () => {
    const dir = t.maya.store.productDir(t.product.id);
    await t.maya.on(() => disk.updateWorkItem(dir, run.id, { note: 'v1 is [cancel-dialog.png](designs/cancel-dialog.png)' }, { source: 'agent' }));
    await mark(dir, run.id, note('n1', 'cancel-dialog.png', 'Dim the page behind it'));
    await mark(dir, run.id, { do: 'reply', id: 'r1', on: 'n1', file: 'cancel-dialog.png', text: 'Agreed, the quiet style' });
    const got = teamRead({});
    expect(got.files.find((f) => f.file === 'cancel-dialog.png').comments[0].replies.map((r) => r.text)).toEqual(['Agreed, the quiet style']);
  });

  it('lists an open comment on v1 again on v2, and not a resolved one', async () => {
    const dir = t.maya.store.productDir(t.product.id);
    await t.maya.on(() => disk.updateWorkItem(dir, run.id, { note: 'v1 designs/cancel-dialog.png, v2 [v2](designs/cancel-dialog-v2.png)' }, { source: 'agent' }));
    await mark(dir, run.id, note('n1', 'cancel-dialog.png', 'Dim the page behind it'));
    await mark(dir, run.id, note('n2', 'cancel-dialog.png', 'Error text too loud'));
    await mark(dir, run.id, { do: 'resolve', on: 'n2' });
    const got = teamRead({});
    const v2 = got.files.find((f) => f.file === 'cancel-dialog-v2.png');
    expect(v2).toMatchObject({ version: 'v2', versions: 2 });
    expect(v2.comments).toEqual([expect.objectContaining({ id: 'n1', text: 'Dim the page behind it', status: 'open', from: 'v1, still open' })]);
    expect(got.files.find((f) => f.file === 'cancel-dialog.png').comments.map((c) => c.id)).toEqual(['n1', 'n2']);
  });

  it('reads a teammate\'s thread files the same way, from what its owner published', async () => {
    const devDir = path.join(t.dev.store.config.accountRoot, 'dev-work');
    fs.mkdirSync(devDir, { recursive: true });
    fs.writeFileSync(path.join(devDir, 'project.json'), JSON.stringify({ id: 'dev-work', name: 'Dev work' }));
    const row = await t.dev.on(() => t.dev.store.composeItem('dev-work', { title: 'Deck', body: 'See [deck](designs/deck.png)' }));
    await t.dev.on(() => disk.updateWorkItem(devDir, row.id, { artifact: note('d1', 'deck.png', 'Slide 3 wants the real rows') }, { source: 'system' }));
    for (let i = 0; i < 2; i += 1) { await t.dev.service.syncNow(); await t.maya.service.syncNow(); }
    await t.tick();
    const got = teamRead({ person: 'Dev', thread: row.id });
    expect(got.files.find((f) => f.file === 'deck.png').comments.map((c) => c.text)).toEqual(['Slide 3 wants the real rows']);
  });

  it('still reads a thread with no files as it did', async () => {
    const got = teamRead({});
    expect(got.files).toEqual([]);
  });
});
