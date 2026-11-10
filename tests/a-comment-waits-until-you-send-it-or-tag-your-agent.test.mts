// A COMMENT WAITS UNTIL YOU SEND IT OR TAG YOUR AGENT, AND NOBODY ELSE CAN START YOUR AGENT.
//
// Before, Enter on a comment sent it to the agent at once, and a teammate's
// comment on your agent's file woke your agent on your own Claude or Codex plan
// without asking you (main/notes-wake.mjs wakeForNotes, every tick). Read off
// main on 2026-11-08: storeItem.tellItem reopened the thread and the next tick
// spawned it. The person asked for comments that collect and go in one press,
// to save tokens, and for nobody to be able to spend somebody else's plan.
// The approved screen was "3 not sent" and Send at the top of the comments; it is now
// the notes sidebar's Unsent line with Send N (w-858a033e54).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appFilesPlace } from '../main/files-place.mts';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { messageKind } from '../renderer/src/threads/message-kind.ts';
import { noteSendWords, notesToSendTheAgent } from '../renderer/src/artifact-pins.ts';
import { notesForTheAgent, tagsYourAgent } from '../shared/artifact-marks.mts';
import * as wake from '../main/notes-wake.mts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const people = [{ id: 'u-me', name: 'Sam Rivera' }, { id: 'u-maya', name: 'Maya Chen' }];
const nameOf = (id) => people.find((p) => p.id === id)?.name.split(' ')[0] ?? 'A teammate';

describe('tagging your agent', () => {
  it('@agent anywhere in the words is a tag', () => {
    expect(tagsYourAgent('@agent cut this line')).toBe(true);
    expect(tagsYourAgent('cut this line @agent')).toBe(true);
    expect(tagsYourAgent('(@Agent) cut this')).toBe(true);
  });
  it('the word agent without the @, or a longer word after it, is not', () => {
    expect(tagsYourAgent('the agent should cut this')).toBe(false);
    expect(tagsYourAgent('@agents all of you')).toBe(false);
    expect(tagsYourAgent('mail me@agent.dev')).toBe(false);
    expect(tagsYourAgent('')).toBe(false);
  });
});

describe('the button under the box says what pressing it does', () => {
  const mine = (text) => noteSendWords({ text, people, me: 'u-me', nameOf, agentMade: true, toAgent: true, owner: 'u-me' });
  it('on your agent\'s file a plain comment is only a comment', () => {
    expect(mine('')).toBe('Comment');
    expect(mine('Make the last bar orange')).toBe('Comment');
  });
  it('tagging your agent sends it now', () => {
    expect(mine('@agent make the last bar orange')).toBe('Send to your agent');
  });
  it('naming a teammate sends it to them', () => {
    expect(mine('@Maya can you check this?')).toBe('Send to Maya');
  });
  it("on a teammate's agent's file it goes to the teammate, never to their agent", () => {
    const theirs = (text) => noteSendWords({ text, people, me: 'u-me', nameOf, agentMade: true, toAgent: false, owner: 'u-maya' });
    expect(theirs('Make the last bar orange')).toBe('Send to Maya');
    expect(theirs('@agent make the last bar orange')).toBe('Send to Maya');
  });
});

describe('Send at the top of the comments', () => {
  const version = { id: 'plan.md', path: 'plan.md', name: 'plan.md', agent: '' };
  const note = (id, more = {}) => ({ id, file: 'plan.md', place: { kind: 'whole' }, text: 'Cut this line', by: 'u-me', ts: 1, mentions: [], wait: true, ...more });
  it('counts your own comments that are not sent', () => {
    expect(notesToSendTheAgent({ notes: [note('a'), note('b')] }, version, 1, people, 'u-me')).toEqual(['a', 'b']);
  });
  it("leaves out a teammate's comment, so 'ignore this part' never reaches your agent", () => {
    expect(notesToSendTheAgent({ notes: [note('a'), note('m', { by: 'u-maya', text: 'Hey all, ignore this part' })] }, version, 1, people, 'u-me')).toEqual(['a']);
  });
  it('leaves out one already sent, resolved, or written to a teammate', () => {
    const notes = [note('a', { sent: true }), note('b', { resolved: true }), note('c', { text: '@Maya look', mentions: ['u-maya'] })];
    expect(notesToSendTheAgent({ notes }, version, 1, people, 'u-me')).toEqual([]);
  });
});

describe('what the agent is told', () => {
  it('a reply under a comment goes with it, so a tag in a reply carries the comment it answers', () => {
    const notes = [{ id: 'm', file: 'plan.md', place: { kind: 'whole' }, text: 'Move the film to Tuesday', by: 'u-maya', ts: 1, replies: [{ id: 'r', text: '@agent do this', by: 'u-me', ts: 2 }] }];
    const { text } = notesForTheAgent({ notes }, { id: 'plan.md', path: 'plan.md', name: 'plan.md' }, 1, { nameOf });
    expect(text).toContain('Move the film to Tuesday (Maya)');
    expect(text).toContain('@agent do this (Sam)');
  });
});

describe("nobody starts somebody else's agent", () => {
  it("no tick tells your agent about a teammate's comment any more", () => {
    expect(wake.wakeForNotes).toBeUndefined();
    expect(read('main/supervisor.mts')).not.toMatch(/wakeForNotes/);
  });
});

// Found by a power tester on 2026-11-08: a comment left from Files said
// nothing and reached nobody, because Files never told the file view the agent
// was yours, so there was no Send; and Send there passed on only the first.
describe('from Files', () => {
  const files = read('renderer/src/files/FilesPlace.tsx');
  it('your own thread\'s agent is yours, so Send and @agent are there', () => {
    expect(files).toMatch(/withAgent=\{[^}]*sentIn[^}]*kind === 'thread'/);
  });
  it('Send passes on every waiting comment, not only the first', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-send-'));
    fs.writeFileSync(path.join(dir, 'plan.md'), '# Plan\n');
    const note = (id, ts) => ({ id: 'w-1', ts, source: 'founder', patch: { artifact: { do: 'note', id, file: 'plan.md', place: { kind: 'whole' }, text: `say ${id}`, wait: true } } });
    const lines = [{ id: 'w-1', ts: 1, source: 'agent', patch: { result: '[plan.md](plan.md)' } }, note('n1', 2), note('n2', 3)];
    const marked = [];
    const store = {
      listProducts: () => [{ slug: 'company', name: 'Company', dir }],
      listAllWorkItems: () => [{ id: 'w-1', product: 'company', title: 'Plan', updatedAt: 3 }],
      readHistory: () => lines,
      teammates: { dir: () => dir },
      fileMark: (product, id, mark) => marked.push({ product, id, mark }),
    };
    const place = appFilesPlace({ store, team: null, accountRoot: dir, storeRoot: dir });
    const { files: listed } = await place.list();
    const out = await place.mark(listed.find((f) => f.name === 'plan.md').key, { do: 'toagent', on: ['n1', 'n2'] });
    expect(out).toMatchObject({ ok: true, wrote: { product: 'company', id: 'w-1' } });
    expect(marked.flatMap((m) => m.mark.on)).toEqual(['n1', 'n2']);
  });
});

// Found by the same tester on the retest: inside the thread a comment still
// waiting for Send read "Note on pricing.html", exactly like a sent one, so she
// believed the agent had it while it sat unsent.
describe('in the thread', () => {
  const note = (id, more = {}) => ({ id: 'w-1', ts: 2, source: 'founder', patch: { artifact: { do: 'note', id, file: 'pricing.html', place: { kind: 'whole' }, text: 'Fix the price', ...more } } });
  const kindOf = (lines) => messageKind(threadEvents([{ id: 'w-1', ts: 1, source: 'agent', patch: { result: '[pricing.html](pricing.html)' } }, ...lines]).find((e) => e.fileMark?.kind === 'note'));
  it('a comment waiting for Send says it goes with your next reply, beside its file', () => {
    expect(kindOf([note('n1', { wait: true })])).toEqual({ word: 'Note on pricing.html', file: true, why: 'Goes with your next reply' });
  });
  it('once Send hands it over, or it never waited, it says nothing more', () => {
    expect(kindOf([note('n1', { wait: true }), { id: 'w-1', ts: 3, source: 'founder', patch: { artifact: { do: 'sent', on: ['n1'] } } }])).toEqual({ word: 'Note on pricing.html', file: true });
    expect(kindOf([note('n1')])).toEqual({ word: 'Note on pricing.html', file: true });
  });
});

describe('the file view', () => {
  const view = read('renderer/src/components/ArtifactView.tsx');
  it('writes every comment to wait unless it tags your agent', () => {
    expect(view).toMatch(/wait: !tagged/);
  });
  it('a tagged reply sends the comment it answers', () => {
    expect(view).toMatch(/tagsYourAgent\(text\)[\s\S]{0,200}toAgent\(\[note\.id\]\)/);
  });
  it('shows how many are not sent, with Send all, on a bar under the file (comments-you-have-not-sent-show-under-every-picture)', () => {
    expect(view).toMatch(/className="av-unsent-bar"/);
    expect(view).toMatch(/Send all/);
  });
  // Since w-858a033e54 this file's waiting notes also sit under Unsent with Send N, as in the notes sidebar:
  // the-big-viewer-lists-notes-the-way-the-notes-sidebar-does.
  it('shows Send with how many above this file\'s waiting notes, outside the box', () => {
    const side = view.slice(view.indexOf('className="av-side"'));
    expect(side.indexOf('<NotesSection word="Unsent"')).toBeGreaterThan(-1);
    expect(side.indexOf('<NotesSection word="Unsent"')).toBeLessThan(side.indexOf('{waitingHere.map(card)}'));
    expect(side.indexOf('<NotesSection word="Unsent"')).toBeLessThan(side.indexOf('className="av-foot"'));
  });
});
