// SIX OF THE TEN THINGS CODEX CAN ASK US GOT A BARE ERROR FRAME (w-36c51443df).
//
// MEASURED 2026-10-09. `codex app-server generate-json-schema --out` on
// codex-cli 0.160.0, then every `method` const in `ServerRequest.json` -- the
// schema's own list of what the server may send a client. Ten of them, and
// `main/codex-app-server.mjs` knew four.
//
// DENY BY DEFAULT IS THE RIGHT RULE AND IT IS NOT WEAKENED HERE. An approval
// shape nobody has measured must not be granted. What was wrong is that the rule
// was being applied by ACCIDENT rather than by decision: six requests fell
// through one `if (!shape)` into a protocol error, with nothing anywhere saying
// which, and no way to find out that one had ever arrived.
//
// So each of the six is now a decision with its reason written next to it, and
// anything unrecognised is REPORTED as well as refused. Three roads:
//
//   THE TWO LEGACY APPROVALS ARE ANSWERED. `execCommandApproval` and
//   `applyPatchApproval` are the v1 spellings of approvals we already draw
//   cards for under their v2 names. Their response is `{ decision:
//   ReviewDecision }` and that vocabulary is NOT the v2 one -- `approved`,
//   `approved_for_session`, `{denied:{rejection}}`, `abort` -- which is why
//   forwarding our own word would have been refused. Mapped, so a Codex that
//   speaks v1 on any path gets a card instead of a failure.
//
//   THE THREE WE CANNOT HONESTLY SERVE ARE REFUSED IN WORDS. `item/tool/call`,
//   `account/chatgptAuthTokens/refresh` and `attestation/generate` ask the
//   client to DO something -- run a tool we do not offer, mint a login token we
//   do not hold, sign an attestation we cannot produce. There is no answer to
//   invent, so each is refused with a sentence naming what was asked.
//
//   THE QUESTION FOR A PERSON IS REFUSED, AND SAYS SO TO THE MODEL.
//   `item/tool/requestUserInput` is a tool asking the person something, and its
//   response is a map of question id to typed answers. Agentbox has no form to
//   put on screen and may not invent an answer -- the same rule that keeps
//   `content` off an accepted elicitation, and it matters more here because a
//   question may be marked `isSecret`. So it is refused with a sentence telling
//   the model to ask in its reply instead, where she will actually read it.
//
// NEITHER OF THE LAST TWO WAS SEEN LIVE. Across roughly twenty-five real turns
// the only server request that ever arrived was
// `item/commandExecution/requestApproval`, so this is a gap read off the schema
// rather than a reproduced failure. That is exactly why the trace matters: the
// next one shows up on a row instead of in a silence.
import { describe, expect, it, vi } from 'vitest';
import {
  createCodexAppServer, REFUSAL_DECISION, APPROVAL_DECISIONS,
  LEGACY_DECISIONS, SERVER_REQUESTS,
} from '../main/codex-app-server.mjs';
import { EventEmitter } from 'node:events';

/** Every `method` the 0.160.0 schema lets a server send a client. */
const EVERY_REQUEST = Object.freeze([
  'account/chatgptAuthTokens/refresh',
  'applyPatchApproval',
  'attestation/generate',
  'execCommandApproval',
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
  'item/tool/call',
  'item/tool/requestUserInput',
  'mcpServer/elicitation/request',
]);

/** The ones that put a card in front of her. */
const ASKS_HER = Object.freeze([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
  'mcpServer/elicitation/request',
  'execCommandApproval',
  'applyPatchApproval',
]);

/** The handler is called off a promise, so let the microtasks drain first. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A child process's face, so nothing here spawns anything. */
function fakeChild() {
  const child = new EventEmitter();
  child.written = [];
  child.stdin = { write: (text, cb) => { child.written.push(text); cb?.(); return true; }, end: () => {}, on: () => {} };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  child.say = (msg) => child.stdout.emit('data', `${JSON.stringify(msg)}\n`);
  child.answers = () => child.written.map((t) => JSON.parse(t)).filter((m) => m.id !== undefined && m.method === undefined);
  return child;
}

/** One client, one thread, and a handler that answers with whatever is given. */
function connected({ answer = 'accept', onUnknown } = {}) {
  const child = fakeChild();
  const client = createCodexAppServer({ transport: child, onUnknownRequest: onUnknown });
  const asked = [];
  client.watch('T', {
    onApproval: (method, params) => { asked.push({ method, params }); return answer; },
  });
  return { child, client, asked };
}

describe('the list itself', () => {
  it('is the schema\'s ten, written down where a reader can check it', () => {
    // Pinned as an export so the table and the test cannot drift: a new Codex
    // version adding an eleventh fails here rather than falling through.
    expect([...SERVER_REQUESTS].sort()).toEqual([...EVERY_REQUEST].sort());
    expect(SERVER_REQUESTS).toHaveLength(10);
  });
});

describe('the requests that put a card in front of her', () => {
  for (const method of ASKS_HER) {
    it(`asks her about ${method}`, async () => {
      const { child, asked } = connected();
      child.say({ jsonrpc: '2.0', id: 1, method, params: { threadId: 'T' } });
      await settle();
      expect(asked.map((a) => a.method)).toEqual([method]);
    });
  }

  it('is six of the ten now, not four', () => {
    expect(ASKS_HER).toHaveLength(6);
  });
});

describe('the two legacy approvals speak the older vocabulary', () => {
  // `{ decision: ReviewDecision }`, read off ExecCommandApprovalResponse.json
  // on 0.160.0: approved | approved_for_session | approved_mcp_policy_amendment
  // | timed_out | abort as words, and {denied:{rejection}} as an object. Our own
  // four words are the v2 set and are NOT valid here, so sending one straight
  // through would have been refused by the server.
  it('knows the older words are a different list from ours', () => {
    expect(APPROVAL_DECISIONS).toEqual(['accept', 'acceptForSession', 'decline', 'cancel']);
    expect(Object.keys(LEGACY_DECISIONS).sort()).toEqual([...APPROVAL_DECISIONS].sort());
    for (const word of APPROVAL_DECISIONS) expect(LEGACY_DECISIONS[word]).toBeTruthy();
  });

  it('turns an approval into `approved`', async () => {
    const { child } = connected({ answer: 'accept' });
    child.say({ jsonrpc: '2.0', id: 4, method: 'execCommandApproval', params: { threadId: 'T' } });
    await settle();
    expect(child.answers()[0].result).toEqual({ decision: 'approved' });
  });

  it('turns a session approval into `approved_for_session`', async () => {
    const { child } = connected({ answer: 'acceptForSession' });
    child.say({ jsonrpc: '2.0', id: 5, method: 'applyPatchApproval', params: { threadId: 'T' } });
    await settle();
    expect(child.answers()[0].result).toEqual({ decision: 'approved_for_session' });
  });

  it('turns a refusal into the `denied` object, with a reason the model can read', async () => {
    // `denied` is an OBJECT here and `decline` is not a word this protocol
    // takes. It also carries a `rejection` string, which is the one place a
    // refusal gets to say WHY, so it says why.
    const { child } = connected({ answer: 'decline' });
    child.say({ jsonrpc: '2.0', id: 6, method: 'execCommandApproval', params: { threadId: 'T' } });
    await settle();
    const { decision } = child.answers()[0].result;
    expect(Object.keys(decision)).toEqual(['denied']);
    expect(typeof decision.denied.rejection).toBe('string');
    expect(decision.denied.rejection.length).toBeGreaterThan(0);
  });

  it('refuses a legacy card nobody answers with `denied`, not with our own word', async () => {
    const child = fakeChild();
    createCodexAppServer({ transport: child });
    child.say({ jsonrpc: '2.0', id: 8, method: 'execCommandApproval', params: { threadId: 'NOBODY' } });
    await settle();
    const { decision } = child.answers()[0].result;
    expect(decision.denied).toBeTruthy();
    expect(decision).not.toBe('decline');
  });

  it('refuses rather than guessing when the handler answers with nonsense', async () => {
    const { child } = connected({ answer: 'yes please' });
    child.say({ jsonrpc: '2.0', id: 9, method: 'applyPatchApproval', params: { threadId: 'T' } });
    await settle();
    expect(child.answers()[0].result.decision.denied).toBeTruthy();
  });
});

describe('the requests this app cannot honestly serve', () => {
  const CANNOT = ['item/tool/call', 'account/chatgptAuthTokens/refresh', 'attestation/generate', 'item/tool/requestUserInput'];

  it('is the four left over', () => {
    expect(CANNOT.sort()).toEqual(EVERY_REQUEST.filter((m) => !ASKS_HER.includes(m)).sort());
  });

  for (const method of CANNOT) {
    it(`refuses ${method} without asking her, and says what was asked`, async () => {
      const { child, asked } = connected();
      child.say({ jsonrpc: '2.0', id: 7, method, params: { threadId: 'T' } });
      await settle();
      expect(asked).toEqual([]);                        // no card: there is nothing to card
      const [answer] = child.answers();
      expect(answer.id).toBe(7);
      expect(answer.error).toBeTruthy();
      expect(answer.result).toBeUndefined();
      // THE MESSAGE NAMES THE REQUEST. A bare refusal is what made these six
      // invisible; a refusal that says which one is a refusal somebody can act on.
      expect(answer.error.message).toContain(method);
    });
  }

  it('tells the model to ask in its reply when a tool wanted to question her', async () => {
    // There is no form on screen and a question may be marked `isSecret`, so
    // inventing an answer is out. Pointing the model at its reply is the road
    // that does reach her.
    const { child } = connected();
    child.say({ jsonrpc: '2.0', id: 10, method: 'item/tool/requestUserInput', params: { threadId: 'T', questions: [{ id: 'q1', header: 'Which', question: 'Which database?' }] } });
    await settle();
    expect(child.answers()[0].error.message).toMatch(/reply|answer/i);
  });
});

describe('a request nobody recognised is reported, not just refused', () => {
  it('names the unknown method to whoever is listening', async () => {
    // THE WHOLE REASON THIS GAP LASTED. Six methods fell through one branch with
    // nothing written anywhere, so the only way to find out was to read the
    // schema by hand. A hook here means the next new method lands on a row.
    const onUnknown = vi.fn();
    const child = fakeChild();
    createCodexAppServer({ transport: child, onUnknownRequest: onUnknown });
    child.say({ jsonrpc: '2.0', id: 11, method: 'something/nobody/hasSeen', params: { threadId: 'T' } });
    await settle();
    expect(onUnknown).toHaveBeenCalledTimes(1);
    expect(onUnknown.mock.calls[0][0]).toBe('something/nobody/hasSeen');
  });

  it('does not report the ones we decided about on purpose', async () => {
    // A decision is not news. Reporting the four we refuse deliberately would
    // be the 2026-08-05 card flood in a log file.
    const onUnknown = vi.fn();
    const child = fakeChild();
    createCodexAppServer({ transport: child, onUnknownRequest: onUnknown });
    for (const method of EVERY_REQUEST) child.say({ jsonrpc: '2.0', id: `x-${method}`, method, params: { threadId: 'T' } });
    await settle();
    expect(onUnknown).not.toHaveBeenCalled();
  });

  it('still refuses the unknown one, and a listener that throws costs nothing', async () => {
    const child = fakeChild();
    createCodexAppServer({ transport: child, onUnknownRequest: () => { throw new Error('a bad listener'); } });
    child.say({ jsonrpc: '2.0', id: 12, method: 'something/nobody/hasSeen', params: {} });
    await settle();
    expect(child.answers()[0].error).toBeTruthy();
    // The read loop survived it, so the next frame is still handled.
    child.say({ jsonrpc: '2.0', id: 13, method: 'something/else/new', params: {} });
    await settle();
    expect(child.answers()).toHaveLength(2);
  });
});

describe('what has not changed', () => {
  it('still refuses a v2 approval on a thread nobody is watching', () => {
    // There is nobody to ask, so the turn hears no NOW instead of waiting out a
    // fifteen-minute deadline.
    const child = fakeChild();
    createCodexAppServer({ transport: child });
    child.say({ jsonrpc: '2.0', id: 3, method: 'item/commandExecution/requestApproval', params: { threadId: 'NOBODY' } });
    expect(child.answers()[0].result?.decision).toBe(REFUSAL_DECISION);
    expect(REFUSAL_DECISION).toBe('decline');
  });
});
