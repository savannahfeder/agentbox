// THE PHONE APP'S REPLY BOX KEEPS ITS WORDS, SENDS ONCE, AND KEEPS YOUR PLACE.
//
// Codex's parity audit (findings 4, 5, 6, 9) found four ways the app's thread
// screen lost what the phone site keeps:
//   - the reply box held its words in the screen, so leaving the thread lost
//     them (the site keeps a draft per thread, renderer/src/drafts.ts);
//   - busy was set only after the files had uploaded, so a second tap
//     uploaded and sent the reply twice (Focus.tsx guards the whole send);
//   - every update scrolled to the end, pulling the reader off an older
//     message (the site only holds the bottom while you rest there,
//     thread-bottom.ts, and keeps your place when the middle comes back);
//   - signed out, only the inbox went to sign-in; a thread, a new thread and
//     Settings stayed up and took presses that went nowhere.
// These hold mobile/src/lib/thread-reply.ts, thread-scroll.ts and
// thread-gate.ts to the site, and check the three screens use them.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { sendReply, replySender } from '../mobile/src/lib/thread-reply';
import { atEnd, keptPlace } from '../mobile/src/lib/thread-scroll';
import { screenGate } from '../mobile/src/lib/thread-gate';

function box({ text = 'Ship it', files = [] } = {}) {
  const calls = [];
  let held = { text, files, priority: null };
  const draft = {
    get text() { return held.text; },
    get files() { return held.files; },
    take: () => { calls.push('take'); const was = held; held = { text: '', files: [], priority: null }; return was; },
    restore: (d) => { calls.push('restore'); if (held.text) return false; held = d; return true; },
  };
  return { draft, calls, now: () => held };
}

describe('a reply', () => {
  it('is busy before its files upload, and the box empties only once it has gone', async () => {
    const { draft, calls } = box({ files: [{ name: 'a.png', dataBase64: 'x' }] });
    const ok = await sendReply({
      draft,
      busy: (on) => calls.push(on ? 'busy' : 'free'),
      attach: async (files) => { calls.push(`attach ${files.length}`); return [{ rel: 'phone-files/ab.png', name: 'a.png', image: true }]; },
      send: async (text) => { calls.push(`send ${text}`); },
      failed: (m) => calls.push(`failed ${m}`),
    }, {});
    expect(ok).toBe(true);
    expect(calls).toEqual(['busy', 'attach 1', 'send Ship it\n\n![a.png](phone-files/ab.png)', 'take', 'free']);
  });

  it('that fails keeps every word and file in the box, and says why', async () => {
    const { draft, calls, now } = box({ files: [{ name: 'a.png', dataBase64: 'x' }] });
    const ok = await sendReply({ draft, busy: () => {}, attach: async () => { throw new Error('Too big'); }, send: async () => {}, failed: (m) => calls.push(`failed ${m}`) }, {});
    expect(ok).toBe(false);
    expect(calls).toEqual(['failed Too big']);
    expect(now().text).toBe('Ship it');
    expect(now().files.length).toBe(1);
  });

  it('undone puts its words back, unless something new was typed', async () => {
    const { draft, now } = box();
    let undone;
    await sendReply({ draft, busy: () => {}, attach: async () => [], send: async (_t, _c, back) => { undone = back; }, failed: () => {} }, {});
    expect(now().text).toBe('');
    undone();
    expect(now().text).toBe('Ship it');
  });

  it('an empty box sends nothing', async () => {
    const { draft, calls } = box({ text: '  ' });
    expect(await sendReply({ draft, busy: (on) => calls.push(on), attach: async () => [], send: async () => calls.push('send'), failed: () => {} }, {})).toBe(false);
    expect(calls).toEqual([]);
  });

  it('two quick taps send once', async () => {
    const { draft } = box();
    let sent = 0;
    let release;
    const deps = { draft, busy: () => {}, attach: () => new Promise((r) => { release = () => r([]); }), send: async () => { sent += 1; }, failed: () => {} };
    const send = replySender(() => deps);
    const first = send({});
    const second = send({});
    release();
    await Promise.all([first, second]);
    expect(sent).toBe(1);
  });
});

describe('your place in the thread', () => {
  it('follows the end only while you are resting at it', () => {
    expect(atEnd({ y: 1000, view: 600, content: 1600 })).toBe(true);
    expect(atEnd({ y: 980, view: 600, content: 1600 })).toBe(true);
    expect(atEnd({ y: 400, view: 600, content: 1600 })).toBe(false);
  });
  it('stays on the same words when the middle comes back above them', () => {
    // 1000 from the bottom before; the page grew by 2400 above.
    expect(keptPlace(1000, 4000)).toBe(3000);
    expect(keptPlace(5000, 4000)).toBe(0);
  });
});

describe('signed out', () => {
  it('a screen waits while the app opens, then sends you to sign in', () => {
    expect(screenGate({ opened: false, signedIn: false })).toBe('wait');
    expect(screenGate({ opened: true, signedIn: false })).toBe('sign-in');
    expect(screenGate({ opened: true, signedIn: true })).toBe('show');
  });
  it('the thread, the new thread and Settings all ask it', () => {
    for (const file of ['mobile/src/app/thread/[product]/[id].tsx', 'mobile/src/app/new.tsx', 'mobile/src/app/settings/_layout.tsx']) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text, file).toMatch(/screenGate\(/);
      expect(text, file).toMatch(/<Redirect href="\/sign-in" \/>/);
    }
  });
});

describe('the thread screen', () => {
  const text = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');
  it('keeps its reply as a draft per thread', () => {
    expect(text).toMatch(/useDraft\(\{ product: [^,]+, id: [^}]+\}, appStore\)/);
  });
  it('hands every message the files it names, and your own its files', () => {
    expect(text).toMatch(/useMessageFiles\(/);
    expect(text).toMatch(/<SentFiles /);
  });
});
