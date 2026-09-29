// A GREEN LIGHT OVER A MESSAGE THAT WENT NOWHERE.
//
// MEASURED 2026-08-17, against a real Claude Code session (2.1.234) started
// with `--permission-mode bypassPermissions`. Agentbox's own `reply` was called
// with "Write the single word ok into the file …" and returned:
//
//   {"ok":true,"delivered":true,"working":true,…}
//
// The session's transcript for the same second said:
//
//   {"type":"system","level":"warning","content":"Held peer message — from an
//    unidentified session [verified pid 77704]; preview: «Write the single word
//    ok…» — not delivered to Claude (1 held). The sender did not attest its
//    permission mode and this session bypasses prompts."}
//
// The agent never saw it. The file was never written. `working:true` was true
// of the process and false of the point: the CPU it burned was the session
// drawing that warning.
//
// Claude Code holds an incoming socket message when the session bypasses
// permission prompts and the sender did not attest a matching permission mode,
// which Agentbox cannot do. Agentbox cannot stop the hold. It can refuse to call it
// a delivery, which is the whole of this file: the system swallowing something
// a person said is the failure this codebase cares about most.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fromTheApp } from '../main/agents.mjs';
import { NAME } from '../shared/product-name.mjs';

let home;
let dir;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-held-'));
  dir = path.join(home, '.claude', 'projects', '-tmp-probe');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(home, '.claude', 'sessions'), { recursive: true });
});
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

const MESSAGE = 'Write the single word ok into the file /tmp/proof.txt, then say DID IT.';

const HOLD = JSON.stringify({
  type: 'system',
  subtype: 'informational',
  level: 'warning',
  content: `Held peer message — from an unidentified session [verified pid 77704]; preview: «${MESSAGE}» — not delivered to Claude (1 held). The sender did not attest its permission mode and this session bypasses prompts.`,
  timestamp: '2026-08-18T02:49:48.224Z',
});

// The reader is exercised through the module's own export, with HOME pointed at
// a temporary tree, which is how every other reader test in here drives it.
async function readerWithHome(fn) {
  const before = process.env.HOME;
  process.env.HOME = home;
  try { return await fn(); } finally { process.env.HOME = before; }
}

describe('a message the session held is not a message it got', () => {
  it('the hold in the transcript is found and said in her words', async () => {
    const file = path.join(dir, 'sess.jsonl');
    fs.writeFileSync(file, '');
    const sizeBefore = fs.statSync(file).size;
    fs.appendFileSync(file, `${HOLD}\n`);

    const { __heldNotice } = await readerWithHome(() => import('../main/agents.mjs'));
    const said = __heldNotice({ name: 'session-67', transcript: file }, sizeBefore, MESSAGE);
    expect(said).toBe('session-67 held your message for approval in its own window, so it has not read it yet.');
  });

  it('a hold from BEFORE this message is not this message being held', async () => {
    // The watermark is the point: a session that held something an hour ago and
    // took this one must not be reported as swallowing it.
    const file = path.join(dir, 'sess.jsonl');
    fs.writeFileSync(file, `${HOLD}\n`);
    const sizeBefore = fs.statSync(file).size;
    fs.appendFileSync(file, `${JSON.stringify({ type: 'user', isMeta: true, message: { role: 'user', content: MESSAGE } })}\n`);

    const { __heldNotice } = await readerWithHome(() => import('../main/agents.mjs'));
    expect(__heldNotice({ name: 'session-67', transcript: file }, sizeBefore, MESSAGE)).toBe(null);
  });

  it('a hold about somebody ELSE\'s message is not hers', async () => {
    const file = path.join(dir, 'sess.jsonl');
    fs.writeFileSync(file, '');
    const sizeBefore = fs.statSync(file).size;
    fs.appendFileSync(file, `${HOLD.replace(MESSAGE, 'some other session asking about the build')}\n`);

    const { __heldNotice } = await readerWithHome(() => import('../main/agents.mjs'));
    expect(__heldNotice({ name: 'session-67', transcript: file }, sizeBefore, MESSAGE)).toBe(null);
  });

  it('a session with no transcript is not claimed to be holding anything', async () => {
    // BEST EFFORT IN ONE DIRECTION ONLY. A hold that is not found is not a
    // promise there was none, and this must not start inventing one.
    const { __heldNotice } = await readerWithHome(() => import('../main/agents.mjs'));
    expect(__heldNotice({ name: 'session-67' }, 0, MESSAGE)).toBe(null);
  });

  it('an ordinary delivery leaves nothing to find', async () => {
    const file = path.join(dir, 'sess.jsonl');
    fs.writeFileSync(file, '');
    const sizeBefore = fs.statSync(file).size;
    fs.appendFileSync(file, `${JSON.stringify({
      type: 'user',
      isMeta: true,
      timestamp: '2026-08-18T02:51:40.196Z',
      message: { role: 'user', content: `Another Claude session sent a message:\n${MESSAGE}` },
    })}\n`);

    const { __heldNotice } = await readerWithHome(() => import('../main/agents.mjs'));
    expect(__heldNotice({ name: 'session-67', transcript: file }, sizeBefore, MESSAGE)).toBe(null);
  });
});


// WHO IS ASKING.
describe(`what ${NAME} puts on the wire says who is asking`, () => {
  it('carries her message through untouched, at the end where it is read last', () => {
    const out = fromTheApp("what's the status on this?");
    expect(out.endsWith("They said:\nwhat's the status on this?")).toBe(true);
  });

  it('gives "this" the referent the session was missing', () => {
    expect(fromTheApp('x')).toContain("THIS session's own work");
    expect(fromTheApp('x')).toContain('do not go looking for other sessions');
  });

  // IT MUST NOT TALK OVER THE WRAPPER. Claude Code's own text forbids treating a
  // peer message as the user's approval and calls working around that permission
  // laundering. Agentbox says where the message came from; it never claims her
  // authority, and a change here that does is a change that gets refused.
  it('never claims to be her approval', () => {
    const out = fromTheApp('x').toLowerCase();
    expect(out).not.toContain('approve');
    expect(out).not.toContain('permission');
    expect(out).not.toContain('your user typed');
  });
});
