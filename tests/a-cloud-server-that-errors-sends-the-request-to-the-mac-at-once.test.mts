// A CLOUD SERVER THAT ERRORS SENDS THE REQUEST TO THE MAC AT ONCE.
//
// 2026-11-06: the cloud server answered 502 to every call (its bundle could not
// start in Lambda). Each thread placed in the cloud died two seconds in with
// "agentbox cloud: stopped: the cloud server said 502: no reason", exit 75.
// The thread then read "Claude Code was cut off in the middle" and waited about
// 15 minutes to try the cloud again, three times over, before it ran here.
// Thirteen threads hit it in one day (sessions/*.log naming "said 502").
// Trying that thread's start again cannot mend the server, so its request now
// runs on this Mac straight away. Other start failures keep the three-in-a-row
// rule (tests/a-folder-the-cloud-cannot-take-runs-on-the-mac-instead-of-looping).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IMPORT_FAILED } from '../main/cloud/run.mts';
import { Supervisor } from '../main/supervisor.mts';

function supervisor() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-server-error-'));
  return new Supervisor({ storeRoot: root, home: root, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true }, root, root, root);
}
const said = (line) => [`stderr: agentbox cloud: ${line}`];
const cloudSession = (id, tail, extra = {}) => ({ cloud: true, itemId: id, tail, sessionId: null, result: null, ...extra });
const onMac = (s, id) => !s._mayRunInCloud({ id }, { slug: 'p', repoPath: '/r' }, `/r/.claude/worktrees/${id}`);

describe('a cloud start the cloud server itself turned down', () => {
  it.each(['502: no reason', '503: the cloud did not answer', '500: Internal Server Error'])('runs the request here after the first one (%s)', (why) => {
    const s = supervisor();
    const session = cloudSession('w-1', said(`stopped: the cloud server said ${why}`));
    expect(s._cloudKeptOnMac({ id: 'w-1' }, session, IMPORT_FAILED)).toBe(true);
    expect(session.handedBack).toBe(true);
    expect(onMac(s, 'w-1')).toBe(true);
  });

  it('does not for a start that failed some other way: that keeps the three-in-a-row rule', () => {
    const s = supervisor();
    const session = cloudSession('w-2', said('could not pack the folder: write-tree failed'));
    expect(s._cloudKeptOnMac({ id: 'w-2' }, session, IMPORT_FAILED)).toBe(false);
    expect(onMac(s, 'w-2')).toBe(false);
  });

  it('does not for a server that said no for a reason of its own, such as a sign-in', () => {
    const s = supervisor();
    expect(s._cloudKeptOnMac({ id: 'w-3' }, cloudSession('w-3', said('stopped: the cloud server said 401: sign in again')), IMPORT_FAILED)).toBe(false);
  });

  it('does not once the agent had started, or when we stopped it', () => {
    const s = supervisor();
    const late = said('could not save the run\'s commits: the cloud server said 502: no reason');
    expect(s._cloudKeptOnMac({ id: 'w-4' }, cloudSession('w-4', late, { sessionId: 'abc' }), IMPORT_FAILED)).toBe(false);
    expect(s._cloudKeptOnMac({ id: 'w-5' }, cloudSession('w-5', said('stopped: the cloud server said 502: no reason'), { stoppedByUs: true }), IMPORT_FAILED)).toBe(false);
  });
});
