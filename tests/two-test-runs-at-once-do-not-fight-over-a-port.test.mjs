// A SHIP BOUNCED THREE TIMES ON TESTS THAT HAD NOTHING TO DO WITH THE CHANGE.
//
// 2026-10-19, w-5cadf05d09: a folder fix, green on its own, was refused three
// times by `npm run ship`, and a different innocent test was named each time
// (a cloud host, a cloud park, then the phone door). A dozen agents work this
// Mac, so two test runs overlap routinely, and the one thing a second run
// cannot have is a port the first one is already on.
//
// MEASURED by running the phone-door file twice at once: one run passed, the
// other failed on "turned back to Wi-Fi, listens on the network again",
// because the file binds 41951 to 41957 by hand. Four phone files did that,
// 31 ports between them; every other test in the suite already asks the
// computer for a free one with `listen(0)` and reads back what it got.
//
// So the fix is both halves: the phone door now reports the port it actually
// bound, which makes `port: 0` usable, and this check keeps the next fixed
// port out.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { createPhoneLink } from '../main/phone-link.mjs';
import { aFreePort } from './helpers/free-port.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * A port number handed to something that listens or connects, as opposed to one
 * written in a sentence. Three shapes, and the third is the one that hid two
 * of these until the others were cleaned up: a file's own helper whose first
 * argument is a port, called with a number.
 */
const named = (text) => [...String(text).matchAll(/\bport(?::|\s*=)\s*(\d{2,5})\b/g)].map((m) => Number(m[1]));

const portTakers = (text) => [...String(text)
  .matchAll(/(?:function\s+([\w$]+)\s*\(\s*port\b|const\s+([\w$]+)\s*=\s*\(?\s*port\s*[,)])/g)]
  .map((m) => m[1] ?? m[2]);

const handedOver = (text) => portTakers(text).flatMap((helper) => [
  ...String(text).matchAll(new RegExp(`\\b${helper}\\(\\s*(\\d{2,5})\\b`, 'g')),
].map((m) => Number(m[1])));

const fixedPorts = (text) => [...named(text), ...handedOver(text)].filter((n) => n !== 0);

// This file's own samples above are strings being matched, not servers being
// started, so the check reads every test but this one.
const ITSELF = path.basename(fileURLToPath(import.meta.url));

describe('a port number written into a test', () => {
  it('is nowhere in the suite, because a second run of it would collide', () => {
    const offenders = fs.readdirSync(HERE)
      .filter((f) => f.endsWith('.test.mjs') && f !== ITSELF)
      .map((f) => [f, fixedPorts(fs.readFileSync(path.join(HERE, f), 'utf8'))])
      .filter(([, ports]) => ports.length > 0)
      .map(([f, ports]) => `${f}: ${ports.join(', ')}`);
    expect(offenders, 'ask for a free port with listen(0) or port: 0 instead').toEqual([]);
  });

  // THE HALF THAT MAKES THE CHECK HONEST. A port in prose, in a payload or in
  // a url being read as text is not a server being told where to listen, and
  // flagging those would make the rule something people route around.
  it('is not the same thing as a port in a sentence', () => {
    expect(fixedPorts('the next `npm run dev` to bind 5199 would have thrown her out')).toEqual([]);
    expect(fixedPorts("description: 'Start the app on port 5173'")).toEqual([]);
    expect(fixedPorts('expect(links(run("It binds localhost on port 3000."))).toEqual([])')).toEqual([]);
    expect(fixedPorts('http://localhost:3000/x')).toEqual([]);
    expect(fixedPorts('port: 41901')).toEqual([41901]);
    expect(fixedPorts('port:41901')).toEqual([41901]);
    expect(fixedPorts('const port = 41975;')).toEqual([41975]);
    expect(fixedPorts('port: 0')).toEqual([]);
    expect(fixedPorts('const port = 0;')).toEqual([]);
  });

  // THE SHAPE THAT HID TWO OF THEM. The number never sits beside the word:
  // the file's own helper takes a port, and the test calls it with 41930.
  it('is caught when a helper in the file takes it as an argument', () => {
    const file = 'const build = (port, send) => createPhoneLink({ port });\nbuild(41930, noop);';
    expect(fixedPorts(file)).toEqual([41930]);
    const fn = 'function ask(port, link) {}\nask(41951, link);';
    expect(fixedPorts(fn)).toEqual([41951]);
    // And the same helper handed a port it read back is the whole point.
    expect(fixedPorts('const build = (port, send) => 0;\nbuild(port, noop);')).toEqual([]);
    expect(fixedPorts('function ask(host, port) {}\nask(lan, 8000);')).toEqual([]);
  });
});

describe('the phone door, asked to take any free port', () => {
  const open = [];
  afterEach(() => { for (const link of open.splice(0)) link.close(); });

  const make = (port) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-port-'));
    const link = createPhoneLink({
      file: path.join(dir, 'phone-link.json'), channels: new Map(), listeners: new Set(), port,
      interfaces: () => ({}), log: {}, tailscale: null, warm: () => {},
    });
    open.push(link);
    return link;
  };

  const listening = async (link) => {
    for (let i = 0; i < 200; i += 1) {
      if ((await link.status()).listening) return;
      await new Promise((r) => setTimeout(r, 10));
    }
  };

  it('says which one it got, and answers there', async () => {
    const link = make(0);
    await link.act({ action: 'on' });
    await listening(link);
    const { port, listening: up } = await link.status();
    expect(up).toBe(true);
    expect(port).toBeGreaterThan(0);
    const answered = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: '/' }, (res) => resolve(res.statusCode)).on('error', reject);
    });
    expect(answered).toBeGreaterThan(0);
  });

  // AND A PORT IT WAS TOLD TO TAKE IS STILL THE PORT IT REPORTS, which is the
  // app's own case: `PHONE_PORT` is fixed so a phone that was paired once can
  // come back to the same address.
  it('still reports a port it was given', async () => {
    const asked = await aFreePort();
    const link = make(asked);
    await link.act({ action: 'on' });
    await listening(link);
    expect((await link.status()).port).toBe(asked);
  });
});
