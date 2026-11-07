// Sofia saved Team look v2 in the team's group and Files said "No file matches." for "look" and
// "team". Measured on the team's cloud: the group held team-look.md in
// 2 versions and Files listed none of them, because Files read threads and never groups.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { appFilesPlace } from '../main/files-place.mjs';
import { filesShown } from '../renderer/src/files/files-shown.ts';
import { filesInLines, shownName, threadFiles } from '../shared/artifact-marks.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'group-files-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const kept = path.join(dir, 'mvx6zm5q-dep7ls-team-look.md');
fs.writeFileSync(kept, '# Team look');
const first = path.join(dir, 'team-look.md');
fs.writeFileSync(first, '# Team look, first');

const ROOM = 'room-1';
const message = (id, name, at, by = 'sofia', extra = {}) => ({ id, roomId: ROOM, by, body: `Updated it.\n\n[${name}](attachments/${name})`, at, deleted: false, ...extra });

function place({ messages, marks = [], fetched = [], written = [] }) {
  const onDisk = { 'team-look.md': first, 'mvx6zm5q-dep7ls-team-look.md': kept };
  const team = {
    state: () => ({ me: { id: 'me' }, people: [], cards: [], rooms: { rooms: [{ id: ROOM, name: 'Lumen' }], messages: { [ROOM]: messages }, fileMarks: { [ROOM]: marks } } }),
    sharedThreads: () => [],
    sharedThreadProducts: () => [],
    rooms: {
      fileIfKept: (_r, name) => (name === 'not-here-yet.md' ? null : onDisk[name] ?? null),
      fileOnDisk: async (_r, name) => { fetched.push(name); return onDisk[name] ?? null; },
      markFile: async (roomId, mark) => { written.push({ roomId, mark }); return 'id'; },
    },
  };
  const store = { listProducts: () => [], listAllWorkItems: () => [] };
  return appFilesPlace({ store, team, accountRoot: dir, storeRoot: dir });
}

describe('the name a kept group file goes by', () => {
  const kept2 = '/s/.room-files/room-1/mvx6zm5q-dep7ls-team-look.md';
  const kept1 = '/s/.room-files/room-1/team-look.md';

  it('drops the copy mark, as it does in the group', () => {
    expect(shownName(kept2)).toBe('team-look.md');
  });

  it('keeps the versions one family, which the opened file needs for "v2 of 2"', () => {
    const families = threadFiles([{ path: kept1, at: 1 }, { path: kept2, at: 2 }]);
    expect(families).toHaveLength(1);
    expect(families[0].versions.map((v) => v.id)).toEqual(['team-look.md', 'team-look.md#2']);
  });

  it('leaves a same-looking name outside a group alone', () => {
    expect(shownName('/s/company/mvx6zm5q-dep7ls-team-look.md')).toBe('mvx6zm5q-dep7ls-team-look.md');
  });
});

describe('a file in a group, in Files', () => {
  const messages = [message('a', 'team-look.md', 100, 'maya'), message('b', 'mvx6zm5q-dep7ls-team-look.md', 200)];

  it('is one file with its versions, and says where it was shared', async () => {
    const { files } = await place({ messages }).list();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ versions: 2, kind: 'markdown', at: 200, by: 'sofia', project: null, opened: kept });
    expect(files[0].sentIn).toEqual([{ kind: 'room', roomId: ROOM, title: 'Lumen' }]);
  });

  it('is found by the words Sofia searched, and not by others', async () => {
    const { files } = await place({ messages }).list();
    expect(filesShown(files, { query: 'look' })).toHaveLength(1);
    expect(filesShown(files, { query: 'team' })).toHaveLength(1);
    expect(filesShown(files, { query: 'teaser' })).toHaveLength(0);
  });

  it('opens with each version where it is on this computer', async () => {
    const view = await place({ messages }).open((await place({ messages }).list()).files[0].key);
    expect(view.versions.map((v) => v.n)).toEqual([1, 2]);
    expect(filesInLines(view.lines).map((f) => f.path)).toEqual([first, kept]);
  });

  it('carries the comments made in the group, and a new one goes back there', async () => {
    const list = await place({ messages }).list();
    const fileId = (await place({ messages }).open(list.files[0].key)).versions[1].id;
    const marks = [{ id: 'm1', by: 'dev', at: 300, mark: { do: 'note', id: 'n1', file: fileId, place: { kind: 'whole' }, text: 'Which copper?' } }];
    const written = [];
    const here = place({ messages, marks, written });
    const view = await here.open(list.files[0].key);
    expect(view.marks.notes.map((n) => n.text)).toEqual(['Which copper?']);
    const out = await here.mark(list.files[0].key, { do: 'note', id: 'n2', file: fileId, place: { kind: 'whole' }, text: 'This one.' });
    expect(out).toEqual({ ok: true });
    expect(written).toEqual([{ roomId: ROOM, mark: expect.objectContaining({ id: 'n2' }) }]);
  });

  it('does not download anything to draw the list', async () => {
    const fetched = [];
    const { files } = await place({ messages: [message('c', 'not-here-yet.md', 50)], fetched }).list();
    expect(files[0].opened).toBe(null);
    expect(fetched).toEqual([]);
  });

  it('fetches a file not yet here when it is opened', async () => {
    const fetched = [];
    const p = place({ messages: [message('c', 'not-here-yet.md', 50)], fetched });
    await p.open((await p.list()).files[0].key);
    expect(fetched).toEqual(['not-here-yet.md']);
  });

  it('leaves out a file whose message was deleted', async () => {
    const { files } = await place({ messages: [message('a', 'team-look.md', 100, 'maya', { deleted: true })] }).list();
    expect(files).toHaveLength(0);
  });

  it('lists nothing for a person with no team', async () => {
    const store = { listProducts: () => [], listAllWorkItems: () => [] };
    expect((await appFilesPlace({ store, team: null, accountRoot: dir, storeRoot: dir }).list()).files).toEqual([]);
  });
});
