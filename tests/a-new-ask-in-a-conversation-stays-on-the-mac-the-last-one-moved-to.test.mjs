// A NEW ASK IN A CONVERSATION STAYS ON THE MAC THE LAST ONE MOVED TO
// (w-17eef890be, 2026-11-02).
//
// In a conversation with a teammate, the person asked an agent for files on
// their Mac; that thread (w-cbccd05081) ran in the cloud and could not reach
// them. They moved it to the Mac and wrote "@Claude Code in Agentbox Team I
// moved to mac so you can perform it there". That second mention made a new
// thread (w-59a1312c97), as every mention does (`startChatAgents` in App.tsx
// composes a fresh task each time), and the new thread carried no "Keep on
// this Mac", so it started in the cloud again. Measured on the two rows: both
// created from the same conversation, the second one's first run filed this bug
// from the cloud.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lastAskKeptOnMac } from '../renderer/src/team/agent-mentions.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const ask = (ts, project, task) => ({ ts, by: 'me', patch: { answer: `[@Claude Code in Team](agentbox-agent:claude?project=${project}&task=${task}) find the films` } });
const said = (ts, text) => ({ ts, by: 'them', patch: { answer: text } });
const finder = (onMac) => (product, id) => (id in onMac ? { id, product, onMac: onMac[id] } : undefined);

describe('whether a new ask starts on this Mac', () => {
  it('does when the conversation\'s last ask in that project was moved to this Mac', () => {
    const lines = [ask(1, 'team', 'w-1'), said(2, 'thanks')];
    expect(lastAskKeptOnMac(lines, 'team', finder({ 'w-1': true }))).toBe(true);
  });

  it('follows the latest ask, not an older one', () => {
    const lines = [ask(1, 'team', 'w-1'), ask(3, 'team', 'w-2')];
    expect(lastAskKeptOnMac(lines, 'team', finder({ 'w-1': true, 'w-2': false }))).toBe(false);
    expect(lastAskKeptOnMac(lines.slice().reverse(), 'team', finder({ 'w-1': false, 'w-2': true }))).toBe(true);
  });

  it('does not when the earlier ask went to another project', () => {
    expect(lastAskKeptOnMac([ask(1, 'video', 'w-1')], 'team', finder({ 'w-1': true }))).toBe(false);
  });

  it('does not when there was no earlier ask, or its thread is gone', () => {
    expect(lastAskKeptOnMac([said(1, 'hello')], 'team', finder({}))).toBe(false);
    expect(lastAskKeptOnMac([ask(1, 'team', 'w-9')], 'team', finder({}))).toBe(false);
  });

  it('ignores a message taken back', () => {
    const lines = [ask(1, 'team', 'w-1'), { ts: 2, by: 'me', patch: { answer: '(withdrawn)' } }];
    expect(lastAskKeptOnMac(lines, 'team', finder({ 'w-1': true }))).toBe(true);
  });
});

describe('the send carries it to the thread before it can start', () => {
  it('asks for the new task to be kept on this Mac when the last ask was', () => {
    const app = read('renderer/src/App.tsx');
    const at = app.indexOf('const startChatAgents');
    const body = app.slice(at, app.indexOf('}, [', at));
    expect(body).toMatch(/lastAskKeptOnMac\(/);
    expect(body).toMatch(/onMac: true/);
  });

  it('keeps it on this Mac before the supervisor is woken', () => {
    const ipc = read('main/ipc.mjs');
    const at = ipc.indexOf("ipcMain.handle('zero:compose'");
    const body = ipc.slice(at, ipc.indexOf('ipcMain.handle(', at + 1));
    expect(body).toMatch(/\bonMac\b[^}]*\}\) =>/);
    const keep = body.indexOf('supervisor.setThreadOnMac(');
    expect(keep).toBeGreaterThan(-1);
    expect(keep).toBeLessThan(body.indexOf('supervisor.wake()'));
  });
});
