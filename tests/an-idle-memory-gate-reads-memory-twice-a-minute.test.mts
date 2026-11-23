// AN IDLE MEMORY GATE READ THE MAC'S MEMORY EVERY TWO SECONDS.
//
// The gate (main/memory-gate-server.mts) took a reading every 2 s for as long
// as the app was open, and on a Mac each reading starts `/usr/sbin/sysctl`.
// Traced for ten idle minutes with no agent running, the app started 357
// sysctl processes, most of them this. A reading is only acted on when a
// worker's command asks to run, so with nothing asked, granted or waiting it
// reads every 30 s, an ask finds a reading no older than the busy rate before
// it is decided, and polling goes back to 2 s while anything is in hand.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { MemoryGateServer } from '../main/memory-gate-server.mts';
import { CommandHistory } from '../main/memory-gate-history.mts';

const servers: MemoryGateServer[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeServer({ pollMs = 40, idlePollMs = 600, freePct }: { pollMs?: number; idlePollMs?: number; freePct: () => number }) {
  // Short on purpose: a Unix socket path is limited to 104 bytes on macOS.
  const dir = fs.mkdtempSync(path.join('/tmp', 'gate-idle-'));
  dirs.push(dir);
  const reads = { n: 0 };
  // Known to be light, so it runs short of critical and the ask returns.
  const history = new CommandHistory();
  for (let i = 0; i < 3; i++) history.record('git status', { peakMb: 10, durationMs: 100 });
  const server = new MemoryGateServer({
    socketPath: path.join(dir, 'g.sock'),
    history,
    readPressure: async () => { reads.n += 1; return { level: 1, freePct: freePct() }; },
    sampleProcesses: async () => [],
    pollMs,
    idlePollMs,
    takeoverMs: 50,
    lockPort: 0,
    gate: { slots: 1 },
  });
  servers.push(server);
  await server.start();
  return { server, reads, sock: path.join(dir, 'g.sock') };
}

function ask(sock: string, url: '/pre' | '/post', id: string) {
  const body = JSON.stringify({ item: 'w-test', product: 'demo', score: 5, ppid: process.pid, hook: { tool_use_id: id, tool_input: { command: 'git status' }, duration_ms: 10 } });
  return new Promise<string>((resolve, reject) => {
    const req = http.request({ socketPath: sock, path: url, method: 'POST' }, (res) => {
      let out = '';
      res.on('data', (d) => { out += d; });
      res.on('end', () => resolve(out));
    });
    req.on('error', reject);
    req.end(body);
  });
}

describe('the memory gate with nothing to look after', () => {
  it('reads memory at the idle rate, not the busy one', async () => {
    const { reads } = await makeServer({ freePct: () => 50 });
    await wait(1_000);
    // One at the start and one at 600 ms; at the busy rate it would be 26.
    expect(reads.n).toBeGreaterThanOrEqual(1);
    expect(reads.n).toBeLessThanOrEqual(3);
  });

  it('decides an ask on a reading taken when it came, not the idle one', async () => {
    let free = 50;
    const { server, reads, sock } = await makeServer({ idlePollMs: 60_000, freePct: () => free });
    await wait(200);
    expect(server.status().freePct).toBe(50);
    free = 8;
    const before = reads.n;
    await ask(sock, '/pre', 't1');
    expect(reads.n).toBeGreaterThan(before);
    expect(server.status().freePct).toBe(8);
    expect(server.gate.pressure).toBe('tight');
  });

  it('does not read again for an ask when the last reading is fresh', async () => {
    const { reads, sock } = await makeServer({ pollMs: 5_000, idlePollMs: 60_000, freePct: () => 50 });
    await wait(50);
    const before = reads.n;
    await ask(sock, '/pre', 't1');
    expect(reads.n).toBe(before);
  });

  it('polls at the busy rate while a command is running, and goes back to idle after', async () => {
    const { reads, sock } = await makeServer({ freePct: () => 50 });
    await wait(100);
    await ask(sock, '/pre', 't1');
    const running = reads.n;
    await wait(400);
    expect(reads.n - running).toBeGreaterThanOrEqual(5);
    await ask(sock, '/post', 't1');
    await wait(100);
    const after = reads.n;
    await wait(400);
    expect(reads.n - after).toBeLessThanOrEqual(1);
  });
});
