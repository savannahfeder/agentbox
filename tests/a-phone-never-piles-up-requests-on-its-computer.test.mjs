// A PHONE NEVER PILES UP REQUESTS ON ITS COMPUTER (2026-10-13).
//
// "Loading is taking an incredible amount of time ... I spend most of my time
// just sitting waiting for agents that say reading this conversation... And
// right now it says too many request at once ... since yesterday the
// performance has gone down dramatically."
//
// "Too many requests at once" is the relay's room turning a phone away when 64
// of its requests are still unanswered (relay/room.mjs). Read in the code, how
// a phone got there:
// - An open thread asks three things (its lines, its trace, its change) on
//   every "something changed" from the computer, which reaches a phone every
//   2 s while any agent anywhere is writing (renderer/src/phone-polls.ts). It
//   asked again whether or not the last three had come back. A long thread's
//   trace takes longer than 2 s through the relay, so the asks overlapped and
//   stacked. Its own comment said it "already guards against overlapping"; the
//   code did not.
// - The day before, a fix for replies to a busy agent (the computer saying
//   "still working" so the room does not give up at 30 s) was switched on for
//   every request a phone made, not only replies. So the pile no longer cleared
//   itself at 30 s, and reached 64.
//
// Now only a reply asks to be waited for, a read in flight is never asked
// again on top of itself (one more follows it if something changed meanwhile),
// and the room has more room.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitsForAgent } from '../relay/phone/tunnel.mjs';
import { oneAtATime } from '../renderer/src/phone-polls.ts';
import { Room } from '../relay/room.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');

describe('which requests may be waited on past 30 s', () => {
  it('a reply, which an agent takes at its next break', () => {
    expect(waitsForAgent('POST', '/api/zero:answer')).toBe(true);
  });
  it('nothing else: a read the computer has not started on in 30 s is given up, as before', () => {
    expect(waitsForAgent('POST', '/api/zero:item-history')).toBe(false);
    expect(waitsForAgent('POST', '/api/zero:snapshot')).toBe(false);
    expect(waitsForAgent('GET', '/api/zero:answer')).toBe(false);
    expect(waitsForAgent('POST', '/api/zero:answer-later')).toBe(false);
  });
  it('the phone asks for it only then', () => {
    expect(src('relay', 'phone', 'tunnel.mjs')).toMatch(/\{ wait = waitsForAgent\(request\.method, new URL\(request\.url\)\.pathname\) \} = \{\}/);
  });
});

describe('one read at a time', () => {
  it('a push while a read is out asks once more when it is back, not once per push', async () => {
    let calls = 0;
    let finish;
    const read = oneAtATime(() => { calls += 1; return new Promise((r) => { finish = r; }); });
    read(); read(); read(); read();
    expect(calls).toBe(1);
    finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2);
    finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2);
  });

  it('a read that fails does not stop the next one', async () => {
    let calls = 0;
    const read = oneAtATime(() => { calls += 1; return Promise.reject(new Error('relay')); });
    read();
    await new Promise((r) => setTimeout(r, 0));
    read();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2);
  });

  it('the thread and its live steps read that way', () => {
    expect(src('renderer', 'src', 'components', 'ItemThread.tsx')).toMatch(/const read = oneAtATime\(\(\) => Promise\.allSettled\(\[/);
    expect(src('renderer', 'src', 'components', 'Live.tsx')).toMatch(/const read = oneAtATime\(\(\) => api\.sessionTrace/);
  });
});

describe('the room', () => {
  it('holds 256 unanswered requests before it turns one away', () => {
    expect(new Room().maxPending).toBe(256);
  });
});
