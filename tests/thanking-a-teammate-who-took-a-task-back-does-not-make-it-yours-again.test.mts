// THANKING A TEAMMATE WHO TOOK A TASK BACK DOES NOT MAKE IT YOURS AGAIN.
//
// In the 2026-11-27 collaboration test Priya gave Sam a task, then took it back
// (closed it) when he could not open its project. Sam replied "Thanks, I saw
// you took it back", and the task came back as his: In progress, "You have
// this", and under his Working on in the standup. Measured from his copy's
// ledger: Priya's status done at 17:22:58, then Sam's reply wrote status open
// at 17:27:45, because a reply reopens a done row so a worker can carry it
// (`statusForReply`). No worker runs on a task between two people.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { statusForReply, taskClosedByOther } from '../renderer/src/list-rules.ts';

const SAM = 'ee53e592';
const PRIYA = '89c57ee1';
const task = (closedBy: string, status = 'done') => ({
  id: 'w-1', status, labels: ['given-task'], assignee: SAM,
  wrote: { status: { ts: 1, source: 'founder', by: closedBy } },
});

describe('a task between two people', () => {
  it('closed by the giver stays closed when you reply to it', () => {
    expect(taskClosedByOther(task(PRIYA) as never, SAM)).toBe(true);
    expect(statusForReply('done', taskClosedByOther(task(PRIYA) as never, SAM))).toBeUndefined();
  });
  it('closed by you is reopened by your reply, as before', () => {
    expect(taskClosedByOther(task(SAM) as never, SAM)).toBe(false);
    expect(statusForReply('done', taskClosedByOther(task(SAM) as never, SAM))).toBe('open');
  });
  it('still open is left as it is', () => {
    expect(taskClosedByOther(task(PRIYA, 'open') as never, SAM)).toBe(false);
  });
});

describe('what stays as it was', () => {
  it('an agent thread closed by its agent is reopened by your reply', () => {
    const thread = { id: 'w-2', status: 'done', labels: ['founder'], wrote: { status: { ts: 1, source: 'agent', by: 'someone-else' } } };
    expect(taskClosedByOther(thread as never, SAM)).toBe(false);
    expect(statusForReply('done')).toBe('open');
    expect(statusForReply('blocked')).toBe('open');
  });
  it('with no one signed in nothing is read as closed by someone else', () => {
    expect(taskClosedByOther(task(PRIYA) as never, null)).toBe(false);
  });
});

describe('both ways of replying read it', () => {
  it('a typed reply and a picked option pass who closed it', () => {
    const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');
    expect(app.match(/statusForReply\(item\.status, taskClosedByOther\(item, snap\?\.team\?\.me\?\.id \?\? null\)\)/g)?.length).toBe(2);
  });
});
