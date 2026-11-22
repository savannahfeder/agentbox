// A THREAD SENT TO THE CLOUD STARTS ITS REPLIES THERE.
//
// What broke (2026-11-10): a Blender thread showed Runs on: Cloud, "Its next
// reply starts in the cloud", and three replies in a row started on the Mac.
// Picking Cloud only cleared "Keep on this Mac", so the thread fell back to the
// cloud setting, and under "when this Mac is full" `_whereToRun` puts a reply
// on the Mac whenever it has a slot. Agents that landed there had no way to
// send the reply on: AGENTBOX-NEEDS-THE-COMPUTER only goes the other way.
//
// Now picking Cloud (or Move to the cloud) is a choice the app keeps: the
// thread's replies go to the cloud first and wait for it rather than start
// here, and the wait says why. A run on the Mac that needs the cloud ends on
// AGENTBOX-NEEDS-THE-CLOUD and its request runs again in the cloud.
// Measured against the supervisor with spawning replaced, as in
// tests/a-thread-runs-in-the-cloud-only-when-this-mac-is-full.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Supervisor } from '../main/supervisor.mts';
import { taskFolderPath } from '../main/task-folders.mts';
import { SEND_TO_CLOUD, asksForCloud } from '../shared/cloud-hand-back.mts';

let tmp; let repo; let folder; let product; let sup;
const savedConfigEnv = process.env.AGENTBOX_CLOUD_CONFIG;

const build = ({ cloudRuns = true, slots = 2, signedIn = true, root = null } = {}) => {
  sup = new Supervisor(
    { home: '/nonexistent-home-with-no-second-account', storeRoot: root ?? path.join(tmp, 'store'), maxConcurrentSessions: slots, authProfiles: ['default'], cloudRuns, maxCloudSessions: 10 },
    { listItems: () => [], listProducts: () => [product], isDue: () => true, settleAnswer() {}, readItem: () => null },
    path.join(tmp, 'app'),
  );
  sup._bringCloudHome = () => {};
  sup._hasCloudSignIn = () => signedIn;
  // The cloud's own sign-in (main/cloud/logins.mts), read from the keychain in the app.
  sup._cloudSignedInAtAll = () => signedIn && cloudRuns !== false;
  return sup;
};
let busy = 0;
const fill = (n, { cloud = false } = {}) => {
  for (let i = 0; i < n; i += 1) {
    busy += 1;
    const id = `w-busy-${busy}`;
    sup.sessions.set(id, { itemId: id, product: 'p', engine: 'claude', cloud, child: { kill() {} }, tail: [] });
  }
};
const row = (id = 'w-1') => ({ id, product: 'p', status: 'open', labels: ['founder'], answer: 'run it in cloud' });
const where = (item = row()) => sup._whereToRun({ item, product, cwd: folder, engine: 'claude', continuation: true });

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sent-to-cloud-')));
  repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=a@e', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: repo });
  product = { slug: 'p', repoPath: repo, dir: path.join(tmp, 'store', 'p') };
  folder = taskFolderPath(repo, 'w-1');
  fs.mkdirSync(path.dirname(folder), { recursive: true });
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'agentbox/w-1', folder], { cwd: repo });
  const cfg = path.join(tmp, 'cloud.json');
  fs.writeFileSync(cfg, JSON.stringify({ region: 'us-east-1', bucket: 'b', runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/x' }));
  process.env.AGENTBOX_CLOUD_CONFIG = cfg;
});
afterEach(() => {
  if (savedConfigEnv === undefined) delete process.env.AGENTBOX_CLOUD_CONFIG; else process.env.AGENTBOX_CLOUD_CONFIG = savedConfigEnv;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('a thread the person sent to the cloud', () => {
  it('starts its reply in the cloud while this Mac has room, with the cloud on "when this Mac is full"', () => {
    build();
    expect(where()).toBe('local');
    sup.setThreadOnMac({ 'w-1': false });
    expect(where()).toBe('cloud');
    // Another thread is placed as before.
    expect(where(row('w-2'))).toBe('local');
  });

  it('waits for the cloud when it is full, rather than starting here, and says so', () => {
    build();
    sup.setThreadOnMac({ 'w-1': false });
    sup._maxCloud = () => 1;
    fill(1, { cloud: true });
    expect(where()).toBe('cloud-wait');
    expect(sup._waitsForCloud(row(), 'claude')).toBe(true);
    expect(sup._whyWaitingForCloud('claude')).toEqual({ why: 'cloud-full', detail: 1 });
  });

  it('waits while the cloud account is at its limit, which a thread left to the setting does not', () => {
    build({ cloudRuns: 'all' });
    sup._cloudInUseState = () => 'limited';
    sup._cloudReady = () => true;
    sup._cloudSlotFor = () => false;
    expect(sup._waitsForCloud(row('w-2'), 'claude')).toBe(false);
    sup.setThreadOnMac({ 'w-1': false });
    expect(sup._waitsForCloud(row(), 'claude')).toBe(true);
    expect(sup._whyWaitingForCloud('claude').why).toBe('accounts-limited');
  });

  it('runs here, saying why, when the cloud has no sign-in for it at all', () => {
    build({ signedIn: false });
    sup.setThreadOnMac({ 'w-1': false });
    expect(sup._waitsForCloud(row(), 'claude')).toBe(false);
    expect(where()).toBe('local');
    expect(sup._whyLocal({ item: row(), product, cwd: folder, engine: 'claude' })).toEqual({ why: 'no-account', detail: 'claude' });
  });

  it('never goes to the cloud with the cloud turned off', () => {
    build({ cloudRuns: false });
    sup.setThreadOnMac({ 'w-1': false });
    expect(sup._waitsForCloud(row(), 'claude')).toBe(false);
    expect(where()).toBe('local');
  });

  it('goes back to the setting when kept on this Mac or let go, and keeps the choice over a restart', () => {
    const root = path.join(tmp, 'store');
    fs.mkdirSync(root, { recursive: true });
    build({ root });
    sup.setThreadOnMac({ 'w-1': false });
    build({ root });
    expect(where()).toBe('cloud');
    sup.setThreadOnMac({ 'w-1': true });
    expect(where()).toBe('local');
    sup.setThreadOnMac({ 'w-1': false });
    sup.setThreadOnMac({ 'w-1': null });
    expect(where()).toBe('local');
  });

  it('is sent by Move to the cloud as well', () => {
    build();
    sup.moveToCloud(['w-1']);
    expect(where()).toBe('cloud');
  });
});

describe('a run on this Mac that needs the cloud', () => {
  const ranHere = (result) => ({ itemId: 'w-1', product: 'p', engine: 'claude', cloud: false, cwd: folder, sessionId: 's1', result, resultIsError: false });

  it('reads the line only at the start of a line', () => {
    expect(asksForCloud(`Stopping here.\n${SEND_TO_CLOUD} a Blender render`)).toBe(true);
    expect(asksForCloud(`I could end on ${SEND_TO_CLOUD} but will not`)).toBe(false);
    expect(asksForCloud('Done.')).toBe(false);
    expect(asksForCloud(null)).toBe(false);
  });

  it('hands the request to the cloud and keeps the thread there', () => {
    build();
    const session = ranHere(`${SEND_TO_CLOUD} a Blender render`);
    expect(sup._noteSentToCloud(row(), session)).toBe(true);
    expect(session.handedBack).toBe(true);
    expect(where()).toBe('cloud');
  });

  it('is not a hand-back on a cloud run, a failed run, or where the cloud cannot take it', () => {
    build();
    expect(sup._noteSentToCloud(row(), { ...ranHere(`${SEND_TO_CLOUD} x`), cloud: true })).toBe(false);
    expect(sup._noteSentToCloud(row(), { ...ranHere(`${SEND_TO_CLOUD} x`), resultIsError: true })).toBe(false);
    expect(sup._noteSentToCloud(row(), ranHere('All done.'))).toBe(false);
    build({ signedIn: false });
    expect(sup._noteSentToCloud(row(), ranHere(`${SEND_TO_CLOUD} x`))).toBe(false);
  });

  it('hands one reply on once, so a reply the cloud sends straight back cannot bounce for ever', () => {
    build();
    expect(sup._noteSentToCloud(row(), ranHere(`${SEND_TO_CLOUD} x`))).toBe(true);
    expect(sup._noteSentToCloud(row(), ranHere(`${SEND_TO_CLOUD} x`))).toBe(false);
  });

  it('is told about the line only where the cloud could take its reply', () => {
    build();
    expect(sup._cloudNoteForHere(row(), product, folder, 'claude')).toContain(SEND_TO_CLOUD);
    sup.setThreadOnMac({ 'w-1': true });
    expect(sup._cloudNoteForHere(row(), product, folder, 'claude')).toBe(null);
    build({ signedIn: false });
    expect(sup._cloudNoteForHere(row(), product, folder, 'claude')).toBe(null);
  });
});
