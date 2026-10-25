// AN ENDING RUN THAT WAS NEVER IN THE CLOUD TOUCHES NO CLOUD MEMORY (w-05522a0a20, 2026-10-21).
//
// This is what turned main red on GitHub at 99de7ab and kept it red, with
// nothing in either machine's log naming a failing test.
//
// `_forgetCloudStartThatLeftNothing` is on the end of every run, cloud or not,
// and it read `this._liveSessions[item.id]` before asking whether the session
// was a cloud start at all. A supervisor that never loaded its state has no
// `_liveSessions`, so an ordinary exit threw TypeError out of a child's exit
// handler, after the test that started the run had already passed.
//
// Vitest counts that as an unhandled error and exits 1 with every test green.
// Measured on 2026-10-21: `npx vitest run tests/what-one-reply-may-do.test.mjs`
// printed "35 passed" and "1 error" and exited 1. That is the whole shape of
// the red: a full-length run, no FAIL anywhere, and a cross on main.
//
// The cases either side are pinned too, because the throw is not the only way
// to get this wrong: a cloud start that left nothing behind must still be
// forgotten, and one that said its id, or whose work is still in the cloud,
// must still be kept.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { writeMarker } from '../main/cloud/marker.mjs';

/** The bare stand-in the suite builds when it wants one method, and no state. */
const noStateYet = (over = {}) => Object.assign(Object.create(Supervisor.prototype), {
  _saveState() { this.saved = (this.saved ?? 0) + 1; },
  _cloudPlace: (cwd) => cwd,
}, over);

const item = { id: 'w-1', product: 'acme' };
const ranOnThisMac = { cloud: false, cwd: '/nowhere', startedAt: 1000 };
const cloudStart = { cloud: true, cwd: '/nowhere', startedAt: 1000 };

describe('an exit on a supervisor that never loaded its state', () => {
  it('raises nothing when the run was never in the cloud', () => {
    const sup = noStateYet();
    expect(() => sup._forgetCloudStartThatLeftNothing(item, ranOnThisMac)).not.toThrow();
    expect(sup.saved).toBeUndefined();
  });

  it('raises nothing when the run WAS in the cloud and nothing is remembered', () => {
    const sup = noStateYet();
    expect(() => sup._forgetCloudStartThatLeftNothing(item, cloudStart)).not.toThrow();
    expect(sup.saved).toBeUndefined();
  });

  it('raises nothing when there is no session at all', () => {
    const sup = noStateYet();
    expect(() => sup._forgetCloudStartThatLeftNothing(item, null)).not.toThrow();
  });
});

describe('and what it still does with a cloud start it remembers', () => {
  const remembering = (rec) => noStateYet({ _liveSessions: { 'w-1': rec } });

  it('forgets a start that never said its id and left nothing in the cloud', () => {
    const sup = remembering({ cloud: true, sessionId: null, startedAt: 1000 });
    sup._forgetCloudStartThatLeftNothing(item, cloudStart);
    expect(sup._liveSessions['w-1']).toBeUndefined();
    expect(sup.saved).toBe(1);
  });

  it('keeps one whose work is still waiting in the cloud', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ending-cloud-'));
    try {
      fs.mkdirSync(path.join(folder, '.git'), { recursive: true });
      fs.writeFileSync(path.join(folder, '.git', 'HEAD'), 'ref: refs/heads/main\n');
      writeMarker(folder, { runId: 'r-1' });
      const sup = remembering({ cloud: true, sessionId: null, startedAt: 1000 });
      sup._forgetCloudStartThatLeftNothing(item, { ...cloudStart, cwd: folder });
      expect(sup._liveSessions['w-1']).toBeTruthy();
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('keeps one that said its id, and one from an earlier start', () => {
    const said = remembering({ cloud: true, sessionId: 's-1', startedAt: 1000 });
    said._forgetCloudStartThatLeftNothing(item, cloudStart);
    expect(said._liveSessions['w-1']).toBeTruthy();

    const older = remembering({ cloud: true, sessionId: null, startedAt: 999 });
    older._forgetCloudStartThatLeftNothing(item, cloudStart);
    expect(older._liveSessions['w-1']).toBeTruthy();
  });

  it('keeps one whose run already had its id remembered', () => {
    const sup = remembering({ cloud: true, sessionId: null, startedAt: 1000 });
    sup._forgetCloudStartThatLeftNothing(item, { ...cloudStart, idRemembered: true });
    expect(sup._liveSessions['w-1']).toBeTruthy();
  });
});
