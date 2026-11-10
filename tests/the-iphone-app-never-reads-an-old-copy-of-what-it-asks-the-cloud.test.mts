// THE IPHONE APP NEVER READS AN OLD COPY OF WHAT IT ASKS THE CLOUD.
//
// On TestFlight build 21 (2026-11-08) a reply was answered by the review
// computer in 4 seconds and the phone never drew the answer, while "Queued"
// went away. The server's copy of the thread had the answer; the browser
// build drew it in 18 seconds. The cloud's answers carry no caching headers,
// and React Native on iOS asks with the system's default cache policy, so
// the same address asked every 5 seconds (the list of when each thread last
// changed) can be answered from an old copy; the list of taken messages asks
// a new address each time, which is why only "Queued" moved. Every request
// the app makes to the cloud now says no copy will do.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fresh } from '../mobile/src/lib/deadline';

const seen = () => {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); return new Response('[]'); };
  return { calls, f };
};

describe('a request to the cloud', () => {
  it('asks for a fresh answer, at the same address', async () => {
    const { calls, f } = seen();
    await fresh(f)('https://x.supabase.co/rest/v1/phone_threads?select=item', { headers: { apikey: 'k' } });
    expect(calls[0].url).toBe('https://x.supabase.co/rest/v1/phone_threads?select=item');
    expect(calls[0].init.headers).toMatchObject({ apikey: 'k', 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' });
  });

  it('keeps everything else it was given', async () => {
    const { calls, f } = seen();
    const signal = new AbortController().signal;
    await fresh(f)('https://x/a', { method: 'POST', body: '{}', signal });
    expect(calls[0].init).toMatchObject({ method: 'POST', body: '{}', signal });
  });

  it('works with no options at all', async () => {
    const { calls, f } = seen();
    await fresh(f)('https://x/a');
    expect(calls[0].init.headers['Cache-Control']).toBe('no-cache, no-store');
  });
});

describe('the app', () => {
  it('reads the cloud through it', () => {
    const cloud = fs.readFileSync(new URL('../mobile/src/state/cloud.tsx', import.meta.url), 'utf8');
    expect(cloud).toContain('fetchImpl: fresh(withDeadline(fetch))');
  });
});
