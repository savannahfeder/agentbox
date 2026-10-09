// Restart and Wi-Fi recovery review, 2026-10-08: three recognized connection
// failures exhausted a reply's three attempts. A failure after 45 seconds also
// cleared the account's trouble, treating a long outage as proof of health.
// Exercise the real exit bookkeeping for both engines, either side of 45s,
// and keep the cap for failures that are actually about the task.
// Codex's Stream error wording: codex-rs/protocol/src/error.rs in openai/codex.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

let root;
const item = {
  id: 'w-connection', product: 'sample', status: 'open', answer: 'continue',
  wrote: { answer: { ts: 1000, source: 'founder' } },
};
const make = () => new Supervisor(
  { home: root, storeRoot: root, authProfiles: ['default'], codexBin: '/fake/codex' },
  { listItems: () => [item], listProducts: () => [] }, root,
);
const failure = (engine, age, result = 'ECONNRESET: connection lost') => ({
  engine, profile: 'default', startedAt: Date.now() - age,
  result, resultIsError: true, tail: [`stderr: ${result}`, 'session exited (1)'],
});
function exit(sup, session) {
  sup._handledAnswers.add(sup._answerKey(item));
  sup.noteExitForBackoff(session);
  return sup.settleDelivery(item, item.answer, session, null);
}
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'connection-recovery-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe.each(['claude', 'codex'])('%s connection recovery', (engine) => {
  it.each([44_000, 45_000, 46_000, 180_000])('does not spend an attempt after %i milliseconds', (age) => {
    const sup = make();
    expect(exit(sup, failure(engine, age))).toBe('interrupted');
    expect(sup._deliveryAttempts[sup._answerKey(item)]).toBeUndefined();
    expect(sup._answerDelivered(item)).toBe(false);
    expect(sup._profileTrouble[sup._accountKey(engine, 'default')]?.cause).toBe('interrupted');
  });

  it('keeps retrying through repeated disconnects and an app restart, with backoff', () => {
    const sup = make();
    for (let n = 0; n < 4; n += 1) {
      expect(exit(sup, failure(engine, 180_000))).toBe('interrupted');
      expect(sup._answerDelivered(item)).toBe(false);
      expect(sup._deliveryAttempts[sup._answerKey(item)]).toBeUndefined();
    }
    const after = make(); // load the actual saved state, without graceful shutdown
    expect(after._answerDelivered(item)).toBe(false);
    expect(after._deliveryAttempts[after._answerKey(item)]).toBeUndefined();
    expect(after._profileCooldown[after._accountKey(engine, 'default')]).toBeGreaterThan(Date.now());
  });

  it('also recognizes a connection error when the process only reports it on stderr', () => {
    const sup = make();
    const session = { ...failure(engine, 180_000), result: null };
    expect(exit(sup, session)).toBe('interrupted');
    expect(sup._answerDelivered(item)).toBe(false);
  });

  it.each([
    'ENETUNREACH: Network is unreachable',
    'stream disconnected before completion: error sending request for url (https://api.example.test/responses)',
    'stream disconnected before completion: failed to send websocket request: connection was reset',
  ])('keeps a reply pending after %s', (message) => {
    const sup = make();
    expect(exit(sup, failure(engine, 180_000, message))).toBe('interrupted');
    expect(sup._answerDelivered(item)).toBe(false);
  });

  it.each(['max_output_tokens', 'content_filter'])('keeps the cap for an incomplete response caused by %s', (reason) => {
    const sup = make();
    const message = `stream disconnected before completion: Incomplete response returned, reason: ${reason}`;
    for (let n = 0; n < 2; n += 1) expect(exit(sup, failure(engine, 180_000, message))).toBe('retrying');
    expect(exit(sup, failure(engine, 180_000, message))).toBe('given up');
  });

  it('preserves earlier task failures without charging a disconnect against them', () => {
    const sup = make();
    exit(sup, failure(engine, 180_000, 'The requested operation failed'));
    exit(sup, failure(engine, 180_000, 'The requested operation failed'));
    expect(exit(sup, failure(engine, 180_000))).toBe('interrupted');
    expect(sup._deliveryAttempts[sup._answerKey(item)]).toBe(2);
    expect(exit(sup, failure(engine, 180_000, 'The requested operation failed'))).toBe('given up');
  });

  it('keeps the retry cap for a task failure', () => {
    const sup = make();
    expect(exit(sup, failure(engine, 180_000, 'The requested operation failed'))).toBe('retrying');
    expect(exit(sup, failure(engine, 180_000, 'The requested operation failed'))).toBe('retrying');
    expect(exit(sup, failure(engine, 180_000, 'The requested operation failed'))).toBe('given up');
    expect(sup._answerDelivered(item)).toBe(true);
  });

  it('does not mistake a successful answer about connections for a failed connection', () => {
    const sup = make();
    const session = { ...failure(engine, 180_000, 'Fixed ECONNRESET connection lost errors'), resultIsError: false };
    sup.spokeOnTheRow = () => true;
    expect(exit(sup, session)).toBe('delivered');
    expect(sup._profileTrouble[sup._accountKey(engine, 'default')]).toBeUndefined();
    expect(session.transportFault).not.toBe(true);
  });
});
