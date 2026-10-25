// A CLOUD CALL THAT NEVER ANSWERS ENDS, INSTEAD OF HANGING THE RUN.
//
// What broke (2026-10-19): with cloud runs on for everything, nothing ran.
// The shared cloud host's log said "a request has exceeded the configured
// 60000 ms requestTimeout", and a run the app had rejoined after its restart
// sat at the same place in its events for nine minutes and more. This AWS SDK
// only WARNS at its request timeout unless told to throw, so a call to the
// cloud that never answered held its run forever, and the next one queued
// behind the cloud's cap.
//
// Now a call that has not answered in time is ended with an error, which the
// relay's own retries already handle. Measured here against a stand-in cloud
// that takes the request and never answers.
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { awsTransport, awsStorage } from '../main/cloud/aws.mjs';

let server;
afterEach(async () => { server?.closeAllConnections?.(); await new Promise((r) => (server ? server.close(r) : r())); server = null; });

async function silentCloud() {
  server = http.createServer(() => { /* takes the request, never answers */ });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${server.address().port}`;
}
const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret-example' };

describe('a call to the cloud', () => {
  it('that never answers is ended with an error within its time', async () => {
    const endpoint = await silentCloud();
    const t = awsTransport({ region: 'us-east-1', runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/x', endpoint, credentials, timeoutMs: 400 });
    const at = Date.now();
    await expect(t.invoke('agentbox-session-0000000000000000000000000000000000', { action: 'events' })).rejects.toThrow();
    expect(Date.now() - at).toBeLessThan(10_000);
  }, 15_000);

  // The storage client tries again a few times itself before it gives up.
  it('to storage that never answers is ended too', async () => {
    const endpoint = await silentCloud();
    const s = awsStorage({ region: 'us-east-1', bucket: 'b', endpoint, credentials, timeoutMs: 400 });
    const at = Date.now();
    await expect(s.get('k')).rejects.toThrow();
    expect(Date.now() - at).toBeLessThan(10_000);
  }, 15_000);

  it('is made with a timeout that throws, not one that only warns', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../main/cloud/aws.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/throwOnRequestTimeout: true/);
  });
});

// THE DEADLINE IS FOR A CALL THAT NEVER ANSWERS, NOT FOR ONE THAT IS WORKING
// (2026-10-19, the same day). At 60 seconds it ended real work: sending a
// run's 55 MB of code up from her Mac, and a cold start, both take longer,
// and every cloud run in her inbox died a minute in ("a request has exceeded
// the configured 60000 ms requestTimeout") and was started again, so only a
// few ever got going.
describe('the deadline itself', () => {
  it('is minutes, enough for a large upload and a cold start, and still a deadline', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../main/cloud/aws.mjs', import.meta.url), 'utf8');
    const ms = Number(eval(src.match(/const TIMEOUT_MS = ([^;]+);/)[1]));
    expect(ms).toBeGreaterThanOrEqual(5 * 60_000);
    expect(ms).toBeLessThanOrEqual(15 * 60_000);
  });
});
