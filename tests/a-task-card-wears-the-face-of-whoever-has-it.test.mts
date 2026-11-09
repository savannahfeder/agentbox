// A TASK CARD WEARS THE FACE OF WHOEVER HAS IT.
//
// On the team's board a tester looked for "every open task and who has each
// one". The task Maya gave Dev, "Review the slot lock fix and merge it", read
// WITH DEV and carried Maya's face, because every row from Maya's own store was
// drawn as hers. Measured on teamEntries: the entry's ownerId was `me` for a
// task given to someone else.
import { describe, it, expect } from 'vitest';
import { teamEntries } from '../renderer/src/threads/page-rules.ts';

const MAYA = 'p-maya';
const DEV = 'p-dev';
const nameOf = (id) => ({ [MAYA]: 'Maya', [DEV]: 'Dev' })[id] ?? 'Someone';
const product = { slug: 'direct-md', name: 'Maya and Dev', team: { projectId: 'pr', direct: true, people: [MAYA, DEV] } };
const task = (over = {}) => ({
  id: 't1', product: product.slug, title: 'Review the slot lock fix', labels: ['given-task'], kind: 'directive',
  assignee: DEV, people: [MAYA, DEV], createdBy: MAYA, status: 'open', priority: 0, createdAt: 50, updatedAt: 120,
  wrote: { body: { by: MAYA, ts: 50 } }, ...over,
});
const entry = (item, me) => teamEntries({ items: [item], products: [product], cards: [], me, now: 200, stateOf: () => 'running', allMine: true, nameOf })[0];

describe('a task on the board', () => {
  it('given by Maya to Dev, wears Dev’s face on Maya’s board', () => {
    expect(entry(task(), MAYA).ownerId).toBe(DEV);
  });
  it('given to Maya, wears hers', () => {
    expect(entry(task({ assignee: MAYA, createdBy: DEV, wrote: { body: { by: DEV, ts: 50 } } }), MAYA).ownerId).toBe(MAYA);
  });
  it('handed to an agent, stays with whoever handed it', () => {
    expect(entry(task({ assignee: 'agent' }), MAYA).ownerId).toBe(MAYA);
  });
});
