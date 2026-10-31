// THE PHONE APP CHATS WITH YOUR AI TEAMMATES, AND HAS WHAT THE WEB APP GAINED SINCE.
//
// Read side by side on 2026-10-30: the iPhone app had no AI teammates at all,
// no Chats, no Auto or teammates in New thread's To, and a teammate's answer
// came unsigned. It also lacked three smaller things the web app had: group
// messages that name you at the top of Needs you, Mark unread, and "in the
// cloud" on a cloud run's working line. These pin the phone's own rules with
// teammates in the shape the computer sends them (shared/phone-snapshot.mjs
// `phoneTeammatesOf`), and that the screens use them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { actWords, chatRows, mateOf, nowLine, onTheirWay, openQuestions, roleOf, teamFrom, waitsOnYou } from '../mobile/src/lib/teammates';
import { bottomTabs } from '../mobile/src/lib/groups';
import { isUnread, markSeen, markUnseen } from '../mobile/src/lib/unread';
import { liveOf } from '../mobile/src/lib/thread-offers';
import { checkCommand } from '../shared/phone-snapshot.mjs';
import { settingCommand } from '../renderer/src/phone-rows';

const read = (p) => fs.readFileSync(p, 'utf8');
const NOW = Date.parse('2026-10-30T15:00:00Z');
const DEV = '0a1b2c3d4e5f';
const iso = (ms) => new Date(ms).toISOString();
const mate = (id, more = {}) => ({ id, name: `Mate ${id}`, letter: 'M', role: null, status: 'active', paused: false, primary: false, product: 'alpha', waiting: [], running: null, now: null, ...more });
const copy = (more = {}) => ({
  list: [mate('t-a', { primary: true }), mate('t-b')],
  chat: [
    { id: 'm-1', kind: 'msg', from: 'you', to: ['t-a'], text: 'Plan the launch', ts: NOW - 50_000 },
    { id: 'm-2', kind: 'msg', from: 't-a', to: ['you'], text: 'Which day?', options: ['Monday', 'Tuesday'], ts: NOW - 40_000 },
  ],
  runs: [],
  ...more,
});
const row = (device, at, settings) => ({ device, name: device, updated_at: iso(at), settings });
const on = (teammates, at = NOW - 1000) => row(DEV, at, { workspace: { alpha: { teammates: true } }, teammates });

describe('your teammates, from the computer\'s settings copy', () => {
  it('come from the newest computer that has them on', () => {
    const team = teamFrom([row('bbbbbbbbbbbb', NOW, { workspace: { alpha: { teammates: false } } }), on(copy())]);
    expect(team.device).toBe(DEV);
    expect(team.view.list.map((t) => t.id)).toEqual(['t-a', 't-b']);
  });
  it('are none while teammates are off or no computer sent them', () => {
    expect(teamFrom([row(DEV, NOW, { workspace: { alpha: { teammates: false } }, teammates: copy() })])).toBeNull();
    expect(teamFrom([row(DEV, NOW, { workspace: { alpha: { teammates: true } } })])).toBeNull();
    expect(teamFrom([])).toBeNull();
  });
  it('a thread a teammate\'s run belongs to is theirs, by its label', () => {
    const team = teamFrom([on(copy())]);
    expect(mateOf({ labels: ['founder', 'teammate:t-b'] }, team)?.name).toBe('Mate t-b');
    expect(mateOf({ labels: ['founder'] }, team)).toBeNull();
    expect(mateOf({ labels: ['teammate:t-gone'] }, team)).toBeNull();
  });
  it('a role that is only its name is not said twice', () => {
    expect(roleOf({ name: 'Launch lead', role: 'launch lead' })).toBeNull();
    expect(roleOf({ name: 'Ada', role: 'Launch lead' })).toBe('Launch lead');
  });
});

describe('the line under its name in Chats', () => {
  const team = teamFrom([on(copy())]);
  it('says it has a question while one waits on you', () => {
    expect(nowLine(team.view.list[0], team.view, NOW)).toBe('Has a question for you');
    expect(waitsOnYou(team.view.list[0], team.view)).toBe(true);
  });
  it('says setting up, paused or what it is on, and nothing waits on you then', () => {
    const view = team.view;
    expect(nowLine({ ...view.list[1], status: 'draft' }, view, NOW)).toBe('Setting up');
    expect(nowLine({ ...view.list[1], paused: true }, view, NOW)).toBe('Paused');
    expect(nowLine({ ...view.list[1], now: 'Cut the film' }, view, NOW)).toBe('Cut the film');
    expect(waitsOnYou(view.list[1], view)).toBe(false);
  });
});

const post = (id, value, extra = {}) => ({ id, device: DEV, project: null, item: null, kind: 'setting', payload: { scope: 'teammate', key: 'post', value }, created_at: iso(NOW - 2000), claimed_at: null, taken_at: null, outcome: null, ...extra });

describe('a message you send a teammate', () => {
  it('is a command the computer takes', () => {
    const cmd = settingCommand(DEV, { scope: 'teammate', key: 'post', value: { text: 'Monday', to: ['t-a'] } });
    expect(checkCommand(cmd, { projects: [], hasItem: () => false })).toBeNull();
  });
  it('shows at once as waiting for your computer, and goes once the copy carries it', () => {
    const team = teamFrom([on(copy(), NOW - 10_000)]);
    expect(onTheirWay([post('c-1', { text: 'Hi', to: ['t-a'] })], team, NOW)).toMatchObject([{ id: 'c-1', from: 'you', text: 'Hi', waiting: true, refused: null }]);
    // Taken after the copy was sent: still drawn from the phone until the next copy.
    expect(onTheirWay([post('c-1', { text: 'Hi', to: ['t-a'] }, { taken_at: iso(NOW - 5000), outcome: 'done' })], team, NOW)).toHaveLength(1);
    // Taken before the copy: the copy has it.
    expect(onTheirWay([post('c-1', { text: 'Hi', to: ['t-a'] }, { taken_at: iso(NOW - 20_000), outcome: 'done' })], team, NOW)).toEqual([]);
  });
  it('says why when the computer turned it down, for ten minutes', () => {
    const team = teamFrom([on(copy())]);
    const refused = post('c-1', { text: 'Hi', to: ['t-a'] }, { taken_at: iso(NOW - 60_000), outcome: 'refused: Teammates are an alpha feature.' });
    expect(onTheirWay([refused], team, NOW)[0].refused).toBe('Teammates are an alpha feature.');
    expect(onTheirWay([refused], team, NOW + 11 * 60_000)).toEqual([]);
  });
  it('leaves out other settings and other computers', () => {
    const team = teamFrom([on(copy())]);
    expect(onTheirWay([{ ...post('c-1', {}), payload: { scope: 'workspace', key: 'adhdMode', value: true } }, { ...post('c-2', { text: 'Hi', to: ['t-a'] }), device: 'bbbbbbbbbbbb' }], team, NOW)).toEqual([]);
  });
  it('answers its open question, which then stops asking', () => {
    const team = teamFrom([on(copy())]);
    expect(openQuestions(team.view, 't-a').map((q) => q.id)).toEqual(['m-2']);
    const pending = onTheirWay([post('c-1', { text: 'Monday', to: ['t-a'], answers: { 'm-2': 'Monday' } })], team, NOW);
    expect(openQuestions(team.view, 't-a', pending)).toEqual([]);
    const answered = teamFrom([on(copy({ chat: [...copy().chat, { id: 'm-3', kind: 'msg', from: 'you', to: ['t-a'], text: 'Monday', answers: { 'm-2': 'Monday' }, ts: NOW - 1000 }] }))]);
    expect(openQuestions(answered.view, 't-a')).toEqual([]);
  });
});

describe('a teammate\'s chat as the phone draws it', () => {
  it('days, who starts each run of messages, and your answers as one line', () => {
    const chat = [
      ...copy().chat,
      { id: 'm-3', kind: 'msg', from: 't-a', to: ['you'], text: 'And which time?', ts: NOW - 39_000 },
      { id: 'm-4', kind: 'msg', from: 'you', to: ['t-a'], text: 'Monday', answers: { 'm-2': 'Monday' }, ts: NOW - 30_000 },
    ];
    const rows = chatRows(teamFrom([on(copy({ chat }))]).view, 't-a', [], NOW);
    expect(rows.map((r) => r.kind)).toEqual(['day', 'msg', 'msg', 'msg', 'answered']);
    expect(rows.filter((r) => r.kind === 'msg').map((r) => r.lead)).toEqual([true, true, false]);
    expect(rows[2]).toMatchObject({ answered: 'Monday' });
  });
  it('threads it sent you one after another are one card, and things it saved one line', () => {
    const runs = [
      { id: 'r-1', kind: 'run', teammate: 't-a', item: 'w-1', product: 'alpha', title: 'One', verb: 'sent', waiting: true, ts: NOW - 20_000 },
      { id: 'r-2', kind: 'run', teammate: 't-a', item: 'w-2', product: 'alpha', title: 'Two', verb: 'sent', ts: NOW - 19_000 },
    ];
    const chat = [...copy().chat, { id: 'm-5', kind: 'act', from: 't-a', verb: 'learned', text: 'a', ts: NOW - 10_000 }, { id: 'm-6', kind: 'act', from: 't-a', verb: 'updated', text: 'b', ts: NOW - 9000 }];
    const rows = chatRows(teamFrom([on(copy({ chat, runs }))]).view, 't-a', [], NOW);
    expect(rows.filter((r) => r.kind === 'sent')).toHaveLength(1);
    expect(rows.find((r) => r.kind === 'sent').runs.map((r) => r.item)).toEqual(['w-1', 'w-2']);
    expect(rows.filter((r) => r.kind === 'saved')).toHaveLength(1);
  });
  it('a thread it names opens on the phone under its computer', () => {
    const team = teamFrom([on(copy())]);
    const w = actWords({ id: 'r-3', kind: 'run', teammate: 't-a', item: 'w-9', product: 'alpha', title: 'Done thing', verb: 'finished', ts: NOW }, team, team.view.list[0]);
    expect(w).toMatchObject({ verb: 'Finished', text: 'Done thing', open: { product: `alpha@${DEV}`, id: 'w-9' } });
  });
  it('work held for your go-ahead offers Go ahead until you say it', () => {
    const chat = [...copy().chat, { id: 'm-p', kind: 'pass', from: 't-b', to: 't-a', title: 'Cut the film', ts: NOW - 5000 }, { id: 'm-h', kind: 'act', from: 't-a', verb: 'hops', ref: 'm-p', ts: NOW - 4000 }];
    const team = teamFrom([on(copy({ chat }))]);
    const hops = team.view.chat.find((m) => m.id === 'm-h');
    expect(actWords(hops, team, team.view.list[0]).goAhead).toEqual({ id: 't-a', ref: 'm-p' });
    expect(nowLine(team.view.list[0], team.view, NOW)).toBe('Has a question for you');
  });
  it('your message shows in the chat before the computer takes it', () => {
    const team = teamFrom([on(copy())]);
    const rows = chatRows(team.view, 't-a', onTheirWay([post('c-1', { text: 'Hello', to: ['t-a'] })], team, NOW), NOW);
    expect(rows.at(-1)).toMatchObject({ kind: 'msg', mine: true, waiting: true });
  });
});

describe('Chats on the phone', () => {
  it('is the fifth tab while teammates are on, holding your groups too', () => {
    expect(bottomTabs(true, true).map((t) => t.label)).toEqual(['Needs you', 'In progress', 'Later', 'Done', 'Chats']);
    expect(bottomTabs(false, true).at(-1).label).toBe('Chats');
    expect(bottomTabs(true, false).at(-1).label).toBe('Groups');
  });
  it('lists teammates, then your groups, and opens a teammate\'s chat', () => {
    const src = read('mobile/src/ui/Teammates.tsx');
    expect(src).toMatch(/title="AI teammates"/);
    expect(src).toMatch(/title="Groups"/);
    expect(src).toMatch(/pathname: '\/teammate\/\[id\]'/);
    expect(src).toMatch(/router\.push\('\/teammate\/new'\)/);
    expect(read('mobile/src/app/index.tsx')).toMatch(/<ChatsPlace /);
  });
  it('a teammate\'s chat sends through your computer, and reads it often while open', () => {
    const page = read('mobile/src/app/teammate/[id].tsx');
    expect(page).toMatch(/c\.askTeammate\('post', value\)/);
    expect(page).toMatch(/useEffect\(\(\) => watchTeam\(\), \[watchTeam\]\)/);
    expect(read('mobile/src/app/teammate/new.tsx')).toMatch(/c\.askTeammate\('describe'/);
  });
  it('asks your yes before your words go to a teammate, as before any agent', () => {
    expect(read('mobile/src/state/cloud.tsx')).toMatch(/if \(key !== 'goAhead' && !agreed\) \{\s*router\.push\('\/ai-notice'\)/);
  });
});

describe('New thread To', () => {
  const form = read('mobile/src/ui/NewThreadForm.tsx');
  it('offers Auto, your teammates and someone new beside the agents', () => {
    expect(form).toMatch(/label="Auto"/);
    expect(form).toMatch(/label="Someone new"/);
    expect(form).toMatch(/form\.mates\.map/);
  });
  it('sends Auto as the auto label, and a teammate your words in its chat', () => {
    expect(form).toMatch(/\.\.\.\(onAuto \? \{ labels: \[AUTO_LABEL\] \} : \{\}\)/);
    expect(form).toMatch(/c\.askTeammate\('post', \{ text: draft\.text, to: \[mate\.id\], fresh: true \}\)/);
    expect(form).toMatch(/c\.askTeammate\('describe', \{ text: draft\.text, product: where\.project \}\)/);
  });
});

describe('a teammate\'s answer on its thread', () => {
  it('is signed with its mark, name and time, and its rows lead with them', () => {
    const page = read('mobile/src/app/thread/[product]/[id].tsx');
    expect(page).toMatch(/const mate = mateOf\(item, c\.team\)/);
    expect(page).toMatch(/<TeammateMark t=\{mate\} \/>/);
    expect(read('mobile/src/app/index.tsx')).toMatch(/mate=\{mateOf\(item\.item, c\.team\)\}/);
  });
});

describe('what else the web app had', () => {
  it('group messages that name you lead Needs you and count in it', () => {
    const src = read('mobile/src/app/index.tsx');
    expect(src).toMatch(/mentionRows\(groups\.state\.mentions\)/);
    expect(src).toMatch(/inbox: shown\.rows\.inbox\.length \+ mentions\.length/);
  });
  it('Mark unread brings the dot back until you open it again', () => {
    const store = new Map();
    const s = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const item = { product: 'p', id: 'w-1', createdAt: NOW - 1000 };
    let seen = markSeen({ at: {}, since: 0 }, item, s, NOW);
    expect(isUnread(item, seen)).toBe(false);
    seen = markUnseen(seen, item, s);
    expect(isUnread(item, seen)).toBe(true);
    expect(isUnread({ ...item, id: 'w-2' }, seen)).toBe(true);
    expect(read('mobile/src/ui/ThreadMenu.tsx')).toMatch(/label="Mark unread"/);
  });
  it('a cloud run\'s working line ends in the cloud, and a computer\'s says nothing of where', () => {
    const item = { id: 'w-1', status: 'claimed', labels: [] };
    const session = (where) => ({ itemId: 'w-1', product: 'p', startedAt: NOW - 60_000, where, activity: [] });
    expect(liveOf(item, { session: session('cloud'), inProgress: true, now: NOW }).place).toBe('in the cloud');
    expect(liveOf(item, { session: session('mac'), inProgress: true, now: NOW }).place).toBeNull();
  });
});
