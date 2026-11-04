// A FILE OF ANY KIND FILED IN A FOLDER SHOWS IN IT.
//
// Dev counted: of seven named folders only the two holding a .md note were
// made; group_booking.py, the csv and seat-picker-demo.html sat loose at the
// top of Lumen app. write_document names a document on its thread, which is
// what puts a file in Files; team_file only wrote where a file sits, so code
// and pages an agent made with its own tools were filed under a name no
// message linked, and Files never listed them in the folder.
//
// What must NOT happen: a file that is not there said to be filed as if it were.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { teamFile } from '../mcp/core/reach.mjs';
import { foldFolders, readFolderLog } from '../shared/file-folders.mjs';
import { filesOf } from '../main/files-place.mjs';

let t; let run; let project; let dir;
const lines = () => t.maya.store.readHistory(t.product.id, run.id, { max: 1000 });
const put = (rel, text = 'x') => { const f = path.join(project.dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

beforeEach(async () => {
  t = await aTeamWithAgents();
  run = t.maya.store.composeItem(t.product.id, { title: 'Group rules', body: 'Write the rules in a folder called group-rules.' });
  process.env.ZERO_ITEM = run.id;
  process.env.ZERO_PRODUCT = t.product.id;
  await t.tick();
  project = t.maya.store.listProducts().find((p) => p.slug === t.product.id);
  dir = t.maya.store.teammates.dir();
});
afterEach(() => t.stop());

describe('team_file', () => {
  it('puts code, a page and a table in the folder and in Files', () => {
    put('group-rules/group_booking.py'); put('demos/seat-picker-demo.html'); put('samples/clinics.csv');
    teamFile({ files: ['group-rules/group_booking.py'], folder: 'group-rules' });
    teamFile({ files: ['demos/seat-picker-demo.html'], folder: 'demos' });
    const out = teamFile({ files: ['samples/clinics.csv'], folder: 'samples' });
    expect(out.note).not.toMatch(/once a message/);
    const files = filesOf([{ ref: { kind: 'thread', product: t.product.id, id: run.id }, title: 'x', project: project.name, lines: lines() }]);
    const shelf = foldFolders(readFolderLog(dir));
    const where = (name) => shelf.folders.find((f) => f.id === shelf.placeOf(files.find((x) => x.name === name)?.key))?.name;
    expect(where('group_booking.py')).toBe('group-rules');
    expect(where('seat-picker-demo.html')).toBe('demos');
    expect(where('clinics.csv')).toBe('samples');
  });

  it('names a file once, however often it is filed', () => {
    put('group-rules/group_booking.py');
    teamFile({ files: ['group-rules/group_booking.py'], folder: 'group-rules' });
    teamFile({ files: ['group-rules/group_booking.py'], folder: 'group-rules' });
    expect(lines().filter((l) => String(l.patch?.note ?? '').includes('group_booking.py'))).toHaveLength(1);
  });

  it('says plainly when a file it was handed is not there', () => {
    const out = teamFile({ files: ['group-rules/missing.py'], folder: 'group-rules' });
    expect(out.note).toMatch(/missing\.py is not/);
  });
});
