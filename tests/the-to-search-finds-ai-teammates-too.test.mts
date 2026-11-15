// THE SEARCH IN THE TO LIST NARROWS THE AI TEAMMATES TOO.
//
// Typing "head of marketing" into New thread > To > Find a person said
// "Nobody on the team matches that." over a list still holding Auto, Claude
// Code, Codex and every AI teammate, Head of Marketing among them. Measured by
// reading the To menu in ThreadComposer.tsx: the query reached `findPeople` and
// nothing else, so only the people above the search box were filtered.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { findInTo, toSections } from '../renderer/src/threads/composer-rules.ts';

const agents = [{ id: 'claude' as const, label: 'Claude Code' }, { id: 'codex' as const, label: 'Codex' }];
const mates = [
  { id: 't-g', name: 'Growth marketer', role: null },
  { id: 't-h', name: 'Head of Marketing', role: 'Owns launches and the site' },
  { id: 't-s', name: 'Security lead', role: 'Reviews auth changes' },
];
const find = (q: string) => findInTo(q, { auto: true, agents, mates });

describe('searching the To list', () => {
  it('finds an AI teammate by its whole name, in any case', () => {
    const got = find('head of marketing');
    expect(got.mates.map((t) => t.id)).toEqual(['t-h']);
    expect(find('HEAD OF').mates.map((t) => t.id)).toEqual(['t-h']);
  });

  it('finds every teammate a part of a word matches', () => {
    expect(find('market').mates.map((t) => t.id)).toEqual(['t-g', 't-h']);
  });

  it('finds an AI teammate by its role', () => {
    expect(find('auth').mates.map((t) => t.id)).toEqual(['t-s']);
  });

  it('leaves out Auto and the agents when the words are not theirs', () => {
    const got = find('head of marketing');
    expect(got.auto).toBe(false);
    expect(got.agents).toEqual([]);
    expect(got.someoneNew).toBe(false);
  });

  it('finds Auto and an agent by name', () => {
    expect(find('auto').auto).toBe(true);
    expect(find('codex').agents.map((a) => a.id)).toEqual(['codex']);
    expect(find('codex').mates).toEqual([]);
  });

  it('finds the lone Agent row on a Mac with one agent', () => {
    expect(findInTo('agent', { auto: false, agents: [], mates }).agent).toBe(true);
    expect(findInTo('maya', { auto: false, agents: [], mates }).agent).toBe(false);
  });

  it('keeps every row, Someone new included, until something is typed', () => {
    const got = find('  ');
    expect(got.auto).toBe(true);
    expect(got.agents).toEqual(agents);
    expect(got.mates).toEqual(mates);
    expect(got.someoneNew).toBe(true);
    expect(got.agent).toBe(true);
  });

  it('never offers Auto where Auto is not offered', () => {
    expect(findInTo('auto', { auto: false, agents, mates }).auto).toBe(false);
  });
});

describe('the sections a search leaves', () => {
  it('drops the agents section when no agent matches', () => {
    expect(toSections({ people: true, auto: false, agents: false, mates: true, adding: false })).toEqual(['people', 'mates']);
  });
  it('still draws the agents when nothing says otherwise', () => {
    expect(toSections({ people: true, auto: true, mates: true, adding: false })).toEqual(['people', 'auto', 'agents', 'mates']);
  });
});

describe('the To menu', () => {
  const card = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
  it('filters the rows under the people with the same search', () => {
    expect(card).toMatch(/findInTo\(query,/);
    expect(card).not.toMatch(/\(agentMates \?\? \[\]\)\.map\(/);
  });
  it('says nobody matches only when no row of any kind does', () => {
    expect(card).not.toMatch(/\{!found\.length && !invitedFound\.length && <span className="tc-none">/);
  });
});
