// AN AGENT FILES WHAT IT MAKES IN A FOLDER BY NAME, AND FINDS IT THERE LATER.
//
// "A good storage system that's fetchable and findable for both humans and
// agents alike." An agent's team_tell put a file in a chat and nowhere else, and
// team_read could not answer "what is in the launch folder": it had no folders.
//
// What must NOT happen: a second folder for the same name, or a folder that is
// not there answering for the one asked about.
import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { aTeamWithAgents } from './lib/a-team-with-agents.mjs';
import { teamFile, teamRead, teamTell } from '../mcp/core/reach.mjs';
import { fileKeyIn, readFolderLog, foldFolders } from '../shared/file-folders.mjs';
import { readTeamView, writeTeamView } from '../main/store/teammates-files.mjs';

let t; let chief; let run; let dir; let project;
beforeEach(async () => {
  t = await aTeamWithAgents();
  chief = t.maya.store.teammates.create({ starter: 'chief' });
  run = t.maya.store.composeItem(t.product.id, { title: 'Launch film', body: 'Make it.', labels: [`teammate:${chief.id}`] });
  process.env.ZERO_ITEM = run.id;
  process.env.ZERO_PRODUCT = t.product.id;
  await t.tick();
  dir = t.maya.store.teammates.dir();
  project = t.maya.store.listProducts().find((p) => p.slug === t.product.id);
});
afterEach(() => t.stop());

const shelf = () => foldFolders(readFolderLog(dir));
const keyOf = (stem, kind) => `${project.name.toLowerCase()}\0${stem}\0${kind}`;

describe('team_file', () => {
  it('makes the folder when there is none and places the file by its identity', () => {
    const out = teamFile({ files: ['designs/launch-film.mp4'], folder: 'Launch' });
    expect(out.folder).toBe('Launch');
    const { folders, placeOf } = shelf();
    expect(folders.map((f) => f.name)).toEqual(['Launch']);
    expect(placeOf(keyOf('launch-film', 'film'))).toBe(folders[0].id);
    expect(fileKeyIn(project.name, 'launch-film-v2.mp4')).toBe(keyOf('launch-film', 'film'));
  });

  it('uses the folder that is there, whatever its capitals', () => {
    teamFile({ files: ['a.png'], folder: 'Launch' });
    teamFile({ files: ['b.png'], folder: 'launch ' });
    expect(shelf().folders).toHaveLength(1);
  });

  it('finds a folder only a teammate has made so far, from what the app last told it', () => {
    const view = readTeamView(dir);
    writeTeamView(dir, { ...view, folders: [{ id: 'cloud-1', project: project.name, folder: 'Launch', files: [] }] });
    teamFile({ files: ['c.png'], folder: 'launch' });
    expect(shelf().places.get(keyOf('c', 'image')).folder).toBe('cloud-1');
    expect(shelf().folders).toEqual([]);
  });

  it('says what it needs', () => {
    expect(() => teamFile({ files: ['a.png'], folder: '  ' })).toThrow(/folder/);
    expect(() => teamFile({ files: [], folder: 'Launch' })).toThrow(/file/);
  });
});

describe('team_tell with a folder', () => {
  it('files what it sends', () => {
    const file = path.join(project.dir, 'launch-plan.md');
    fs.writeFileSync(file, '# Plan');
    teamTell({ text: 'Here it is', to: [t.dev?.name ?? 'Dev'], files: [file], folder: 'Launch' });
    const { folders, placeOf } = shelf();
    expect(placeOf(keyOf('launch-plan', 'markdown'))).toBe(folders[0].id);
  });
});

describe('team_read', () => {
  const inView = () => {
    const view = readTeamView(dir);
    writeTeamView(dir, { ...view, folders: [
      { id: 'f1', project: 'Lumen app', folder: 'Launch', files: [{ file: 'launch-film-v2.mp4', path: '/x/launch-film-v2.mp4', versions: 2 }] },
      { id: 'f2', project: 'Lumen app', folder: 'Billing', files: [] },
    ] });
  };

  it('lists the folders and their files along with this thread', () => {
    inView();
    const out = teamRead({});
    expect(out.folders.map((f) => f.folder)).toEqual(['Launch', 'Billing']);
    expect(out.folders[0].files[0].file).toBe('launch-film-v2.mp4');
    expect(out.folders[0].id).toBeUndefined();
  });

  it('finds one folder by name, and says which there are when there is no such folder', () => {
    inView();
    expect(teamRead({ folder: 'launch' }).folders.map((f) => f.folder)).toEqual(['Launch']);
    expect(teamRead({ folder: 'the launch folder' }).folders.map((f) => f.folder)).toEqual(['Launch']);
    expect(() => teamRead({ folder: 'finance' })).toThrow(/Launch/);
  });
});

it('the brief tells an agent, in one line, to file what it makes', () => {
  const source = fs.readFileSync(new URL('../main/teammates.mjs', import.meta.url), 'utf8');
  expect(source.match(/File what you make/g)).toHaveLength(1);
});
