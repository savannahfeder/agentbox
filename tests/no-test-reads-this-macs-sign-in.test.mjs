// THE SUITE SAYS THE SAME THING WHETHER OR NOT THIS MAC IS SIGNED IN.
//
// Measured 2026-10-01. Two tests passed in the morning and failed in the
// afternoon on the same commit, because between the two runs somebody had
// signed this Mac into a team:
//
//   team-signing-in-turns-the-team-on, "is configured but signed out, and
//   writes plain lines". Its premise is "before anyone signs in", and it
//   asserts a line written into a fresh mkdtempSync directory carries no "by".
//   It came back {"id":"w-...","ts":...,"source":"agent","patch":{...},
//   "by":"<a real person id>","uid":"..."}, because createWorkItem stamps the
//   author from process.env.AGENTBOX_PERSON_ID and the test process had
//   inherited the signed-in one.
//
//   a-codex-worker-can-write-to-her-store-or-it-does-not-run, "names the store
//   server, its command, and the four things it needs to find her store":
//   failed on the same variable, as a FIFTH entry in an env asserted to hold
//   exactly four.
//
// The hour is not the variable and neither test is really flaky: a session the
// APP spawns inherits the signed-in person from main, so both were red for every
// agent in the fleet and green whenever a person ran the suite in their own
// terminal. Checked by printing the env inside a worker session on a signed-in
// Mac: it was set.
//
// The production code is right and is not what changed. A line's author is a
// property of WHO IS RUNNING the process, not of the directory handed to the
// call, and a Mac has one person signed in; pulling a teammate's lines down is
// the one case where that is not true, and appendForeignLines already bypasses
// the stamper to keep each line's own "by". What was wrong is that the suite
// read real machine state, the same family of leak as the real app home and the
// clock zone that tests/agentbox-home.setup.mjs already pins.
//
// Both of those two tests now also clear the variable in their own beforeEach.
// This file is here for the rule rather than the two cases: the strip lives in
// the setup file every test loads, so a test written later inherits a
// signed-out Mac instead of rediscovering this. Nothing but this file would
// notice if that line were dropped.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';

describe('a suite running on a Mac somebody is signed into', () => {
  // The reported case at its source: whatever this Mac's sign-in is, the test
  // process does not carry it. Run the suite with AGENTBOX_PERSON_ID set and
  // this must still pass, which is the whole point of the guard.
  it('does not inherit the signed-in person', () => {
    expect('AGENTBOX_PERSON_ID' in process.env).toBe(false);
  });

  // The boundary on the store side: the assertion that actually went red.
  it('writes plain, unstamped lines into a store it was handed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unstamped-'));
    disk.createWorkItem(dir, { title: 'x' });
    expect(fs.readFileSync(disk._internals.ledgerPath(dir), 'utf8')).not.toContain('"by"');
  });

  // The boundary on the supervisor side: the other test that went red, which
  // failed on the env handed down to a worker's store server rather than on a
  // line in a ledger.
  it('hands a worker store server no person', async () => {
    const { Supervisor } = await import('../main/supervisor.mjs');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'no-person-mcp-'));
    const sup = new Supervisor({ storeRoot: tmp, storeMcpCommand: '/bin/echo' }, { listItems: () => [], listProducts: () => [] }, tmp);
    for (const server of Object.values(sup.mcpServers() ?? {})) {
      expect('AGENTBOX_PERSON_ID' in (server.env ?? {})).toBe(false);
    }
  });

  // THE CASE THAT MUST NOT MATCH, and the one worth keeping. The guard removes
  // an INHERITED person; it does not switch stamping off. A test that sets the
  // variable itself still gets its lines stamped, which is what
  // team-every-line-carries-its-writer and the sign-in tests depend on.
  it('still stamps for a test that sets the person itself', () => {
    process.env.AGENTBOX_PERSON_ID = 'p-set-by-this-test';
    try {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamped-'));
      const item = disk.createWorkItem(dir, { title: 'x' });
      expect(disk.readWorkItem(dir, item.id).createdBy).toBe('p-set-by-this-test');
    } finally {
      delete process.env.AGENTBOX_PERSON_ID;
    }
  });
});
