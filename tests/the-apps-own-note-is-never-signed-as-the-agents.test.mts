// THE APP'S OWN NOTE IS NEVER SIGNED AS THE AGENT'S (w-abab5aca62).
//
// A cloud run's machine stopped two minutes in. The app wrote why on the row
// as a note of its own ("This thread's cloud machine stopped ... The thread
// picks up from where it was before that run", main/cloud/run.mts
// `layCheckpoint`, written as `system`) and started the run again. The thread
// page lifted that note to the foot as "Latest checkpoint" with the model's
// name beside it, so it read as the agent saying its work was lost while the
// agent was already working again under it. Measured on that thread's record:
// the note's writer was `system`, and the page signed it with the row's model
// all the same, because every note took the row's model whoever wrote it
// (thread-history.ts `ranNow`).
//
// That note is no longer drawn at all
// (trouble-the-app-handles-itself-is-not-drawn-on-the-thread). Every other note
// the app writes, "Shipped to main as ..." among them, is signed with the app's
// name in the thread, and at the foot it is the quiet line the Needs you page
// already draws for one (the-page-leads-with-the-agents-answer-not-the-apps-
// shipped-note). A failed ship is still drawn as Not shipped, which asks
// something of the person.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { threadEvents } from '../renderer/src/thread-history.ts';
import { footOf } from '../renderer/src/one-thing-at-a-time.ts';
import { messageKind } from '../renderer/src/threads/message-kind.ts';
import { Name } from '../shared/product-name.mjs';
import { SHIP_FAILED } from '../shared/not-shipped.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(root, 'renderer/src/components/ItemThread.tsx'), 'utf8');
const thread = fs.readFileSync(path.join(root, 'renderer/src/components/Thread.tsx'), 'utf8');
const quiet = fs.readFileSync(path.join(root, 'renderer/src/one-thing-at-a-time.css'), 'utf8');

const T0 = Date.parse('2026-11-21T04:00:00Z');
const line = (ts: number, source: string, patch: Record<string, unknown>) => ({ id: 'w-0a1b2c3d4e', ts, source, patch });
const SHIPPED = 'Shipped to main as 14c45bfb.';
const born = [
  line(T0, 'system', { title: 'Plan the garden', status: 'open', kind: 'directive', priority: 5, labels: ['founder'] }),
  line(T0 + 4, 'founder', { title: 'Plan the garden', body: 'Which beds get the tomatoes?', model: 'opus' }),
  line(T0 + 60_000, 'agent', { result: 'The two south beds.' }),
  line(T0 + 120_000, 'founder', { answer: 'And the herbs?' }),
];
const notes = (lines: unknown[]) => threadEvents(lines as never).filter((e) => e.field === 'note');

describe('a note the app wrote on the row', () => {
  it("is signed with the app's name, never the model the agent runs on", () => {
    const [note] = notes([...born, line(T0 + 240_000, 'system', { note: SHIPPED })]);
    expect(note.words).toBe(SHIPPED);
    expect(note.from).toBe(Name);
    expect(note.ran).toBeUndefined();
  });

  it("while the agent's own checkpoint is still signed with its model", () => {
    const [note] = notes([...born, line(T0 + 240_000, 'agent', { note: 'Halfway: the herbs go by the door.' })]);
    expect(note.from).toBeUndefined();
    expect(note.ran).toEqual({ model: 'opus' });
    expect(messageKind(note)?.word).toBe('Checkpoint');
  });

  it('stays a quiet line once the agent has answered under it, with no Checkpoint label', () => {
    const [note] = notes([...born,
      line(T0 + 240_000, 'system', { note: SHIPPED }),
      line(T0 + 400_000, 'agent', { result: 'The herbs go by the door.' })]);
    expect(note.says).toBe('app');
    expect(messageKind(note)).toBeNull();
    expect(thread).toMatch(/e\.says === 'app'\s*\?\s*<div className="one-app-note">\{md\(e\.text \?\? ''\)\}<\/div>/);
  });

  it("keeps the thread's own 22px there, which measured 36px with the foot's margin", () => {
    expect(quiet).toMatch(/\.thread-block > \.one-app-note \{ margin-top: 0; \}/);
    expect(quiet).toMatch(/\.one-app-note > :first-child \{ margin-top: 0; \}/);
  });
});

describe('at the foot of the thread', () => {
  const wrote = (source: string, ts = T0 + 240_000) => ({ result: { ts: T0 + 60_000, source: 'agent' }, note: { ts, source } });
  const noteOutcome = (text: string) => ({ at: T0 + 240_000, text, field: 'note' as const, ran: { model: 'opus' } });

  it("draws the app's note as its quiet line, not the agent's latest checkpoint", () => {
    expect(footOf(noteOutcome(SHIPPED), { note: SHIPPED, wrote: wrote('system') })).toBe('app');
  });

  it("keeps an agent's checkpoint as the agent's", () => {
    expect(footOf(noteOutcome('Halfway there.'), { note: 'Halfway there.', wrote: wrote('agent') })).toBe('agent');
  });

  it('keeps a ship that failed as Not shipped, though the app wrote it too', () => {
    const failed = `${SHIP_FAILED}a test is red.`;
    expect(footOf(noteOutcome(failed), { note: failed, wrote: wrote('system') })).toBe('unshipped');
  });

  it("keeps a result as the agent's, and draws nothing with nothing to draw", () => {
    const result = { at: T0 + 300_000, text: 'The herbs go by the door.', field: 'result' as const };
    expect(footOf(result, { note: SHIPPED, wrote: { ...wrote('system'), result: { ts: T0 + 300_000, source: 'agent' } } })).toBe('agent');
    expect(footOf(null, { note: SHIPPED, wrote: wrote('system') })).toBeNull();
  });

  it('is the quiet line on every thread page, not only in Needs you', () => {
    expect(page).toMatch(/const foot = footOf\(outcome, item\);/);
    expect(page).toMatch(/foot === 'app'\s*\?\s*<div className="one-app-note" data-exchange=\{answerAt\}>\{md\(clean\(outcome\.text\)\)\}<\/div>/);
  });
});
