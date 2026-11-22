// Under a teammate's answer on the owner's thread the history drew "It handed this back", the app's own reopening of the row read as the agent's (power test issues 82, 40).
// Measured on threadEvents with the two lines tellItem writes: the teammate's answer, then a system status open.
import { it, expect } from 'vitest';
import { threadEvents } from '../renderer/src/thread-history';

const T0 = Date.parse('2026-11-21T08:43:00Z');
const line = (ts, source, patch) => ({ id: 'w-1', ts, source, patch });
const born = [line(T0, 'system', { title: 'Add pagination', status: 'open', labels: ['founder'] }), line(T0 + 4, 'founder', { title: 'Add pagination' })];
const theirs = (ts) => line(ts, 'system', { answer: 'Theo here. Go with option 3.', from: { teammate: 'theo', name: 'Theo' } });
const said = (lines) => threadEvents(lines).map((e) => e.said);

it("draws a teammate's answer and nothing after it when the app reopens the row", () => {
  const out = said([...born, line(T0 + 1000, 'agent', { result: 'Which option?' }), theirs(T0 + 60_000), line(T0 + 60_000, 'system', { status: 'open' })]);
  expect(out).toContain('Theo handed this over');
  expect(out).not.toContain('It handed this back');
});

it('still says it was handed back when the agent itself reopens the row after their answer', () => {
  const out = said([...born, theirs(T0 + 60_000), line(T0 + 120_000, 'agent', { status: 'open' })]);
  expect(out).toContain('It handed this back');
});

it("still says it after the owner's own answer and a system reopening, as before", () => {
  const out = said([...born, line(T0 + 60_000, 'founder', { answer: 'Go on.' }), line(T0 + 60_001, 'system', { status: 'open' })]);
  expect(out).toContain('It handed this back');
});
