// NEEDS YOU IS ONE LIST BY PRIORITY, AND GROUPING BY WHO IS A QUIET CHOICE (2026-10-30).
//
// The owner on the three-part home: "An inbox is very simple cognitively. You
// basically just organize things based on priority." Measured on the built app:
// a person's Medium row sat above an agent's Urgent row, because the list was
// cut into From people, From AI teammates and From your agents. It is one list
// now. Group by Who under View and filters gives two groups, People and Agents,
// and an AI teammate is an agent there.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { DEFAULT_DISPLAY, sorted } from '../renderer/src/threads/page-rules.ts';
import { needsByWho, readNeedsGroup, whoIsWaiting, writeNeedsGroup } from '../renderer/src/threads/stack-rules.ts';

const DIRECT = new Set(['direct-1']);
const LEVEL = { urgent: 9, high: 7, medium: 5, low: 2 };
const agent = (id, level, over = {}) => ({ id, priority: LEVEL[level], updatedAt: 500, product: 'app', ...over });
const person = (id, level, over = {}) => ({ id, priority: LEVEL[level], updatedAt: 100, product: 'app', assignee: 'p-me', createdBy: 'p-dev', ...over });
const mate = (id, level, over = {}) => agent(id, level, { labels: ['teammate:t-1'], ...over });
const ordered = (rows) => sorted(rows, DEFAULT_DISPLAY.inbox, 'inbox', [], DIRECT);
const ids = (rows) => rows.map((r) => r.id);
const whoOf = (i) => whoIsWaiting(i, { me: 'p-me', isMate: (r) => !!r.labels?.length, isDirect: (r) => DIRECT.has(r.product) });

describe('one list by priority', () => {
  it('puts a person\'s Medium row after an agent\'s Urgent row', () => {
    expect(ids(ordered([person('p', 'medium'), agent('a', 'urgent')]))).toEqual(['a', 'p']);
  });

  it('puts a person\'s Urgent row before an agent\'s Medium row', () => {
    expect(ids(ordered([agent('a', 'medium'), person('p', 'urgent')]))).toEqual(['p', 'a']);
  });

  it('keeps a person first at the same level', () => {
    expect(ids(ordered([agent('a', 'high'), person('p', 'high')]))).toEqual(['p', 'a']);
  });

  it('never lifts an AI teammate over your agents for being one', () => {
    expect(ids(ordered([agent('a', 'urgent'), mate('m', 'low')]))).toEqual(['a', 'm']);
    expect(ids(ordered([agent('a', 'low'), mate('m', 'urgent')]))).toEqual(['m', 'a']);
  });

  it('is what the home draws unless someone chose to group', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/needsGroup !== 'who'/);
  });
});

describe('the Group by choice', () => {
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

  it('is None until someone picks Who, and is remembered', () => {
    const s = store();
    expect(readNeedsGroup(s)).toBe('none');
    writeNeedsGroup('who', s);
    expect(readNeedsGroup(s)).toBe('who');
    writeNeedsGroup('none', s);
    expect(readNeedsGroup(s)).toBe('none');
  });

  it('reads None from anything it does not know', () => {
    expect(readNeedsGroup({ getItem: () => 'project', setItem() {} })).toBe('none');
    expect(readNeedsGroup({ getItem: () => { throw new Error('no storage'); }, setItem() {} })).toBe('none');
  });

  it('is offered under View and filters with exactly None and Who', () => {
    const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(pages).toContain('>Group by<');
    expect(pages).toMatch(/onGroup\('none'\)\}>None</);
    expect(pages).toMatch(/onGroup\('who'\)\}>Who</);
  });
});

describe('grouped by who', () => {
  const rows = ordered([person('p-med', 'medium'), agent('a-urg', 'urgent'), mate('m-hi', 'high'), person('p-urg', 'urgent'), agent('a-low', 'low')]);

  it('has two groups, People and Agents', () => {
    const s = needsByWho(rows, whoOf);
    expect(s.sections.map((x) => [x.key, x.label, x.count])).toEqual([['people', 'People', 2], ['agents', 'Agents', 3]]);
  });

  it('holds AI teammates and your agents in Agents, never in a group of their own', () => {
    const s = needsByWho(rows, whoOf);
    expect(s.sectionOf(mate('x', 'low'))).toBe('agents');
    expect(s.sections.some((x) => /teammate/i.test(x.label))).toBe(false);
  });

  it('does not change the order within a group', () => {
    const s = needsByWho(rows, whoOf);
    expect(ids(s.rows)).toEqual(['p-urg', 'p-med', 'a-urg', 'm-hi', 'a-low']);
  });

  it('calls a run an AI teammate stopped an agent, whoever filed it', () => {
    expect(whoOf(mate('m', 'high', { createdBy: 'p-dev' }))).toBe('agents');
  });

  it('calls a task from a person and a direct message people, and your own threads agents', () => {
    expect(whoOf(person('p', 'high'))).toBe('people');
    expect(whoOf(agent('d', 'high', { product: 'direct-1' }))).toBe('people');
    expect(whoOf(agent('a', 'high', { createdBy: 'p-me' }))).toBe('agents');
  });
});
