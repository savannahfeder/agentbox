// YOUR AI TEAMMATES REACH THE PHONE, AND YOU CAN TALK TO THEM FROM IT.
//
// Read on 2026-10-30: a teammate's runs reached the phone as ordinary threads,
// but who the teammates are, the chat you have with them and every way to talk
// to one stayed on the Mac. Neither phone app could show a teammate, send it a
// message, answer its question, make a new one or send a thread To Auto. Now
// the computer's settings copy carries the teammates and their chat (named
// fields only, cleaned as a thread's words are), and the phone's asks of them
// travel as `setting` commands into the window's own `zero:teammates` door.
// Measured with the in-memory cloud and a stand-in for the window's channels.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox, applyThrough } from '../main/phone-inbox.mjs';
import { checkSetting, settingRoute } from '../shared/phone-settings.mjs';
import { phoneChoices, phoneTeammatesOf, TEAMMATES_LIMITS } from '../shared/phone-snapshot.mjs';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const HOME = '/Users/someone';
const mate = (id, more = {}) => ({
  id, name: `Mate ${id}`, letter: 'M', role: 'Launch lead', job: 'Ship the launch', goal: 'Launch', primary: false, paused: false, status: 'active',
  product: 'alpha', engine: 'claude', model: 'opus', now: null, queued: 0, runsThisWeek: 2, createdAt: NOW - 9e6,
  waiting: [], running: null, duties: [], memory: [{ id: 'k-1', text: 'Likes short posts', at: NOW }], asksFirst: 'Before posting', counted: 'Posts',
  ...more,
});
const view = (more = {}) => ({
  list: [mate('t-aaaaaaaaaa', { primary: true }), mate('t-bbbbbbbbbb')],
  chat: [
    { id: 'm-1', kind: 'msg', from: 'you', to: ['t-aaaaaaaaaa'], text: 'Plan the launch', ts: NOW - 5000 },
    { id: 'm-2', kind: 'msg', from: 't-aaaaaaaaaa', to: ['you'], text: 'Which day?', options: ['Monday', 'Tuesday'], ts: NOW - 4000 },
  ],
  runs: [{ id: 'run-1', kind: 'run', teammate: 't-aaaaaaaaaa', item: 'w-1', product: 'alpha', title: 'Plan the launch', verb: 'sent', ts: NOW - 3000 }],
  playbooks: [{ id: 'p-1', title: 'Posts', readers: [], updatedAt: NOW, lessons: [] }],
  ...more,
});

describe('the copy of your teammates the computer sends', () => {
  it('carries who they are, the chat and their runs, and not their memory, method or playbooks', () => {
    const got = phoneTeammatesOf(view(), { home: HOME });
    expect(got.list.map((t) => t.id)).toEqual(['t-aaaaaaaaaa', 't-bbbbbbbbbb']);
    expect(got.list[0]).toMatchObject({ name: 'Mate t-aaaaaaaaaa', letter: 'M', role: 'Launch lead', primary: true, status: 'active', product: 'alpha', waiting: [], running: null });
    expect(got.list[0]).not.toHaveProperty('memory');
    expect(got.list[0]).not.toHaveProperty('asksFirst');
    expect(got).not.toHaveProperty('playbooks');
    expect(got.chat[1]).toMatchObject({ id: 'm-2', from: 't-aaaaaaaaaa', text: 'Which day?', options: ['Monday', 'Tuesday'] });
    expect(got.runs[0]).toMatchObject({ teammate: 't-aaaaaaaaaa', item: 'w-1', verb: 'sent' });
  });

  it('leaves out a teammate that was ended, and is nothing when teammates are off', () => {
    expect(phoneTeammatesOf(view({ list: [mate('t-aaaaaaaaaa', { endedAt: NOW })] })).list).toEqual([]);
    expect(phoneTeammatesOf(null)).toBeNull();
  });

  it('writes your home folder as ~ and hides a key in the words', () => {
    const chat = [{ id: 'm-9', kind: 'msg', from: 'you', to: ['t-aaaaaaaaaa'], text: `Read ${HOME}/plan.md with sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789`, ts: NOW }]; // public-check: allow (a fake key, to prove it is hidden)
    const text = phoneTeammatesOf(view({ chat }), { home: HOME }).chat[0].text;
    expect(text).toContain('~/plan.md');
    expect(text).not.toContain(HOME);
    expect(text).not.toContain('sk-ant-api03');
  });

  it('keeps the newest lines when the chat is too long to fit beside the settings', () => {
    const words = 'The launch plan is ready, here is what changed and why. '.repeat(27);
    const chat = Array.from({ length: 300 }, (_, n) => ({ id: `m-${n}`, kind: 'msg', from: 'you', to: ['t-aaaaaaaaaa'], text: words, ts: NOW + n }));
    const got = phoneTeammatesOf(view({ chat }));
    expect(JSON.stringify(got).length).toBeLessThanOrEqual(TEAMMATES_LIMITS.bytes);
    expect(got.chat.at(-1).id).toBe('m-299');
    expect(got.chat.length).toBeGreaterThan(20);
    expect(got.chat.length).toBeLessThan(300);
  });
});

describe('what the phone may ask of a teammate', () => {
  const ask = (key, value) => checkSetting({ scope: 'teammate', key, value });
  it('a message to one or more of them, with answers to its questions', () => {
    expect(ask('post', { text: 'Monday', to: ['t-aaaaaaaaaa'] })).toBeNull();
    expect(ask('post', { text: 'Go', to: ['t-aaaaaaaaaa'], fresh: true })).toBeNull();
    expect(ask('post', { text: 'Monday', to: ['t-aaaaaaaaaa'], answers: { 'm-2': 'Monday' } })).toBeNull();
  });
  it('refuses a message with no words, to nobody, to someone who is not a teammate, or too long', () => {
    expect(ask('post', { text: '  ', to: ['t-aaaaaaaaaa'] })).not.toBeNull();
    expect(ask('post', { text: 'Hi', to: [] })).not.toBeNull();
    expect(ask('post', { text: 'Hi', to: ['p-person'] })).not.toBeNull();
    expect(ask('post', { text: 'x'.repeat(8001), to: ['t-aaaaaaaaaa'] })).not.toBeNull();
    expect(ask('post', { text: 'Hi', to: ['t-aaaaaaaaaa'], answers: { 'm-2': '' } })).not.toBeNull();
  });
  it('someone new, from a starter or your words, in a project', () => {
    expect(ask('describe', { starter: 'chief', product: 'alpha' })).toBeNull();
    expect(ask('describe', { text: 'Answer support email', product: 'alpha' })).toBeNull();
    expect(ask('describe', { text: 'Answer support email' })).not.toBeNull();
    expect(ask('describe', { product: 'alpha' })).not.toBeNull();
  });
  it('your go-ahead on held work, and nothing else', () => {
    expect(ask('goAhead', { id: 't-aaaaaaaaaa', ref: 'm-2' })).toBeNull();
    expect(ask('goAhead', { id: 't-aaaaaaaaaa' })).not.toBeNull();
    expect(ask('remove', { id: 't-aaaaaaaaaa' })).not.toBeNull();
    expect(ask('update', { id: 't-aaaaaaaaaa', patch: { engine: 'codex' } })).not.toBeNull();
  });
  it('each goes to the window\'s own teammates door', () => {
    expect(settingRoute({ scope: 'teammate', key: 'post', value: { text: 'Go', to: ['t-aaaaaaaaaa'], fresh: true } }))
      .toEqual(['zero:teammates', { op: 'post', args: { text: 'Go', to: ['t-aaaaaaaaaa'], fresh: true } }]);
    expect(settingRoute({ scope: 'teammate', key: 'describe', value: { starter: 'chief', product: 'alpha' } }))
      .toEqual(['zero:teammates', { op: 'describe', args: { starter: 'chief', greeted: true, product: 'alpha' } }]);
    expect(settingRoute({ scope: 'teammate', key: 'goAhead', value: { id: 't-aaaaaaaaaa', ref: 'm-2' } }))
      .toEqual(['zero:teammates', { op: 'goAhead', args: { id: 't-aaaaaaaaaa', ref: 'm-2' } }]);
  });
});

describe('a new thread To Auto from the phone', () => {
  it('carries the auto label and no other', () => {
    expect(phoneChoices('new', { labels: ['auto'] })).toEqual({ labels: ['auto'] });
    expect(phoneChoices('new', { labels: ['auto', 'founder'] })).toEqual({});
    expect(phoneChoices('new', { labels: ['teammate:t-aaaaaaaaaa'] })).toEqual({});
  });
});

function mac({ teammates = view(), repeats = null } = {}) {
  const cloud = createMemoryCloud();
  cloud.now = () => NOW;
  const me = signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
  const backend = memoryBackend(cloud, me);
  const phone = memoryBackend(cloud, me);
  const state = { view: teammates, calls: [] };
  const channels = new Map([
    ['zero:settings-read', async () => ({ ok: true, workspace: { accounts: [], alpha: { teammates: true } }, projects: [] })],
    ['zero:teammates', async (_e, args) => {
      state.calls.push(args);
      if (args.op === 'post') state.view = { ...state.view, chat: [...state.view.chat, { id: `m-${state.calls.length + 10}`, kind: 'msg', from: 'you', to: args.args.to, text: args.args.text, ts: NOW }] };
      return { ok: true, value: null };
    }],
    ['zero:compose', async (_e, args) => { state.calls.push(['compose', args]); return { id: 'w-new' }; }],
  ]);
  const inbox = createPhoneInbox({
    backend,
    projects: () => [{ slug: 'alpha', name: 'Alpha' }],
    listItems: () => [],
    historyOf: () => [],
    apply: applyThrough(channels),
    readSettings: () => channels.get('zero:settings-read')({ sender: null }),
    teammatesOf: () => state.view,
    ...(repeats ? { repeatsOf: () => repeats } : {}),
    stateFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-teammates-')), 'phone-inbox.json'),
    home: HOME,
    now: () => NOW,
  });
  const ask = (key, value) => phone.addPhoneCommand({ device: inbox.device, project: null, item: null, kind: 'setting', payload: { scope: 'teammate', key, value } });
  const carried = async () => (await phone.phoneSettings())[0]?.settings?.teammates;
  return { inbox, phone, state, ask, carried };
}

describe('the computer and the phone together', () => {
  it('the settings copy carries the teammates', async () => {
    const m = mac();
    await m.inbox.syncOnce();
    const got = await m.carried();
    expect(got.list.map((t) => t.name)).toEqual(['Mate t-aaaaaaaaaa', 'Mate t-bbbbbbbbbb']);
    expect(got.chat.map((l) => l.id)).toEqual(['m-1', 'm-2']);
  });

  it('takes only the room the rest of the copy leaves under the cloud\'s 200KB check', async () => {
    const words = 'Read the numbers and say what moved since last week, in plain words. '.repeat(55);
    const repeats = Array.from({ length: 40 }, (_, n) => ({ id: `r-${n}`, product: 'alpha', title: `Rule ${n}`, body: words, priority: 5, every: 'weekday', at: '09:00', createdAt: NOW, served: '' }));
    const chat = Array.from({ length: 300 }, (_, n) => ({ id: `m-${n}`, kind: 'msg', from: 'you', to: ['t-aaaaaaaaaa'], text: words.slice(0, 1500), ts: NOW + n }));
    const m = mac({ teammates: view({ chat }), repeats });
    await m.inbox.syncOnce();
    const settings = (await m.phone.phoneSettings())[0].settings;
    expect(new TextEncoder().encode(JSON.stringify(settings)).length).toBeLessThanOrEqual(190_000);
    expect(settings.repeats).toHaveLength(40);
    expect(settings.teammates.list).toHaveLength(2);
    expect(settings.teammates.chat.at(-1).id).toBe('m-299');
    expect(settings.teammates.chat.length).toBeLessThan(300);
  });

  it('carries none while teammates are off', async () => {
    const m = mac({ teammates: null });
    await m.inbox.syncOnce();
    expect((await m.phone.phoneSettings())[0].settings).not.toHaveProperty('teammates');
  });

  it('a message from the phone reaches the teammate, and the copy carrying it is sent at once', async () => {
    const m = mac();
    await m.inbox.syncOnce();
    await m.ask('post', { text: 'Monday', to: ['t-aaaaaaaaaa'], answers: { 'm-2': 'Monday' } });
    await m.inbox.syncOnce();
    expect(m.state.calls).toEqual([{ op: 'post', args: { text: 'Monday', to: ['t-aaaaaaaaaa'], answers: { 'm-2': 'Monday' } } }]);
    expect((await m.carried()).chat.at(-1)).toMatchObject({ from: 'you', text: 'Monday' });
  });

  it('a message to someone who is not a teammate never reaches the door', async () => {
    const m = mac();
    await m.ask('post', { text: 'Hi', to: ['someone'] });
    await m.inbox.syncOnce();
    expect(m.state.calls).toEqual([]);
  });
});
