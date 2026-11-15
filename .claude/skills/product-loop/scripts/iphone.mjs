#!/usr/bin/env node
// A TESTER'S HANDS ON A REAL IPHONE SIMULATOR, the same commands as phone.mjs:
//
//   phone open | look | tap <n|"words"> | type "<text>" | press <key>
//   phone swipe up|down|left|right | home | shot <name> | away <minutes> | reload | close
//
// The iPhone runs on one of GitHub's Macs (iphones.mjs started it); its
// address and key are in $PHONE_OUT/iphone.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPhone } from './iphones.mjs';

export async function ask(phone, verb, args, { ms = 90_000 } = {}) {
  const r = await fetch(`${phone.address}/do`, {
    method: 'POST',
    headers: { authorization: `Bearer ${phone.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ verb, args }),
    signal: AbortSignal.timeout(ms),
  });
  if (r.status === 401) throw new Error('the iPhone did not take this key');
  if (!r.ok) throw new Error(`the iPhone answered ${r.status}`);
  return r.json();
}

const USAGE = 'usage: phone open | look | tap <n|"words"> | type "<text>" | press <key> | swipe up|down|left|right | home | shot <name> | away <minutes> | reload | close';
const VERBS = new Set(['open', 'look', 'tap', 'type', 'press', 'swipe', 'home', 'reload']);

/** Does one command; returns what to print and the exit code. */
export async function command(out, verb, args, { send = ask, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const phone = readPhone(out);
  if (!phone) return { print: 'No iPhone is running for you yet. Note it in the diary, then try again in a few minutes.', code: 1 };
  if (verb === 'close') return { print: 'Closed.', code: 0 };
  if (verb === 'away') {
    const ms = Math.min(Math.max(Number(args[0]) || 1, 0.25), 9) * 60_000;
    await wait(ms);
    const a = await send(phone, 'look', []);
    return { print: `You put the phone down for ${Math.round(ms / 60_000)} minutes.\n${a.text ?? a.error}`, code: a.error ? 1 : 0 };
  }
  if (verb === 'shot') {
    const name = `${String(args[0] || `phone-${Date.now()}`).replace(/[^\w.-]+/g, '-').replace(/\.png$/, '')}.png`;
    const a = await send(phone, 'shot', []);
    if (!a.png) return { print: `That did not work: ${a.error ?? 'no picture came back'}`, code: 1 };
    fs.writeFileSync(path.join(out, name), Buffer.from(a.png, 'base64'));
    return { print: `Saved ${name}. Open it at ${path.join(out, name)} to see the screen.`, code: 0 };
  }
  if (!VERBS.has(verb)) return { print: USAGE, code: 2 };
  if (verb === 'swipe' && !['up', 'down', 'left', 'right'].includes(args[0])) return { print: 'swipe up, down, left or right.', code: 2 };
  const a = await send(phone, verb, args);
  return a.error ? { print: a.error, code: 1 } : { print: a.text, code: 0 };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = process.env.PHONE_OUT;
  if (!out) { console.log('No phone test is running (PHONE_OUT is not set).'); process.exit(1); }
  const [verb, ...args] = process.argv.slice(2);
  const log = (extra = {}) => fs.appendFileSync(path.join(out, 'actions.jsonl'), `${JSON.stringify({ at: Date.now(), verb, args, ...extra })}\n`);
  try {
    const r = await command(out, verb, args);
    console.log(r.print);
    log(r.code ? { error: r.print.slice(0, 300) } : {});
    process.exit(r.code);
  } catch (err) {
    log({ error: err.message });
    console.log(`The iPhone did not respond (${err.message}). Note it, then try look again in a minute.`);
    process.exit(1);
  }
}
