// CONTINUING A TEAMMATE'S THREAD STARTS IN ITS PROJECT.
//
// Found by the team test on w-1fc102959f (2026-11-09), three times by two
// testers: Maya pressed Continue it yourself on Theo's Payments API thread and
// the new thread opened with the context and both files carried over, but in
// Web app, the project her last task used. Lena's continuation of a Web app
// thread offered Payments API the same way. The box started with no project of
// its own, so it fell back to whatever was last used.
//
// Pinned: the box starts in the project the teammate's thread is in, the copy
// shared with the team first when two of yours share its name, and on the
// usual default when you have no project of that name.
import { describe, it, expect } from 'vitest';
import { continueStart } from '../renderer/src/threads/continue-thread.ts';

const brief = { title: 'Refund webhook', body: 'Carry on', files: [], from: { personId: 'theo', threadId: 'w-1' } };
const shared = { projectId: 'p1', teamId: 't1', visibility: 'team', people: [], sharedBy: 'maya' };
const projects = [
  { slug: 'web-app', name: 'Web app' },
  { slug: 'payments-api', name: 'Payments API' },
  { slug: 'payments-api-2', name: 'Payments API', team: shared },
];

describe('Continue it yourself', () => {
  it("starts in the teammate thread's project", () => {
    expect(continueStart(brief, { project: 'Web app' }, projects).product).toBe('web-app');
  });

  it('takes the copy shared with the team when two have its name', () => {
    expect(continueStart(brief, { project: 'Payments API' }, projects).product).toBe('payments-api-2');
  });

  it('leaves the project to the usual default when you have none of that name', () => {
    expect(continueStart(brief, { project: 'Mobile app' }, projects).product).toBeNull();
    expect(continueStart(brief, { project: null }, projects).product).toBeNull();
  });

  it('still carries the words, the files and where it came from', () => {
    const start = continueStart({ ...brief, files: [{ name: 'a.png', srcPath: '/x/a.png' }] }, { project: 'Web app' }, projects);
    expect(start.body).toBe('Carry on\n\n');
    expect(start.attachments).toEqual([{ name: 'a.png', srcPath: '/x/a.png', image: true }]);
    expect(start.continueFrom).toEqual({ personId: 'theo', threadId: 'w-1' });
  });
});
