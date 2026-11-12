// A PRACTICE THREAD READS IN THE ORDER IT HAPPENED (2026-11-12).
//
// The founder went through the first run and opened its practice thread. For
// two seconds it showed "Add a summary" over one line, "Keep it short: what
// we decided, and what is still open." Then the answer came, and with the
// earlier messages shown, the agent's steps stood above her own ask.
//
// Two causes, both measured on a throwaway copy. A thread's header is a short
// name cut from its first sentence, and the message under it carried that
// sentence only once the app had given the thread a name of its own; until
// then the first sentence was on no screen. And the practice agent's run was
// dated 45 seconds back from its answer, which is before the ask it answers
// two seconds after.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { machineryPath } from '../main/store/home.mts';
import { PRACTICE_SLUG, PRACTICE_TASK, PRACTICE_TASK_TRACE } from '../shared/first-run-practice.mts';
import { threadEvents } from '../renderer/src/thread-history';

const line = (ts, patch, extra = {}) => ({ id: 'w-1', ts, source: 'founder', patch, ...extra });
const openingOf = (title, body, label = null) => {
  const events = threadEvents([line(1, { title, kind: 'directive' }, { source: 'system' }), line(2, { title, body }), ...(label ? [line(3, { label }, { source: 'agent' })] : [])]);
  return events.find((e) => e.field === 'body')?.words;
};

describe('your first message, before the app has named the thread', () => {
  it('carries its first sentence when the header shows only a few words of it', () => {
    expect(openingOf(PRACTICE_TASK.title, PRACTICE_TASK.body)).toBe(`${PRACTICE_TASK.title}\n\n${PRACTICE_TASK.body}`);
  });
  it('is left alone when the header already says the whole first line', () => {
    expect(openingOf('Fix the header', 'It overlaps the logo on a phone.')).toBe('It overlaps the logo on a phone.');
  });
  it('still carries it once the thread has a name of its own, as before', () => {
    expect(openingOf(PRACTICE_TASK.title, PRACTICE_TASK.body, 'Practice meeting notes summary')).toBe(`${PRACTICE_TASK.title}\n\n${PRACTICE_TASK.body}`);
  });
  it('says nothing twice when the message already holds the sentence', () => {
    expect(openingOf(PRACTICE_TASK.title, `${PRACTICE_TASK.title}\n\n${PRACTICE_TASK.body}`)).toBe(`${PRACTICE_TASK.title}\n\n${PRACTICE_TASK.body}`);
  });
});

async function freshStore() {
  const account = fs.mkdtempSync(path.join(os.tmpdir(), 'practice-order-'));
  process.env.ASTRAL_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'practice-order-home-'));
  const store = new Store({ accountRoot: account, products: [], personalProducts: [] });
  await store.init();
  store.watch = () => {};
  return { store, account };
}

describe("the practice agent's run", () => {
  it('is dated after the ask and no later than its answer', async () => {
    const { store } = await freshStore();
    store.createPractice();
    const asked = Date.now() - 6_000;
    const made = store.composeItem(PRACTICE_SLUG, { title: PRACTICE_TASK.title, body: PRACTICE_TASK.body, kind: 'directive', labels: ['first-run'] });
    const out = store.finishFirstRunTask(PRACTICE_SLUG, made.id, 0, { asked });
    const dir = machineryPath(store.productDir(PRACTICE_SLUG), path.join('sessions', made.id));
    const [log] = fs.readdirSync(dir);
    const began = Number(log.replace('.log', ''));
    expect(began).toBeGreaterThan(asked);
    const stamps = fs.readFileSync(path.join(dir, log), 'utf8').trim().split('\n').map((l) => l.slice(0, 8));
    expect(stamps).toHaveLength(PRACTICE_TASK_TRACE.length);
    expect([...stamps].sort()).toEqual(stamps);
    const span = (PRACTICE_TASK_TRACE.length - 1) * 1_000;
    expect(began + span).toBeLessThanOrEqual(out.item.updatedAt);
  });
  it('still reads as a run when the answer comes at once: after the ask, a second apart', async () => {
    const { store } = await freshStore();
    store.createPractice();
    const made = store.composeItem(PRACTICE_SLUG, { title: PRACTICE_TASK.title, body: PRACTICE_TASK.body, kind: 'directive', labels: ['first-run'] });
    store.finishFirstRunTask(PRACTICE_SLUG, made.id);
    const dir = machineryPath(store.productDir(PRACTICE_SLUG), path.join('sessions', made.id));
    const began = Number(fs.readdirSync(dir)[0].replace('.log', ''));
    expect(began).toBeGreaterThanOrEqual(Math.floor(made.createdAt / 1000) * 1000);
  });
});
