// A CLOUD FILE LINK IS ASKED FOR AGAIN AFTER A DROPPED CALL.
//
// A run is packed, started and brought home on a dozen links the cloud server
// signs, and a link call that lost its connection or met a server failure was
// thrown out of the run. With 3% of calls dropped before the server saw them
// and 3% after, and the server killed for 3 s mid-step, 3 of 50 runs used all
// six of the app's passes on dropped link calls, which leaves a thread held
// (scripts/cloud-load-test.mjs --standin --chaos). Asking for a link twice only
// signs it twice, so those are asked again; a refusal is not.
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { managedClients } from '../main/cloud/managed.mts';

let server: http.Server | null = null;
afterEach(async () => { server?.closeAllConnections(); await new Promise((r) => server?.close(r)); server = null; });

// 'drop' closes the connection with no answer.
async function cloudServer(answers: (number | 'drop')[]) {
  const seen: (number | 'drop')[] = [];
  server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const a = answers[Math.min(seen.length, answers.length - 1)];
      seen.push(a);
      if (a === 'drop') return res.destroy();
      res.writeHead(a, { 'content-type': 'application/json' });
      res.end(JSON.stringify(a === 200 ? { url: 'https://bucket.example/x', ok: true } : { error: 'nope', message: 'no' }));
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, seen };
}

describe('a link the cloud server is asked for', () => {
  it('is asked for again after a dropped connection', async () => {
    const { url, seen } = await cloudServer(['drop', 'drop', 200]);
    const { storage } = managedClients({ url, key: 'k', throttleMs: 10_000 });
    expect(await storage.putUrl('runs/r1/done.json')).toBe('https://bucket.example/x');
    expect(seen).toEqual(['drop', 'drop', 200]);
  });

  it('is asked for again after a server failure', async () => {
    const { url, seen } = await cloudServer([502, 500, 200]);
    const { storage } = managedClients({ url, key: 'k', throttleMs: 10_000 });
    expect(await storage.getUrl('runs/r1/out.bundle')).toBe('https://bucket.example/x');
    expect(seen).toEqual([502, 500, 200]);
  });

  it('is not asked for again when the server refused it', async () => {
    const { url, seen } = await cloudServer([403, 200]);
    const { storage } = managedClients({ url, key: 'k', throttleMs: 10_000 });
    await expect(storage.getUrl('runs/r1/out.bundle')).rejects.toThrow(/403/);
    expect(seen).toEqual([403]);
  });

  it('gives up once the deadline passes', async () => {
    const { url, seen } = await cloudServer(['drop']);
    const { storage } = managedClients({ url, key: 'k', throttleMs: 1500 });
    const began = Date.now();
    await expect(storage.getUrl('runs/r1/out.bundle')).rejects.toThrow();
    expect(Date.now() - began).toBeGreaterThanOrEqual(1500);
    expect(Date.now() - began).toBeLessThan(6000);
    expect(seen.length).toBeGreaterThan(1);
  });

  it('leaves a start that met a server failure to the run code, since it may have begun', async () => {
    const { url, seen } = await cloudServer([500, 200]);
    const { transport } = managedClients({ url, key: 'k', throttleMs: 10_000 });
    await expect(transport.invoke('s1', { action: 'start', runId: 'r1' })).rejects.toThrow(/500/);
    expect(seen).toEqual([500]);
  });
});
