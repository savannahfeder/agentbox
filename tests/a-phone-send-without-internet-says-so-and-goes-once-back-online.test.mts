// A PHONE SEND WITHOUT INTERNET SAYS SO, AND GOES ONCE THE PHONE IS BACK ONLINE.
//
// QA on 2026-11-04 (M-31, Android) sent a reply and a new thread with wifi and
// data off. The box read "Not sent: fetch failed: java.net.UnknownHostException:
// Unable to resolve host ...", and after the network came back nothing went
// until it was sent again by hand. A send that never reached the internet now
// says so in plain words and, while its page is open, waits for the inbox's
// next good read, then goes once more, a few times at most. Any other failure still says what it was.
import { describe, it, expect } from 'vitest';
import { cantReach, failedSend, dueAgain, OFFLINE_TRIES } from '../mobile/src/lib/offline';

const ANDROID = 'fetch failed: java.net.UnknownHostException: Unable to resolve host "abc.supabase.co": No address associated with hostname';

describe('a failure that never reached the internet', () => {
  it.each([
    ANDROID,
    'Network request failed',
    'TypeError: Failed to fetch',
    'Load failed',
    'The Internet connection appears to be offline.',
    'getaddrinfo ENOTFOUND abc.supabase.co',
    'connect ENETUNREACH 1.2.3.4:443',
    'java.net.ConnectException: Failed to connect to abc.supabase.co/1.2.3.4:443',
  ])('is told apart: %s', (m) => expect(cantReach(m)).toBe(true));

  it.each([
    'new row violates row-level security policy',
    'Not sent.',
    // A timeout may have arrived, so it is not sent twice on its own.
    'The cloud took too long to answer.',
    'Pick a project on the computer that keeps your teammates.',
  ])('is not this: %s', (m) => expect(cantReach(m)).toBe(false));
});

describe('a failed send', () => {
  it('offline, says so plainly and waits', () => {
    const r = failedSend(null, ANDROID, 1000);
    expect(r.say).toBe('Offline. Keep this open and it sends when you’re back.');
    expect(r.say).not.toMatch(/java|fetch|supabase/i);
    expect(r.waiting).toEqual({ since: 1000, tries: 1 });
  });
  it('for any other reason, says the reason and does not wait', () => {
    expect(failedSend({ since: 1, tries: 2 }, 'new row violates row-level security policy', 1000))
      .toEqual({ say: 'Not sent: new row violates row-level security policy', waiting: null });
  });
  it(`stops waiting after ${OFFLINE_TRIES} tries and leaves the send to you`, () => {
    let w = null;
    for (let i = 1; i < OFFLINE_TRIES; i++) w = failedSend(w, ANDROID, i).waiting;
    expect(w.tries).toBe(OFFLINE_TRIES - 1);
    const last = failedSend(w, ANDROID, 99);
    expect(last.waiting).toBeNull();
    expect(last.say).toBe('Not sent. You’re offline. Send it again once you’re back online.');
  });
});

describe('a waiting send goes again', () => {
  it('after a good read that came after it failed', () => expect(dueAgain({ since: 1000, tries: 1 }, 1001)).toBe(true));
  it('not on the good read from before it failed', () => expect(dueAgain({ since: 1000, tries: 1 }, 1000)).toBe(false));
  it('not while the inbox cannot read either', () => expect(dueAgain({ since: 1000, tries: 1 }, 0)).toBe(false));
  it('not when nothing waits', () => expect(dueAgain(null, 5000)).toBe(false));
});
