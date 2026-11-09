#!/usr/bin/env node
// What the phone still lacks of the desktop, and what reached it lately.
//
//   node scripts/phone-parity.mjs              the count, then each feature still to do
//   node scripts/phone-parity.mjs --since 7    the features that reached the phone in the last 7 days
//
// The product loop uses both: its testers lean on what reached the phone this
// week, and each day's run builds the first feature still to do.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { toDo } from './lib/desktop-features.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = 'mobile/parity.mjs';

const whole = (e) => !!e?.phone && !e.still;

/** Features that are wholly on the phone in `after` and were not in `before`. */
export function reachedThePhone(before, after) {
  return Object.keys(after).filter((k) => whole(after[k]) && !whole(before[k]));
}

/** The ledger as it stood `days` ago, or its first version if it is younger than that. */
async function ledgerDaysAgo(days) {
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', timeout: 20_000 }).trim();
  const sha = git('rev-list', '-1', `--before=${days} days ago`, 'HEAD', '--', LEDGER)
    || git('rev-list', '--reverse', 'HEAD', '--', LEDGER).split('\n')[0];
  if (!sha) return null;
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'parity-')), 'parity.mjs');
  fs.writeFileSync(tmp, git('show', `${sha}:${LEDGER}`));
  return (await import(pathToFileURL(tmp).href)).PARITY;
}

/** One line per feature that reached the phone in the last `days` days, for a tester's focus. */
export async function newOnThePhone(days) {
  const { PARITY } = await import(pathToFileURL(path.join(root, LEDGER)).href);
  return reachedThePhone((await ledgerDaysAgo(days)) ?? {}, PARITY);
}

const invoked = (() => { try { return fs.realpathSync(process.argv[1] ?? ''); } catch { return ''; } })();
if (invoked && invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const at = process.argv.indexOf('--since');
  if (at > 0) {
    for (const k of await newOnThePhone(Number(process.argv[at + 1]) || 7)) console.log(k);
  } else {
    const { PARITY } = await import(pathToFileURL(path.join(root, LEDGER)).href);
    const left = toDo(PARITY);
    const all = Object.keys(PARITY).length;
    const only = Object.values(PARITY).filter((e) => e.desktopOnly).length;
    console.log(`${all - only - left.length} of ${all - only} desktop features are wholly on the phone; ${only} are desktop only by nature.`);
    for (const k of left) console.log(`${k}: ${PARITY[k].missing ?? `partly there; ${PARITY[k].still}`}`);
  }
}
