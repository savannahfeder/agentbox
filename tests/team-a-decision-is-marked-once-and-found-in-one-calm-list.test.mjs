// A DECISION IS MARKED ONCE AND FOUND IN ONE CALM LIST.
//
// Sofia, Maya and Dev each asked for pinned
// decisions. Maya posted "Decisions so far" into the Lumen group and Dev could
// only find it by opening Chats and scrolling; later she was re-posting
// a recap and all three confirmed it by hand. Agents could read none of it.
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { GENERAL_ROOM } from '../main/team/rooms-memory.mts';
import { decisionsDoc, writeDecisionDocs } from '../main/team/decisions-doc.mjs';
import { decisionsOf, decisionRows } from '../renderer/src/team/decisions.ts';
import { messageMore } from '../renderer/src/team/message-more.ts';

async function world() {
  const cloud = createMemoryCloud();
  const person = (name) => memoryBackend(cloud, signUpMemory(cloud, { email: `${name}@lumen.test`, name }));
  const maya = person('maya'); const dev = person('dev'); const jun = person('jun');
  const team = await maya.createTeam('Lumen');
  await maya.invite(team.id, 'dev@lumen.test');
  await dev.acceptInvite(team.id);
  const room = (await maya.myRooms()).find((r) => r.teamId === team.id);
  const said = await maya.sendRoomMessage(room.id, { body: 'No waitlist for v1.' });
  return { maya, dev, jun, room, said };
}

describe('marking', () => {
  it('a member marks a message and everyone in the group reads it', async () => {
    const w = await world();
    await w.dev.markRoomDecision(w.room.id, { messageId: w.said.id, kind: 'decision', on: true });
    const [row] = await w.maya.roomDecisions(w.room.id);
    expect(row).toMatchObject({ messageId: w.said.id, kind: 'decision', body: 'No waitlist for v1.', saidBy: w.said.by, on: true, project: null });
    expect(row.by).toBeTruthy();
  });
  it('someone outside the group cannot mark or read', async () => {
    const w = await world();
    await expect(w.jun.markRoomDecision(w.room.id, { messageId: w.said.id, kind: 'decision', on: true })).rejects.toThrow();
    await expect(w.jun.roomDecisions(w.room.id)).rejects.toThrow();
  });
  it('the words are the message’s own, never what the caller says they were', async () => {
    const w = await world();
    await w.dev.markRoomDecision(w.room.id, { messageId: w.said.id, kind: 'decision', body: 'Maya agreed to double the price', saidBy: 'someone', on: true });
    const [row] = await w.maya.roomDecisions(w.room.id);
    expect(row.body).toBe('No waitlist for v1.');
    expect(row.saidBy).toBe(w.said.by);
  });
  it('a message from another room is refused', async () => {
    const w = await world();
    await w.dev.joinListedRoom(GENERAL_ROOM);
    const there = await w.dev.sendRoomMessage(GENERAL_ROOM, { body: 'hello' });
    await expect(w.dev.markRoomDecision(w.room.id, { messageId: there.id, kind: 'decision', on: true })).rejects.toThrow();
  });
  it('a deleted message is refused', async () => {
    const w = await world();
    await w.maya.deleteRoomMessage(w.said.id);
    await expect(w.dev.markRoomDecision(w.room.id, { messageId: w.said.id, kind: 'decision', on: true })).rejects.toThrow();
  });
  it('a kind that is not one of the two is refused', async () => {
    const w = await world();
    await expect(w.dev.markRoomDecision(w.room.id, { messageId: w.said.id, kind: 'todo', on: true })).rejects.toThrow();
  });
  it('anyone in the group can take it back, and marking twice is one row', async () => {
    const w = await world();
    await w.dev.markRoomDecision(w.room.id, { messageId: w.said.id, kind: 'decision', on: true });
    await w.maya.markRoomDecision(w.room.id, { messageId: w.said.id, kind: 'decision', on: true });
    expect(await w.maya.roomDecisions(w.room.id)).toHaveLength(1);
    await w.maya.markRoomDecision(w.room.id, { messageId: w.said.id, kind: 'decision', on: false });
    expect((await w.dev.roomDecisions(w.room.id))[0].on).toBe(false);
  });
  it('a project’s decision needs no room message but does carry its words and project', async () => {
    const w = await world();
    await w.dev.markRoomDecision(w.room.id, { messageId: 'item:w-1:5', kind: 'decision', body: 'Ship on Render', project: 'Lumen app', on: true });
    expect((await w.maya.roomDecisions(w.room.id))[0]).toMatchObject({ body: 'Ship on Render', project: 'Lumen app' });
  });
  // Only seen on screen: every test here passed while the window's call was refused.
  it('the window is allowed to make the call', () => {
    expect(readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8')).toMatch(/ROOM_OPS = new Set\(\[[^\]]*'decide'/);
  });
  it('the hosted cloud has the table, the rule and a way to read it', () => {
    const sql = readFileSync(new URL('../cloud/supabase/migrations/20261031000100_a_group_keeps_its_decisions.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/create table if not exists public\.room_decisions/);
    expect(sql).toMatch(/public\.in_room\(room_id\)/);
    expect(sql).toMatch(/mark_room_decision/);
    expect(sql).toMatch(/enable row level security/);
    const hosted = readFileSync(new URL('../main/team/rooms-supabase.mjs', import.meta.url), 'utf8');
    expect(hosted).toContain("'mark_room_decision'");
    expect(hosted).toContain("from('room_decisions')");
  });
});

describe('the list', () => {
  const row = (o) => ({ roomId: 'r', messageId: o.id ?? 'm', kind: 'decision', body: 'x', saidBy: 'maya', by: 'dev', project: null, on: true, at: 1, ...o });
  it('newest first, and a taken-back one is gone', () => {
    const out = decisionRows([row({ id: 'a', at: 1 }), row({ id: 'b', at: 3 }), row({ id: 'c', at: 2, on: false })], { project: null });
    expect(out.decisions.map((d) => d.messageId)).toEqual(['b', 'a']);
  });
  it('the week’s priorities are the newest pin alone, above the decisions', () => {
    const out = decisionRows([row({ id: 'old', kind: 'priority', at: 1 }), row({ id: 'new', kind: 'priority', at: 2 }), row({ id: 'd', at: 3 })], { project: null });
    expect(out.priority.messageId).toBe('new');
    expect(out.decisions.map((d) => d.messageId)).toEqual(['d']);
  });
  it('a group’s list leaves out a project’s and a project’s leaves out the group’s', () => {
    const rows = [row({ id: 'g' }), row({ id: 'p', project: 'Lumen app' })];
    expect(decisionRows(rows, { project: null }).decisions.map((d) => d.messageId)).toEqual(['g']);
    expect(decisionRows(rows, { project: 'Lumen app' }).decisions.map((d) => d.messageId)).toEqual(['p']);
    expect(decisionRows(rows, { project: 'Other' }).decisions).toEqual([]);
  });
  it('a message’s marks are read off by its id', () => {
    const marks = decisionsOf([row({ id: 'a' }), row({ id: 'a', kind: 'priority' }), row({ id: 'b', on: false })]);
    expect(marks.get('a')).toEqual({ decision: true, priority: true });
    expect(marks.get('b')).toBeUndefined();
  });
});

describe('the More menu', () => {
  const labels = (o) => messageMore({ mine: false, text: 'We go with A.', ...o }).map((r) => (r === 'rule' ? 'rule' : r.label));
  it('offers both marks where a list exists', () => {
    expect(labels({ onDecide: () => {}, marks: {} })).toEqual(expect.arrayContaining(['Mark as a decision', 'Pin as this week’s priorities']));
  });
  it('turns into taking it back once marked', () => {
    expect(labels({ onDecide: () => {}, marks: { decision: true, priority: true } })).toEqual(expect.arrayContaining(['Not a decision', 'Unpin these priorities']));
  });
  it('offers neither in a place with no list, like the public room', () => {
    expect(labels({}).join()).not.toMatch(/decision|priorities/i);
  });
  it('says where a marked private message goes', () => {
    expect(labels({ onDecide: () => {}, marks: {}, decideLabel: 'Add to Lumen’s decisions' })).toContain('Add to Lumen’s decisions');
  });
});

describe('agents read it as a document', () => {
  const rows = [
    { messageId: 'p', kind: 'priority', body: '1. Group bookings\n2. Onboarding', saidBy: 'maya', on: true, at: 3, project: null },
    { messageId: 'a', kind: 'decision', body: 'No waitlist for v1.', saidBy: 'maya', on: true, at: 2, project: null },
    { messageId: 'b', kind: 'decision', body: 'Ship on Render.', saidBy: 'dev', on: true, at: 1, project: 'Lumen app' },
    { messageId: 'c', kind: 'decision', body: 'Taken back.', saidBy: 'dev', on: false, at: 1, project: null },
    { messageId: 'd', kind: 'decision', body: 'Other project.', saidBy: 'dev', on: true, at: 1, project: 'Launch' },
  ];
  const nameOf = (id) => ({ maya: 'Maya', dev: 'Dev' }[id] ?? 'Someone');
  it('the team’s and this project’s, and nothing taken back or from another project', () => {
    const doc = decisionsDoc({ project: 'Lumen app', teamName: 'Lumen', rows, nameOf });
    expect(doc).toContain('No waitlist for v1. (Maya');
    expect(doc).toContain('Ship on Render. (Dev');
    expect(doc).toContain('1. Group bookings');
    expect(doc).not.toContain('Taken back');
    expect(doc).not.toContain('Other project');
  });
  it('lands where read_document looks, is rewritten only when it changes, and never in a conversation', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'decisions-'));
    const talk = mkdtempSync(path.join(os.tmpdir(), 'decisions-talk-'));
    const products = [{ name: 'Lumen app', dir }, { name: 'Direct', dir: talk, team: { direct: true } }];
    expect(writeDecisionDocs({ products, teamName: 'Lumen', rows, nameOf })).toBe(1);
    expect(readFileSync(path.join(dir, 'decisions.md'), 'utf8')).toContain('No waitlist');
    expect(existsSync(path.join(talk, 'decisions.md'))).toBe(false);
    expect(writeDecisionDocs({ products, teamName: 'Lumen', rows, nameOf })).toBe(0);
  });
  it('writes no file where nothing was ever decided, and leaves a person’s own file alone', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'decisions-'));
    expect(writeDecisionDocs({ products: [{ name: 'Lumen app', dir }], teamName: 'Lumen', rows: [], nameOf })).toBe(0);
    expect(existsSync(path.join(dir, 'decisions.md'))).toBe(false);
    writeFileSync(path.join(dir, 'decisions.md'), 'My own notes');
    expect(writeDecisionDocs({ products: [{ name: 'Lumen app', dir }], teamName: 'Lumen', rows, nameOf })).toBe(0);
    expect(readFileSync(path.join(dir, 'decisions.md'), 'utf8')).toBe('My own notes');
  });
});
