#!/usr/bin/env node
// THE PRE-DEPLOY CHECK: ONE COMMAND, THE LAYERS A CHANGE NEEDS, ONE VERDICT.
//
//   node .claude/skills/verify-agentbox/scripts/verify.mjs            the layers this branch needs, in full
//   node .claude/skills/verify-agentbox/scripts/verify.mjs --all      every layer, whatever changed
//   node .claude/skills/verify-agentbox/scripts/verify.mjs --quick    stand-in drives only (for iterating)
//   node .claude/skills/verify-agentbox/scripts/verify.mjs --no-real --no-installed --no-breaker   drop a layer
//   node .claude/skills/verify-agentbox/scripts/verify.mjs --breaker-minutes 20
//   node .claude/skills/verify-agentbox/scripts/verify.mjs --base <ref>    compare against <ref> (default origin/main)
//
// The unit tests are not repeated here: `npm run ship`, the push hook and CI
// run them. This is what they cannot see:
//
//   this-machine  what the app finds on the Mac it runs on, as a Dock launch would. ~2 s.
//   machines      the app's own finders and worker setup on Macs unlike this
//                 one (check-machines.mjs). ~35 s.
//   live          the browser copy on stand-ins, every drive: Codex, six at
//                 once, logins out of usage, a quit and a Control-C mid-run,
//                 replies landing where they were sent. ~10 min.
//   setups        the real Claude Code on homes set up the way other people
//                 set theirs up (hooks, connected tools, a key in a settings
//                 file, two logins), against a stand-in model: a task and a
//                 reply each (check-setups.mjs). Nothing billed. ~40 s a setup.
//   real          the agent drives again on the Claude Code and Codex this Mac
//                 has, signed in as they are, with one-word tasks. ~5-10 min.
//   installed     the real .app, opened with `open` on a throwaway home, and
//                 the agent drives through its own window. ~5 min with the build.
//   breaker       a Claude Code session trying to break the app through the
//                 screen. Its findings are reported, not counted as failures. 15 min.
//
// Exit 0 only when every layer that ran held (known gaps excepted). The
// evidence of every layer goes in one folder under /tmp/agentbox-verify/runs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');

/**
 * WHICH LAYERS A SET OF CHANGED FILES NEEDS. Pure, so it is tested
 * (tests/the-pre-deploy-check-runs-what-a-change-needs.test.mjs).
 *
 * The rule is "could this change what a user's Mac does", not "is it code":
 * anything under main/, shared/, bin/, renderer/ or preload can, and the
 * verify skill itself is re-proved when it changes. Docs, tests and one-off
 * scripts cannot, so a branch of only those runs the cheap layer alone.
 */
export const MACHINE_FILES = [
  /^main\/(shell-path|claude-bin|codex-bin|codex-launch-env|config|harnesses|claude-input)(\.mjs|\/)/,
  /^main\/harnesses\//,
  /^shared\/(engines|fresh-user-home|product-name)\.mjs$/,
  /^package(-lock)?\.json$/,
  /^\.claude\/skills\/verify-agentbox\/scripts\/(machines|check-machines|check-this-machine)\.mjs$/,
];
export const LIVE_FILES = [
  /^(main|shared|bin|renderer|mcp)\//,
  /^preload\.cjs$/,
  /^package(-lock)?\.json$/,
  /^scripts\/lib\/(stub-claude-worker|claude-stub-model|stand-in-world)\.mjs$/,
  /^\.claude\/skills\/verify-agentbox\/scripts\//,
];
export function layersFor(files, { all = false, quick = false, real = true, installed = true, breaker = true, setups = true } = {}) {
  const hit = (rules) => files.filter((f) => rules.some((r) => r.test(f)));
  const machines = hit(MACHINE_FILES);
  const live = hit(LIVE_FILES);
  const liveWhy = all ? '--all' : `touches what the app does: ${live.slice(0, 3).join(', ')}${live.length > 3 ? ' …' : ''}`;
  const appChanges = all || live.length > 0;
  const off = (why) => ({ run: false, why });
  const on = (why) => ({ run: true, why });
  return {
    'this-machine': on('always: it is two seconds and it is the only real Mac in the check'),
    machines: all || machines.length
      ? on(all ? '--all' : `touches how the app finds or starts a tool: ${machines.slice(0, 3).join(', ')}${machines.length > 3 ? ' …' : ''}`)
      : off('nothing here changes how the app finds or starts Claude Code or Codex'),
    live: appChanges ? on(liveWhy) : off('only docs, tests or scripts changed, which a user never runs'),
    // Free (a stand-in model) but a real Claude Code per setup, about 40 s each.
    setups: !appChanges ? off('nothing a user runs changed')
      : quick ? off('--quick') : !setups ? off('--no-setups') : on('most bugs that reached people were about how their Claude Code was set up'),
    real: !appChanges ? off('nothing a user runs changed')
      : quick ? off('--quick') : !real ? off('--no-real') : on('every deploy runs real Claude Code and Codex'),
    installed: !appChanges ? off('nothing a user runs changed')
      : quick ? off('--quick') : !installed ? off('--no-installed') : on('the packaged app is where 11 of 36 escaped bugs lived'),
    breaker: !appChanges ? off('nothing a user runs changed')
      : quick ? off('--quick') : !breaker ? off('--no-breaker') : on('an agent tries what the drives do not'),
  };
}

// The order matters: `every-login-runs-out` leaves every login resting until
// the reset it was told, so nothing can run after it on the same copy.
export const DRIVE_ORDER = [
  'inbox-opens', 'new-thread', 'reply', 'codex-thread', 'many-at-once', 'reply-lands-where-shown',
  'one-login-runs-out', 'restart-mid-run', 'ctrl-c-mid-run', 'undo-says-what-happened', 'every-login-runs-out',
];
// On real Claude Code and Codex: the agent drives, with one-word tasks.
export const REAL_ORDER = ['new-thread', 'reply', 'codex-thread', 'many-at-once'];
// Through the installed app's own window.
export const INSTALLED_ORDER = ['inbox-opens', 'new-thread', 'codex-thread', 'many-at-once', 'one-login-runs-out', 'every-login-runs-out'];

function changedFiles(base) {
  try {
    const committed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: REPO, encoding: 'utf8' });
    const working = execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' })
      .split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop());
    return [...new Set([...committed.split('\n').filter(Boolean), ...working])];
  } catch { return null; }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
  const base = opt('base', 'origin/main');
  const breakerMinutes = opt('breaker-minutes', '15');
  const files = changedFiles(base);
  if (!files && !all) { console.error(`verify: could not diff against ${base}. Pass --all, or --base <ref>.`); process.exit(2); }
  const layers = layersFor(files ?? [], {
    all, quick: args.includes('--quick'),
    real: !args.includes('--no-real'), installed: !args.includes('--no-installed'), breaker: !args.includes('--no-breaker'),
    setups: !args.includes('--no-setups'),
  });
  const out = path.join('/tmp', 'agentbox-verify', 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-verify`);
  fs.mkdirSync(out, { recursive: true });
  const node = (script, a, label) => {
    console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 66 - label.length))}`);
    return spawnSync(process.execPath, [path.join(here, script), ...a], { cwd: REPO, stdio: 'inherit' }).status;
  };
  const results = [];
  console.log(`verify: ${files ? `${files.length} file(s) differ from ${base}` : 'every layer'}`);
  for (const [name, l] of Object.entries(layers)) console.log(`  ${l.run ? 'run ' : 'skip'}  ${name.padEnd(13)} ${l.why}`);

  if (layers['this-machine'].run) results.push(['this-machine', node('check-this-machine.mjs', ['--out', path.join(out, 'this-machine')], 'this machine')]);
  if (layers.machines.run) results.push(['machines', node('check-machines.mjs', ['--out', path.join(out, 'machines')], 'machines unlike this one')]);
  // One copy at a time (they share this checkout's instance folder), each
  // brought up fresh, checked, used, and always taken down.
  const onCopy = (layer, upArgs, use) => {
    const upped = node('live.mjs', ['up', ...upArgs], `${layer}: up`);
    if (upped !== 0) { results.push([`${layer}: up`, upped]); node('live.mjs', ['down'], `${layer}: down`); return; }
    try {
      const doc = node('live.mjs', ['doctor'], `${layer}: doctor`);
      if (doc !== 0) results.push([`${layer}: doctor`, doc]);
      else use();
    } finally {
      node('live.mjs', ['down'], `${layer}: down`);
    }
  };
  const drives = (layer, order) => () => {
    for (const d of order) {
      const s = node('live.mjs', ['drive', d, '--out', path.join(out, `${layer}-${d}`)], `${layer}: ${d}`);
      results.push([`${layer}: ${d}`, s]);
      // Invariant: never drive an instance that has not been checked
      // since it last did something surprising.
      if (s !== 0 && node('live.mjs', ['doctor'], `${layer}: doctor after a failed drive`) !== 0) break;
    }
  };
  if (layers.live.run) onCopy('live', [], drives('live', DRIVE_ORDER));
  // Brings each copy up and down itself, one setup at a time.
  if (layers.setups.run) results.push(['setups', node('check-setups.mjs', ['--out', path.join(out, 'setups')], 'other people\'s Claude Code setups')]);
  if (layers.real.run) onCopy('real', ['--real'], drives('real', REAL_ORDER));
  if (layers.installed.run) onCopy('installed', ['--installed'], drives('installed', INSTALLED_ORDER));
  // On a fresh stand-in copy, where it can make agents hang or run out on
  // purpose. Its findings are judgement, so they are printed for the person
  // and only a breaker that could not run at all fails the check.
  if (layers.breaker.run) {
    onCopy('breaker', [], () => results.push(['breaker', node('breaker.mjs', ['--minutes', breakerMinutes, '--out', path.join(out, 'breaker')], 'breaker')]));
  }
  const bad = results.filter(([, s]) => s !== 0);
  console.log(`\n── verdict ${'─'.repeat(59)}`);
  for (const [name, s] of results) console.log(`  ${s === 0 ? 'held' : 'FAIL'}  ${name}`);
  let found = [];
  try { found = JSON.parse(fs.readFileSync(path.join(out, 'breaker', 'findings.json'), 'utf8')); } catch { /* no breaker, or nothing written */ }
  if (found.length) {
    console.log(`\nThe breaker found ${found.length} thing(s) for a person to read (not counted above):`);
    for (const f of found) console.log(`  ${String(f.severity ?? '?').toUpperCase().padEnd(9)} ${f.title}`);
  }
  console.log(`\n${bad.length ? `NOT READY: ${bad.length} layer(s) failed.` : 'Ready to ship: every layer that ran held.'} Evidence: ${out}`);
  process.exit(bad.length ? 1 : 0);
}
