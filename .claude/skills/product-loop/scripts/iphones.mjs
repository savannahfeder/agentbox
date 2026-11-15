#!/usr/bin/env node
// IPHONES ON GITHUB'S MACS, ONE PER TESTER (.github/workflows/iphone-for-testers.yml).
//
//   node iphones.mjs start --out <tester folder> [--hours 5] [--build-url <simulator .tar.gz>]
//   node iphones.mjs stop --out <tester folder>
//
// `start` makes a key, hands GitHub only its sha256 (the run and its log are
// public), waits for the run to name its address, and writes iphone.json in
// the folder for iphone.mjs. The first run for a new version of the app
// builds it there, which takes a while; later ones reuse that build.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const WORKFLOW = 'iphone-for-testers.yml';
const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(here, '../../../..');

export const newKey = () => crypto.randomBytes(32).toString('hex');
export const ticketOf = (key) => crypto.createHash('sha256').update(key).digest('hex');

/** `owner/name` from a GitHub remote, ssh or https. */
export function repoOf(remote) {
  const m = String(remote ?? '').trim().match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** The run started for this ticket: its title carries the ticket (run-name in the workflow). */
export function runFor(runs, ticket) {
  return (runs ?? []).find((r) => String(r.display_title ?? r.name ?? '').includes(ticket)) ?? null;
}

/** The phone's address, which the run gives as the name of an artifact: iphone-at-<tunnel name>. */
export function addressFrom(artifacts) {
  for (const a of artifacts ?? []) {
    const m = String(a.name ?? '').match(/^iphone-at-([a-z0-9-]+)$/);
    if (m && !a.expired) return `https://${m[1]}.trycloudflare.com`;
  }
  return null;
}

function gh(args, { ms = 30_000, bin = 'gh' } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: ms, maxBuffer: 16 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) reject(new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${String(errOut || err.message).trim().slice(-300)}`));
      else resolve(out);
    });
  });
}
const ghJson = async (p, opts) => JSON.parse(await gh(['api', p], opts));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function repoHere() {
  return new Promise((resolve) => execFile('git', ['-C', REPO_DIR, 'remote', 'get-url', 'origin'], { timeout: 10_000 }, (err, out) => resolve(err ? null : repoOf(out))));
}

/** Asks the iPhone whether it is still there and still ours. */
export async function alive(phone, { ms = 15_000 } = {}) {
  if (!phone?.address || !phone?.key) return false;
  try {
    const r = await fetch(`${phone.address}/hello`, { headers: { authorization: `Bearer ${phone.key}` }, signal: AbortSignal.timeout(ms) });
    return r.ok;
  } catch { return false; }
}

/** Starts one iPhone and waits for its address. Throws, saying why, when the run ends or the wait runs out. */
export async function startIPhone({ repo, hours = 5, buildUrl = null, waitMinutes = 90, say = () => {}, bin = 'gh', poll = 20_000 }) {
  const key = newKey();
  const ticket = ticketOf(key);
  const fields = ['-f', `ticket=${ticket}`, '-f', `hours=${hours}`, ...(buildUrl ? ['-f', `build_url=${buildUrl}`] : [])];
  await gh(['workflow', 'run', WORKFLOW, '-R', repo, ...fields], { bin });
  const until = Date.now() + waitMinutes * 60_000;
  let run = null;
  while (!run && Date.now() < until) {
    await sleep(Math.min(poll, 10_000));
    const list = await ghJson(`repos/${repo}/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=30`, { bin }).catch(() => null);
    run = runFor(list?.workflow_runs, ticket);
  }
  if (!run) throw new Error(`GitHub never started the iPhone run (${WORKFLOW} on ${repo})`);
  say(`iPhone run ${run.html_url} started; waiting for its address`);
  while (Date.now() < until) {
    const arts = await ghJson(`repos/${repo}/actions/runs/${run.id}/artifacts`, { bin }).catch(() => null);
    const address = addressFrom(arts?.artifacts);
    if (address) {
      const phone = { address, key, repo, runId: run.id, runUrl: run.html_url, startedAt: Date.now() };
      // The tunnel's name can take a few seconds to reach every resolver.
      for (let i = 0; i < 12; i++) { if (await alive(phone)) return phone; await sleep(5000); }
      throw new Error(`the iPhone named ${address} but does not answer there (${run.html_url})`);
    }
    const now = await ghJson(`repos/${repo}/actions/runs/${run.id}`, { bin }).catch(() => null);
    if (now?.status === 'completed') throw new Error(`the iPhone run ended (${now.conclusion}) before it had an address: ${run.html_url}`);
    await sleep(poll);
  }
  throw new Error(`the iPhone had no address after ${waitMinutes} minutes: ${run.html_url}`);
}

/** Lets the iPhone go: asks it to stop, then cancels its run in case it did not hear. */
export async function stopIPhone(phone, { bin = 'gh' } = {}) {
  if (!phone) return;
  if (phone.address && phone.key) {
    await fetch(`${phone.address}/stop`, { method: 'POST', headers: { authorization: `Bearer ${phone.key}` }, signal: AbortSignal.timeout(10_000) }).catch(() => {});
  }
  if (phone.repo && phone.runId) {
    await sleep(5000);
    const now = await ghJson(`repos/${phone.repo}/actions/runs/${phone.runId}`, { bin }).catch(() => null);
    if (now && now.status !== 'completed') await gh(['run', 'cancel', String(phone.runId), '-R', phone.repo], { bin }).catch(() => {});
  }
}

export const phoneFile = (dir) => path.join(dir, 'iphone.json');
export function readPhone(dir) {
  try { return JSON.parse(fs.readFileSync(phoneFile(dir), 'utf8')); } catch { return null; }
}
export function writePhone(dir, phone) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(phoneFile(dir), JSON.stringify(phone, null, 2), { mode: 0o600 });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (n, f = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : f; };
  const out = opt('out');
  if (!out || !['start', 'stop'].includes(args[0])) { console.log('usage: iphones.mjs start|stop --out <tester folder> [--hours 5] [--build-url <url>] [--repo owner/name]'); process.exit(2); }
  const say = (s) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${s}`);
  try {
    if (args[0] === 'stop') { await stopIPhone(readPhone(out)); fs.rmSync(phoneFile(out), { force: true }); say('the iPhone is stopped'); process.exit(0); }
    const repo = opt('repo') || await repoHere();
    if (!repo) throw new Error('no GitHub repository: pass --repo owner/name');
    const phone = await startIPhone({ repo, hours: Number(opt('hours', 5)), buildUrl: opt('build-url'), say });
    writePhone(out, phone);
    say(`the iPhone is at ${phone.address}; ${path.join(out, 'iphone.json')} holds its key`);
    process.exit(0);
  } catch (err) {
    say(err.message);
    process.exit(1);
  }
}
