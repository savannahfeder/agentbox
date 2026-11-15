// NEEDS YOU SAYS WHO IS WAITING, PEOPLE FIRST (2026-10-30).
//
// "Replies from people sit below agent rows", and Dev
// wanted "someone is waiting on you" told apart from "an agent is waiting on
// you". Measured on the built app with three people and six AI teammates: a
// task from Dev and a mention from Sofia sat among three AI teammates' runs and
// three of Maya's own agents in one undivided list. Group by Who splits Needs
// you in two, People and Agents, each in the order it came, and one part alone
// has no header. Unless someone picks it, the list is one by priority.
import { describe, it, expect } from 'vitest';
import { needsByWho } from '../renderer/src/threads/stack-rules.ts';

const row = (id, who) => ({ id, who });
const whoOf = (i) => i.who;

describe('Needs you by who is waiting', () => {
  const rows = [row('a1', 'agents'), row('p1', 'people'), row('a2', 'agents'), row('p2', 'people')];

  it('puts people first, then agents', () => {
    const s = needsByWho(rows, whoOf);
    expect(s.sections.map((x) => [x.key, x.label, x.count])).toEqual([['people', 'People', 2], ['agents', 'Agents', 2]]);
    expect(s.rows.map((r) => r.id)).toEqual(['p1', 'p2', 'a1', 'a2']);
  });

  it('keeps each row\'s own order inside its part', () => {
    expect(needsByWho(rows, whoOf).rows.filter((r) => r.who === 'agents').map((r) => r.id)).toEqual(['a1', 'a2']);
  });

  it('draws one kind alone as it always was, with no header', () => {
    expect(needsByWho([row('a1', 'agents'), row('a2', 'agents')], whoOf)).toBeNull();
    expect(needsByWho([], whoOf)).toBeNull();
  });

  it('folds a part away and keeps its count', () => {
    const s = needsByWho(rows, whoOf, new Set(['agents']));
    expect(s.sections.find((x) => x.key === 'agents')).toMatchObject({ folded: true, count: 2 });
    expect(s.rows.map((r) => r.id)).toEqual(['p1', 'p2']);
  });

  it('counts mentions drawn over the list as from people, even with no other row from a person', () => {
    const s = needsByWho([row('a1', 'agents')], whoOf, new Set(), 1);
    expect(s.sections.map((x) => [x.key, x.count])).toEqual([['people', 1], ['agents', 1]]);
    expect(s.sectionOf(row('a1', 'agents'))).toBe('agents');
  });

  it('says every row is a Needs you row', () => {
    expect(needsByWho(rows, whoOf).sections.every((x) => x.tab === 'inbox')).toBe(true);
  });
});
