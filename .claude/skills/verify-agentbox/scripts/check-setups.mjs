#!/usr/bin/env node
// DOES A WHOLE TASK RUN ON CLAUDE CODE SET UP THE WAY OTHER PEOPLE SET IT UP?
//
//   node .claude/skills/verify-agentbox/scripts/check-setups.mjs [setup ...] [--engine claude|codex] [--out <dir>]
//
// For each setup in setups.mjs: bring the browser copy up on a home laid out
// that way, with the real Claude Code (or, for a Codex setup, the real codex)
// on this Mac and a stand-in model (so nothing is billed), then drive one task
// and one reply through the screen:
//
//   setup-task  the answer lands, the worker was offered the app's store
//               tools, its note reached the thread, and no API key the person
//               has was used; or, on a setup that must not run, the thread
//               says why in a plain sentence and nothing was sent
//   reply       the reply is answered and remembers the first turn
//
// and take the copy down. One setup at a time: they share this checkout's
// instance folder, and each runs a real Claude Code. About 40 s a setup.
//
// Exit 0 only if every setup held (known gaps excepted). Evidence per setup in
// <out>/<setup>-<drive>/, and a summary in <out>/setups.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SETUPS } from './setups.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
export const SETUP_DRIVES = ['setup-task', 'reply'];

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  const out = at >= 0 ? path.resolve(args.splice(at, 2)[1]) : path.join('/tmp', 'agentbox-verify', 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-setups`);
  const ea = args.indexOf('--engine');
  const engine = ea >= 0 ? args.splice(ea, 2)[1] : null;
  const wanted = args.filter((a) => !a.startsWith('--'));
  const unknown = wanted.filter((w) => !SETUPS.some((s) => s.name === w));
  if (unknown.length) { console.error(`No such setup: ${unknown.join(', ')}. Setups: ${SETUPS.map((s) => s.name).join(', ')}`); process.exit(2); }
  const setups = (wanted.length ? SETUPS.filter((s) => wanted.includes(s.name)) : SETUPS)
    .filter((s) => !engine || (s.engine ?? 'claude') === engine);
  fs.mkdirSync(out, { recursive: true });
  const live = (a, quiet = true) => spawnSync(process.execPath, [path.join(here, 'live.mjs'), ...a], { cwd: REPO, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' });
  const results = [];
  for (const setup of setups) {
    const r = { setup: setup.name, why: setup.why, drives: {}, ok: true, known: false, wrong: [] };
    live(['down']);
    const up = live(['up', '--setup', setup.name]);
    const doctor = up.status === 0 ? live(['doctor']) : null;
    if (up.status !== 0 || doctor?.status !== 0) {
      r.ok = false;
      r.wrong.push(`the copy did not come up: ${String(up.stderr || doctor?.stdout || '').trim().split('\n').slice(-2).join(' ')}`);
    } else {
      // A setup that must not run has no answer to reply to.
      for (const d of SETUP_DRIVES.filter((x) => x !== 'reply' || setup.expect.answers !== false)) {
        const dir = path.join(out, `${setup.name}-${d}`);
        const run = live(['drive', d, '--out', dir]);
        let report = null;
        try { report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')); } catch { /* the drive died before writing */ }
        const claims = report?.claims ?? [];
        r.drives[d] = { status: run.status, held: claims.filter((c) => c.ok).length, of: claims.length };
        // `known.all`: the setup cannot run a task at all today, so every
        // claim after the first that fails is that one gap again.
        for (const c of claims.filter((x) => !x.ok)) {
          const known = c.known ?? setup.known?.all ?? null;
          if (known) r.known = true; else r.ok = false;
          r.wrong.push(`${known ? 'KNOWN ' : ''}${d}: ${c.sentence}${c.evidence ? ` (${c.evidence})` : ''}`);
        }
        if (setup.known?.all && !claims.some((x) => !x.ok)) r.wrong.push(`${d}: every claim held, so the known gap may be fixed: take known.all off`);
        if (!report) { r.ok = false; r.wrong.push(`${d}: the drive wrote no report: ${String(run.stderr || run.stdout).trim().split('\n').slice(-1)[0]}`); }
      }
    }
    live(['down']);
    results.push(r);
    const mark = r.ok ? (r.known ? 'KNOWN' : 'PASS') : 'FAIL';
    const cells = SETUP_DRIVES.map((d) => (r.drives[d] ? `${d} ${r.drives[d].held}/${r.drives[d].of}` : `${d} -`)).join('  ');
    console.log(`${mark.padEnd(5)} ${setup.name.padEnd(24)} ${cells}`);
    for (const w of r.wrong) console.log(`      ${w}`);
    for (const why of new Set(Object.values(setup.known ?? {}))) if (!r.ok || r.known) console.log(`      known gap: ${why}`);
  }
  fs.writeFileSync(path.join(out, 'setups.json'), `${JSON.stringify({ at: new Date().toISOString(), results }, null, 1)}\n`);
  const bad = results.filter((r) => !r.ok);
  const known = results.filter((r) => r.ok && r.known).length;
  console.log(`\n${results.length - bad.length - known}/${results.length} setups held${known ? `, ${known} with known gap(s)` : ''}. Evidence: ${out}`);
  process.exit(bad.length ? 1 : 0);
}
