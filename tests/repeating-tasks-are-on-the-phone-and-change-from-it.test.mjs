// REPEATING TASKS ARE ON THE PHONE, AND CHANGE FROM IT.
//
// Neither phone app had repeating tasks (2026-10-28): the Mac sent none of
// them, so the web app's `repeats` door answered an empty list and the iPhone
// app had nowhere to show one. Now each computer's settings copy carries the
// repeating tasks of the projects on the phone, cleaned as a thread's words
// are, and a task made, changed or ended on a phone goes to the Mac as a
// `setting` command through the window's own three handlers. The phone shows
// the change while the Mac has not taken it. Measured with the in-memory
// cloud and a stand-in for the window's channels.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox, applyThrough } from '../main/phone-inbox.mjs';
import { checkSetting } from '../shared/phone-settings.mjs';
import { phoneSlug } from '../renderer/src/phone-rows';
import { phoneSender } from '../renderer/src/phone-send';
import { phoneRepeats } from '../renderer/src/phone-repeats';
import { planFor, runSteps } from '../mobile/src/lib/actions';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const HOME = '/Users/someone';
const iso = (ms) => new Date(ms).toISOString();
const rule = (id, more = {}) => ({ id, product: 'alpha', productName: 'Alpha', title: `Rule ${id}`, body: 'Read the metrics', priority: 5, every: 'weekday', at: '09:00', createdAt: NOW - 9e6, served: '2026-10-27', misses: 0, alerted: 0, ...more });

function mac({ rules = [rule('r-1')] } = {}) {
  const cloud = createMemoryCloud();
  cloud.now = () => NOW;
  const me = signUpMemory(cloud, { email: `owner-${Math.random()}@example.com` });
  const backend = memoryBackend(cloud, me);
  const phone = memoryBackend(cloud, me);
  const state = { rules: [...rules], calls: [] };
  const channels = new Map([
    ['zero:settings-read', async () => ({ ok: true, workspace: { accounts: [] }, projects: [] })],
    ['zero:compose-repeat', async (_e, args) => { state.calls.push(['new', args]); state.rules.push(rule('r-new', { ...args, ...args.rule })); return { id: 'r-new' }; }],
    ['zero:set-repeat', async (_e, args) => { state.calls.push(['change', args]); return { id: args.id }; }],
    ['zero:end-repeat', async (_e, args) => { state.calls.push(['end', args]); state.rules = state.rules.filter((r) => r.id !== args.id); return { id: args.id }; }],
  ]);
  const inbox = createPhoneInbox({
    backend,
    projects: () => [{ slug: 'alpha', name: 'Alpha' }],
    listItems: () => [],
    historyOf: () => [],
    apply: applyThrough(channels),
    readSettings: () => channels.get('zero:settings-read')({ sender: null }),
    repeatsOf: () => state.rules,
    stateFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'phone-repeats-')), 'phone-inbox.json'),
    home: HOME,
    now: () => NOW,
  });
  const send = (payload) => phone.addPhoneCommand({ device: inbox.device, project: null, item: null, kind: 'setting', payload: { scope: 'repeat', product: 'alpha', ...payload } });
  const carried = async () => (await phone.phoneSettings())[0]?.settings?.repeats;
  return { inbox, phone, state, send, carried };
}

describe('the settings copy the Mac sends', () => {
  it('carries the repeating tasks of the projects on the phone, and only those', async () => {
    const m = mac({ rules: [rule('r-1'), rule('r-2', { product: 'beta' }), rule('r-3', { endedAt: NOW - 1000 })] });
    await m.inbox.syncOnce();
    const got = await m.carried();
    expect(got.map((r) => r.id)).toEqual(['r-1']);
    expect(got[0]).toMatchObject({ product: 'alpha', title: 'Rule r-1', body: 'Read the metrics', every: 'weekday', at: '09:00', served: '2026-10-27' });
  });

  it('writes her home folder as ~ and hides a key in the words', async () => {
    const m = mac({ rules: [rule('r-1', { body: `Read ${HOME}/notes.md with sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789` })] }); // public-check: allow (a fake key, to prove it is hidden)
    await m.inbox.syncOnce();
    const body = (await m.carried())[0].body;
    expect(body).toContain('~/notes.md');
    expect(body).not.toContain(HOME);
    expect(body).not.toContain('sk-ant-api03');
  });
});

describe('a repeating task made, changed or ended on the phone', () => {
  it('goes through the window\'s own handlers, and the copy is sent again at once', async () => {
    const m = mac();
    await m.inbox.syncOnce();
    await m.send({ key: 'new', value: { title: 'Daily report', body: 'Write it', priority: 7, every: 'week', on: 4, at: '08:30', engine: 'codex' } });
    await m.send({ key: 'change', id: 'r-1', value: { every: 'day', at: '10:00' } });
    await m.send({ key: 'change', id: 'r-1', value: { body: 'Read the numbers' } });
    await m.send({ key: 'end', id: 'r-1', value: true });
    await m.inbox.syncOnce();
    expect(m.state.calls).toEqual([
      ['new', { product: 'alpha', title: 'Daily report', body: 'Write it', priority: 7, rule: { every: 'week', on: 4, at: '08:30' }, engine: 'codex' }],
      ['change', { product: 'alpha', id: 'r-1', rule: { every: 'day', at: '10:00' } }],
      ['change', { product: 'alpha', id: 'r-1', rule: { body: 'Read the numbers' } }],
      ['end', { product: 'alpha', id: 'r-1' }],
    ]);
    expect((await m.carried()).map((r) => r.id)).toEqual(['r-new']);
  });

  it('is refused when it cannot be kept', () => {
    const ok = (p) => checkSetting({ scope: 'repeat', product: 'alpha', ...p });
    expect(ok({ key: 'new', value: { title: 'Daily', every: 'day', at: '09:00' } })).toBeNull();
    expect(ok({ key: 'new', value: { title: 'Thursdays', every: 'week', on: 4, at: '09:00' } })).toBeNull();
    expect(ok({ key: 'change', id: 'r-1', value: { title: 'New words' } })).toBeNull();
    expect(ok({ key: 'end', id: 'r-1', value: true })).toBeNull();
    expect(ok({ key: 'new', value: { title: '  ', every: 'day', at: '09:00' } })).toBe('a repeating task needs its words');
    expect(ok({ key: 'new', value: { title: 'x', every: 'week', at: '09:00' } })).toBe('not a schedule this computer can keep');
    expect(ok({ key: 'new', value: { title: 'x', every: 'day', at: '24:00' } })).toBe('not a schedule this computer can keep');
    expect(ok({ key: 'change', id: 'r-1', value: { at: '10:00' } })).toBe('not a schedule this computer can keep');
    expect(ok({ key: 'change', id: 'r-1', value: {} })).toBe('not a value that setting takes');
    expect(ok({ key: 'change', id: 'r-1', value: { served: '2099-01-01' } })).toBe('not a value that setting takes');
    expect(ok({ key: 'change', id: 'r-1', value: { engine: 'gpt' } })).toBe('not a value that setting takes');
    expect(ok({ key: 'change', value: { title: 'x' } })).toBe('that needs its repeating task');
    expect(ok({ key: 'end', id: 'r-1', value: false })).toBe('not a value that setting takes');
    expect(ok({ key: 'delete', id: 'r-1', value: true })).toBe('not a setting your phone can change');
    expect(checkSetting({ scope: 'repeat', key: 'end', id: 'r-1', value: true })).toBe('that setting needs its project');
  });
});

const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const settingsRow = (repeats, at = NOW - 60_000) => ({ device: DEV, name: 'Studio Mac', settings: { v: 1, repeats }, updated_at: iso(at) });
const projects = [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }];
const carried = (id, more = {}) => { const { productName, ...r } = rule(id, more); return r; };
const cmd = (payload, more = {}) => ({ id: `c-${Math.random()}`, device: DEV, project: null, item: null, kind: 'setting', payload: { scope: 'repeat', product: 'alpha', ...payload }, created_at: iso(NOW - 500), claimed_at: null, taken_at: null, outcome: null, ...more });

describe('on the phone', () => {
  it('each computer\'s repeating tasks, named the way the inbox names its projects', () => {
    const got = phoneRepeats([settingsRow([carried('r-1')])], [], projects, NOW);
    expect(got).toEqual([expect.objectContaining({ id: 'r-1', product: A, productName: 'Alpha', title: 'Rule r-1', every: 'weekday', at: '09:00' })]);
    expect(phoneRepeats([], [], projects, NOW)).toEqual([]);
  });

  it('a project taken off the phone takes its repeating tasks with it', () => {
    expect(phoneRepeats([settingsRow([carried('r-1', { product: 'gone' })])], [], projects, NOW)).toEqual([]);
  });

  it('shows what was sent until the computer\'s copy has it', () => {
    const rows = [settingsRow([carried('r-1'), carried('r-2')])];
    const made = cmd({ key: 'new', value: { title: 'Daily report', every: 'day', at: '08:00' } });
    const got = phoneRepeats(rows, [made, cmd({ key: 'change', id: 'r-1', value: { at: '10:00', every: 'day' } }), cmd({ key: 'end', id: 'r-2', value: true })], projects, NOW);
    expect(got.map((r) => [r.id, r.every, r.at, !!r.waiting])).toEqual([['r-1', 'day', '10:00', true], [`phone-${made.id}`, 'day', '08:00', true]]);
  });

  it('a change the computer refused, or one its copy since has, is not drawn again', () => {
    const rows = [settingsRow([carried('r-1')], NOW - 1000)];
    const refused = cmd({ key: 'end', id: 'r-1', value: true }, { taken_at: iso(NOW - 2000), outcome: 'refused: no' });
    const landed = cmd({ key: 'change', id: 'r-1', value: { title: 'Old words' } }, { taken_at: iso(NOW - 5000), outcome: 'done' });
    expect(phoneRepeats(rows, [refused, landed], projects, NOW)).toEqual([expect.objectContaining({ id: 'r-1', title: 'Rule r-1' })]);
  });

  it('the desktop\'s three doors leave a setting for the computer that has the project', async () => {
    let rows = { projects, threads: [], commands: [] };
    let n = 0;
    const client = { generation: () => 0, async insertCommand(r) { n += 1; return { id: `c-${n}`, created_at: iso(NOW), claimed_at: null, taken_at: null, outcome: null, ...r }; }, async update() { return []; } };
    const sender = phoneSender({ client, rows: () => rows, setRows: (r) => { rows = r; }, aliases: () => ({}), changed: () => {} });
    await sender.composeRepeat({ product: A, title: 'Daily report', body: 'Write it', priority: 7, rule: { every: 'day', at: '08:00' }, engine: 'claude' });
    await sender.setRepeat({ product: A, id: 'r-1', rule: { title: 'New words' } });
    await sender.endRepeat({ product: A, id: 'r-1' });
    expect(rows.commands.map((c) => [c.device, c.project, c.kind, c.payload])).toEqual([
      [DEV, null, 'setting', { scope: 'repeat', key: 'new', product: 'alpha', value: { title: 'Daily report', body: 'Write it', priority: 7, every: 'day', at: '08:00', engine: 'claude' } }],
      [DEV, null, 'setting', { scope: 'repeat', key: 'change', product: 'alpha', id: 'r-1', value: { title: 'New words' } }],
      [DEV, null, 'setting', { scope: 'repeat', key: 'end', product: 'alpha', id: 'r-1', value: true }],
    ]);
    await expect(sender.endRepeat({ product: 'nowhere', id: 'r-1' })).rejects.toThrow();
  });
});

describe('the phone app\'s presses', () => {
  const world = () => {
    let rows = { projects, threads: [], commands: [] };
    let n = 0;
    const client = { generation: () => 0, async insertCommand(r) { n += 1; return { id: `c-${n}`, created_at: iso(NOW), claimed_at: null, taken_at: null, outcome: null, ...r }; }, async update() { return []; } };
    const sender = phoneSender({ client, rows: () => rows, setRows: (r) => { rows = r; }, aliases: () => ({}), changed: () => {} });
    return { sender, last: () => rows.commands.at(-1), count: () => rows.commands.length };
  };
  const weekday = { every: 'weekday', at: '09:00' };

  it('a new thread sent with Repeat makes a repeating task, not a thread, in the desktop\'s words', async () => {
    const w = world();
    const plan = planFor({ kind: 'new', product: A, text: 'Daily report\n\nRead the numbers', choices: { priority: 7, engine: 'codex', model: 'gpt-5', repeat: weekday } }, null, NOW);
    await runSteps(w.sender, plan.steps);
    expect(w.count()).toBe(1);
    expect(w.last()).toMatchObject({ kind: 'setting', payload: { scope: 'repeat', key: 'new', product: 'alpha', value: { title: 'Daily report', body: 'Read the numbers', priority: 7, every: 'weekday', at: '09:00', engine: 'codex', model: 'gpt-5' } } });
    expect(plan.toast).toMatch(/^Repeating: weekdays at 9:00/);
  });

  it('a new thread without Repeat is still a thread', () => {
    const plan = planFor({ kind: 'new', product: A, text: 'Once only', choices: {} }, null, NOW);
    expect(plan.steps.map((s) => s.door)).toEqual(['compose']);
  });

  it('a repeating task\'s time is changed, and it is ended, from its page', async () => {
    const w = world();
    const r = { product: A, id: 'r-1', title: 'Rule r-1' };
    const change = planFor({ kind: 'repeat-at', rule: r, to: { every: 'week', on: 4, at: '08:00' } }, null, NOW);
    await runSteps(w.sender, change.steps);
    expect(w.last().payload).toEqual({ scope: 'repeat', key: 'change', product: 'alpha', id: 'r-1', value: { every: 'week', on: 4, at: '08:00' } });
    expect(change.toast).toMatch(/^Now Thursdays at 8:00/);
    const end = planFor({ kind: 'end-repeat', rule: r }, null, NOW);
    await runSteps(w.sender, end.steps);
    expect(w.last().payload).toEqual({ scope: 'repeat', key: 'end', product: 'alpha', id: 'r-1', value: true });
    expect(end.toast).toBe('Ended: Rule r-1');
  });
});
