// The freeze recorder (main/freeze-recorder.mts) has written every hold of the
// main thread to a log on the computer since 2026-10-21, and nobody read it: the
// spinning wheel kept coming on most actions, and the freezes were fixed one at
// a time, a dozen times that month, each after somebody complained. A cloud run
// asked to look into it could not read the log at all, since it stays on the
// computer. So the app reads it: once a day, on the computer that runs Agentbox
// from its own repository, a day with a hold of a second or more files one
// thread carrying the stacks, which starts on its own.
import { it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mts';
import { writeFreeze } from '../main/freeze-recorder.mts';
import { FreezeWatch, FREEZE_LABEL } from '../main/freeze-watch.mjs';

const DAY = 86_400_000;
const NOON_NOV_2 = new Date(2026, 10, 2, 12).getTime();
let root, appDir, logDir, userDir, store;

async function aComputer({ appsOwnRepo = true } = {}) {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-watch-'));
  appDir = path.join(root, 'agentbox');
  logDir = path.join(root, 'user', 'memory-log');
  userDir = path.join(root, 'user');
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  const accountRoot = path.join(root, 'store', 'accounts', 'a');
  const project = (slug, repoPath) => {
    fs.mkdirSync(path.join(accountRoot, slug), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, slug, 'project.json'), JSON.stringify({ schemaVersion: 2, id: slug, name: slug, repoPath }));
  };
  project('website', path.join(root, 'website'));
  if (appsOwnRepo) project('agentbox', appDir);
  disk._internals.forgetFolds();
  store = await new Store({ storeRoot: path.join(root, 'store'), accountId: 'a', accountRoot, products: [] }).init();
}

const froze = (at, ms, where = 'filesInLines shared/artifact-marks.mjs:404') => writeFreeze(logDir, {
  at: new Date(at).toISOString(), ms, samples: ms / 10, busy: 0.9, gc: 0.05, where,
  stacks: [{ share: 0.6, frames: [where, 'allFiles main/files-place.mjs:367', 'lineFor main/files-place.mjs:707'] }],
}, { keepDays: 30 });
const watch = (now) => new FreezeWatch({ store, userDir, appDir, logDir, now: () => now, log: { warn() {}, info() {} } });
const rows = () => store.listItems().filter((i) => i.labels?.includes(FREEZE_LABEL));

beforeEach(() => aComputer());

it('a day with a hold of a second or more files one thread that starts on its own', () => {
  froze(NOON_NOV_2 - DAY, 1200);
  froze(NOON_NOV_2 - DAY + 60_000, 600, '_tick main/supervisor.mts:7477');
  watch(NOON_NOV_2).check();
  const [row] = rows();
  expect(rows()).toHaveLength(1);
  expect(row.product).toBe('agentbox');
  expect(row.labels).toContain('founder');
  expect(row.status).toBe('open');
  expect(row.title).toBe('The app froze 2 times on 2026-11-01, longest 1.2 s');
  expect(row.body).toContain('filesInLines shared/artifact-marks.mjs:404');
  expect(row.body).toContain('lineFor main/files-place.mjs:707');
  expect(row.body).toContain('_tick main/supervisor.mts:7477');
  expect(row.body.indexOf('filesInLines')).toBeLessThan(row.body.indexOf('_tick'));
});

it('a day whose longest hold is under a second files nothing, and one of exactly a second does', () => {
  froze(NOON_NOV_2 - DAY, 999);
  watch(NOON_NOV_2).check();
  expect(rows()).toHaveLength(0);
  froze(NOON_NOV_2, 1000);
  watch(NOON_NOV_2 + DAY).check();
  expect(rows()).toHaveLength(1);
});

it('files nothing on a computer that does not run Agentbox from its own repository', async () => {
  await aComputer({ appsOwnRepo: false });
  froze(NOON_NOV_2 - DAY, 5000);
  watch(NOON_NOV_2).check();
  expect(rows()).toHaveLength(0);
  expect(store.listItems()).toHaveLength(0);
});

it('reads only whole days: today is left for tomorrow', () => {
  froze(NOON_NOV_2 - 60_000, 4000);
  watch(NOON_NOV_2).check();
  expect(rows()).toHaveLength(0);
  watch(NOON_NOV_2 + DAY).check();
  expect(rows()).toHaveLength(1);
});

it('checks a day once, however often it is asked', () => {
  froze(NOON_NOV_2 - DAY, 1500);
  for (let i = 0; i < 5; i += 1) watch(NOON_NOV_2 + i * 3_600_000).check();
  expect(rows()).toHaveLength(1);
});

it('while its thread is open, the next day is a note on it; once closed, a new thread', () => {
  froze(NOON_NOV_2 - DAY, 1500);
  watch(NOON_NOV_2).check();
  const [first] = rows();
  froze(NOON_NOV_2, 2500, 'status main/supervisor.mts:6894');
  watch(NOON_NOV_2 + DAY).check();
  expect(rows()).toHaveLength(1);
  const history = store.readHistory('agentbox', first.id).map((l) => l.patch?.note).filter(Boolean);
  expect(history.at(-1)).toContain('2026-11-02');
  expect(history.at(-1)).toContain('status main/supervisor.mts:6894');
  disk.updateWorkItem(store.productDir('agentbox'), first.id, { status: 'done' }, { source: 'founder' });
  froze(NOON_NOV_2 + DAY, 3000);
  watch(NOON_NOV_2 + 2 * DAY).check();
  expect(rows()).toHaveLength(2);
});
