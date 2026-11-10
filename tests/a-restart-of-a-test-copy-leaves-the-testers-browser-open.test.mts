// A RESTART OF A TEST COPY LEAVES THE TESTER'S BROWSER OPEN.
//
// What broke (w-811757c0b5, 2026-10-20): the first power test restarted both
// copies halfway, as an update would, and both testers lost the app for 11
// to 12 minutes. `live.mjs restart` killed every process whose command line
// named the instance folder, and the testers' headless Chrome keeps its
// profile there, so the restart took the browser with the app. Every
// command after that failed with "unsettled top-level await". The testers
// logged it as the app vanishing; it was the tooling.
//
// A restart is the app's, so it stops the app and its strays and leaves the
// browser; taking the copy down stops everything.
import { describe, it, expect } from 'vitest';
import { straysToStop } from '../.claude/skills/verify-agentbox/scripts/live.mjs';

const I = '/tmp/agentbox-verify/instances/abc-power-founder';
const table = [
  { pid: 10, command: `node bin/agentbox.mjs --dir ${I}/data` },
  { pid: 11, command: `node ${I}/bin/stub-claude-worker.mjs -p` },
  { pid: 12, command: `/opt/chrome --headless=new --user-data-dir=${I}/chrome-profile about:blank` },
  { pid: 13, command: `/opt/chrome --type=renderer --user-data-dir=${I}/chrome-profile` },
  { pid: 14, command: `node stub-codex-server.mjs ${I} 41234 --setup` },
  { pid: 15, command: `node stub-codex-server.mjs ${I}` },
  { pid: 20, command: 'node bin/agentbox.mjs --dir /tmp/agentbox-verify/instances/abc-power-cto/data' },
  { pid: 99, command: `node live.mjs restart ${I}` },
];

describe('what stopping a test copy stops', () => {
  it('on a restart: the app, its workers and the Codex stand-in, not the browser', () => {
    expect(straysToStop(table, I, { keepBrowser: true, self: 99 })).toEqual([10, 11, 14, 15]);
  });

  it('on taking it down: the browser too', () => {
    expect(straysToStop(table, I, { self: 99 })).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it('never another copy, and never the process doing the stopping', () => {
    const pids = straysToStop(table, I, { self: 99 });
    expect(pids).not.toContain(20);
    expect(pids).not.toContain(99);
  });

  // Found the same day: an agent's shell whose command line named the folder
  // was killed by the `down` it had just run.
  it('never the shell that ran it, though its command line names the folder', () => {
    const withShell = [...table, { pid: 98, command: `bash -c P=$(cat ${I}/instance.json); node live.mjs down` }];
    expect(straysToStop(withShell, I, { self: [99, 98] })).not.toContain(98);
  });

  // The plain copy's folder (…/abc) is a prefix of every named one (…/abc-power-founder).
  it('taking the plain copy down leaves the named copies a power test is running', () => {
    expect(straysToStop(table, '/tmp/agentbox-verify/instances/abc', {})).toEqual([]);
  });
});
