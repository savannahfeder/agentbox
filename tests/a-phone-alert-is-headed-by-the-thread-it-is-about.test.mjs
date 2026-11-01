// A PHONE ALERT IS HEADED BY THE THREAD IT IS ABOUT (2026-10-13).
//
// Reported from a phone: "the notifications aren't too helpful because they
// don't show me the title of the chat at the top like the bold text should be
// the specific chat title so I know which thread we're talking about."
//
// Measured: the phone's alert used the desktop banner's words, whose bold line
// is a fixed sentence ("An agent is ready"), and the line under it was the
// row's raw `title`, which on a thread started from a message is the whole
// first sentence typed, not the name the list shows. So the phone's bold line
// is now the thread's name as the list draws it (rowTitle), and the sentence
// moves under it. The desktop banner keeps its own two lines.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { banner, phoneBanner } from '../shared/notify-rules.mjs';
import { createPhoneLink } from '../main/phone-link.mjs';

describe('what a phone alert says', () => {
  it('one finished thread: its name in bold, the sentence under it', () => {
    expect(phoneBanner([{ id: 'w-1', title: 'Fix the login page', kind: 'item' }]))
      .toEqual({ title: 'Fix the login page', body: 'An agent is ready', open: 'w-1' });
  });

  it('several: the newest thread in bold, and the sentence says there are more', () => {
    const say = phoneBanner([
      { id: 'w-1', title: 'Older thread', kind: 'item' },
      { id: 'w-2', title: 'Newest thread', kind: 'item' },
    ]);
    expect(say.title).toBe('Newest thread');
    expect(say.body).toBe('Agents are ready');
    expect(say.open).toBe('w-2');
  });

  it('an approval is headed by the thread that is asking, and says what it wants to run', () => {
    const say = phoneBanner([{ id: 'a-1', title: 'npm publish', thread: 'Ship the release', kind: 'approval' }]);
    expect(say.title).toBe('Ship the release');
    expect(say.body).toBe('Waiting on you: npm publish');
  });

  it('an approval with no thread to name falls back to the plain sentence, never an empty bold line', () => {
    const say = phoneBanner([{ id: 'a-1', title: 'npm publish', kind: 'approval' }]);
    expect(say.title).toBe('An agent is waiting on you');
    expect(say.body).toBe('npm publish');
  });

  it('a thread with no name at all keeps the plain sentence in bold', () => {
    expect(phoneBanner([{ id: 'w-1', title: '   ', kind: 'item' }]).title).toBe('An agent is ready');
  });

  it('a long name is clipped, not left for the phone to cut mid-word', () => {
    const say = phoneBanner([{ id: 'w-1', title: 'word '.repeat(60), kind: 'item' }]);
    expect(say.title.length).toBeLessThan(120);
  });

  it('nothing waiting is nothing to say', () => {
    expect(phoneBanner([])).toBeNull();
  });

  it('the desktop banner is unchanged: its bold line is still the sentence', () => {
    expect(banner([{ id: 'w-1', title: 'Fix the login page', kind: 'item' }]).title).toBe('An agent is ready');
  });
});

describe('the inbox names the thread the way the list does', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const arrivals = app.slice(app.indexOf('const arrivals = ['), app.indexOf('window.zero?.notify?.(arrivals)'));

  it('a finished thread arrives under its list name, not its first message', () => {
    expect(arrivals).toMatch(/fresh\.map\(\(i\) => \(\{ id: i\.id, title: rowTitle\(i\)/);
  });

  it('an approval arrives with the name of the thread it belongs to', () => {
    expect(arrivals).toMatch(/thread:/);
  });
});

describe('the alert the phone is sent', () => {
  it('carries the thread name as its title', async () => {
    const sent = [];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-alert-title-'));
    const link = createPhoneLink({
      file: path.join(dir, 'phone-link.json'), channels: new Map(), listeners: new Set(), port: 0,
      interfaces: () => ({ en0: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }] }),
      log: {}, tailscale: null, warm: () => {}, coalesceMs: 10, atDesk: () => false,
      send: async (s, body) => { sent.push(JSON.parse(body)); },
    });
    try {
      await link.act({ action: 'on' });
      for (let i = 0; i < 100 && !(await link.status()).listening; i++) await new Promise((r) => setTimeout(r, 10));
      const { port } = await link.status();
      await new Promise((resolve, reject) => {
        const req = http.request({
          host: '127.0.0.1', port, path: '/phone/alerts', method: 'POST',
          headers: { 'x-agentbox-token': link.key, 'x-agentbox-device': 'ph', 'content-type': 'application/json' },
        }, (res) => { res.resume(); res.on('end', resolve); });
        req.on('error', reject);
        req.end(JSON.stringify({ action: 'subscribe', subscription: { endpoint: 'https://web.push.apple.com/1', keys: { p256dh: 'BP1', auth: 'au1' } } }));
      });
      link.arrivals([{ id: 'w-1', title: 'Fix the login page', kind: 'item' }]);
      await new Promise((r) => setTimeout(r, 60));
      expect(sent).toHaveLength(1);
      expect(sent[0].title).toBe('Fix the login page');
      expect(sent[0].body).toBe('An agent is ready');
      expect(sent[0].open).toBe('w-1');
    } finally {
      link.close();
    }
  });
});
