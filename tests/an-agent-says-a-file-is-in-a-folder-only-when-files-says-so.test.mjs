// AN AGENT SAYS A FILE IS IN A FOLDER ONLY WHEN FILES SAYS SO.
//
// An agent told Maya "pricing-decision-rule.md is now in your Product specs
// folder", and it sat loose in Company. It told her the folder held 1 file when she
// saw 4. Dev's agents' dev-afternoon and group-bookings-plan never appeared.
// Measured from the session logs of all three copies: team_file was called 0 times.
// The pricing agent called write_document with "Product specs/pricing-decision-rule.md",
// which made a folder ON DISK with the same name (it is there in Maya's store), and
// list_documents read that one back: 1 file, truthfully. Dev's used Write in its
// checkout. Nothing told a plain thread's agent that Files has folders; only an AI
// teammate's brief did. Both tools it did use answered success about the wrong thing.
//
// What must NOT happen: a folder made because a path has a directory in it, or
// "filed" said when the line was not written.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { documentsWithFolders, fileWrittenDocument, teamRead } from '../mcp/core/reach.mjs';
import { readDocument } from '../mcp/core/documents.mjs';
import { filesFoldersBrief, foldFolders, readFolderLog } from '../shared/file-folders.mjs';
import { readTeamView, writeTeamView } from '../main/store/teammates-files.mjs';

let t; let run; let dir; let project;
const shelf = () => foldFolders(readFolderLog(dir));
const keyOf = (stem) => `${project.name.toLowerCase()}\0${stem}\0markdown`;
const seen = (folders) => writeTeamView(dir, { ...readTeamView(dir), folders });

beforeEach(async () => {
  t = await aTeamWithAgents();
  run = t.maya.store.composeItem(t.product.id, { title: 'Pricing note', body: 'Write it.' });
  process.env.ZERO_ITEM = run.id;
  process.env.ZERO_PRODUCT = t.product.id;
  await t.tick();
  dir = t.maya.store.teammates.dir();
  project = t.maya.store.listProducts().find((p) => p.slug === t.product.id);
});
afterEach(() => { delete process.env.ZERO_ITEM; delete process.env.ZERO_PRODUCT; t.stop(); });

describe('write_document and the folder a person named', () => {
  it('files it when the path starts with a folder Files has, under its capitals', () => {
    seen([{ id: 'f-1', project: project.name, folder: 'Product specs', files: [] }]);
    const out = fileWrittenDocument({ path: 'product specs/rule.md' });
    expect(out.filedIn).toBe('Product specs');
    expect(shelf().places.get(keyOf('rule')).folder).toBe('f-1');
  });

  it('makes the folder when it is asked for by name', () => {
    const out = fileWrittenDocument({ path: 'notes/plan.md', folder: 'dev-afternoon' });
    expect(out.filedIn).toBe('dev-afternoon');
    expect(shelf().folders.map((f) => f.name)).toEqual(['dev-afternoon']);
    expect(shelf().placeOf(keyOf('plan'))).toBe(shelf().folders[0].id);
  });

  it('does not make a folder for a directory in a path, and says the file is not in one', () => {
    const out = fileWrittenDocument({ path: 'reports/round-1.md' });
    expect(out.filedIn).toBeUndefined();
    expect(out.say).toMatch(/reports.*not a folder in Files/);
    expect(shelf().folders).toEqual([]);
  });

  it('says nothing about a file at the top', () => {
    expect(fileWrittenDocument({ path: 'plan.md' })).toEqual({});
  });

  it('says plainly it was not filed when nobody is signed in to a team', () => {
    writeTeamView(dir, { ...readTeamView(dir), me: null });
    const out = fileWrittenDocument({ path: 'plan.md', folder: 'Launch' });
    expect(out.filedIn).toBeUndefined();
    expect(out.say).toMatch(/not in Launch/);
  });

  it('a path alone with nobody signed in stays quiet: an ordinary write', () => {
    writeTeamView(dir, { ...readTeamView(dir), me: null });
    expect(fileWrittenDocument({ path: 'reports/a.md' })).toEqual({});
  });
});

describe('list_documents and what is in a folder', () => {
  const four = [
    { file: 'spec.md', path: '/x/spec.md', versions: 1, openComments: 0, approved: false },
    { file: 'plan.md', path: '/x/plan.md', versions: 2, openComments: 0, approved: false },
    { file: 'seats.md', path: '/x/seats.md', versions: 1, openComments: 0, approved: false },
    { file: 'rule.md', path: '/x/rule.md', versions: 1, openComments: 0, approved: false },
  ];
  const onDisk = [{ title: 'rule', path: 'Product specs/rule.md', folder: 'Product specs', kind: 'markdown', status: 'current' }];

  it('finds the whole folder as a person sees it, not the directory of the same name', () => {
    seen([{ id: 'f-1', project: project.name, folder: 'Product specs', files: four }]);
    const out = documentsWithFolders(onDisk, { folder: 'Product specs' });
    expect(out.map((d) => d.title).sort()).toEqual(['plan.md', 'rule', 'seats.md', 'spec.md']);
    expect(out.every((d) => d.filesFolder === 'Product specs')).toBe(true);
  });

  it('marks where each listed file sits when no folder is asked for', () => {
    seen([{ id: 'f-1', project: project.name, folder: 'Product specs', files: four }]);
    const out = documentsWithFolders([{ title: 'loose', path: 'loose.md', folder: null }], {});
    expect(out.find((d) => d.path === 'loose.md').filesFolder).toBeUndefined();
    expect(out.filter((d) => d.filesFolder === 'Product specs')).toHaveLength(4);
  });

  it('leaves out another project\'s folder of the same name', () => {
    seen([{ id: 'f-9', project: 'Other', folder: 'Product specs', files: four }]);
    expect(documentsWithFolders(onDisk, { folder: 'Product specs' })).toEqual(onDisk);
  });

  it('is the list as it was with nobody signed in', () => {
    writeTeamView(dir, { ...readTeamView(dir), me: null });
    expect(documentsWithFolders(onDisk, {})).toEqual(onDisk);
  });
});

describe('team_read straight after filing', () => {
  // A real agent, measured: write_document said filed, team_read said no folder called
  // Investors, because the app only rewrites its view on its next tick.
  it('finds a folder made this minute, with the file in it', () => {
    fileWrittenDocument({ path: 'plan.md', folder: 'Investors' });
    const { folders } = teamRead({ folder: 'Investors' });
    expect(folders[0].folder).toBe('Investors');
    expect(folders[0].files.map((f) => f.file)).toEqual(['plan']);
  });
  it('moves a file the app last saw elsewhere', () => {
    seen([
      { id: 'a', project: project.name, folder: 'Old', files: [{ file: 'plan.md', path: '/x/plan.md' }] },
      { id: 'b', project: project.name, folder: 'New', files: [] },
    ]);
    fileWrittenDocument({ path: 'plan.md', folder: 'New' });
    expect(teamRead({ folder: 'Old' }).folders[0].files).toEqual([]);
    expect(teamRead({ folder: 'New' }).folders[0].files.map((f) => f.file)).toEqual(['plan.md']);
  });
  it('does not repeat a file the app has already listed there', () => {
    seen([{ id: 'b', project: project.name, folder: 'New', files: [{ file: 'plan.md', path: '/x/plan.md' }] }]);
    fileWrittenDocument({ path: 'plan.md', folder: 'New' });
    expect(teamRead({ folder: 'New' }).folders[0].files.map((f) => f.path)).toEqual(['/x/plan.md']);
  });
  // This file failed about one run in two: the app stamps its view before it
  // reads anything, and a filing in that same millisecond (gap measured at 0 ms
  // in 3 of 18 runs) was taken as already seen.
  describe('filed in the millisecond the view was stamped', () => {
    const atView = (offset) => {
      seen([
        { id: 'a', project: project.name, folder: 'Old', files: [{ file: 'plan.md', path: '/x/plan.md' }] },
        { id: 'b', project: project.name, folder: 'New', files: [] },
      ]);
      fileWrittenDocument({ path: 'plan.md', folder: 'New' }, { now: readTeamView(dir).at + offset });
      return { old: teamRead({ folder: 'Old' }).folders[0].files.length, new: teamRead({ folder: 'New' }).folders[0].files.length };
    };
    it('counts when it is after the stamp', () => expect(atView(1)).toEqual({ old: 0, new: 1 }));
    it('counts on the stamp itself', () => expect(atView(0)).toEqual({ old: 0, new: 1 }));
    it('does NOT count from before the stamp: the view has read it', () => expect(atView(-1)).toEqual({ old: 1, new: 0 }));
  });
  it('still says when there is no such folder', () => {
    expect(() => teamRead({ folder: 'Nope' })).toThrow(/no folder called Nope/);
  });
});

describe('read_document after a person edited the file', () => {
  const write = (rel, words, mtime) => {
    const at = path.join(project.dir, rel);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, words);
    if (mtime) fs.utimesSync(at, mtime, mtime);
  };

  it('reads the newest words, and says which file they came from', () => {
    write('updates/o.md', 'Waitlist: 40', new Date(1000));
    write('designs/w-1/o-v2.md', 'Waitlist: 42', new Date(2000));
    const out = readDocument(t.product.id, { path: 'updates/o.md' });
    expect(out.content).toBe('Waitlist: 42');
    expect(out.newestVersion).toBe('designs/w-1/o-v2.md');
  });

  it('takes the newest of several', () => {
    write('updates/o.md', 'one', new Date(1000));
    write('designs/w-1/o-v2.md', 'two', new Date(2000));
    write('designs/w-2/o-v3.md', 'three', new Date(3000));
    expect(readDocument(t.product.id, { path: 'updates/o.md' }).content).toBe('three');
  });

  it('keeps the words of a file nobody edited', () => {
    write('updates/o.md', 'mine', new Date(1000));
    write('designs/w-1/other-v2.md', 'not mine', new Date(2000));
    const out = readDocument(t.product.id, { path: 'updates/o.md' });
    expect(out.content).toBe('mine');
    expect(out.newestVersion).toBeUndefined();
  });

  it('asked for a version by its own path, gives that version', () => {
    write('updates/o.md', 'one', new Date(3000));
    write('designs/w-1/o-v2.md', 'two', new Date(2000));
    expect(readDocument(t.product.id, { path: 'designs/w-1/o-v2.md' }).content).toBe('two');
    expect(readDocument(t.product.id, { path: 'updates/o.md' }).content).toBe('one');
  });
});

describe('the brief of a thread on a team', () => {
  const view = { me: { id: 'm' }, folders: [
    { project: 'Company', folder: 'Product specs', files: [{}, {}, {}, {}] },
    { project: 'Company', folder: 'Launch', files: [] },
    { project: 'Other', folder: 'Secret', files: [{}] },
  ] };
  it('names this project\'s folders, and the rule about saying so', () => {
    const line = filesFoldersBrief(view, 'Company');
    expect(line).toContain('Product specs (4 files)');
    expect(line).toContain('Launch (0 files)');
    expect(line).not.toContain('Secret');
    expect(line).toMatch(/write_document/);
    expect(line).toMatch(/team_file/);
    expect(line).toMatch(/team_read/);
    expect(line).toMatch(/only after/i);
  });
  it('still tells how when the project has no folders yet', () => {
    expect(filesFoldersBrief({ me: { id: 'm' }, folders: [] }, 'Company')).toMatch(/team_file/);
  });
  it('is nothing with nobody signed in', () => {
    expect(filesFoldersBrief({ me: null }, 'Company')).toBeNull();
    expect(filesFoldersBrief(null, 'Company')).toBeNull();
  });
  it('rides with every run', () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'main/supervisor.mjs'), 'utf8');
    expect(src).toMatch(/this\.editedFilesLine\(item\), this\.filesFoldersLine\(item, product\)/);
  });
});
