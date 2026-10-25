// A REPLY THE CLOUD TOOK SAYS SO ON THE PHONE.
//
// On 2026-10-24 the founder read the phone's first screen ("What you write
// here goes to your computer, which hands it to the coding agent") and said
// the phone has to work with the computer shut in a backpack. A reply the
// computer leaves for a minute is now started in Agentbox Cloud, which claims
// the command `cloud:<run id>` (shared/cloud-kit.mjs, migration
// 20261026000000). Before this the phone said every reply was "Waiting for
// your computer" and, with the computer away, "What you send waits for it",
// which stops being true for a computer that leaves its threads ready for the
// cloud (phone_projects.cloud).
//
// Measured here: what a cloud-claimed reply says in its thread, what one the
// computer claimed or nobody claimed still says, the line over the inbox in
// each case, that the phone reads the new columns whether or not the live
// database has them yet, and the words of the first screen and the privacy
// policy.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneView, phoneSlug, phoneStatusLine, cloudCarriesOn, readCommands, PROJECTS_SELECT } from '../renderer/src/phone-rows';
import { threadOf } from '../mobile/src/lib/thread';

const NOW = Date.UTC(2026, 9, 24, 12);
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const iso = (ms) => new Date(ms).toISOString();
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const reply = (over = {}) => ({ id: 'c-1', device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'yes, ship it' }, created_at: iso(NOW - 120_000), claimed_at: null, claimed_by: null, taken_at: null, outcome: null, ...over });
function rows(commands = [], { cloud = false, seen = NOW } = {}) {
  const thread = { id: 'w-1', title: 'Ship the phone app', status: 'blocked', kind: 'directive', labels: ['founder'], priority: 0, createdAt: NOW - 9e6, updatedAt: NOW - 600_000, body: 'Ship it?', result: 'Ready?' };
  return {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(seen), cloud }],
    threads: [{ device: DEV, project: 'alpha', item: 'w-1', updated_at: iso(NOW - 600_000), snapshot: { v: 3, item: thread, history: [
      { id: 'w-1', ts: NOW - 9e6, source: 'founder', patch: { body: 'Ship it?' } },
      { id: 'w-1', ts: NOW - 600_000, source: 'agent', patch: { result: 'Ready?' } },
    ] } }],
    commands,
  };
}
const yours = (t) => t.events.filter((e) => e.who === 'you' && e.pending);

describe('a reply in its thread', () => {
  it('the cloud took says it is working in Agentbox Cloud (the reported case)', () => {
    const r = rows([reply({ claimed_at: iso(NOW - 60_000), claimed_by: 'cloud:r1' })]);
    const view = phoneView(r, NOW);
    expect(view.waiting).toEqual([expect.objectContaining({ text: 'yes, ship it', cloud: true })]);
    expect(yours(threadOf(r, view, A, 'w-1'))).toEqual([expect.objectContaining({ text: 'yes, ship it', cloud: true })]);
  });

  it('nobody has claimed yet still waits for the computer', () => {
    const r = rows([reply()]);
    const view = phoneView(r, NOW);
    expect(view.waiting[0].cloud).toBeUndefined();
    expect(yours(threadOf(r, view, A, 'w-1'))[0].cloud).toBeUndefined();
  });

  it('the computer claimed is not the cloud\'s', () => {
    const view = phoneView(rows([reply({ claimed_at: iso(NOW - 60_000) })]), NOW);
    expect(view.waiting[0].cloud).toBeUndefined();
  });

  it('a claim that names no run is not the cloud\'s', () => {
    const view = phoneView(rows([reply({ claimed_at: iso(NOW - 60_000), claimed_by: 'cloud:' })]), NOW);
    expect(view.waiting[0].cloud).toBeUndefined();
  });

  it('answered in the cloud shows nothing more: the thread\'s copy holds the answer', () => {
    const view = phoneView(rows([reply({ claimed_at: iso(NOW - 60_000), claimed_by: 'cloud:r1', taken_at: iso(NOW - 1000), outcome: 'Answered in Agentbox Cloud' })]), NOW);
    expect(view.waiting).toEqual([]);
  });

  it('the thread draws the words for the cloud, and offers no Send now on a reply the cloud has', () => {
    const page = read('mobile/src/app/thread/[product]/[id].tsx');
    expect(page).toMatch(/e\.cloud \? 'Working in Agentbox Cloud'/);
    expect(page).toMatch(/e\.pending && !e\.refused && !e\.cloud && sendNow/);
  });
});

describe('the line over the inbox', () => {
  const away = NOW - 3 * 3600_000;
  it('with the computer off and its threads ready for the cloud, says the cloud carries on', () => {
    const r = rows([], { cloud: true, seen: away });
    expect(cloudCarriesOn(r.projects)).toBe(true);
    expect(phoneStatusLine({ error: null, fetchedAt: NOW, macSeen: away, cloud: cloudCarriesOn(r.projects) }, NOW)).toBe('Your computer is off. Replies carry on in Agentbox Cloud.');
  });
  it('with the computer off and no cloud, says what you send waits for it, as before', () => {
    expect(phoneStatusLine({ error: null, fetchedAt: NOW, macSeen: away, cloud: false }, NOW)).toBe('Your Mac was last online 3 hours ago. What you send waits for it.');
  });
  it('with the computer on, says nothing, cloud or not', () => {
    expect(phoneStatusLine({ error: null, fetchedAt: NOW, macSeen: NOW - 60_000, cloud: true }, NOW)).toBeNull();
  });
  it('a project with no word about the cloud, or a false one, is not the cloud\'s', () => {
    expect(cloudCarriesOn([{ device: DEV, project: 'a', name: 'A' }, { device: DEV, project: 'b', name: 'B', cloud: false }])).toBe(false);
  });
  it('both screens hand the line whether the cloud carries on', () => {
    expect(read('mobile/src/state/cloud.tsx')).toMatch(/cloud: cloudCarriesOn\(rows\.projects\)/);
    expect(read('renderer/src/cloud-bridge.ts')).toMatch(/cloud: cloudCarriesOn\(rows\.projects\)/);
  });
});

describe('the new columns are read whether or not the live database has them yet', () => {
  it('commands and projects are asked for whole, so a missing column is never an error', async () => {
    const asked = [];
    await readCommands(async (table, query) => { asked.push([table, query]); return []; }, NOW);
    for (const [, q] of asked) expect(q).toMatch(/^select=\*&/);
    expect(PROJECTS_SELECT).toMatch(/^select=\*&/);
    expect(read('mobile/src/state/cloud.tsx')).toMatch(/select\('phone_projects', PROJECTS_SELECT\)/);
    expect(read('renderer/src/cloud-bridge.ts')).toMatch(/select\('phone_projects', PROJECTS_SELECT\)/);
  });
});

describe('the words', () => {
  it('the first screen says your words go to your computer, or to Agentbox Cloud when it is off', () => {
    const notice = read('mobile/src/app/ai-notice.tsx');
    expect(notice).toMatch(/Agentbox Cloud/);
    expect(notice).toMatch(/when your computer is off/);
    expect(notice).not.toMatch(/goes to your computer, which hands it/);
  });
  it('the privacy policy names Amazon Web Services and what goes there, and for how long', () => {
    const policy = read('phone-legal/privacy.html');
    expect(policy).toMatch(/Amazon Web Services/);
    expect(policy).toMatch(/us-east-1|North Virginia/);
    expect(policy).toMatch(/within a week|7 days/);
  });
});

// The phone website draws the desktop's own thread (renderer/src/components/
// Thread.tsx), which said "Waiting for your computer" under every reply that
// had not landed, the cloud's too.
describe('on the phone website', () => {
  it('a reply the cloud took is marked so in the thread it is drawn in', async () => {
    const { itemThread } = await import('../renderer/src/item-thread.ts');
    const T = Date.parse('2026-10-24T12:00:00Z');
    const ledger = [{ ts: T, source: 'founder', patch: { id: 'w-1', title: 'Ship it', body: 'Ship it.', status: 'open' } }];
    const built = itemThread(ledger, [], null, { pending: [{ at: T + 60_000, text: 'yes', cloud: true }, { at: T + 120_000, text: 'and tests' }] });
    const mine = built.events.filter((e) => e.pending);
    expect(mine.map((e) => [e.text, !!e.cloud])).toEqual([['yes', true], ['and tests', false]]);
  });
  it('the thread says Working in Agentbox Cloud for it, and waits for the computer otherwise', () => {
    const thread = read('renderer/src/components/Thread.tsx');
    expect(thread).toMatch(/onCloudPhone\(\) \? \(e\.cloud \? `Working in \$\{Name\} Cloud` : 'Waiting for your computer'\)/);
    expect(read('renderer/src/App.tsx')).toMatch(/\.\.\.\(w\.cloud \? \{ cloud: true \} : \{\}\)/);
  });
});
