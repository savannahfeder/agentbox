// Home's Team this week card kept the Team page's dragged order, so people who
// were not on Rooms yet and had finished nothing sat at the top and the one
// teammate with work done was fourth. Measured on the rule Home sorts with.
import { describe, it, expect } from 'vitest';
import { busiestFirst, type TeamRowState } from '../renderer/src/home/home-model.ts';

const row = (name: string, state: TeamRowState, week: number[]) => ({ name, state, week, total: week.reduce((a, b) => a + b, 0) });
const names = (rows: { name: string }[]) => rows.map((r) => r.name);
const none = [0, 0, 0, 0, 0, 0, 0];

describe('Team this week puts the busiest first', () => {
  it('moves the one teammate with work done above the quiet ones (the reported case)', () => {
    const rows = [row('David', 'quiet', none), row('Margarette', 'quiet', none), row('Riley', 'quiet', none), row('Self-improve lead', 'working', [0, 0, 0, 0, 0, 0, 4])];
    expect(names(busiestFirst(rows))).toEqual(['Self-improve lead', 'David', 'Margarette', 'Riley']);
  });
  it('puts whoever waits on you above whoever is working, and working above done work', () => {
    const rows = [row('Done', 'quiet', [0, 0, 0, 0, 0, 0, 9]), row('Working', 'working', none), row('Waiting', 'waiting', none)];
    expect(names(busiestFirst(rows))).toEqual(['Waiting', 'Working', 'Done']);
  });
  it('among the quiet, more finished this week comes first', () => {
    const rows = [row('One', 'quiet', [1, 0, 0, 0, 0, 0, 0]), row('Three', 'quiet', [0, 1, 1, 1, 0, 0, 0])];
    expect(names(busiestFirst(rows))).toEqual(['Three', 'One']);
  });
  it('the same count finished more lately comes first', () => {
    const rows = [row('Monday', 'quiet', [2, 0, 0, 0, 0, 0, 0]), row('Today', 'quiet', [0, 0, 0, 0, 0, 0, 2])];
    expect(names(busiestFirst(rows))).toEqual(['Today', 'Monday']);
  });
  it('keeps the Team page order between people with nothing to tell them apart', () => {
    const rows = [row('B', 'quiet', none), row('A', 'quiet', none), row('C', 'quiet', none)];
    expect(names(busiestFirst(rows))).toEqual(['B', 'A', 'C']);
  });
  it('does not reorder the list it was given', () => {
    const rows = [row('Quiet', 'quiet', none), row('Working', 'working', none)];
    busiestFirst(rows);
    expect(names(rows)).toEqual(['Quiet', 'Working']);
  });
});
