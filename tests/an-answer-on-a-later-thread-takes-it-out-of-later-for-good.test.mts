// AN ANSWER ON A LATER THREAD TAKES IT OUT OF LATER FOR GOOD.
//
// Power test of 2026-11-16, every thread in Agentbox Cloud. A Later thread
// answered by a reply or a picked option kept "Scheduled for tomorrow 2:28am"
// and "Back to Later" while it ran, and the label came back once the run
// finished (seen 5 times); a "Close this task" on a Later thread said Done
// while the board still showed it in Later; the Later count on the list was
// one more than on the board (seen 10 times).
//
// Measured on the tester's own ledger: the thread's runAt, set by the person,
// was never written again through two replies and two picks. The window only
// looked past it while the answer was unread (`wordWaits`), so the time came
// back as soon as the run answered. A pick never cleared a Later reminder in
// the store at all. While a pick or close was held for Z, the Later list still
// took the row. The list counted repeating tasks in Later; the board did not.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { laterHerWordLifts } from '../shared/answers.mts';
import { deferredUntil, hiddenUntil } from '../renderer/src/list-rules';

const NOW = 1_794_830_000_000;
const DAY = 86_400_000;
let root: string, dir: string, store: InstanceType<typeof Store>, id: string;

const at = (ms: number) => vi.setSystemTime(ms);
const row = () => store.readItem('p', id);
const ranAndAnswered = (when: number) => {
  at(when);
  store.modules.workItemsDisk.updateWorkItem(dir, id, { result: 'Here are the openers.' }, { source: 'agent' });
  at(when + 1);
  store.modules.workItemsDisk.updateWorkItem(dir, id, { answeredThrough: row().wrote.answer.ts }, { source: 'system' });
};

beforeEach(async () => {
  vi.useFakeTimers();
  at(NOW);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'later-answer-'));
  dir = path.join(root, 'p');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name: 'Outreach' }));
  store = await new Store({ accountRoot: root, products: [] }).init();
  id = store.composeItem('p', { title: 'Seed-stage fintech founders in New York' }).id;
  at(NOW + 1);
  store.modules.workItemsDisk.updateWorkItem(dir, id, { result: 'Which should I do next?\n\n1. Check locations\n2. Write outreach openers now' }, { source: 'agent' });
  at(NOW + 2);
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a time she set for the thread', () => {
  it('a reply clears it, and it stays cleared after the run answers', () => {
    store.scheduleItem('p', id, NOW + DAY);
    at(NOW + 10);
    store.answerItem('p', id, { answer: 'Please use only the five named founders.' });
    expect(row().runAt).toBe(0);
    ranAndAnswered(NOW + 20);
    expect(deferredUntil(row())).toBe(0);
    expect(hiddenUntil(row())).toBe(0);
  });

  it('a picked option clears it too', () => {
    store.scheduleItem('p', id, NOW + DAY);
    at(NOW + 10);
    store.answerItem('p', id, { answer: 'Option 2: Write outreach openers now' });
    ranAndAnswered(NOW + 20);
    expect(row().runAt).toBe(0);
  });

  it('a reply set for later keeps the new time', () => {
    store.scheduleItem('p', id, NOW + DAY);
    at(NOW + 10);
    store.answerItem('p', id, { answer: 'Carry on tomorrow.' });
    store.scheduleItem('p', id, NOW + 2 * DAY);
    expect(row().runAt).toBe(NOW + 2 * DAY);
  });

  it('a time already past is left alone', () => {
    store.scheduleItem('p', id, NOW + 5);
    at(NOW + 10);
    store.answerItem('p', id, { answer: 'Go on.' });
    expect(row().runAt).toBe(NOW + 5);
  });
});

describe('a Later reminder she set', () => {
  it('a picked option clears it, and it stays cleared after the run answers', () => {
    store.snoozeItem('p', id, NOW + DAY);
    at(NOW + 10);
    store.answerItem('p', id, { answer: 'Option 2: Write outreach openers now' });
    expect(row().snoozedUntil).toBe(0);
    ranAndAnswered(NOW + 20);
    expect(hiddenUntil(row())).toBe(0);
  });
});

describe('what an answer does not lift', () => {
  it('a moment the agent set for itself', () => {
    store.modules.workItemsDisk.updateWorkItem(dir, id, { runAt: NOW + DAY }, { source: 'agent' });
    at(NOW + 10);
    store.answerItem('p', id, { answer: 'Do it now.' });
    expect(row().runAt).toBe(NOW + DAY);
  });

  it('a withdrawn answer, or a write with no words', () => {
    store.scheduleItem('p', id, NOW + DAY);
    store.snoozeItem('p', id, NOW + DAY);
    at(NOW + 10);
    store.answerItem('p', id, { answer: '(withdrawn)' });
    store.answerItem('p', id, { status: 'blocked' });
    expect(row().runAt).toBe(NOW + DAY);
    expect(row().snoozedUntil).toBe(NOW + DAY);
  });

  it('the rule says the same on the row the window holds', () => {
    const later = { runAt: NOW + DAY, snoozedUntil: NOW + DAY, wrote: { runAt: { ts: NOW, source: 'founder' } } };
    expect(laterHerWordLifts(later, NOW)).toEqual({ runAt: true, snoozedUntil: true });
    expect(laterHerWordLifts({ ...later, wrote: { runAt: { ts: NOW, source: 'agent' } } }, NOW).runAt).toBe(false);
    expect(laterHerWordLifts(later, NOW + DAY)).toEqual({ runAt: false, snoozedUntil: false });
  });
});

describe('the window', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');

  it('a word held for Z already lifts the Later it will lift', () => {
    expect(app).toMatch(/const dueAt = useCallback\(\(i: WorkItem\) => \(startingIds\.has\(i\.id\) && laterHerWordLifts\(i\)\.runAt \? 0 : deferredUntil\(i\)\)/);
    expect(app).toMatch(/const hiddenAt = useCallback\(\(i: WorkItem\) => \(startingIds\.has\(i\.id\) \? 0 : hiddenUntil\(i, snoozes\[i\.id\] \?\? 0\)\)/);
  });

  it('a close or answer held for Z leaves Later at once', () => {
    const later = app.slice(app.indexOf('const snoozed = useMemo(() => ['), app.indexOf('].sort((a, b) => whenShown(a) - whenShown(b))'));
    expect(later).toMatch(/runOnIt:[^}]*shippingIds\.has\(i\.id\) \|\| pendingIds\.has\(i\.id\)/);
  });

  it('a reply taken back puts back the time the store lifted', () => {
    expect(app).toMatch(/if \(runLifted\) await api\.schedule\(\{ product: item\.product, id: item\.id, runAt: priorRunAt \}\);/);
  });

  it('the board counts repeating tasks in Later, as the list does', () => {
    expect(app).toMatch(/<InboxBoard items=\{items\}[^>]*laterRules=\{repeats\.length\}/);
    expect(pages).toMatch(/const count = rows\.length \+ \(ahead\?\.count \?\? 0\) \+ \(col\.state === 'scheduled' \? laterRules : 0\);/);
  });
});
