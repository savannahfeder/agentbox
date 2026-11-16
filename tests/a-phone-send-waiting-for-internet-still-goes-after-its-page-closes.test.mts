// A PHONE SEND WAITING FOR INTERNET STILL GOES AFTER ITS PAGE CLOSES.
//
// QA on 2026-11-14 (m18, Android) sent a new thread offline, read "Offline.
// Keep this open and it sends when you're back.", tapped Close and turned the
// network back on. After 30 s no thread had been filed, and New thread showed
// the words as a plain draft. The waiting send lived only in the page, so
// closing it dropped the send. A page that closes with a send waiting now
// hands it on; it goes on the inbox's next good read, and opening the page
// again takes it back rather than sending it twice.
import { describe, it, expect } from 'vitest';
import { carriedSends } from '../mobile/src/lib/carried-sends';
import { OFFLINE_TRIES } from '../mobile/src/lib/offline';

const OFFLINE = 'fetch failed: java.net.UnknownHostException: Unable to resolve host "abc.supabase.co"';
const SAID = 'Offline. Keep this open and it sends when you’re back.';

function harness() {
  const sends = carriedSends<string>();
  const ran: string[] = [];
  let fail: string | null = null;
  const run = (what: string) => async (cloud: string) => { if (fail) throw new Error(fail); ran.push(`${what}@${cloud}`); };
  return { sends, ran, run, failWith: (m: string | null) => { fail = m; } };
}

describe('a send handed on by a closed page', () => {
  it('goes on the first good read after it failed, once', async () => {
    const h = harness();
    h.sends.carry('new', { since: 1000, tries: 1 }, SAID, h.run('thread'));
    await h.sends.goAgain('cloud', 1001);
    await h.sends.goAgain('cloud', 2000);
    expect(h.ran).toEqual(['thread@cloud']);
  });

  it('waits through reads from before it failed and reads that failed', async () => {
    const h = harness();
    h.sends.carry('new', { since: 1000, tries: 1 }, SAID, h.run('thread'));
    await h.sends.goAgain('cloud', 1000);
    await h.sends.goAgain('cloud', 0);
    expect(h.ran).toEqual([]);
    await h.sends.goAgain('cloud', 1500);
    expect(h.ran).toEqual(['thread@cloud']);
  });

  it('is taken back by its page opening again, and then does not go on its own', async () => {
    const h = harness();
    h.sends.carry('new', { since: 1000, tries: 2 }, SAID, h.run('thread'));
    expect(h.sends.takeBack('new')).toEqual({ waiting: { since: 1000, tries: 2 }, say: SAID });
    await h.sends.goAgain('cloud', 5000);
    expect(h.ran).toEqual([]);
    expect(h.sends.takeBack('new')).toEqual({ waiting: null, say: null });
  });

  it('keeps each page’s send apart', async () => {
    const h = harness();
    h.sends.carry('new', { since: 1000, tries: 1 }, SAID, h.run('thread'));
    h.sends.carry('p:w-1', { since: 1000, tries: 1 }, SAID, h.run('reply'));
    expect(h.sends.takeBack('p:w-1').waiting).not.toBeNull();
    await h.sends.goAgain('cloud', 2000);
    expect(h.ran).toEqual(['thread@cloud']);
  });

  it('still offline, waits for the next read, a few tries at most, then leaves its page saying so', async () => {
    const h = harness();
    h.failWith(OFFLINE);
    h.sends.carry('new', { since: 0, tries: 1 }, SAID, h.run('thread'));
    for (let at = 1; at < OFFLINE_TRIES + 3; at++) await h.sends.goAgain('cloud', at * 1000, at * 1000);
    expect(h.ran).toEqual([]);
    expect(h.sends.takeBack('new')).toEqual({ waiting: null, say: 'Not sent. You’re offline. Send it again once you’re back online.' });
  });

  it('failing for another reason, stops and leaves the reason for its page', async () => {
    const h = harness();
    h.sends.carry('new', { since: 0, tries: 1 }, SAID, h.run('thread'));
    h.failWith('new row violates row-level security policy');
    await h.sends.goAgain('cloud', 1000);
    h.failWith(null);
    await h.sends.goAgain('cloud', 2000);
    expect(h.ran).toEqual([]);
    expect(h.sends.takeBack('new')).toEqual({ waiting: null, say: 'Not sent: new row violates row-level security policy' });
  });

  it('is not tried twice while its try is still out', async () => {
    const sends = carriedSends<string>();
    let tries = 0;
    let finish = () => {};
    sends.carry('new', { since: 0, tries: 1 }, SAID, () => { tries++; return new Promise<void>((r) => { finish = r; }); });
    const first = sends.goAgain('cloud', 1000);
    await sends.goAgain('cloud', 2000);
    finish();
    await first;
    expect(tries).toBe(1);
  });
});
