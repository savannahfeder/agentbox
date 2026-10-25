// A PERMISSION CARD REACHES THE PHONE, AND HER ANSWER REACHES THE MAC.
//
// What broke (found reading the code, 2026-10-19): the hosted phone always
// drew no permission cards and refused Allow and Deny, so an agent asking
// leave to run a command waited, drawn as "working", until the request was
// denied for silence fifteen minutes later.
//
// Now her Mac puts each thread's waiting cards in the thread's copy, with the
// secrets in them hidden and the fingerprint of the card as drawn, and the
// phone sends her answer with that fingerprint. Her Mac answers only if the
// card is still the one she read: a request rewritten since gets no Allow.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox, applyThrough } from '../main/phone-inbox.mjs';
import { checkCommand } from '../shared/phone-snapshot.mjs';
import * as approvals from '../main/approvals.mjs';
import { phoneView, approvalCommand, phoneSlug } from '../renderer/src/cloud-bridge';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const DEV = 'a1b2c3d4e5f6';
const KEY = 'sk-ant-oat01-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'; // a made-up key, to prove it is hidden. public-check: allow
const request = (id, extra = {}) => ({ id, at: NOW - 1000, product: 'alpha', item: 'w-1', tool: 'Bash', input: { command: 'echo hello' }, ...extra });
const withSecret = (id, extra = {}) => request(id, { input: { command: `curl -H "x-api-key: ${KEY}" https://example.com` }, ...extra });

describe('her Mac', () => {
  it('puts a thread\'s waiting cards in its copy, secrets hidden, with each card\'s fingerprint', async () => {
    const cloud = createMemoryCloud();
    cloud.now = () => NOW;
    const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-asks-'));
    let asks = [{ ...request('a-1'), card: 'digest-1' }, { ...withSecret('a-1s'), card: 'digest-secret' }, { ...request('a-2', { item: 'w-2' }), card: 'digest-2' }];
    const inbox = createPhoneInbox({
      backend: memoryBackend(cloud, me), projects: () => [{ slug: 'alpha', name: 'Alpha' }],
      listItems: () => [{ id: 'w-1', title: 'T', status: 'open', updatedAt: NOW - 5000 }], historyOf: (s, id) => [{ id, ts: NOW - 5000, source: 'founder', patch: { body: 'b' } }],
      apply: async () => {}, stateFile: path.join(dir, 's.json'), home: '/Users/someone', now: () => NOW, approvalsOf: () => asks,
    });
    await inbox.syncOnce();
    const copy = (await memoryBackend(cloud, me).phoneThreads())[0].snapshot;
    expect(copy.approvals).toHaveLength(2);
    // A card the phone drew whole carries its fingerprint, so her Allow binds to it.
    expect(copy.approvals.find((a) => a.id === 'a-1')).toMatchObject({ id: 'a-1', tool: 'Bash', card: 'digest-1' });
    // A card whose secret the phone had to hide is answered on the computer, where
    // she can read the whole of it; it carries no fingerprint, so the phone cannot Allow it.
    expect(copy.approvals.find((a) => a.id === 'a-1s')).toMatchObject({ card: null, answerOnComputer: true });
    expect(JSON.stringify(copy.approvals)).not.toContain(KEY);
    // Answered on the Mac: the next copy has no card.
    asks = [];
    expect((await inbox.syncOnce()).sent).toBe(1);
    expect((await memoryBackend(cloud, me).phoneThreads())[0].snapshot.approvals).toBeUndefined();
  });

  it('takes an answer only for a card on a thread on her phone, with its fingerprint', () => {
    const opts = { projects: ['alpha'], hasItem: (p, id) => id === 'w-1' };
    const c = (payload, item = 'w-1') => ({ project: 'alpha', item, kind: 'approve', payload });
    expect(checkCommand(c({ approval: 'a-1', allow: true, card: 'abcdefgh12' }), opts)).toBe(null);
    expect(checkCommand(c({ approval: 'a-1', allow: 'yes', card: 'abcdefgh12' }), opts)).toBe('an answer needs its card');
    expect(checkCommand(c({ approval: '../x', allow: true, card: 'abcdefgh12' }), opts)).toBe('an answer needs its card');
    expect(checkCommand(c({ approval: 'a-1', allow: true }), opts)).toBe('an answer needs its card');
    expect(checkCommand(c({ approval: 'a-1', allow: true, card: 'abcdefgh12' }, 'w-9'), opts)).toBe('that thread is not on your phone');
  });

  it('hands it to the window\'s own Allow and Deny, fingerprint and all', async () => {
    const calls = [];
    const apply = applyThrough(new Map([['zero:approve', async (_e, args) => { calls.push(args); return { ok: true }; }]]));
    await apply({ id: 'c1', kind: 'approve', project: 'alpha', item: 'w-1', payload: { approval: 'a-1', allow: true, card: 'abcdefgh12', note: 'fine' } });
    expect(calls).toEqual([{ id: 'a-1', allow: true, note: 'fine', card: 'abcdefgh12' }]);
  });
});

describe('the card she read', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-card-')); });
  const write = (req) => { const dir = approvals.spoolDir(root); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${req.id}.request.json`), JSON.stringify(req)); };

  it('is the one her Mac would answer, and not once the request is rewritten under it', () => {
    write(request('a-1'));
    approvals.listPending(root);
    const card = approvals.cardShown(root, 'a-1');
    expect(approvals.cardStillShown(root, 'a-1', card)).toBe(true);
    expect(approvals.cardStillShown(root, 'a-1', 'something-else')).toBe(false);
    write(request('a-1', { input: { command: 'rm -rf ~' } }));
    approvals.listPending(root);
    expect(approvals.cardStillShown(root, 'a-1', card)).toBe(false);
    expect(approvals.cardStillShown(root, 'a-9', card)).toBe(false);
  });
});

describe('the phone', () => {
  const thread = (asks) => ({ device: DEV, project: 'alpha', item: 'w-1', snapshot: { v: 3, item: { id: 'w-1', title: 'T', status: 'open', updatedAt: NOW }, history: [], approvals: asks } });
  it('draws a thread\'s cards as the window\'s own', () => {
    const view = phoneView({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha' }], threads: [thread([{ ...request('a-1'), card: 'digest-1' }])], commands: [] }, NOW);
    expect(view.approvals).toEqual([{ id: 'a-1', at: NOW - 1000, product: phoneSlug(DEV, 'alpha'), item: 'w-1', tool: 'Bash', input: request('a-1').input }]);
  });

  it('answers a card with the fingerprint it was drawn with, and nothing for a card it never drew', () => {
    const view = phoneView({ projects: [{ device: DEV, project: 'alpha', name: 'Alpha' }], threads: [thread([{ ...request('a-1'), card: 'digest-1' }])], commands: [] }, NOW);
    expect(approvalCommand(view.cards, { id: 'a-1', allow: false })).toEqual({ device: DEV, project: 'alpha', item: 'w-1', kind: 'approve', payload: { approval: 'a-1', allow: false, card: 'digest-1' } });
    expect(approvalCommand(view.cards, { id: 'a-9', allow: true })).toBeNull();
  });
});
