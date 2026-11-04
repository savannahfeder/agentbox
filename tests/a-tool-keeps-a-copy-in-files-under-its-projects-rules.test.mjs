// A TOOL KEEPS A COPY IN FILES, UNDER ITS PROJECT'S RULES.
//
// What was missing (2026-10-31): a team's work stayed in its other tools, so every
// agent fetched it again and nobody could search it here. Measured on real stores
// with the in-memory team cloud and the stand-ins: what lands on disk, what Files
// and Command K find, what a teammate sees, and how a failing schedule ends. What
// must not happen: a private project's copy crossing the team, a token in a copy,
// a hostile title escaping the folder, a schedule that retries for ever.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, memoryBackend, signUpMemory } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { appFilesPlace } from '../main/files-place.mjs';
import { createFinder, filesAndNotesOf } from '../main/everything-found.mjs';
import { createConnections } from '../main/connections/index.mjs';
import { createCopies, COPY_EVERY_MS, COPY_RETRY_STEPS_MS, renderForTest } from '../main/connections/copies.mjs';
import { catalogFor } from '../shared/connections-catalog.mjs';
import { standInClient, STANDIN_KINDS, startStandin } from '../scripts/standin-tools.mjs';
import { startToolsFixture } from '../cloud/standin/tools-mcp.mjs';

const key = crypto.randomBytes(32);
const cipher = {
  available: () => true,
  encrypt: (t) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv); const out = Buffer.concat([c.update(t, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), out]); },
  decrypt: (b) => { const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); },
};
const browser = async (url) => {
  const allowed = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000) });
  await fetch(allowed.headers.get('location'), { signal: AbortSignal.timeout(5000) });
};
const OWN_PORT = 34900 + Math.floor(Math.random() * 1000);

async function aMac(cloud, personId, projects) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'copies-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  for (const [id, json] of Object.entries(projects)) {
    fs.mkdirSync(path.join(accountRoot, id, 'designs'), { recursive: true });
    fs.writeFileSync(path.join(accountRoot, id, 'project.json'), JSON.stringify({ schemaVersion: 1, id, ...json }));
  }
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  const service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, personId)),
    store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000,
  });
  const place = appFilesPlace({ store, team: service, accountRoot, storeRoot });
  return { personId, store, service, place, storeRoot, accountRoot, dir: (id) => path.join(accountRoot, id) };
}

let cloud; let maya; let sofia; let running; let conn; let copies; let clock; let rows; let vaultDir;
const allSync = async () => { for (let i = 0; i < 2; i += 1) for (const m of [maya, sofia]) { await m.service.syncNow(); await m.place.crossing(); } };

beforeEach(async () => {
  disk._internals.forgetFolds();
  cloud = createMemoryCloud();
  const ids = ['Maya Chen', 'Sofia Reyes'].map((name) => signUpMemory(cloud, { email: `${name.split(' ')[0].toLowerCase()}@lumen.test`, name }));
  maya = await aMac(cloud, ids[0], { app: { name: 'Lumen app', seenBy: 'team' }, plans: { name: 'Plans', seenBy: 'private' } });
  sofia = await aMac(cloud, ids[1], {});
  await maya.service.signIn();
  await maya.service.createTeam('Lumen');
  await maya.service.invite(cloud.people.get(sofia.personId).email);
  await sofia.service.signIn();
  await sofia.service.acceptInvite(maya.service.state().team.id);

  const redirect = `http://localhost:${OWN_PORT}/callback`;
  running = Object.fromEntries(await Promise.all(STANDIN_KINDS.map(async (k) => [k, await startStandin(k, { redirects: [redirect] })])));
  vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copies-vault-'));
  clock = Date.UTC(2026, 9, 31, 18, 5);
  rows = [];
  conn = createConnections({
    vaultFile: path.join(vaultDir, 'connections.enc'), cipher, openExternal: browser, ownClientPort: OWN_PORT, checkMs: 2000, callMs: 2000, now: () => clock,
    catalog: catalogFor({ env: { AGENTBOX_TOOLS_STANDINS: JSON.stringify(Object.fromEntries(Object.entries(running).map(([k, s]) => [k, s.mcpUrl]))) }, packaged: false }),
  });
  copies = createCopies({
    connections: conn, store: maya.store, stateFile: path.join(vaultDir, 'copies.json'), now: () => clock, onNeedsYou: (r) => rows.push(r), callMs: 2000, runMs: 6000,
  });
  copies.bindPlace(() => maya.place);
});
afterEach(async () => {
  await copies.stop();
  await conn.stop();
  await Promise.all(Object.values(running).map((s) => s.stop()));
  for (const m of [maya, sofia]) await m.service.signOut();
  for (const d of [vaultDir, maya.storeRoot, sofia.storeRoot]) fs.rmSync(d, { recursive: true, force: true });
});

const everythingInTheCloud = () => JSON.stringify([...cloud.threadWork, ...cloud.threadFiles, ...cloud.cards, ...(cloud.fileFolders ?? []), ...(cloud.filePlaces ?? [])], (_k, v) => (v instanceof Map ? [...v] : v));
const connectAll = async (...kinds) => { for (const k of kinds) { const c = standInClient(k); await conn.connect(k, c ? { clientId: c.clientId, clientSecret: c.clientSecret } : {}); } };
const onDisk = (project, tool) => { const d = path.join(maya.dir(project), 'sources', tool); return fs.existsSync(d) ? fs.readdirSync(d).sort() : []; };
const read = (project, tool, name) => fs.readFileSync(path.join(maya.dir(project), 'sources', tool, name), 'utf8');

describe('what lands', () => {
  it('Linear issues, as clean markdown saying where each came from and when', async () => {
    await connectAll('linear');
    const out = await copies.start('linear', { project: 'app' });
    expect(out).toMatchObject({ ok: true, copy: { count: 3, failed: [], ranAt: clock } });
    const names = onDisk('app', 'linear');
    expect(names).toHaveLength(3);
    const doc = read('app', 'linear', names.find((n) => n.startsWith('LUM-41')));
    expect(doc).toMatch(/^# LUM-41 Group bookings: a clinic can hold a block of six\n/);
    expect(doc).toContain('[Linear](https://linear.app/lumen/issue/LUM-41/group-bookings)');
    expect(doc).toMatch(/Copied Oct 31, 2026/);
    expect(doc).toContain('In Progress');
    expect(doc).toContain('## What done looks like');
    expect(doc).toContain('Sofia Reyes');
    expect(doc).not.toMatch(/"id"|\{"/);
  });

  it('Notion pages, without the wrapping the tool answers in', async () => {
    await connectAll('notion');
    await copies.start('notion', { project: 'app' });
    const name = onDisk('app', 'notion').find((n) => n.startsWith('launch-plan'));
    const doc = read('app', 'notion', name);
    expect(doc).toMatch(/^# Launch plan for group bookings\n/);
    expect(doc.match(/# Launch plan for group bookings/g)).toHaveLength(1);
    expect(doc).toContain('| Maya | Clinic email |');
    expect(doc).not.toMatch(/<page|<content|<properties/);
  });

  it('HubSpot deals', async () => {
    await connectAll('hubspot');
    await copies.start('hubspot', { project: 'app' });
    const doc = read('app', 'hubspot', onDisk('app', 'hubspot').find((n) => n.startsWith('northside')));
    expect(doc).toMatch(/^# Northside Clinic, group plan\n/);
    expect(doc).toContain('$14,400');
    expect(doc).toContain('[HubSpot](https://app.hubspot.com/contacts/4404211/deal/48213)');
  });

  it('Slack threads only from the channels named, and asks for a channel first', async () => {
    await connectAll('slack');
    expect(await copies.start('slack', { project: 'app' })).toMatchObject({ ok: false });
    const out = await copies.start('slack', { project: 'app', channels: ['#launch', 'nope'] });
    expect(out.ok).toBe(true);
    const names = onDisk('app', 'slack');
    expect(names.every((n) => n.startsWith('launch-'))).toBe(true);
    const thread = read('app', 'slack', names.find((n) => n.includes('waitlist')));
    expect(thread).toContain('#launch');
    expect(thread).toContain('Not until the first six are live.');
    expect(out.copy.failed.map((f) => f.what)).toEqual(['#nope']);
    expect(running.slack.calls).not.toContain('slack_send_message');
  });

  it('reads only, and only tools on the written list', async () => {
    await connectAll('linear', 'notion', 'hubspot', 'slack');
    await copies.start('linear', { project: 'app' });
    await copies.start('notion', { project: 'app' });
    await copies.start('hubspot', { project: 'app' });
    await copies.start('slack', { project: 'app', channels: ['launch'] });
    for (const k of STANDIN_KINDS) {
      const allowed = conn._entryOf(k).reads;
      expect(running[k].calls.every((n) => allowed.includes(n)), k).toBe(true);
      expect(running[k].writes, k).toEqual([]);
    }
  });

  it('refuses a tool that is not connected, not working, or has no way to copy', async () => {
    expect(await copies.start('linear', { project: 'app' })).toMatchObject({ ok: false });
    await connectAll('linear');
    expect(await copies.start('linear', { project: 'no-such-project' })).toMatchObject({ ok: false });
    expect(await copies.start('figma', { project: 'app' })).toMatchObject({ ok: false });
    expect(onDisk('app', 'linear')).toEqual([]);
  });
});

describe('hostile words from a tool', () => {
  it('cannot climb out of the folder or name a file somewhere else', () => {
    const r = renderForTest('issue', { id: '../../../etc/passwd', title: '../../evil\u0000name', description: 'x' }, { tool: 'Linear', at: 0 });
    expect(r.name).toMatch(/^[\w.-]+\.md$/);
    expect(r.name).not.toContain('..');
  });

  it('a title that looks secret still crosses, under a plain name', () => {
    const r = renderForTest('issue', { id: 'LUM-9', title: 'Rotate the API key', description: 'x' }, { tool: 'Linear', at: 0 });
    expect(r.name).toBe('LUM-9.md');
  });

  it('a huge page is cut and says so', () => {
    const r = renderForTest('issue', { id: 'A-1', title: 'Big', description: 'y'.repeat(2_000_000) }, { tool: 'Linear', at: 0 });
    expect(Buffer.byteLength(r.text)).toBeLessThan(400_000);
    expect(r.text).toMatch(/cut here/i);
  });

  it('an answer that is not the shape we expect still lands as its words', async () => {
    const odd = await startToolsFixture({ play: { name: 'Linear', tools: [{ name: 'list_issues', description: 'x', inputSchema: { type: 'object', properties: {} } }], call: (_n, _a, { text }) => text('LUM-1: a plain line of text, no JSON at all') } });
    const c = createConnections({ vaultFile: path.join(vaultDir, 'odd.enc'), cipher, openExternal: browser, checkMs: 2000, callMs: 2000, catalog: [{ ...catalogFor({ env: {}, packaged: false }).find((e) => e.id === 'linear'), address: odd.mcpUrl }] });
    const cp = createCopies({ connections: c, store: maya.store, stateFile: path.join(vaultDir, 'odd.json'), now: () => clock, callMs: 2000, runMs: 6000 });
    cp.bindPlace(() => maya.place);
    try {
      await c.connect('linear');
      const out = await cp.start('linear', { project: 'plans' });
      expect(out.ok).toBe(true);
      expect(out.copy.count).toBe(1);
    } finally { await cp.stop(); await c.stop(); await odd.stop(); }
  });
});

describe('in Files', () => {
  it('sits in a folder named for the tool, finds by name, and starts no agent', async () => {
    await connectAll('notion');
    await copies.start('notion', { project: 'app' });
    const list = await maya.place.list();
    const folder = list.folders.find((f) => f.name === 'Notion' && f.project === 'Lumen app');
    expect(folder).toBeTruthy();
    const kept = list.files.filter((f) => f.folder === folder.id);
    expect(kept).toHaveLength(2);
    expect(kept.every((f) => f.kind === 'markdown' && f.opened)).toBe(true);
    expect(kept.map((f) => f.name).join(' ')).toMatch(/launch-plan/);
    const row = maya.store.listAllWorkItems().find((i) => i.title === 'Copies from Notion');
    expect(row.status).toBe('done');
  });

  it('a second run changes what changed, keeps one version of each, and adds no noise', async () => {
    await connectAll('linear');
    await copies.start('linear', { project: 'app' });
    const dir = path.join(maya.dir('app'), 'sources', 'linear');
    const name = onDisk('app', 'linear')[0];
    const stamp = fs.statSync(path.join(dir, name)).mtimeMs;
    const row = maya.store.listAllWorkItems().find((i) => i.title === 'Copies from Linear');
    const linesBefore = maya.store.readHistory('app', row.id, { max: 1000 }).length;
    clock += COPY_EVERY_MS;
    await copies.run('linear');
    expect(fs.statSync(path.join(dir, name)).mtimeMs).toBe(stamp);
    expect(maya.store.readHistory('app', row.id, { max: 1000 }).length).toBe(linesBefore);
    const list = await maya.place.list();
    expect(list.files.filter((f) => f.name.startsWith('LUM-')).every((f) => f.versions === 1)).toBe(true);
  });

  it('Command K finds a page by a word inside it', async () => {
    await connectAll('notion');
    await copies.start('notion', { project: 'app' });
    const row = maya.store.listAllWorkItems().find((i) => i.title === 'Copies from Notion');
    const lines = maya.store.readHistory('app', row.id, { max: 1000 });
    expect(filesAndNotesOf(lines).files.length).toBe(2);
    const finder = createFinder({
      listThreads: () => [{ key: row.id, version: 1 }],
      loadThread: async () => ({ lines, resolve: async (src) => path.join(maya.dir('app'), src) }),
      readText: async (f) => fs.readFileSync(f, 'utf8'),
    });
    await finder.warm();
    const found = await finder.search('waitlist of 40');
    expect(found.files.map((f) => f.name ?? f.file).join(' ')).toMatch(/launch-plan/);
  });

  it('an agent finds the folder and its paths through what team_read reads', async () => {
    await connectAll('linear');
    await copies.start('linear', { project: 'app' });
    const seen = await maya.place.forAgents();
    const folder = seen.find((f) => f.folder === 'Linear');
    expect(folder.project).toBe('Lumen app');
    expect(folder.files).toHaveLength(3);
    expect(fs.readFileSync(folder.files[0].path, 'utf8')).toMatch(/Copied/);
  });
});

describe('who may read follows the project', () => {
  it('a project the team sees: a teammate gets the folder, the files and their words', async () => {
    await connectAll('notion');
    await copies.start('notion', { project: 'app' });
    await allSync();
    const seen = await sofia.place.list();
    const folder = seen.folders.find((f) => f.name === 'Notion');
    expect(folder).toBeTruthy();
    const page = seen.files.find((f) => f.name.startsWith('launch-plan'));
    expect(page.folder).toBe(folder.id);
    const view = await sofia.place.open(page.key);
    const opened = /\]\(([^)]+)\)/.exec(view.lines[0].patch.note)[1];
    expect(fs.readFileSync(opened, 'utf8')).toContain('waitlist of 40');
  });

  it('a private project: nothing crosses, not a folder, a file, a card or a name', async () => {
    await connectAll('notion');
    await copies.start('notion', { project: 'plans' });
    await allSync();
    const seen = await sofia.place.list();
    expect(seen.folders.some((f) => f.name === 'Notion')).toBe(false);
    expect(seen.files).toEqual([]);
    expect(everythingInTheCloud()).not.toMatch(/launch-plan|Launch plan|Copies from Notion/);
    expect((sofia.service.state().cards ?? []).some((c) => /Copies from/.test(c.title ?? ''))).toBe(false);
    expect((await maya.place.list()).files.some((f) => f.name.startsWith('launch-plan'))).toBe(true);
  });

  it('the same look at the cloud does find a copy the team may read, so the line above means something', async () => {
    await connectAll('notion');
    await copies.start('notion', { project: 'app' });
    await allSync();
    expect(everythingInTheCloud()).toMatch(/launch-plan/);
  });

  it('a project made private after copying takes its copies off the team', async () => {
    await connectAll('notion');
    await copies.start('notion', { project: 'app' });
    await allSync();
    expect((await sofia.place.list()).files.length).toBeGreaterThan(0);
    maya.store.setProductSeenBy('app', { who: 'private' });
    await allSync();
    expect((await sofia.place.list()).files).toEqual([]);
  });

  it('a project seen by chosen people reaches them and not the rest', async () => {
    maya.store.setProductSeenBy('app', { who: 'people', people: [maya.personId] });
    await connectAll('notion');
    await copies.start('notion', { project: 'app' });
    await allSync();
    expect((await sofia.place.list()).files).toEqual([]);
    maya.store.setProductSeenBy('app', { who: 'people', people: [sofia.personId] });
    clock += COPY_EVERY_MS;
    await copies.run('notion');
    await allSync();
    expect((await sofia.place.list()).files.some((f) => f.name.startsWith('launch-plan'))).toBe(true);
  });
});

describe('no token or secret in a copy', () => {
  it('not in a copied file, the state file, the thread, or what the page reads', async () => {
    await connectAll('slack', 'notion');
    await copies.start('slack', { project: 'app', channels: ['launch'] });
    await copies.start('notion', { project: 'app' });
    const secrets = [...running.slack.tokensEverIssued, ...running.notion.tokensEverIssued, standInClient('slack').clientSecret];
    expect(secrets.length).toBeGreaterThan(0);
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const everything = [...walk(maya.storeRoot), path.join(vaultDir, 'copies.json')].map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
    for (const s of secrets) {
      expect(everything).not.toContain(s);
      expect(JSON.stringify(copies.all())).not.toContain(s);
    }
  });
});

describe('the schedule is bounded and says what it did', () => {
  it('runs when due, not before, and says when it last ran', async () => {
    await connectAll('linear');
    await copies.start('linear', { project: 'app' });
    const ranAt = clock;
    const before = running.linear.calls.length;
    clock += COPY_EVERY_MS - 1000;
    await copies.tick();
    expect(running.linear.calls.length).toBe(before);
    clock += 2000;
    await copies.tick();
    expect(running.linear.calls.length).toBeGreaterThan(before);
    expect(copies.all().linear.ranAt).toBeGreaterThan(ranAt);
    expect(copies.all().linear.okAt).toBe(clock);
  });

  it('one row failing says which, and the rest land', async () => {
    const partly = await startToolsFixture({ play: {
      name: 'Linear',
      tools: [
        { name: 'list_issues', description: 'x', inputSchema: { type: 'object', properties: {} } },
        { name: 'get_issue', description: 'x', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } },
      ],
      call: (n, a, { text }) => {
        if (n === 'list_issues') return text({ issues: [{ id: 'A-1', title: 'Fine' }, { id: 'A-2', title: 'Broken' }] });
        return a.id === 'A-2' ? { isError: true, ...text('That one is locked.') } : text({ id: a.id, title: 'Fine', description: 'Words' });
      },
    } });
    const c = createConnections({ vaultFile: path.join(vaultDir, 'p.enc'), cipher, openExternal: browser, checkMs: 2000, callMs: 2000, catalog: [{ ...catalogFor({ env: {}, packaged: false }).find((e) => e.id === 'linear'), address: partly.mcpUrl }] });
    const cp = createCopies({ connections: c, store: maya.store, stateFile: path.join(vaultDir, 'p.json'), now: () => clock, callMs: 2000, runMs: 6000 });
    cp.bindPlace(() => maya.place);
    try {
      await c.connect('linear');
      const out = await cp.start('linear', { project: 'plans' });
      expect(out.copy.count).toBe(1);
      expect(out.copy.failed).toEqual([expect.objectContaining({ what: 'A-2', why: 'That one is locked.' })]);
      expect(out.copy.nextAt).toBe(clock + COPY_EVERY_MS);
    } finally { await cp.stop(); await c.stop(); await partly.stop(); }
  });

  it('an outage: says what failed, tries on the ladder, then stops and tells Needs you once', async () => {
    await connectAll('linear');
    await copies.start('linear', { project: 'app' });
    running.linear.switches.down = true;
    clock += COPY_EVERY_MS;
    await copies.tick();
    expect(copies.all().linear.failed[0].why).toBeTruthy();
    expect(copies.all().linear.nextAt).toBe(clock + COPY_RETRY_STEPS_MS[0]);
    for (const step of COPY_RETRY_STEPS_MS) {
      clock += step;
      await copies.tick();
    }
    const after = copies.all().linear;
    expect(after.nextAt).toBeNull();
    expect(after.stoppedAt).toBe(clock);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Copies from Linear stopped');
    // Nothing runs any more, however long it is left.
    const calls = running.linear.calls.length;
    clock += 30 * 24 * 3600_000;
    await copies.tick();
    expect(running.linear.calls.length).toBe(calls);
    expect(rows).toHaveLength(1);
  });

  it('a stopped copy goes again on a press, and keeps what it had', async () => {
    await connectAll('linear');
    await copies.start('linear', { project: 'app' });
    running.linear.switches.down = true;
    clock += COPY_EVERY_MS;
    await copies.tick();
    for (const step of COPY_RETRY_STEPS_MS) { clock += step; await copies.tick(); }
    expect(onDisk('app', 'linear')).toHaveLength(3);
    running.linear.switches.down = false;
    await copies.run('linear');
    const back = copies.all().linear;
    expect(back.stoppedAt).toBeNull();
    expect(back.failed).toEqual([]);
    expect(back.nextAt).toBe(clock + COPY_EVERY_MS);
  });

  it('an expired sign-in is not retried: it says so, and signing in again starts it', async () => {
    await connectAll('linear');
    await copies.start('linear', { project: 'app' });
    running.linear.switches.revoked = true;
    await conn.check('linear');
    const calls = running.linear.calls.length;
    clock += COPY_EVERY_MS;
    await copies.tick();
    expect(running.linear.calls.length).toBe(calls);
    expect(copies.all().linear.failed[0].why).toMatch(/sign/i);
    expect(copies.all().linear.nextAt).toBeNull();
    running.linear.switches.revoked = false;
    await conn.connect('linear');
    await copies.kick('linear');
    expect(copies.all().linear.failed).toEqual([]);
    expect(copies.all().linear.okAt).toBe(clock);
  });

  it('a tool that never answers ends inside the run\'s deadline', async () => {
    await connectAll('linear');
    await copies.start('linear', { project: 'app' });
    running.linear.switches.slowMs = 20_000;
    const started = Date.now();
    await copies.run('linear');
    expect(Date.now() - started).toBeLessThan(9000);
    expect(copies.all().linear.failed.length).toBeGreaterThan(0);
    running.linear.switches.slowMs = 0;
  }, 15000);

  it('two presses at once are one run', async () => {
    await connectAll('linear');
    await copies.start('linear', { project: 'app' });
    const before = running.linear.calls.length;
    await Promise.all([copies.run('linear'), copies.run('linear')]);
    expect(running.linear.calls.length - before).toBe(4);
  });

  it('stopping keeps the files and ends the schedule', async () => {
    await connectAll('linear');
    await copies.start('linear', { project: 'app' });
    await copies.stopKeeping('linear');
    expect(copies.all().linear).toBeUndefined();
    expect(onDisk('app', 'linear')).toHaveLength(3);
    const before = running.linear.calls.length;
    clock += COPY_EVERY_MS * 3;
    await copies.tick();
    expect(running.linear.calls.length).toBe(before);
  });

  it('remembers across a restart', async () => {
    await connectAll('linear');
    await copies.start('linear', { project: 'app' });
    const again = createCopies({ connections: conn, store: maya.store, stateFile: path.join(vaultDir, 'copies.json'), now: () => clock, callMs: 2000, runMs: 6000 });
    expect(again.all().linear).toMatchObject({ count: 3, project: 'app' });
    await again.stop();
  });
});

describe('what an agent is told', () => {
  it('names each kept copy and where', async () => {
    await connectAll('linear');
    await copies.start('linear', { project: 'app' });
    const told = copies.now();
    expect(told).toEqual([expect.objectContaining({ name: 'Linear', folder: 'Linear', projectName: 'Lumen app', count: 3 })]);
  });
});
