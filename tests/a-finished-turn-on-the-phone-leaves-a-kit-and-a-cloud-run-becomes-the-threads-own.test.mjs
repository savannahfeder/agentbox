// A FINISHED TURN ON THE PHONE LEAVES A KIT, AND A CLOUD RUN BECOMES THE THREAD'S OWN.
//
// The supervisor's half of the phone working with the computer shut
// (2026-10-24: "Everything should work from your mobile app with your
// computer completely closed"). After a Claude Code turn ends cleanly on a
// thread her phone carries, and only on the managed cloud (the one with a
// server to start it), the supervisor starts the kit writer with the reply
// run's own command line, planned as a real reply is, and the reply's place
// marked in the prompt. On waking it makes a run the cloud started its own:
// marker written, her reply on the row, no run of its own, and the run joined.
// Measured with the real Supervisor and Store and a stand-in for the relay.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { Supervisor } from '../main/supervisor.mjs';
import { Store } from '../main/store.mjs';
import { readMarker, writeMarker } from '../main/cloud/marker.mjs';
import { kitCopyPath } from '../main/cloud/kit.mjs';
import { REPLY_MARK, replyPrompt, cloudSessionId } from '../shared/cloud-kit.mjs';

const DEVICE = 'a1b2c3d4e5f6';
let tmp; let store; let sup; let row; let folder; let relays; let joins;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-kit-')));
  const root = path.join(tmp, 'store');
  const repo = path.join(tmp, 'repo');
  folder = path.join(repo, '.claude', 'worktrees', 'w-1');
  fs.mkdirSync(folder, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: folder });
  fs.mkdirSync(path.join(root, 'team'), { recursive: true });
  fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
  store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
  // As the supervisor holds a row: with its project.
  row = { ...store.fileItem('team', { title: 'Ship it', kind: 'task', body: 'Ship the phone app.' }), product: 'team' };
  const storeMcp = path.join(tmp, 'store-mcp.sh');
  fs.writeFileSync(storeMcp, '#!/bin/sh\n');
  sup = new Supervisor({ storeRoot: root, home: tmp, maxConcurrentSessions: 3, storeMcpCommand: storeMcp }, store, tmp);
  sup.writeMcpConfig = () => null;
  sup._workerEnv = () => ({});
  relays = [];
  sup._spawnCloudRelay = (args, opts) => {
    const c = new EventEmitter();
    c.stdout = new PassThrough(); c.stderr = new PassThrough();
    c.kill = () => true;
    c.args = args; c.opts = opts;
    relays.push(c);
    return c;
  };
  // On the managed cloud, with a Claude account signed in for it, and her phone carrying this project.
  sup._cloudReady = () => true;
  sup._cloudConfig = { gateway: 'https://cloud.example' };
  sup.phoneCarrying({ device: DEVICE, slugs: ['team'] });
  joins = [];
  sup._cloudStorage = async () => ({ put: async (k, body) => { joins.push({ k, body: JSON.parse(body) }); } });
});

afterEach(() => {
  sup?.stop?.();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const finished = (over = {}) => ({ engine: 'claude', cwd: folder, profile: 'default', result: 'Ready?', resultIsError: false, exitFailed: false, child: { ranToTheEnd: () => true }, ...over });
const kitWriters = () => relays.filter((r) => r.args[0] === '--agentbox-kit');

describe('after a turn', () => {
  it('starts the kit writer with the reply run\'s own command line and the reply\'s place', () => {
    sup._leaveKitForThePhone(row, finished());
    expect(kitWriters()).toHaveLength(1);
    const { args, opts } = kitWriters()[0];
    expect(opts.cwd).toBe(folder);
    expect(opts.env).toMatchObject({ AGENTBOX_KIT_DEVICE: DEVICE, ZERO_PRODUCT: 'team', ZERO_ITEM: row.id, AGENTBOX_KIT_COPY: kitCopyPath(tmp, 'team', row.id) });
    // The prompt goes on the agent's input, never on its command line.
    expect(args.join(' ')).not.toContain(REPLY_MARK);
    expect(args).toEqual(expect.arrayContaining(['--input-format', 'stream-json']));
    const frame = JSON.parse(fs.readFileSync(opts.env.AGENTBOX_KIT_FRAME, 'utf8'));
    expect(replyPrompt(frame, 'yes, ship it')).toContain('yes, ship it');
  });

  it('one writer a thread at a time; a newer turn waits and goes once it ends', () => {
    sup._leaveKitForThePhone(row, finished());
    sup._leaveKitForThePhone(row, finished());
    sup._leaveKitForThePhone(row, finished());
    expect(kitWriters()).toHaveLength(1);
    kitWriters()[0].emit('exit', 0);
    expect(kitWriters()).toHaveLength(2);
    kitWriters()[1].emit('exit', 0);
    expect(kitWriters()).toHaveLength(2);
  });

  it('a writer that fails is said once and not tried again on its own', () => {
    const warned = [];
    const was = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    try {
      sup._leaveKitForThePhone(row, finished());
      kitWriters()[0].stderr.write('agentbox cloud: the bucket refused it\n');
      kitWriters()[0].emit('exit', 1);
      sup._leaveKitForThePhone(row, finished());
      kitWriters()[1].emit('exit', 1);
    } finally { console.warn = was; }
    expect(kitWriters()).toHaveLength(2);
    expect(warned.filter((w) => /no kit for the phone/.test(w))).toHaveLength(1);
  });

  // A Codex thread with a conversation to resume does leave one
  // (tests/a-codex-thread-on-the-phone-carries-on-in-the-cloud-with-the-computer-shut).
  it('leaves none for a thread not on her phone, a Codex thread with no conversation yet, a failed run, or a computer not on the managed cloud', () => {
    sup.phoneCarrying({ device: DEVICE, slugs: ['other'] });
    sup._leaveKitForThePhone(row, finished());
    sup.phoneCarrying({ device: DEVICE, slugs: ['team'] });
    sup._leaveKitForThePhone(row, finished({ engine: 'codex' }));
    sup._leaveKitForThePhone(row, finished({ exitFailed: true }));
    sup._leaveKitForThePhone(row, finished({ resultIsError: true }));
    sup._cloudConfig = { bucket: 'her-own-aws' };
    sup._leaveKitForThePhone(row, finished());
    sup._cloudConfig = { gateway: 'https://cloud.example' };
    sup._cloudReady = () => false;
    sup._leaveKitForThePhone(row, finished());
    expect(kitWriters()).toHaveLength(0);
  });

  it('says which projects carry on in the cloud', () => {
    expect(sup.leavesKitsFor('team')).toBe(true);
    expect(sup.leavesKitsFor('other')).toBe(false);
    sup._cloudReady = () => false;
    expect(sup.leavesKitsFor('team')).toBe(false);
  });
});

describe('waking to a run the cloud started', () => {
  const kit = () => ({
    v: 1, item: row.id, project: 'team', cwd: folder,
    marker: { branch: 'agentbox/w-1', startSha: 'a'.repeat(40), configDir: path.join(tmp, '.claude'), engine: 'claude', bringDirs: [{ name: 'projects.tgz', dir: path.join(tmp, '.claude', 'projects', 'x') }] },
  });
  const leaveKit = () => { fs.mkdirSync(path.join(tmp, 'cloud-kits'), { recursive: true }); fs.writeFileSync(kitCopyPath(tmp, 'team', row.id), JSON.stringify(kit())); };

  it('writes its marker, puts her reply on the row with no run of its own, and joins it', async () => {
    leaveKit();
    expect(await sup.adoptCloudRun({ product: 'team', itemId: row.id, runId: 'r1', replies: ['yes, go ahead'] })).toBe('adopted');
    expect(readMarker(folder)).toMatchObject({ runId: 'r1', sessionId: cloudSessionId(row.id, 'r1'), state: 'detached', branch: 'agentbox/w-1', cursor: 0, unsent: [{ action: 'stdin', end: true }] });
    const fresh = store.readItem('team', row.id);
    expect(fresh.answer).toBe('yes, go ahead');
    expect(sup._answerDelivered(fresh)).toBe(true);
    expect(sup.sessions.has(row.id)).toBe(false);
    expect(relays.map((r) => r.args)).toEqual([['--agentbox-import-only']]);
    expect(sup._liveSessions[row.id]).toMatchObject({ cloud: true, cwd: folder, product: 'team', engine: 'claude' });
  });

  it('its answer reaches the row when the joined run ends', async () => {
    leaveKit();
    await sup.adoptCloudRun({ product: 'team', itemId: row.id, runId: 'r1', replies: ['go'] });
    const relay = relays[0];
    relay.stdout.write(`${JSON.stringify({ type: 'system', subtype: 'init', session_id: 's-cloud' })}\n`);
    relay.stdout.write(`${JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Shipped from the cloud.' })}\n`);
    await new Promise((r) => setImmediate(r));
    relay.emit('exit', 0, null);
    await new Promise((r) => setImmediate(r));
    expect(store.readItem('team', row.id).result).toBe('Shipped from the cloud.');
  });

  it('puts every reply the run took on the row in order, none of them starting a run here', async () => {
    leaveKit();
    await sup.adoptCloudRun({ product: 'team', itemId: row.id, runId: 'r4', replies: ['first', 'second'] });
    const said = store.readHistory('team', row.id, { max: 1000 }).filter((l) => l.patch?.answer).map((l) => l.patch.answer);
    expect(said.slice(-2)).toEqual(['first', 'second']);
    expect(sup._answerDelivered(store.readItem('team', row.id))).toBe(true);
    expect(relays).toHaveLength(1);
  });

  it('a reply the run took after the computer joined goes on the row too, with no run of its own', async () => {
    leaveKit();
    await sup.adoptCloudRun({ product: 'team', itemId: row.id, runId: 'r5', replies: ['first'] });
    await sup.cloudRunReplies({ product: 'team', itemId: row.id, replies: ['late'] });
    const fresh = store.readItem('team', row.id);
    expect(fresh.answer).toBe('late');
    expect(sup._answerDelivered(fresh)).toBe(true);
  });

  it('tells the cloud server it joined, so it stops feeding and closing the run', async () => {
    leaveKit();
    await sup.adoptCloudRun({ product: 'team', itemId: row.id, runId: 'r6', replies: ['go'] });
    expect(joins).toEqual([{ k: 'runs/server/r6.joined.json', body: { joinedAt: expect.any(Number) } }]);
  });

  it('joins all the same when the server cannot be told, and says so once', async () => {
    leaveKit();
    const warned = [];
    const was = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    sup._cloudStorage = async () => ({ put: async () => { throw new Error('the bucket refused it'); } });
    try {
      expect(await sup.adoptCloudRun({ product: 'team', itemId: row.id, runId: 'r7', replies: ['go'] })).toBe('adopted');
    } finally { console.warn = was; }
    expect(warned.filter((w) => /could not tell the cloud/.test(w))).toHaveLength(1);
    expect(readMarker(folder)?.runId).toBe('r7');
  });

  it('is home once its marker is gone and nothing is bringing it home, and until then her next reply waits for it', async () => {
    leaveKit();
    await sup.adoptCloudRun({ product: 'team', itemId: row.id, runId: 'r8', replies: ['go'] });
    const place = sup._cloudPlace(folder, 'team', row.id);
    expect(sup.cloudRunHome({ product: 'team', itemId: row.id, runId: 'r8' })).toBe(false);
    expect(sup._stillComingHome(place)).toBe(true);
    fs.rmSync(path.join(folder, '.git', 'agentbox-cloud.json'), { force: true });
    relays[0].emit('exit', 0, null);
    await new Promise((r) => setImmediate(r));
    expect(sup._stillComingHome(place)).toBe(false);
    expect(sup.cloudRunHome({ product: 'team', itemId: row.id, runId: 'r8' })).toBe(true);
  });

  it('waits while other cloud work in the folder is still coming home', async () => {
    leaveKit();
    writeMarker(folder, { runId: 'earlier', state: 'detached' });
    expect(await sup.adoptCloudRun({ product: 'team', itemId: row.id, runId: 'r2', replies: ['go'] })).toBe('busy');
    expect(readMarker(folder).runId).toBe('earlier');
    expect(store.readItem('team', row.id).answer ?? null).not.toBe('go');
  });

  it('with no kit here, leaves her reply on the row for an ordinary run', async () => {
    expect(await sup.adoptCloudRun({ product: 'team', itemId: row.id, runId: 'r3', replies: ['go on'] })).toBe('no-kit');
    const fresh = store.readItem('team', row.id);
    expect(fresh.answer).toBe('go on');
    expect(sup._answerDelivered(fresh)).toBe(false);
    expect(readMarker(folder)).toBeNull();
    expect(relays).toEqual([]);
  });
});
