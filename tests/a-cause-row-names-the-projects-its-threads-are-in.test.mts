// A CAUSE ROW NAMES THE PROJECTS ITS THREADS ARE IN (w-0985093d1d).
//
// A tester's Needs you showed "Write access to repository Git metadata, 2
// waiting" under the project ALL PROJECTS, and they could not tell which
// project it was about. A cause row said "All projects" whenever its own
// project and its threads' projects made more than one, so a cause whose
// opener had moved on said it even when every thread waiting was in one
// project. It now names the project most of its threads are in, and "+1" for
// each other project.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { causePlace, causeWhere, CAUSE_KIND, CAUSE_LABEL } from '../shared/causes.mts';

const names: Record<string, string> = { agentbox: 'Agentbox', vowels: 'Vowel Count JS', site: 'Website' };
const nameOf = (slug: string) => names[slug] ?? slug;
const cause = { id: 'c1', product: 'agentbox', kind: CAUSE_KIND, labels: ['founder', CAUSE_LABEL], status: 'blocked' };
const stuck = (id: string, product: string) => ({ id, product, status: 'blocked', blockedBy: ['c1'] });

describe('the Project column of a cause row', () => {
  it('names its own project when nothing waits on it yet', () => {
    expect(causeWhere(cause, [], nameOf)).toBe('Agentbox');
  });

  it('names its own project when every thread waiting is in it', () => {
    expect(causeWhere(cause, [stuck('a', 'agentbox'), stuck('b', 'agentbox')], nameOf)).toBe('Agentbox');
  });

  it('names the threads\' project, not "All projects", when they are all in one other project', () => {
    expect(causeWhere(cause, [stuck('a', 'vowels'), stuck('b', 'vowels')], nameOf)).toBe('Vowel Count JS');
  });

  it('names the project most of them are in, and counts the rest', () => {
    expect(causeWhere(cause, [stuck('a', 'site'), stuck('b', 'vowels'), stuck('c', 'vowels')], nameOf)).toBe('Vowel Count JS +1');
    expect(causeWhere(cause, [stuck('a', 'site'), stuck('b', 'vowels'), stuck('c', 'agentbox')], nameOf)).toBe('Agentbox +2');
  });

  it('on a tie, its own project goes first, then the first thread\'s', () => {
    expect(causeWhere(cause, [stuck('a', 'vowels'), stuck('b', 'agentbox')], nameOf)).toBe('Agentbox +1');
    expect(causeWhere(cause, [stuck('a', 'site'), stuck('b', 'vowels')], nameOf)).toBe('Website +1');
  });

  it('never says All projects', () => {
    expect(fs.readFileSync(new URL('../shared/causes.mts', import.meta.url), 'utf8')).not.toMatch(/All projects/);
  });

  it('keeps the count apart from the name, so a long name can be cut without losing it', () => {
    expect(causePlace(cause, [stuck('a', 'vowels'), stuck('b', 'site')], nameOf)).toEqual({ name: 'Vowel Count JS', more: 1 });
    const page = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/causePlace\(item, behind, nameOfProduct\)/);
  });
});
