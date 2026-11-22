// THE FOLDER MADE AHEAD IS IN THE PROJECT THE NEXT THREAD WILL BE IN.
//
// What broke (w-9993530556, 2026-11-21): a new user's first thread waited
// 19.7 s before Claude Code started, most of it making the thread's own copy
// of their project (main/task-folders.mts makes one ahead now, see
// tests/the-next-threads-folder-is-made-before-it-is-asked-for). One copy is
// kept, so where it is made decides whether it helps: the project of the
// person's newest thread, or before their first thread the newest project
// with a repository, which is the one setup has just connected. It is made
// while nothing is starting, checked again every ten minutes so a copy main
// has moved past is made again before it is wanted, and made again right
// after a thread has taken it.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jobs: { name: string; args: unknown[] }[] = [];
vi.mock('../main/task-folders-offthread.mts', () => ({
  folderJob: (name: string, ...args: unknown[]) => { jobs.push({ name, args }); return Promise.resolve({ made: true }); },
  warmFolderThread: () => true,
}));
const { Supervisor } = await import('../main/supervisor.mts');

const NOW = 1_800_000_000_000;
const code = fs.mkdtempSync(path.join(os.tmpdir(), 'next-folder-'));
afterAll(() => { fs.rmSync(code, { recursive: true, force: true }); });
const at = (slug: string) => path.join(code, slug);
const project = (slug: string, over: object = {}) => {
  fs.mkdirSync(at(slug), { recursive: true });
  return { slug, name: slug, dir: `/store/${slug}`, repoPath: at(slug), createdAt: NOW - 1000, ...over };
};
const thread = (id: string, product: string, createdAt: number, labels = ['founder']) => ({ id, product, status: 'open', title: 't', labels, createdAt });

function standIn(products: object[], over: object = {}) {
  const self = Object.create(Supervisor.prototype);
  Object.assign(self, {
    spareFolders: true,
    sessions: new Map(),
    _preparing: new Map(),
    config: {},
    store: { listProducts: () => products },
    ...over,
  });
  return self;
}

beforeEach(() => { jobs.length = 0; });
const made = () => jobs.filter((j) => j.name === 'makeSpareFolder').map((j) => j.args[0]);

describe('where the folder is made ahead', () => {
  it('in the project of the person\'s newest thread', () => {
    const self = standIn([project('a'), project('b')]);
    self._readyTheNextFolder([thread('w-1', 'a', NOW - 50), thread('w-2', 'b', NOW - 10)], NOW);
    expect(made()).toEqual([at('b')]);
  });

  it('before any thread, in the newest project with a repository', () => {
    const self = standIn([project('old', { createdAt: NOW - 9000 }), project('new', { createdAt: NOW - 10 }), project('notes', { repoPath: null, createdAt: NOW })]);
    self._readyTheNextFolder([], NOW);
    expect(made()).toEqual([at('new')]);
  });

  it('not in a project with no repository, the practice project, or for a thread an agent filed', () => {
    const self = standIn([project('a'), project('notes', { repoPath: null }), project('practice', { practice: true })]);
    self._readyTheNextFolder([thread('w-1', 'a', NOW - 50), thread('w-2', 'notes', NOW - 10), thread('w-3', 'practice', NOW - 5), thread('w-4', 'a', NOW, [])], NOW);
    expect(made()).toEqual([at('a')]);
  });

  it('nowhere when no project has a repository', () => {
    const self = standIn([project('notes', { repoPath: null })]);
    self._readyTheNextFolder([], NOW);
    expect(jobs).toEqual([]);
  });
});

describe('when it is made', () => {
  it('only on a Mac that turned it on', () => {
    const self = standIn([project('a')], { spareFolders: false });
    self._readyTheNextFolder([], NOW);
    expect(jobs).toEqual([]);
  });

  it('not while an agent is starting', () => {
    const self = standIn([project('a')], { _preparing: new Map([['w-9', {}]]) });
    self._readyTheNextFolder([], NOW);
    expect(jobs).toEqual([]);
  });

  it('once, then again after ten minutes or as soon as a thread there has taken it', () => {
    const self = standIn([project('a')]);
    self._readyTheNextFolder([], NOW);
    self._readyTheNextFolder([], NOW + 60_000);
    expect(made()).toHaveLength(1);
    self._readyTheNextFolder([], NOW + 10 * 60_000);
    expect(made()).toHaveLength(2);
    self._aFolderWasTaken(at('a'));
    self._readyTheNextFolder([], NOW + 10 * 60_000 + 1);
    expect(made()).toHaveLength(3);
  });

  it('a move to another project puts the old one away', () => {
    const self = standIn([project('a'), project('b')]);
    self._readyTheNextFolder([thread('w-1', 'a', NOW - 50)], NOW);
    jobs.length = 0;
    self._readyTheNextFolder([thread('w-1', 'a', NOW - 50), thread('w-2', 'b', NOW - 10)], NOW + 1);
    expect(jobs).toEqual([{ name: 'dropSpareFolder', args: [at('a')] }, { name: 'makeSpareFolder', args: [at('b')] }]);
  });
});

it('the desktop app makes them on a Mac only, where a copy shares its blocks with the checkout', () => {
  const main = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'main', 'main.mts'), 'utf8');
  expect(main).toMatch(/supervisor\.spareFolders = process\.platform === 'darwin';/);
});
