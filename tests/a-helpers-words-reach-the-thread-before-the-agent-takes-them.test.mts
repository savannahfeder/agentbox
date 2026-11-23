// A helper's "Send to the agent" words were written on the owner's thread only once the live Claude session took them, at its next break: during a 15-minute git grep they were nowhere, and a failed steer lost them (power test issues 16, 17, 72).
// Measured with a fake Claude session that never takes the line, one that fails, and the asks relay with a tell that rejects.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { attachClaudeInput } from '../main/claude-input.mts';
import { submitReply } from '../main/live-replies.mts';
import { createAsks } from '../main/team/asks.mts';
import { GIVEN_TASK } from '../shared/team-rules.mts';

function fake() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.written = [];
  c.stdin = { writable: true, write: (line) => { c.written.push(JSON.parse(line)); return true; }, end: () => { c.stdin.writable = false; }, on: () => {} };
  attachClaudeInput(c);
  // Mid-turn, inside one long command.
  c.stdout.emit('data', JSON.stringify({ type: 'system', subtype: 'init' }) + '\n');
  return c;
}
const supervisor = (child) => ({ sessions: new Map([['w', { product: 'p', child }]]), _handledAnswers: new Set(), _answerKey: (i) => i.answer, _saveState() {} });
const tick = () => new Promise((r) => setTimeout(r, 0));
const take = (c) => { const u = c.written.at(-1); c.stdout.emit('data', JSON.stringify({ type: 'user', uuid: u.uuid, message: u.message }) + '\n'); };

describe("a teammate's words to a working agent", () => {
  it('are on the thread before the agent takes them, and marked handled once it does', async () => {
    const c = fake();
    const s = supervisor(c);
    let saved = 0;
    const item = await submitReply(s, { product: 'p', id: 'w', answer: 'Use src/currency.js', from: 'Theo Okafor' }, () => { saved += 1; return { answer: 'Use src/currency.js' }; });
    expect(saved).toBe(1);
    expect(item).toMatchObject({ product: 'p', id: 'w', answer: 'Use src/currency.js' });
    await tick();
    expect(c.written).toHaveLength(1);
    expect(c.written[0].message.content).toContain('Theo Okafor');
    expect(s._handledAnswers.size).toBe(0);
    take(c);
    await tick();
    expect([...s._handledAnswers]).toEqual(['Use src/currency.js']);
    expect(s.sessions.get('w').lastLiveReply).toMatchObject({ answer: 'Use src/currency.js' });
  });

  it('stay on the thread, unhandled, when the session dies before taking them', async () => {
    const c = fake();
    const s = supervisor(c);
    await submitReply(s, { product: 'p', id: 'w', answer: 'Use src/currency.js', from: 'Theo Okafor' }, () => ({ answer: 'Use src/currency.js' }));
    await tick();
    c.emit('exit', 1);
    await tick();
    expect(s._handledAnswers.size).toBe(0);
    expect(s.sessions.get('w').lastLiveReply).toBeUndefined();
  });

  it('are never steered when they could not be written', async () => {
    const c = fake();
    const s = supervisor(c);
    await expect(submitReply(s, { product: 'p', id: 'w', answer: 'x', from: 'Theo Okafor' }, () => { throw Error('disk full'); })).rejects.toThrow('disk full');
    await tick();
    expect(c.written).toHaveLength(0);
  });

  it("leave the person's own reply as it was: written once the agent takes it", async () => {
    const c = fake();
    const s = supervisor(c);
    let saved = 0;
    const sent = submitReply(s, { product: 'p', id: 'w', answer: 'mine' }, () => { saved += 1; return { answer: 'mine' }; });
    await tick();
    expect(saved).toBe(0);
    take(c);
    await sent;
    expect(saved).toBe(1);
    expect([...s._handledAnswers]).toEqual(['mine']);
  });
});

describe('the relay of a comment from someone you asked for help', () => {
  const setup = (tell) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-'));
    const rows = [{ id: 'k', product: 'dm', status: 'open', assignee: 'theo', createdBy: 'sam', createdAt: 1, ask: { kind: 'help', owner: 'sam', thread: 'w', product: 'api' }, labels: [GIVEN_TASK] }];
    const asks = createAsks({ file: path.join(dir, 'asks.json'), me: () => 'sam', products: () => [{ slug: 'dm', dir: 'dm', team: { direct: true } }], readRows: () => rows, nameOf: () => 'Theo Okafor', tell, putAway() {} });
    return { asks, kept: () => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'asks.json'), 'utf8')).relayed; } catch { return []; } } };
  };
  const c = { id: 'c1', threadId: 'w', by: 'theo', at: 5, text: 'Use src/currency.js', owner: 'sam' };
  const thread = { item: { id: 'w', product: 'api', status: 'open' }, product: { slug: 'api', dir: 'api' } };

  it('counts it relayed only once the thread took it', async () => {
    let done;
    const { asks, kept } = setup(() => new Promise((r) => { done = r; }));
    const filed = [];
    expect(asks.relay(c, thread, () => filed.push(c.id))).toBe(true);
    await tick();
    expect(kept()).toEqual([]);
    done('sent');
    await tick();
    expect(kept()).toEqual(['c1']);
    expect(filed).toEqual([]);
    expect(asks.relay(c, thread, () => filed.push(c.id))).toBe(true);
  });

  it('files it on the thread as a comment when the thread could not take it', async () => {
    const { asks, kept } = setup(() => Promise.reject(Error('disk full')));
    const filed = [];
    expect(asks.relay(c, thread, () => filed.push(c.id))).toBe(true);
    await tick();
    expect(filed).toEqual(['c1']);
    expect(kept()).toEqual(['c1']);
  });

  it('does not tell it twice while the first tell is still going', async () => {
    let calls = 0;
    const { asks } = setup(() => { calls += 1; return new Promise(() => {}); });
    asks.relay(c, thread, () => {});
    await tick();
    expect(asks.relay(c, thread, () => {})).toBe(true);
    await tick();
    expect(calls).toBe(1);
  });
});
