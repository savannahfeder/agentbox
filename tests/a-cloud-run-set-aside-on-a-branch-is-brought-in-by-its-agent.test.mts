// A cloud run that comes home to a folder changed on this Mac meanwhile goes
// on a branch of its own, `cloud/<item>` (main/cloud/run.mts `park`). The row
// was then blocked with "Reply to have the agent bring the two together; it
// will not ship until then", so a finished fix sat unshipped until the person
// came and typed a reply. Seen on w-b17dd2f06f (2026-11-24): a fix for lost
// edits, filed by an agent, blocked in Needs you with nobody due to answer.
//
// Now the app hands the agent the branch and starts it, the way a failed ship
// goes straight back to its agent, and the note is one the thread does not
// draw. A second set-aside before the agent has answered still waits for the
// person, so the two cannot go round for ever, and a thread they stopped stays
// stopped.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { addCloudNews } from '../main/cloud/marker.mts';
import { Supervisor } from '../main/supervisor.mts';
import { forTheAgent, bringingItTogether } from '../shared/notes-for-the-agent.mts';
import { KEPT_ASIDE, notShipped } from '../shared/not-shipped.mts';

const ASKED = `${KEPT_ASIDE}this folder changed on this Mac while the run was in the cloud. Nothing is lost. The folder is as this Mac left it, and the run's version is on the branch cloud/w-1. Reply to have the agent bring the two together; it will not ship until then.`;
const T = 1_800_000_000_000;

let tmp: string; let folder: string;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'setaside-')));
  folder = path.join(tmp, 'task');
  fs.mkdirSync(folder);
  execFileSync('git', ['init', '-q'], { cwd: folder });
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }); });

type Row = { id: string; product: string; status: string; note?: string; labels?: string[]; wrote: Record<string, { ts: number; source: string }> };
const setUp = async (row: Row, { running = false } = {}) => {
  const kept: { note: string; waits: boolean }[] = [];
  const started: { id: string; opts: Record<string, unknown> }[] = [];
  const product = { slug: 'p', dir: '/nowhere', repoPath: '/r' };
  const store = {
    listItems: () => [row], listProducts: () => [product], isDue: () => true,
    readItem: () => row,
    cloudWorkKeptAside: (_slug: string, _id: string, note: string, { waits = true } = {}) => { kept.push({ note, waits }); },
  };
  const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'] }, store, tmp);
  sup.spawnWorker = (item: { id: string }, opts: Record<string, unknown>) => { started.push({ id: item.id, opts }); };
  sup.releaseWorkFolder = () => null;
  const session = { cloud: true };
  if (running) sup.sessions.set('w-1', session);
  addCloudNews(folder, { runId: 'r1', item: 'w-1', product: 'p', branch: 'cloud/w-1', note: ASKED });
  sup._sayCloudNews(folder);
  await new Promise((r) => setTimeout(r, 5));
  const end = async () => { sup.endSession(row, session, product); await new Promise((r) => setTimeout(r, 5)); };
  return { kept, started, end };
};
const answered = (): Row => ({ id: 'w-1', product: 'p', status: 'claimed', note: 'Working on it.', wrote: { result: { ts: T, source: 'agent' }, note: { ts: T - 10, source: 'agent' } } });

describe('a cloud run set aside on a branch is brought in by its agent', () => {
  it('starts the agent on the same conversation, told which branch to bring in, and leaves the row open', async () => {
    const { kept, started } = await setUp(answered());
    expect(started).toHaveLength(1);
    expect(started[0].opts).toMatchObject({ continuation: true });
    expect(String(started[0].opts.shipFailure)).toMatch(/cloud\/w-1/);
    expect(kept).toEqual([{ note: expect.any(String), waits: false }]);
  });

  it('told while the run that brought it home is still being put away, it starts once that run has ended', async () => {
    const { started, end } = await setUp(answered(), { running: true });
    expect(started).toEqual([]);
    await end();
    expect(started).toHaveLength(1);
  });

  it('writes a note the thread does not draw, which still says the work has not reached main', async () => {
    const { kept } = await setUp(answered());
    expect(forTheAgent(kept[0].note)).toBe(true);
    expect(kept[0].note).toBe(bringingItTogether(ASKED));
    expect(notShipped({ status: 'open', note: kept[0].note, wrote: { note: { ts: T + 5 }, result: { ts: T } } })?.branch).toBe('cloud/w-1');
  });

  it('the note asking for a reply is still drawn', async () => {
    expect(forTheAgent(ASKED)).toBe(false);
  });

  it('set aside again before the agent has answered, it waits for the person as before', async () => {
    const row: Row = { id: 'w-1', product: 'p', status: 'claimed', note: bringingItTogether(ASKED), wrote: { result: { ts: T, source: 'agent' }, note: { ts: T + 5, source: 'system' } } };
    const { kept, started } = await setUp(row);
    expect(started).toEqual([]);
    expect(kept).toEqual([{ note: ASKED, waits: true }]);
  });

  it('a thread the person stopped is not started', async () => {
    const row = answered();
    row.wrote.status = { ts: T + 1, source: 'founder' };
    row.status = 'blocked';
    const { kept, started } = await setUp(row);
    expect(started).toEqual([]);
    expect(kept).toEqual([{ note: ASKED, waits: true }]);
  });
});
