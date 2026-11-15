// A CLOUD CODEX SIGN-IN THAT IS REFUSED SENDS CODEX THREADS HOME.
//
// What broke (2026-11-10): the outreach films thread was started in the cloud
// on Codex ten times, 10:10pm to 10:47pm, and every turn failed in under 20
// seconds with "workspace routing discovery unauthorized (401)" (the first five
// wrapped as "Error running remote compact task: ..."). All ten are in
// ~/.agentbox/cloud-usage.jsonl; the same thread on this Mac's own Codex login
// worked, and a fresh `codex exec` there answered. The cloud's Codex sign-in
// was being refused, but the cloud only checks a Codex sign-in's expiry date,
// never a refusal, so it stayed "ready" and kept taking Codex threads. The
// thread was held after six starts and said "Codex was signed out", naming no
// account, while the account it meant was the cloud's.
//
// Now the relay reads Codex's own failed turn: a refusal of the sign-in is
// login trouble for that cloud sign-in, which is marked so the cloud menu
// asks for a new one and no cloud run picks it, and the thread runs here.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexLoginRefusedInLine } from '../main/cloud/run.mts';
import { recordCloudLogin, markCloudLogin, cloudLoginState, mayRunOn, pickCloudLogin } from '../main/cloud/logins.mts';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

const frame = (method, turn) => JSON.stringify({ jsonrpc: '2.0', method, params: { threadId: 'th', turn } });
const failed = (message) => frame('turn/completed', { id: 't1', status: 'failed', error: { message, codexErrorInfo: 'other' }, items: [] });

describe('a Codex turn the cloud sign-in was refused for', () => {
  it('is read off the relayed frame, both ways Codex said it', () => {
    expect(codexLoginRefusedInLine(failed('workspace routing discovery unauthorized (401)'))).toBe(true);
    expect(codexLoginRefusedInLine(failed('Error running remote compact task: workspace routing discovery unauthorized (401)'))).toBe(true);
    expect(codexLoginRefusedInLine(frame('turn/failed', { status: 'failed', error: { message: 'Your access token could not be refreshed. Please log out and sign in again.' } }))).toBe(true);
  });

  it('must NOT be read off a turn that worked, a limit, or another failure', () => {
    expect(codexLoginRefusedInLine(frame('turn/completed', { status: 'completed', items: [{ type: 'agentMessage', phase: 'final_answer', text: 'the 401 unauthorized bug is fixed' }] }))).toBe(false);
    expect(codexLoginRefusedInLine(failed("You've hit your usage limit."))).toBe(false);
    expect(codexLoginRefusedInLine(failed('stream disconnected before completion'))).toBe(false);
    expect(codexLoginRefusedInLine(JSON.stringify({ method: 'item/completed', params: { item: { type: 'agentMessage', text: 'unauthorized (401)' } } }))).toBe(false);
    expect(codexLoginRefusedInLine('not json')).toBe(false);
  });

  it('is login trouble for the run, which marks that cloud sign-in', () => {
    const RUN = read('main/cloud/run.mts');
    expect(RUN).toMatch(/if \(codexLoginRefusedInLine\(line\)\) loginTrouble = \{ state: 'refused', id: login\?\.id \?\? null \}/);
    expect(RUN).toMatch(/if \(codex\) noteCodexRefusal\(buf\);/);
  });

  it('and a refused cloud sign-in takes no more cloud runs', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-codex-refused-'));
    dirs.push(home);
    recordCloudLogin('codex', 'acct-1', { id: 'l-1', expiresAt: Date.now() + 9 * 86_400_000, email: null }, { home });
    expect(pickCloudLogin('codex', { home })?.id).toBe('l-1');
    markCloudLogin('codex', 'acct-1', 'l-1', { broken: 'refused' }, { home });
    expect(mayRunOn(cloudLoginState(pickCloudLogin('codex', { home }) ?? { id: 'l-1', broken: 'refused' }))).toBe(false);
    expect(pickCloudLogin('codex', { home })).toBe(null);
  });
});
