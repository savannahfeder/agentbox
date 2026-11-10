// A CLOUD SERVER CALL TURNED AWAY FOR LOAD IS SENT AGAIN.
//
// Lambda answers 429 when the cloud server already has as many calls open as
// it may, and the server never ran the call. The app's client threw it, and
// only some of the run code's calls were retried: the links a run is packed
// and started with were not, so the run stopped as "work not home" and the
// thread was started over, six times and it is held. With the server capped at
// 30 calls and 50 runs starting together, 21 of 50 runs stopped that way
// (scripts/cloud-load-test.mjs --standin --concurrency 30 --starting 50); at 200
// runs and the deployed cap of 200, one did.
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { managedClients } from '../main/cloud/managed.mts';

let server: http.Server | null = null;
afterEach(async () => { server?.closeAllConnections(); await new Promise((r) => server?.close(r)); server = null; });

async function cloudServer(answers: number[]) {
  const seen: number[] = [];
  server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const status = answers[Math.min(seen.length, answers.length - 1)];
      seen.push(status);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(status === 200 ? { url: 'https://bucket.example/x', ok: true } : status === 429 ? { message: 'Rate Exceeded.' } : { error: 'nope', message: 'no' }));
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, seen };
}

describe('a call the cloud server turned away for load', () => {
  it('is sent again until it gets through: a run link', async () => {
    const { url, seen } = await cloudServer([429, 429, 429, 200]);
    const { storage } = managedClients({ url, key: 'k', throttleMs: 10_000 });
    expect(await storage.getUrl('runs/r1/done.json')).toBe('https://bucket.example/x');
    expect(seen).toEqual([429, 429, 429, 200]);
  });

  it('is sent again until it gets through: a start', async () => {
    const { url, seen } = await cloudServer([429, 200]);
    const { transport } = managedClients({ url, key: 'k', throttleMs: 10_000 });
    expect((await transport.invoke('s1', { action: 'start', runId: 'r1' })).ok).toBe(true);
    expect(seen).toEqual([429, 200]);
  });

  it('gives up once the deadline passes, rather than waiting for ever', async () => {
    const { url, seen } = await cloudServer([429]);
    const { storage } = managedClients({ url, key: 'k', throttleMs: 1500 });
    const began = Date.now();
    await expect(storage.getUrl('runs/r1/done.json')).rejects.toThrow(/429/);
    expect(Date.now() - began).toBeGreaterThanOrEqual(1500);
    expect(Date.now() - began).toBeLessThan(6000);
    expect(seen.length).toBeGreaterThan(1);
  });

  it('is not sent again when the server failed, since it may have done the work', async () => {
    const { url, seen } = await cloudServer([500, 200]);
    const { transport } = managedClients({ url, key: 'k', throttleMs: 10_000 });
    await expect(transport.invoke('s1', { action: 'start', runId: 'r1' })).rejects.toThrow(/500/);
    expect(seen).toEqual([500]);
  });

  it('is not sent again when the server refused it', async () => {
    const { url, seen } = await cloudServer([403, 200]);
    const { storage } = managedClients({ url, key: 'k', throttleMs: 10_000 });
    await expect(storage.getUrl('runs/r1/done.json')).rejects.toThrow(/403/);
    expect(seen).toEqual([403]);
  });
});
