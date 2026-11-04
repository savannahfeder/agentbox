// AN AGENT BUILT ON AN OLD VERSION KEEPS THE PERSON'S EDIT.
//
// The founder changed a document's one-liner five times and it kept reverting.
// Measured from the thread's files: the person's v8, v9, v10 had the line, the
// agent's v11 and v12 (copied from v7) did not; the person's v13 had it, the
// agent's v14 (copied from v12) did not. A rule in the agent's prompt was the
// only guard. An agent writes through ordinary file tools, so nothing can make it
// say what it started from; what it started from is worked out from the words,
// under conditions strict enough that being wrong keeps words rather than loses them.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanMark, editedFilesLine, filesInLines, newestOfFamily } from '../shared/artifact-marks.mjs';
import { planReconcile, reconcileRows, reconcileThread } from '../main/version-reconcile.mjs';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';

const doc = (oneLiner, para = 'The first paragraph as it stands.', tail = 'The closing words.') => `# Doc\n\n${oneLiner}\n\n${para}\n\n${tail}\n`;
let dir;
const put = (name, text) => { const p = `designs/w-1/${name}`; fs.mkdirSync(path.join(dir, 'designs/w-1'), { recursive: true }); fs.writeFileSync(path.join(dir, p), text); return p; };
const agent = (p, ts) => ({ id: 'w-1', ts, source: 'agent', by: 'owner', patch: { result: `I wrote [x](${p}).` } });
const person = (p, file, ts) => ({ id: 'w-1', ts, source: 'founder', by: 'owner', patch: { artifact: { do: 'edit', file, path: p } } });
const plan = (lines) => planReconcile({ dir, lines });

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-')); });

describe('the reported case', () => {
  const chain = (v14) => [
    agent(put('plan.md', doc('Old line')), 1),
    person(put('plan-v2.md', doc('The line they typed')), 'plan.md', 2),
    agent(put('plan-v3.md', v14), 3),
  ];
  it('puts the person\'s line back on top of the agent\'s change', () => {
    const [p] = plan(chain(doc('Old line', 'The paragraph the agent changed.')));
    expect(p.do).toBe('merge');
    expect(p.text).toBe(doc('The line they typed', 'The paragraph the agent changed.'));
    expect(p.from).toBe('plan.md');
  });
  it('keeps the person\'s sentence when the agent changed another in the same paragraph', () => {
    const start = 'First sentence. Second sentence. Third sentence.';
    const lines = [
      agent(put('a.md', doc('L', start)), 1),
      person(put('a-v2.md', doc('L', 'First TYPED. Second sentence. Third sentence.')), 'a.md', 2),
      agent(put('a-v3.md', doc('L', 'First sentence. Second sentence. Third AGENT.')), 3),
    ];
    expect(plan(lines)[0].text).toBe(doc('L', 'First TYPED. Second sentence. Third AGENT.'));
  });
  it('goes back past several saves of a sitting to where the agent really started', () => {
    const lines = [
      agent(put('b.md', doc('Old')), 1),
      person(put('b-v2.md', doc('Typed one')), 'b.md', 2),
      person(put('b-v3.md', doc('Typed two')), 'b.md', 3),
      person(put('b-v4.md', doc('Typed three')), 'b.md', 4),
      agent(put('b-v5.md', doc('Old', 'Agent paragraph.')), 5),
    ];
    const [p] = plan(lines);
    expect(p.from).toBe('b.md');
    expect(p.text).toBe(doc('Typed three', 'Agent paragraph.'));
  });
});

describe('must not touch', () => {
  it('an agent that built on the person\'s version', () => {
    const lines = [agent(put('c.md', doc('Old')), 1), person(put('c-v2.md', doc('Typed')), 'c.md', 2), agent(put('c-v3.md', doc('Typed', 'Agent paragraph.')), 3)];
    expect(plan(lines)[0]).toMatchObject({ do: 'none' });
  });
  it('an agent that went back on purpose to the exact words of an older version', () => {
    const lines = [agent(put('d.md', doc('Old')), 1), person(put('d-v2.md', doc('Typed')), 'd.md', 2), agent(put('d-v3.md', doc('Old')), 3)];
    expect(plan(lines)[0]).toMatchObject({ do: 'none' });
  });
  it('a chain nobody but the agent wrote', () => {
    expect(plan([agent(put('e.md', doc('One')), 1), agent(put('e-v2.md', doc('Two')), 2)])).toEqual([]);
  });
  it('a chain whose newest version is the person\'s', () => {
    expect(plan([agent(put('f.md', doc('One')), 1), person(put('f-v2.md', doc('Two')), 'f.md', 2)])).toEqual([]);
  });
  it('a picture, whatever its chain', () => {
    expect(plan([agent(put('g.png', 'x'), 1), person(put('g-v2.png', 'y'), 'g.png', 2), agent(put('g-v3.png', 'z'), 3)])).toEqual([]);
  });
  it('a version an agent marked as meaning to replace', () => {
    const lines = [agent(put('h.md', doc('Old')), 1), person(put('h-v2.md', doc('Typed')), 'h.md', 2), agent(put('h-v3.md', doc('Old', 'Other.')), 3),
      { id: 'w-1', ts: 4, source: 'agent', by: 'owner', patch: { artifact: { do: 'reconcile', file: 'h-v3.md', replace: true } } }];
    expect(plan(lines)).toEqual([]);
  });
  it('a file that has not arrived yet, so it is looked at again later', () => {
    const lines = [agent(put('i.md', doc('Old')), 1), person(put('i-v2.md', doc('Typed')), 'i.md', 2), agent('designs/w-1/i-v3.md', 3)];
    expect(plan(lines)).toEqual([]);
  });
  it('a path outside the project', () => {
    fs.mkdirSync(path.join(dir, 'designs'), { recursive: true });
    const lines = [agent('../outside.md', 1), person(put('j-v2.md', doc('Typed')), 'outside.md', 2)];
    expect(plan(lines)).toEqual([]);
  });
});

describe('says so when it cannot merge', () => {
  it('the agent changed only the words the person changed: nothing to add, so both stay and it says so', () => {
    const lines = [agent(put('k.md', doc('Old')), 1), person(put('k-v2.md', doc('Typed')), 'k.md', 2), agent(put('k-v3.md', doc('The agent line')), 3)];
    expect(plan(lines)[0]).toMatchObject({ do: 'missed', file: 'k-v3.md', missed: 'designs/w-1/k-v2.md' });
  });
  it('the agent changed those words and others: the other changes land, the person\'s words stay, and it says so', () => {
    // Measured on the reported thread: v13 and v14 both changed one paragraph, and v14 dropped v13's one-liner.
    const lines = [agent(put('r.md', doc('Old', 'Para', 'Tail')), 1), person(put('r-v2.md', doc('Typed', 'Para typed', 'Tail')), 'r.md', 2), agent(put('r-v3.md', doc('Old', 'Para agent', 'Tail agent')), 3)];
    const [p] = plan(lines);
    expect(p).toMatchObject({ do: 'merge', clash: 1 });
    expect(p.text).toBe(doc('Typed', 'Para typed', 'Tail agent'));
  });
  it('the place is repeated word for word, so the alignment is a guess', () => {
    const row = '| same | row | of | a | table | that | repeats | itself |\n';
    const lines = [
      agent(put('l.md', row.repeat(6)), 1),
      person(put('l-v2.md', row.repeat(2) + row.replace('same', 'TYPED') + row.repeat(3)), 'l.md', 2),
      agent(put('l-v3.md', row.repeat(4) + row.replace('table', 'AGENT') + row), 3),
    ];
    expect(plan(lines)[0]).toMatchObject({ do: 'missed' });
  });
  it('a whole rewrite that left out what the person typed', () => {
    const lines = [agent(put('m.md', doc('Old')), 1), person(put('m-v2.md', doc('Words the person typed')), 'm.md', 2),
      agent(put('m-v3.md', 'A complete rewrite with nothing kept from before, in entirely new language throughout the piece.\n'), 3)];
    expect(plan(lines)[0]).toMatchObject({ do: 'missed' });
  });
  it('but not a whole rewrite that carried it', () => {
    const lines = [agent(put('n.md', doc('Old')), 1), person(put('n-v2.md', doc('Words the person typed')), 'n.md', 2),
      agent(put('n-v3.md', 'A complete rewrite with nothing kept, in new language, except:\n\nWords the person typed\n'), 3)];
    expect(plan(lines)[0]).toMatchObject({ do: 'none' });
  });
});

describe('writing it down', () => {
  const lines = () => [agent(put('o.md', doc('Old')), 1), person(put('o-v2.md', doc('Typed')), 'o.md', 2), agent(put('o-v3.md', doc('Old', 'Agent paragraph.')), 3)];
  const run = (start) => {
    const log = [...start];
    const write = (patch) => log.push({ id: 'w-1', ts: log.length + 10, source: 'system', by: 'owner', patch });
    reconcileThread({ dir, threadId: 'w-1', lines: log, write });
    return log;
  };
  it('adds the merged words as the next version, and the agent\'s file stays as it wrote it', () => {
    const log = run(lines());
    expect(fs.readFileSync(path.join(dir, 'designs/w-1/o-v4.md'), 'utf8')).toBe(doc('Typed', 'Agent paragraph.'));
    expect(fs.readFileSync(path.join(dir, 'designs/w-1/o-v3.md'), 'utf8')).toBe(doc('Old', 'Agent paragraph.'));
    expect(filesInLines(log).map((f) => f.path).at(-1)).toBe('designs/w-1/o-v4.md');
  });
  it('says what happened on the thread', () => {
    const said = run(lines()).filter((l) => l.patch.note).map((l) => l.patch.note);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/o-v4\.md/);
  });
  it('does it once, however many times it is asked', () => {
    const log = run(run(lines()));
    expect(log.filter((l) => l.patch.artifact?.do === 'edit' && l.ts >= 10)).toHaveLength(1);
    expect(fs.existsSync(path.join(dir, 'designs/w-1/o-v5.md'))).toBe(false);
  });
  it('points the agent\'s next run at the merged version', () => {
    expect(editedFilesLine(run(lines()))).toMatch(/o-v4\.md/);
  });
  it('tells the agent\'s next run what it missed', () => {
    const log = run([agent(put('p.md', doc('Old')), 1), person(put('p-v2.md', doc('Typed')), 'p.md', 2), agent(put('p-v3.md', doc('The agent line')), 3)]);
    expect(log.filter((l) => l.patch.artifact?.do === 'edit' && l.ts >= 10)).toHaveLength(0);
    expect(editedFilesLine(log)).toMatch(/p-v3\.md.*p-v2\.md/);
    expect(log.some((l) => /p-v2\.md/.test(l.patch.note ?? ''))).toBe(true);
  });
  it('tells the row and the agent\'s next run where the person\'s words won', () => {
    const log = run([agent(put('s.md', doc('Old', 'Para', 'Tail')), 1), person(put('s-v2.md', doc('Typed', 'Para typed', 'Tail')), 's.md', 2), agent(put('s-v3.md', doc('Old', 'Para agent', 'Tail agent')), 3)]);
    expect(log.find((l) => l.patch.note)?.patch.note).toMatch(/same words \(one place\)/);
    expect(editedFilesLine(log)).toMatch(/s-v4\.md kept a person's words where your s-v3\.md changed the same ones/);
  });
  it('a later version of the agent\'s own ends that line', () => {
    const log = run([agent(put('q.md', doc('Old')), 1), person(put('q-v2.md', doc('Typed')), 'q.md', 2), agent(put('q-v3.md', doc('The agent line')), 3)]);
    log.push(agent(put('q-v4.md', doc('Typed', 'Done by hand.')), 99));
    expect(editedFilesLine(log)).toBeNull();
  });
  it('reads back through the store\'s own check on a mark', () => {
    expect(cleanMark({ do: 'reconcile', file: 'o-v3.md', path: 'designs/w-1/o-v4.md', from: 'o.md' })).toEqual({ do: 'reconcile', file: 'o-v3.md', path: 'designs/w-1/o-v4.md', from: 'o.md' });
    expect(cleanMark({ do: 'reconcile', file: 'o-v3.md', replace: true })).toEqual({ do: 'reconcile', file: 'o-v3.md', replace: true });
    expect(cleanMark({ do: 'reconcile', file: 'o-v3.md', path: '../../x.md' })).toEqual({ do: 'reconcile', file: 'o-v3.md' });
    expect(cleanMark({ do: 'reconcile' })).toBeUndefined();
  });
});

describe('what opens beside the message', () => {
  // Measured in a running copy: the agent's message names v3, the pane opened v3,
  // and the person saw their line gone though v4 had it.
  const edits = [{ file: 'o.md', path: 'designs/w-1/o-v2.md' }, { file: 'o-v3.md', path: 'designs/w-1/o-v4.md' }];
  it('is the merged version, not the one the message names', () => {
    expect(newestOfFamily('designs/w-1/o-v3.md', edits)).toBe('designs/w-1/o-v4.md');
    const app = fs.readFileSync(path.join(import.meta.dirname, '../renderer/src/App.tsx'), 'utf8');
    expect(app).toMatch(/besideSrc = namedBeside && newestOfFamily\(namedBeside, focused\?\.artifacts\?\.edits\)/);
  });
  it('is the named file when nobody edited it', () => {
    expect(newestOfFamily('designs/w-1/o-v3.md', undefined)).toBe('designs/w-1/o-v3.md');
  });
  it('is the named file when the edits were to another document', () => {
    expect(newestOfFamily('designs/w-1/other.md', edits)).toBe('designs/w-1/other.md');
  });
});

describe('the supervisor\'s look over a real store', () => {
  const start = async () => {
    const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rows-'));
    const accountRoot = path.join(storeRoot, 'accounts', 'a');
    dir = path.join(accountRoot, 'app');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'app', name: 'App' }));
    const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
    const item = disk.createWorkItem(dir, { title: 'revise the plan' }, { source: 'founder' });
    const put2 = (name, text) => { const p = `designs/${item.id}/${name}`; fs.mkdirSync(path.join(dir, 'designs', item.id), { recursive: true }); fs.writeFileSync(path.join(dir, p), text); return p; };
    const looked = new Map();
    const look = (isLive = () => false) => reconcileRows({
      items: store.listItems(Date.now()),
      isLive,
      dirOf: () => dir,
      historyOf: (i) => disk.readItemHistory(dir, i.id, { max: Number.MAX_SAFE_INTEGER }),
      writeTo: (i, patch) => disk.updateWorkItem(dir, i.id, patch, { source: 'system' }),
      looked,
    });
    return { store, item, put2, look };
  };
  const stale = async () => {
    const s = await start();
    disk.updateWorkItem(dir, s.item.id, { note: `I wrote [plan.md](${s.put2('plan.md', doc('Old'))}).` }, { source: 'agent' });
    s.store.fileMark('app', s.item.id, { do: 'edit', file: 'plan.md', path: s.put2('plan-v2.md', doc('Typed')) });
    disk.updateWorkItem(dir, s.item.id, { result: `I wrote [plan-v3.md](${s.put2('plan-v3.md', doc('Old', 'Agent paragraph.'))}).` }, { source: 'agent' });
    return s;
  };
  it('merges once the run is over, and the merged version is the newest', async () => {
    const { store, item, look } = await stale();
    look();
    const after = store.readItem('app', item.id);
    expect(after.artifacts.edits.at(-1).path).toBe(`designs/${item.id}/plan-v4.md`);
    expect(fs.readFileSync(path.join(dir, `designs/${item.id}/plan-v4.md`), 'utf8')).toBe(doc('Typed', 'Agent paragraph.'));
  });
  it('leaves a thread alone while its agent is still working', async () => {
    const { item, look } = await stale();
    look(() => true);
    expect(fs.existsSync(path.join(dir, `designs/${item.id}/plan-v4.md`))).toBe(false);
    look();
    expect(fs.existsSync(path.join(dir, `designs/${item.id}/plan-v4.md`))).toBe(true);
  });
  it('never makes a second copy across looks', async () => {
    const { item, look } = await stale();
    look(); look(); look();
    expect(fs.existsSync(path.join(dir, `designs/${item.id}/plan-v5.md`))).toBe(false);
  });
  it('leaves the row\'s status as it was', async () => {
    const { store, item, look } = await stale();
    const was = store.readItem('app', item.id).status;
    look();
    expect(store.readItem('app', item.id).status).toBe(was);
  });
  it('tries again after a failure', async () => {
    const { item, look } = await stale();
    const f = path.join(dir, 'designs', item.id);
    fs.chmodSync(f, 0o555);
    look();
    fs.chmodSync(f, 0o755);
    look();
    expect(fs.existsSync(path.join(f, 'plan-v4.md'))).toBe(true);
  });
});
