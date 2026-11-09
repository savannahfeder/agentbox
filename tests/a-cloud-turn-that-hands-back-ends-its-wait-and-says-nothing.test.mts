// A CLOUD TURN THAT HANDS ITS THREAD BACK ENDS ITS WAIT AND SAYS NOTHING ON THE ROW.
//
// Reported 2026-11-08: the App Store thread showed the raw line
// "AGENTBOX-NEEDS-THE-COMPUTER: your Mac's Keychain, ..." as its answer, and the
// person's "go ahead" went back to the same cloud machine, twice. Since cloud
// sessions wait for the next reply (4a3595c0), `_turnOver` wrote each turn's
// answer onto the row at once, but only the run's real end looked for the
// hand-back line (`_noteCloudHandBack`). So the line reached the screen, and the
// open session took the reply instead of the thread moving to the Mac.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { attachClaudeInput } from '../main/claude-input.mts';
import { Supervisor, WAIT_FOR_NEXT_REPLY_MS } from '../main/supervisor.mts';
import { Name } from '../shared/product-name.mjs';

function fakeChild() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.frames = [];
  c.stdin = { writable: true, write: (s) => { c.frames.push(JSON.parse(s)); return true; }, end: () => { c.stdin.writable = false; }, on: () => {} };
  return c;
}
const say = (c, text) => c.stdout.emit('data', `${JSON.stringify({ type: 'result', result: text })}\n`);

let tmp;
afterEach(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); tmp = null; });

function turnEndingOn(text) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-back-turn-'));
  const row = { id: 'w-app', product: 'p', status: 'claimed', epoch: 3, labels: ['founder'], title: 'App Store approval', wrote: {} };
  const written = [];
  const store = {
    listItems: () => [row],
    listProducts: () => [{ slug: 'p', name: Name, dir: path.join(tmp, 'p') }],
    isDue: () => true,
    readItem: () => row,
    recordSessionResult: (slug, id, patch) => { written.push(patch); row.result = patch.result; },
    releaseRunClaim: () => {},
    settleAnswer: () => {},
  };
  const sup = new Supervisor({ storeRoot: tmp, authProfiles: ['default'], home: tmp }, store, tmp);
  sup._saveState = () => {};
  sup.storeMcpCommand = () => '/bin/agentbox-mcp.sh';
  const child = attachClaudeInput(fakeChild());
  child.waitAfterTurns(WAIT_FOR_NEXT_REPLY_MS);
  const session = {
    child, itemId: row.id, product: 'p', startedAt: Date.now() - 60_000, tail: [], cloud: true, engine: 'claude',
    ranOn: { model: null, effort: null }, result: text,
  };
  sup.sessions.set(row.id, session);
  say(child, text);
  sup._turnOver(row, session, { continuation: false, answerAtSpawn: null });
  return { session, written };
}

describe('a cloud turn that ends on the hand-back line', () => {
  it('as its only line: nothing goes on the row and the session stops waiting, so its end moves the thread', () => {
    const { session, written } = turnEndingOn("AGENTBOX-NEEDS-THE-COMPUTER: your Mac's Keychain, to read the demo account's password");
    expect(written).toEqual([]);
    expect(session.between).toBeFalsy();
    expect(session.child.stdin.writable).toBe(false);
  });

  it('after other words, indented: the same', () => {
    const { session, written } = turnEndingOn('I could not read it from here.\n  AGENTBOX-NEEDS-THE-COMPUTER: Xcode');
    expect(written).toEqual([]);
    expect(session.child.stdin.writable).toBe(false);
  });

  it('a turn that only names the line mid-sentence is an ordinary answer and still waits', () => {
    const text = 'The app moves a thread when a run ends on AGENTBOX-NEEDS-THE-COMPUTER: and this one did not.';
    const { session, written } = turnEndingOn(text);
    expect(written).toEqual([{ result: text, status: null }]);
    expect(session.between).toBe(true);
    expect(session.child.stdin.writable).toBe(true);
  });
});
