// A NAMED FOLDER IS FOUND IN WHICHEVER PROJECT HAS IT.
//
// Maya: "Save it in the
// Files folder called Research" put the note in a new Research inside Lumen
// app, beside the Research she uses in Company; "the Files folder called Launch
// inside Company" put it in Lumen app too, while the agent said "Company >
// Launch". A folder was looked up, and made, only in the thread's own project.
//
// What must NOT happen: a folder whose name only contains a project's name
// split on it, or a second folder made when one of that name is there.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aTeamWithAgents } from './lib/a-team-with-agents.mts';
import { teamFile } from '../mcp/core/reach.mts';
import { foldFolders, readFolderLog, writeFolderLog } from '../shared/file-folders.mts';
import { readTeamView, writeTeamView } from '../main/store/teammates-files.mts';
import { appFilesPlace } from '../main/files-place.mts';

let t; let dir; let own;
const inView = (folders) => writeTeamView(dir, { ...readTeamView(dir), folders });
const placed = (name) => [...foldFolders(readFolderLog(dir)).places.values()].find((p) => p.family.startsWith(`${name}\0`))?.folder;
const made = () => foldFolders(readFolderLog(dir)).folders;

beforeEach(async () => {
  t = await aTeamWithAgents();
  const run = t.maya.store.composeItem(t.product.id, { title: 'Clinic asks', body: 'Write it.' });
  process.env.ZERO_ITEM = run.id;
  process.env.ZERO_PRODUCT = t.product.id;
  await t.tick();
  dir = t.maya.store.teammates.dir();
  own = t.maya.store.listProducts().find((p) => p.slug === t.product.id).name;
});
afterEach(() => t.stop());

describe('a folder named without its project', () => {
  it('is the one another project has, when the thread\'s own has none', () => {
    inView([{ id: 'c-research', project: 'Company', folder: 'Research', files: [] }]);
    const out = teamFile({ files: ['clinic-asks-summary.md'], folder: 'Research' });
    expect(placed('clinic-asks-summary')).toBe('c-research');
    expect(made()).toEqual([]);
    expect(out.note).toMatch(/Company > Research/);
  });

  it('is the thread\'s own when both have one', () => {
    inView([{ id: 'c-research', project: 'Company', folder: 'Research', files: [] }, { id: 'o-research', project: own, folder: 'Research', files: [] }]);
    teamFile({ files: ['a.md'], folder: 'research' });
    expect(placed('a')).toBe('o-research');
  });

  it('is made in the thread\'s own project when no project has it', () => {
    inView([{ id: 'c-research', project: 'Company', folder: 'Research', files: [] }]);
    teamFile({ files: ['a.md'], folder: 'Launch' });
    expect(made().map((f) => [f.project, f.name])).toEqual([[own, 'Launch']]);
  });
});

describe('a folder named with its project', () => {
  beforeEach(() => inView([
    { id: 'c-research', project: 'Company', folder: 'Research', files: [] },
    { id: 'o-research', project: own, folder: 'Research', files: [] },
  ]));

  it('"Company > Research" is Company\'s, though the thread\'s own has one', () => {
    teamFile({ files: ['a.md'], folder: 'Company > Research' });
    expect(placed('a')).toBe('c-research');
  });

  it('"Launch inside Company" is made in Company when Company has none', () => {
    const out = teamFile({ files: ['monday-priorities.md'], folder: 'Launch inside Company' });
    expect(made().map((f) => [f.project, f.name])).toEqual([['Company', 'Launch']]);
    expect(placed('monday-priorities')).toBe(made()[0].id);
    expect(out).toMatchObject({ folder: 'Launch', project: 'Company' });
  });

  it('a name that only holds a project\'s name stays whole', () => {
    teamFile({ files: ['a.md'], folder: 'Company notes' });
    expect(made().map((f) => f.name)).toEqual(['Company notes']);
  });
});

describe('in Files', () => {
  it('a file filed in another project\'s folder shows there', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'other-root-'));
    const lumen = { slug: 'lumen', name: 'Lumen app', dir: path.join(root, 'lumen') };
    fs.mkdirSync(lumen.dir);
    fs.writeFileSync(path.join(lumen.dir, 'note.md'), 'x');
    const store = {
      listProducts: () => [lumen],
      listAllWorkItems: () => [{ id: 'w-1', product: 'lumen', title: 'w-1', updatedAt: 1 }],
      readHistory: () => [{ ts: 1, source: 'agent', patch: { result: '[note.md](note.md)' } }],
      teammates: { dir: () => root },
    };
    writeFolderLog(root, { op: 'folder', id: 'c-research', project: 'Company', name: 'Research', parent: null, at: 1 });
    writeFolderLog(root, { op: 'place', key: 'lumen app\0note\0markdown', project: 'Lumen app', family: 'note\0markdown', folder: 'c-research', at: 2 });
    const { files } = await appFilesPlace({ store, team: null, accountRoot: root, storeRoot: root }).list();
    expect(files[0]).toMatchObject({ name: 'note.md', project: 'Company', folder: 'c-research' });
  });
});
