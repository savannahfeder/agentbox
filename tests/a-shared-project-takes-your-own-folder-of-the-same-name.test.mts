// A SHARED PROJECT TAKES YOUR OWN FOLDER OF THE SAME NAME (2026-11-20).
//
// On a synthetic team, Theo shared Payments API. Sam already had his own
// Payments API project on his copy, with his checkout of the code. Joining
// made a second "Payments API" with no folder, and Sam's Codex and Claude
// threads in it said "No repository is registered" and could not change code;
// his picker showed two Payments API rows, one plain, one "Shared by Theo".
// Measured on Sam's copy: payments-api/project.json had a repoPath,
// payments-api-2/project.json (the shared one) had none.
//
// A shared project with no folder here now takes the folder of your own
// project with the same name, when exactly one has one.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linkSharedFolders } from '../main/team/projects.mts';

const THEO = 'p-theo';
const team = (o: Record<string, unknown> = {}) => ({ projectId: 'pr-1', teamId: 't-1', visibility: 'team', people: [], sharedBy: THEO, ...o });

describe('linking a shared project to your folder', () => {
  let root: string; let repo: string;
  const write = (slug: string, json: Record<string, unknown>) => { fs.mkdirSync(path.join(root, slug), { recursive: true }); fs.writeFileSync(path.join(root, slug, 'project.json'), JSON.stringify(json)); return path.join(root, slug); };
  const read = (slug: string) => JSON.parse(fs.readFileSync(path.join(root, slug, 'project.json'), 'utf8'));
  const products = () => fs.readdirSync(root).map((slug) => ({ dir: path.join(root, slug), ...read(slug) }));
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'account-'));
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'payments-api-'));
  });

  it('takes the folder of your own project of the same name, the reported one', () => {
    write('payments-api', { name: 'Payments API', repoPath: repo });
    write('payments-api-2', { name: 'Payments API', team: team() });
    expect(linkSharedFolders(products())).toEqual([{ dir: path.join(root, 'payments-api-2'), repoPath: repo }]);
    expect(read('payments-api-2').repoPath).toBe(repo);
    expect(read('payments-api-2').team.sharedBy).toBe(THEO);
  });

  it('matches the name whatever its case and spacing', () => {
    write('mine', { name: 'payments  api', repoPath: repo });
    write('shared', { name: 'Payments API', team: team() });
    expect(linkSharedFolders(products())).toHaveLength(1);
  });

  it('takes nothing when two of your projects have that name, or none does', () => {
    write('a', { name: 'Payments API', repoPath: repo });
    write('b', { name: 'Payments API', repoPath: fs.mkdtempSync(path.join(os.tmpdir(), 'other-')) });
    write('shared', { name: 'Payments API', team: team() });
    expect(linkSharedFolders(products())).toEqual([]);
    expect(read('shared').repoPath).toBeUndefined();
  });

  it('never takes a folder for another name, a conversation, or a shared project that has one', () => {
    write('mine', { name: 'Web app', repoPath: repo });
    write('shared', { name: 'Payments API', team: team() });
    write('direct-1', { name: 'Web app', team: team({ direct: true }) });
    const had = fs.mkdtempSync(path.join(os.tmpdir(), 'had-'));
    write('shared-web', { name: 'Web app', team: team(), repoPath: had });
    expect(linkSharedFolders(products())).toEqual([]);
    expect(read('shared-web').repoPath).toBe(had);
  });

  it('never takes a folder that is gone', () => {
    write('mine', { name: 'Payments API', repoPath: path.join(repo, 'gone') });
    write('shared', { name: 'Payments API', team: team() });
    expect(linkSharedFolders(products())).toEqual([]);
  });

  it('is done on every pass of the team sync', () => {
    const src = fs.readFileSync(new URL('../main/team/index.mts', import.meta.url), 'utf8');
    expect(src).toMatch(/linkSharedFolders\(products\(\)\)/);
  });
});
