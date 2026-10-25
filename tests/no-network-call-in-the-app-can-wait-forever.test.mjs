// NO NETWORK CALL IN THE APP CAN WAIT FOREVER.
//
// What broke (2026-10-19): a cloud run sat at the same place for over nine
// minutes and never moved again, because the AWS client only WARNED at its
// 60-second request timeout and kept waiting. Nothing in the app could tell a
// call that was slow from one that would never answer, so one quiet socket
// held a run, and the runs queued behind it, for good.
//
// So every way the app's own process reaches the network is read here, and
// each must carry a deadline that ENDS the call: a fetch its own abort signal,
// an AWS client a timeout that throws, the account database's client a fetch
// with a deadline. A new network call without one fails this test, which is
// the point: the next hang is caught here, not on her Mac.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function files(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(rel);
    return /\.(mjs|cjs|js|ts|tsx)$/.test(e.name) ? [rel] : [];
  });
}
const code = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').split('\n')
  .map((line, i) => ({ rel, n: i + 1, line })).filter((l) => !/^\s*(\/\/|\*)/.test(l.line));
// The phone app (mobile/src) as well, which is TypeScript.
const lines = ['main', 'shared', 'mcp', 'mobile/src'].flatMap(files).flatMap(code);
// Code that only builds text to be run elsewhere (the cloud's probe script is a string).
const inAString = (l) => /^\s*const \w+ = `/.test(l.line) || /`[^`]*fetch\(/.test(l.line);

describe('every network call the app makes', () => {
  it('a fetch carries a signal that ends it', () => {
    const bare = lines.filter((l) => /(^|[^.\w])fetch\(/.test(l.line) && !inAString(l) && !/signal/.test(l.line) && !/fetch\(url, \{ \.\.\.init, signal/.test(l.line));
    expect(bare.map((l) => `${l.rel}:${l.n}`)).toEqual([]);
  });

  it('an AWS client is made with a timeout that throws', () => {
    const clients = lines.filter((l) => /new (S3|BedrockAgentCore|[A-Z]\w*)Client\(/.test(l.line) && /@aws-sdk|requestHandler|region/.test(l.line));
    expect(clients.length).toBeGreaterThan(0);
    for (const c of clients) expect(c.line, `${c.rel}:${c.n}`).toMatch(/requestHandler: http\(/);
    const aws = fs.readFileSync(path.join(root, 'main/cloud/aws.mjs'), 'utf8');
    expect(aws).toMatch(/throwOnRequestTimeout: true/);
  });

  it('the account database\'s client fetches with a deadline', () => {
    const made = lines.filter((l) => /createClient\(/.test(l.line) && !/import/.test(l.line));
    expect(made.length).toBeGreaterThan(0);
    for (const m of made) {
      const file = fs.readFileSync(path.join(root, m.rel), 'utf8');
      const call = file.slice(file.indexOf('createClient(', file.split('\n').slice(0, m.n - 1).join('\n').length), file.indexOf('createClient(', file.split('\n').slice(0, m.n - 1).join('\n').length) + 600);
      expect(call, `${m.rel}:${m.n}`).toMatch(/global: \{ fetch: withDeadline/);
    }
  });
});

describe('the deadline the account database\'s client fetches with', () => {
  it('ends a request that never answers, and leaves one that answers alone', async () => {
    const http = await import('node:http');
    const { withDeadline } = await import('../main/team/session.mjs');
    const server = http.createServer((req, res) => { if (req.url === '/ok') res.end('fine'); });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const f = withDeadline(300);
      expect(await (await f(`${base}/ok`)).text()).toBe('fine');
      const at = Date.now();
      await expect(f(`${base}/never`)).rejects.toThrow();
      expect(Date.now() - at).toBeLessThan(3000);
      // A signal of the caller's own still ends it too.
      const own = new AbortController();
      const p = f(`${base}/never`, { signal: own.signal });
      own.abort();
      await expect(p).rejects.toThrow();
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  });
});
