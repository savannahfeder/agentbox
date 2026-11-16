// THE PHONE HAS A FILES PLACE OF EVERY FILE A THREAD SENT.
//
// The desktop has a Files page; the phone app could only open a file from the
// thread that named it, so there was no way to "see your files" on the phone.
// Every thread's cloud copy already lists the files it names
// (`snapshot.attached`). Measured with copies in that shape: one file named by
// two threads is one row carrying both, rows are newest first by the newest
// thread, the same name in two projects is two rows, bookkeeping and an
// agent's check pictures stay out, a file too big for the phone stays in and
// is flagged, an entry the computer never uploaded is left out, and search,
// kind and project narrow the list as the desktop's do. Files is the last tab
// in both tab rows and a command in the phone's search.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { filesOnPhone, phoneFiles, type PhoneFile } from '../mobile/src/lib/files-place';
import { bottomTabs } from '../mobile/src/lib/groups';
import { phoneCommands } from '../mobile/src/lib/palette';
import type { PhoneRows } from '../renderer/src/phone-rows';

const DEV = 'aaaaaaaaaaaa';
const n = (seed: string, ext: string) => `${seed.repeat(64 / seed.length)}.${ext}`;
type Entry = { n?: string; s: number; big?: boolean; w?: number; h?: number };
const copy = (project: string, item: string, title: string, updatedAt: number, files: Record<string, Entry>): PhoneRows['threads'][number] => ({
  device: DEV, project, item, updated_at: new Date(updatedAt).toISOString(),
  snapshot: { v: 3, item: { id: item, title, updatedAt }, attached: { dir: '~/docs/x', files } } as unknown as PhoneRows['threads'][number]['snapshot'],
});
const projects = [{ slug: `app@${DEV}`, name: 'Agentbox' }, { slug: `film@${DEV}`, name: 'Launch film' }];
const names = (files: PhoneFile[]) => files.map((f) => f.name);

const threads = [
  copy('app', 'w-1', 'Plan the phone app', 1_000, { 'designs/inbox.png': { n: n('a1', 'png'), s: 48_000, w: 1200, h: 750 }, 'STATE.md': { n: n('b1', 'md'), s: 300 } }),
  copy('app', 'w-2', 'Draw three inboxes', 5_000, {
    'designs/inbox.png': { n: n('a1', 'png'), s: 48_000 },
    'designs/notes-on-inbox.md': { n: n('c1', 'md'), s: 900 },
    'recordings/session.mov': { s: 812_000_000, big: true },
    'designs/page-2026-10-31T17-42-40-037Z.png': { n: n('d1', 'png'), s: 20_000 },
    'designs/half-sent.pdf': { s: 10 },
  }),
  copy('film', 'w-3', 'Cut the launch film', 3_000, { 'cut/draft.mp4': { n: n('e1', 'mp4'), s: 4_000_000 }, 'designs/inbox.png': { n: n('f1', 'png'), s: 51_000 }, 'deck.pptx': { n: n('f2', 'pptx'), s: 90_000 } }),
];

describe('the files the phone lists', () => {
  const files = phoneFiles(threads, projects);

  it('is one row for a file two threads named, carrying both, the newest first', () => {
    const inbox = files.filter((f) => f.product === `app@${DEV}` && f.path === 'designs/inbox.png');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].threads.map((t) => t.id)).toEqual(['w-2', 'w-1']);
    expect(inbox[0].threads[0]).toMatchObject({ product: `app@${DEV}`, title: 'Draw three inboxes' });
    expect(inbox[0].at).toBe(5_000);
  });

  it('keeps the same name in two projects as two rows', () => {
    expect(files.filter((f) => f.path === 'designs/inbox.png').map((f) => f.projectName).sort()).toEqual(['Agentbox', 'Launch film']);
  });

  it('is newest first, by the newest thread that named each', () => {
    const at = files.map((f) => f.at);
    expect(at).toEqual([...at].sort((a, b) => b - a));
    expect(files[0].at).toBe(5_000);
    expect(files.at(-1)!.at).toBe(3_000);
  });

  it('takes its kinds from the desktop Files page', () => {
    const kind = (name: string) => files.find((f) => f.name === name)?.kind;
    expect(kind('inbox.png')).toBe('image');
    expect(kind('notes-on-inbox.md')).toBe('markdown');
    expect(kind('draft.mp4')).toBe('film');
    expect(kind('deck.pptx')).toBe('deck');
  });

  it('leaves out bookkeeping and a file the computer never sent up', () => {
    expect(names(files)).not.toContain('STATE.md');
    expect(names(files)).not.toContain('half-sent.pdf');
  });

  it('keeps a file too big for the phone and flags it, and only that one', () => {
    const big = files.find((f) => f.name === 'session.mov');
    expect(big).toMatchObject({ big: true, bytes: 812_000_000, kind: 'film' });
    expect(files.filter((f) => f.big).map((f) => f.name)).toEqual(['session.mov']);
  });

  it('opens a thread under the id its screen shows when two projects share one', () => {
    const twice = [copy('app', 'w-9', 'One', 2_000, { 'a.md': { n: n('a2', 'md'), s: 1 } }), copy('film', 'w-9', 'Two', 2_500, { 'b.md': { n: n('a3', 'md'), s: 1 } })];
    const listed = phoneFiles(twice, projects, { 'w-alias00001': { product: `film@${DEV}`, item: 'w-9' } });
    expect(listed.find((f) => f.name === 'b.md')!.threads[0].id).toBe('w-alias00001');
    expect(listed.find((f) => f.name === 'a.md')!.threads[0].id).toBe('w-9');
  });

  it('lists nothing for a project the computer no longer sends', () => {
    expect(phoneFiles(threads, [projects[1]]).every((f) => f.projectName === 'Launch film')).toBe(true);
    expect(phoneFiles([], projects)).toEqual([]);
  });
});

describe('what the search, the kinds and the projects leave', () => {
  const files = phoneFiles(threads, projects);

  it('hides an agent\'s check picture until it is searched for', () => {
    expect(names(filesOnPhone(files, {}))).not.toContain('page-2026-10-31T17-42-40-037Z.png');
    expect(names(filesOnPhone(files, { query: 'page' }))).toContain('page-2026-10-31T17-42-40-037Z.png');
  });

  it('finds by a word that starts a part of the name, and not by one inside it', () => {
    expect(names(filesOnPhone(files, { query: 'notes' }))).toEqual(['notes-on-inbox.md']);
    expect(names(filesOnPhone(files, { query: 'otes' }))).toEqual([]);
  });

  it('names a file before a project of that word', () => {
    expect(names(filesOnPhone(files, { query: 'launch' }))).toEqual(expect.arrayContaining(['draft.mp4', 'inbox.png', 'deck.pptx']));
    expect(names(filesOnPhone(files, { query: 'draft' }))).toEqual(['draft.mp4']);
  });

  it('narrows to one kind and one project', () => {
    expect(names(filesOnPhone(files, { kind: 'image' }))).toEqual(['inbox.png', 'inbox.png']);
    expect(filesOnPhone(files, { kind: 'image', project: 'Launch film' }).map((f) => f.projectName)).toEqual(['Launch film']);
    expect(filesOnPhone(files, { kind: 'pdf' })).toEqual([]);
  });

  it('keeps the newest first through every filter', () => {
    const at = filesOnPhone(files, { query: 'inbox' }).map((f) => f.at);
    expect(at).toEqual([...at].sort((a, b) => b - a));
  });
});

describe('Files as a place on the phone', () => {
  it('is the last tab with a team on and with the four tabs', () => {
    expect(bottomTabs(true).at(-1)).toEqual({ id: 'files', label: 'Files' });
    expect(bottomTabs(false).map((t) => t.label)).toEqual(['Needs you', 'In progress', 'Later', 'Done', 'Files']);
  });

  it('is a command in search, team or not', () => {
    for (const team of [true, false]) expect(phoneCommands({ team }).find((c) => c.id === 'files')).toMatchObject({ label: 'Files', act: { go: 'files' } });
  });

  it('is drawn by the inbox page and says the desktop\'s words when empty', () => {
    expect(fs.readFileSync('mobile/src/app/index.tsx', 'utf8')).toMatch(/<FilesPlace\b/);
    const page = fs.readFileSync('mobile/src/ui/FilesPlace.tsx', 'utf8');
    expect(page).toContain('Nothing in Files yet.');
    expect(page).toContain('placeholder="Search files"');
  });
});
