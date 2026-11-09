// A THREAD STARTED OR ANSWERED ON THE PHONE IS IN PROGRESS AT ONCE.
//
// What she reported (2026-10-17): on the phone site, a thread she started
// "just says waiting" and was never In progress. Measured with the site built
// from this branch: the phone's own stand-in for a new thread carried no
// `founder` label, which every thread written on the Mac carries
// (store.composeItem), so the list's rule took it for an agent's proposal and
// put it in Needs you. A reply was the same: until her Mac took it, the row
// kept no answer, so it stayed in Needs you under her own unsent words.
import { describe, it, expect } from 'vitest';
import { phoneView } from '../renderer/src/cloud-bridge.ts';
import { belongsInProgress, belongsInInbox } from '../renderer/src/list-rules.ts';

const T = Date.UTC(2026, 9, 17, 18, 0);
const P = { device: 'a1b2c3d4e5f6', project: 'p', name: 'P' };
const cmd = (over) => ({ id: '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e', device: P.device, project: 'p', item: null, kind: 'new', payload: { title: 'Fix the login', body: '' }, created_at: new Date(T).toISOString(), claimed_at: null, taken_at: null, outcome: null, ...over });
const asked = { id: 'w-aaaaaaaaaa', title: 'Make the video', kind: 'directive', labels: ['founder'], status: 'open', result: 'Here it is. Ship it?', wrote: { title: { ts: T - 9e5, source: 'founder' }, result: { ts: T - 6e5, source: 'agent' } }, createdAt: T - 9e5, updatedAt: T - 6e5 };
const thread = (item) => ({ device: P.device, project: 'p', item: item.id, snapshot: { v: 3, item, history: [] } });
const where = (i) => (belongsInProgress(i, { now: T }) ? 'progress' : belongsInInbox(i, { now: T }) ? 'inbox' : 'elsewhere');

describe('the phone, before her Mac has taken what she did', () => {
  it('puts a thread she started there In progress', () => {
    const view = phoneView({ projects: [P], threads: [], commands: [cmd()] }, T);
    expect(view.items.map(where)).toEqual(['progress']);
  });

  it('puts a thread she replied to In progress, as the window does the moment she sends', () => {
    expect(where(asked)).toBe('inbox');
    const view = phoneView({ projects: [P], threads: [thread(asked)], commands: [cmd({ item: asked.id, kind: 'reply', payload: { text: 'Yes, ship it' } })] }, T);
    expect(view.items.map(where)).toEqual(['progress']);
  });

  it('reopens a closed thread she replied to, as a reply on the Mac does', () => {
    const view = phoneView({ projects: [P], threads: [thread({ ...asked, status: 'done' })], commands: [cmd({ item: asked.id, kind: 'reply', payload: { text: 'One more thing' } })] }, T);
    expect(view.items[0].status).toBe('open');
    expect(view.items.map(where)).toEqual(['progress']);
  });

  it('leaves a thread her Mac turned down in her inbox, saying why', () => {
    const view = phoneView({ projects: [P], threads: [], commands: [cmd({ taken_at: new Date(T).toISOString(), outcome: 'refused: no such project' })] }, T + 1000);
    expect(view.items.map((i) => [i.status, where(i)])).toEqual([['blocked', 'inbox']]);
  });

  it('a reply already taken changes nothing once the Mac\'s own copy from after it says what happened', () => {
    const taken = cmd({ item: asked.id, kind: 'reply', payload: { text: 'Yes' }, taken_at: new Date(T).toISOString(), outcome: 'done' });
    const view = phoneView({ projects: [P], threads: [{ ...thread(asked), updated_at: new Date(T + 500).toISOString() }], commands: [taken] }, T + 1000);
    expect(view.items[0].answer).toBeUndefined();
    // Until that copy arrives, it is still the reply she sent.
    expect(phoneView({ projects: [P], threads: [thread(asked)], commands: [taken] }, T + 1000).items[0].answer).toBe('Yes');
  });
});
