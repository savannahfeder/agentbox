// A byte-tail fold lost open work and its original fields after 8 MiB.
// Exercise real files, including claim and create-if-absent decisions, across that boundary.
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { foldWorkItems, threadOf, buildLine, MAX_LINE_BYTES } from '../shared/work-items.mjs';
let dir;
const now = 1_800_000_000_000;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'complete-ledger-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, {recursive:true,force:true}); });
function pad(bytes = 8 * 1024 * 1024 + 1) {
  const line = JSON.stringify({id:'w-ffffff',ts:now,source:'agent',patch:{note:'filler'},pad:'x'.repeat(64 * 1024)}) + '\n';
  fs.appendFileSync(disk._internals.ledgerPath(dir), line.repeat(Math.ceil(bytes / Buffer.byteLength(line))));
}
it('keeps old open and scheduled work in ordinary reads', () => {
  const open = disk.createWorkItem(dir, {title:'Original',body:'Keep me'}, {now});
  const scheduled = disk.createWorkItem(dir, {title:'Later',runAt:now+60_000}, {now});
  pad();
  expect(disk.readWorkItem(dir, scheduled.id, now)?.runAt).toBe(now+60_000);
  expect(disk.readWorkItem(dir, open.id, now)).toMatchObject({title:'Original',body:'Keep me'});
  expect(disk.readWorkItems(dir, now).map(i=>i.id)).toEqual(expect.arrayContaining([open.id,scheduled.id]));
});
it('preserves original fields when a recent patch crosses the window', () => {
  const item = disk.createWorkItem(dir, {title:'Original',body:'Body'}, {now}); pad();
  disk.updateWorkItem(dir,item.id,{note:'Recent'}, {now:now+1});
  expect(disk.readWorkItem(dir,item.id,now+2)).toMatchObject({title:'Original',body:'Body',note:'Recent',createdAt:now});
});
it('does not recreate an existing item whose creation is old', () => {
  const item = disk.createWorkItem(dir,{title:'Original'}, {now}); pad();
  expect(disk.createWorkItemIfAbsent(dir,item.id,{title:'Replacement'}, {now:now+1})).toMatchObject({created:false,item:{title:'Original'}});
});
it('honors an old live claim and permits reclaim after expiry', async () => {
  const item = disk.createWorkItem(dir,{title:'Held'}, {now});
  await disk.claimWorkItem(dir,{id:item.id,holder:'first',leaseMs:60_000,now}); pad();
  expect(await disk.claimWorkItem(dir,{id:item.id,holder:'second',now:now+1})).toMatchObject({claimed:false,heldBy:'first'});
  expect(await disk.claimWorkItem(dir,{id:item.id,holder:'second',now:now+60_001})).toMatchObject({claimed:true,epoch:2,item:{title:'Held'}});
});
it('reads a ledger on either side of the former limit', () => {
  const item = disk.createWorkItem(dir,{title:'Boundary'}, {now});
  const file = disk._internals.ledgerPath(dir);
  for (const size of [8*1024*1024-1,8*1024*1024,8*1024*1024+1]) {
    // Preserve valid creation, fill with ignored blank lines.
    const missing=size-fs.statSync(file).size;
    fs.appendFileSync(file,'\n'.repeat(missing));
    expect(disk.readWorkItem(dir,item.id,now)?.title).toBe('Boundary');
  }
});
it('folds streamed lines with the same result as arrays', () => {
  const lines=[buildLine({id:'w-abcdef',patch:{title:'Stream'},source:'agent',now})];
  function* stream(){yield* lines;}
  expect(foldWorkItems(stream(),now)).toEqual(foldWorkItems(lines,now));
});
it('skips oversized records and preserves multibyte records across read chunks', () => {
  const item=disk.createWorkItem(dir,{title:'Original'}, {now});
  const file=disk._internals.ledgerPath(dir);
  const record={id:item.id,ts:now+1,source:'agent',patch:{note:'é'.repeat(100)},pad:'é'.repeat(40_000)};
  fs.appendFileSync(file, JSON.stringify(record)+'\n');
  fs.appendFileSync(file, JSON.stringify({id:item.id,ts:now+2,source:'founder',patch:{title:'Wrong'},pad:'x'.repeat(MAX_LINE_BYTES)})+'\n');
  disk.updateWorkItem(dir,item.id,{body:'After oversized'}, {now:now+3});
  expect([...disk._internals.readLines(file)].map(line=>JSON.parse(line))).toContainEqual(record);
  expect(disk.readWorkItem(dir,item.id,now+4)).toMatchObject({title:'Original',note:'é'.repeat(100),body:'After oversized'});
});

it('keeps historical conversation lines available after the window moves', () => {
  const item=disk.createWorkItem(dir,{title:'Thread',body:'Original request'}, {now}); pad();
  disk.updateWorkItem(dir,item.id,{answer:'Later reply'}, {now:now+1});
  const file=disk._internals.ledgerPath(dir);
  expect(threadOf(disk._internals.readLines(file),item.id).map(turn=>turn.text)).toEqual(['Original request','Later reply']);
});
it('does not append a foreign line again after it leaves the recent window', () => {
  const line={id:'w-abcdef',ts:now,source:'agent',patch:{title:'Remote'},uid:'l-original',by:'person-fixture'};
  expect(disk.appendForeignLines(dir,[line])).toBe(1); pad();
  expect(disk.appendForeignLines(dir,[line])).toBe(0);
});
it('closes a streamed ledger when its consumer stops early', () => {
  disk.createWorkItem(dir,{title:'First'}, {now});
  const opened=vi.spyOn(fs,'openSync');
  const reader=disk._internals.readLines(disk._internals.ledgerPath(dir));
  expect(reader.next().done).toBe(false);
  const fd=opened.mock.results.at(-1).value;
  expect(fs.fstatSync(fd).isFile()).toBe(true);
  expect(reader.return().done).toBe(true);
  expect(() => fs.fstatSync(fd)).toThrow();
  expect(reader.next().done).toBe(true);
});

it('rechecks an interrupted final record after its remaining bytes arrive', () => {
  const item = disk.createWorkItem(dir, {title:'Before'}, {now});
  const file = disk._internals.ledgerPath(dir);
  const line = JSON.stringify(buildLine({id:item.id,patch:{title:'After'},source:'founder',now:now+1}));
  const split = Math.floor(line.length/2);
  fs.appendFileSync(file, line.slice(0,split));
  expect(disk.readWorkItem(dir,item.id,now+2)?.title).toBe('Before');
  fs.appendFileSync(file, line.slice(split)+'\n');
  expect(disk.readWorkItem(dir,item.id,now+2)?.title).toBe('After');
});
it('invalidates cached state when the ledger is replaced with an equal-size file', () => {
  const item = disk.createWorkItem(dir, {title:'Before'}, {now});
  const file = disk._internals.ledgerPath(dir);
  expect(disk.readWorkItem(dir,item.id,now)?.title).toBe('Before');
  const replacement = file+'.replacement';
  fs.writeFileSync(replacement,fs.readFileSync(file,'utf8').replace('Before','After!'));
  const stamp=fs.statSync(file);
  fs.utimesSync(replacement,stamp.atime,stamp.mtime);
  fs.renameSync(replacement,file);
  expect(disk.readWorkItem(dir,item.id,now)?.title).toBe('After!');
});
it('reads a stable byte snapshot while another writer appends', () => {
  const item = disk.createWorkItem(dir, {title:'Before'}, {now});
  const file = disk._internals.ledgerPath(dir);
  const reader = disk._internals.readLines(file);
  const first = reader.next().value;
  disk.updateWorkItem(dir,item.id,{title:'After'}, {now:now+1});
  expect([...reader]).toEqual([]);
  expect(foldWorkItems([first],now).get(item.id)?.title).toBe('Before');
  expect(disk.readWorkItem(dir,item.id,now+2)?.title).toBe('After');
});
it('closes the descriptor when a streamed read throws', () => {
  disk.createWorkItem(dir, {title:'Before'}, {now});
  const opened=vi.spyOn(fs,'openSync');
  vi.spyOn(fs,'readSync').mockImplementationOnce(() => {throw Error('fixture read failure');});
  expect(() => [...disk._internals.readLines(disk._internals.ledgerPath(dir))]).toThrow('fixture read failure');
  const fd=opened.mock.results.at(-1).value;
  expect(() => fs.fstatSync(fd)).toThrow();
});
