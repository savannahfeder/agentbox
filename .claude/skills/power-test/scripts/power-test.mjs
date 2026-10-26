#!/usr/bin/env node
// A POWER TEST: PEOPLE AGENTBOX IS FOR, USING IT FOR HOURS, WHILE THINGS AROUND THEM GO WRONG.
//
//   node .claude/skills/power-test/scripts/power-test.mjs
//     --who startup-engineer,founder | random:2 | all   who tests (../people; default random:2)
//     --hours 2 | --minutes 45                         how long (default 1 hour)
//     --focus "what the team shipped"                  what the testers lean on
//     --real                                           the Claude Code and Codex this computer has, on their plans (billed)
//     --cloud                                          every thread in this Mac's cloud (implies --real); the Mac sleeps and shuts under the runs
//     --cloud-accounts a@x.com,b@y.com                 the cloud accounts the copies may spend, of those signed in (default all)
//     --chaos none|light|normal|heavy                  what goes wrong around them (default normal)
//     --round-minutes 20                               one tester session, before it is started again with its diary
//     --model <alias>                                  the testers' model
//     --tester-login inherit                           testers sign in with this session's variables
//     --testers external                               the agent that started this runs each stretch itself
//     --keep                                           leave the copies up afterwards
//     --team <file> --room <name>                      one tester signs in to a real team (live.mjs --team) and talks in that room
//
// For each person: a copy of the app of their own (live.mjs with
// VERIFY_INSTANCE=power-<who>), shaped like their setup; a watcher reading it
// every minute (watch.mjs); the stand-ins' world changing on the clock
// (plan.mjs chaosPlan); and a Claude Code session playing them through two
// commands in their folder, `app` (browse.mjs) and `diary` (diary.mjs),
// started again with its diary until the clock runs out. Evidence and
// report.md go to /tmp/agentbox-verify/runs/<time>-power/.
//
// --testers external is for where a Claude Code started from here cannot sign
// in (the Agentbox cloud blanks the session's key for what it starts): each
// stretch's prompt is written to round-NN.prompt.md, and the stretch ends when
// round-NN.done appears, written by the agent that ran it as a subagent.
//
// The testers are not the app's workers. The copy and its workers get the
// clean environment live.mjs gives them; only the testers' own Claude Code
// signs in, with its own login, or with this session's under --tester-login.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPeople, pickPeople, chaosPlan, worldAt, nextRound, restartAgain, roundOutcome, coverage, testerPrompt, projectNamedIn } from './plan.mjs';
import { createWatcher, freeMemoryMb, readAllLines, keepEvidence, sleepTargets } from './watch.mjs';
import { writeReport } from './report.mjs';
import { readDiary } from './diary.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const VERIFY = path.resolve(here, '../../verify-agentbox/scripts');
const LIVE = path.join(VERIFY, 'live.mjs');
const BROWSE = path.join(VERIFY, 'browse.mjs');
const DIARY = path.join(here, 'diary.mjs');
const { cleanEnv, RUNS, REPO, instanceDir } = await import(LIVE);
const { machinery } = await import(path.join(VERIFY, 'drives.mjs'));
const { findClaudeBin } = await import(path.join(REPO, 'main', 'claude-bin.mjs'));

const MIN = 60_000;
const args = process.argv.slice(2);
const opt = (name, fallback = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const flag = (name) => args.includes(`--${name}`);
const say = (s) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
const stop = (s) => { console.error(`power-test: ${s}`); process.exit(1); };
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const readJsonl = (file) => { try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
const node = process.execPath;

let people;
try { people = pickPeople(opt('who', 'random:2'), readPeople(path.join(here, '..', 'people'))); } catch (err) { stop(err.message); }
const totalMs = ((Number(opt('hours', 0)) * 60) + Number(opt('minutes', 0))) * MIN || 60 * MIN;
const roundMs = Math.max(2, Number(opt('round-minutes', 20))) * MIN;
const chaos = opt('chaos', 'normal');
const cloud = flag('cloud');
const real = flag('real') || cloud;
const cloudAccounts = opt('cloud-accounts');
if (cloudAccounts && !cloud) stop('--cloud-accounts narrows the cloud\'s accounts: add --cloud.');
const focus = opt('focus');
const alpha = opt('alpha');
const model = opt('model');
const inherit = opt('tester-login') === 'inherit';
const external = opt('testers') === 'external';
const team = opt('team');
const room = opt('room');
if (team && people.length !== 1) stop('--team signs one account in, so it runs one tester: name them with --who.');
if (room && !team) stop('--room needs --team: a copy with no team is in no room.');
try { chaosPlan(chaos, totalMs); } catch (err) { stop(err.message); }

// A cloud run holds a stand-in of a few megabytes here, not an agent.
const need = people.length * (real && !cloud ? 2500 : 1200) + 1000;
const free = freeMemoryMb();
if (free < need) stop(`${people.length} ${people.length === 1 ? 'person needs' : 'people need'} about ${(need / 1024).toFixed(1)} GB free and this computer has ${(free / 1024).toFixed(1)} GB. Run fewer with --who.`);
const claude = findClaudeBin({});
if (!claude.found && !external) stop('there is no Claude Code on this computer for the testers to run on.');

/** The testers' environment: clean, with this session's sign-in only when asked, and Bash allowed to wait out an away. */
function testerEnv(extra = {}) {
  const env = { ...cleanEnv(), BASH_DEFAULT_TIMEOUT_MS: '660000', BASH_MAX_TIMEOUT_MS: '660000', ...extra };
  if (inherit) for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR']) if (process.env[k]) env[k] = process.env[k];
  return env;
}

/** A child with a deadline, so nothing here waits for ever. */
function run(cmd, argv, { env = process.env, timeoutMs = 10 * MIN, cwd = REPO } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { out += `\n(stopped after ${Math.round(timeoutMs / 1000)} s)`; child.kill('SIGKILL'); }, timeoutMs);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}
const live = (name, ...verb) => {
  const shut = verb.indexOf('--shut-for');
  return run(node, [LIVE, ...verb], { env: { ...process.env, VERIFY_INSTANCE: name }, timeoutMs: 15 * MIN + (shut >= 0 ? Number(verb[shut + 1]) * 1000 : 0) });
};

/** `app` and `diary` in the person's folder: the tester's two commands, each knowing which copy and diary it is for. */
function layCommands(dir, name) {
  const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
  for (const [cmd, script] of [['app', BROWSE], ['diary', DIARY]]) {
    fs.writeFileSync(path.join(dir, cmd), `#!/bin/sh\nexport VERIFY_INSTANCE=${q(name)} BREAKER_OUT=${q(dir)} POWER_OUT=${q(dir)}\nexec ${q(node)} ${q(script)} "$@"\n`, { mode: 0o755 });
  }
  return { browse: path.join(dir, 'app'), diary: path.join(dir, 'diary') };
}
const testerArgs = (prompt, dir) => [
  '-p', prompt, '--output-format', 'stream-json', '--verbose',
  '--allowedTools', `Bash(${path.join(dir, 'app')}:*)`, `Bash(${path.join(dir, 'diary')}:*)`, `Read(/${dir}/**)`,
  '--disallowedTools', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'Write', 'Edit', 'NotebookEdit',
  '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
  ...(model ? ['--model', model] : []),
];

const root = path.join(RUNS, `${new Date().toISOString().replace(/[:.]/g, '-')}-power`);
fs.mkdirSync(root, { recursive: true });
say(`power test: ${people.map((p) => p.name).join(', ')} for ${Math.round(totalMs / MIN)} min on ${cloud ? 'the real Claude Code and Codex in this Mac\'s cloud' : real ? 'the real Claude Code and Codex' : 'stand-ins'}, chaos ${chaos}.`);
say(`evidence: ${root}  (progress.json there says how it is going)`);

if (!external) {
  const check = await run(claude.path, ['-p', 'Reply with the single word ready.', '--output-format', 'json', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', ...(model ? ['--model', model] : [])],
    { env: testerEnv(), timeoutMs: 2 * MIN, cwd: root });
  let said = '';
  try { said = String(JSON.parse(check.out.trim().split('\n').pop()).result ?? ''); } catch { said = ''; }
  if (!/ready/i.test(said)) {
    stop(`the testers' Claude Code did not answer a one-word check, so no tester could run: "${said || check.out.trim().slice(-300)}". Sign Claude Code in on this computer, try --tester-login inherit, or run the stretches yourself with --testers external.`);
  }
}

/** The person's projects with real code in them, so real agents have work to do. */
function seedCode(state) {
  const git = (cwd, ...a) => run('git', a, { cwd, timeoutMs: MIN });
  return Promise.all(Object.values(state.repos).map(async (repo, i) => {
    fs.cpSync(path.join(here, '..', 'fixtures', i % 2 ? 'web' : 'api'), repo, { recursive: true });
    await git(repo, 'add', '-A');
    await git(repo, '-c', 'user.email=power@agentbox.invalid', '-c', 'user.name=power test', 'commit', '-qm', 'The code so far');
  }));
}

/** An inbox with a past: done, waiting and put-off threads from the last month, written as the app writes them. */
function seedHistory(state, person, count) {
  const ids = new Set();
  const slugs = Object.keys(state.repos);
  const titles = [...person.plate, 'Look into the flaky test on main', 'Update dependencies', 'Write release notes', 'Tidy up the README', 'Find out why CI is slow'];
  const named = (title) => slugs[projectNamedIn(title, person.projects)];
  const now = Date.now();
  const byProject = new Map(slugs.map((s) => [s, []]));
  for (let i = 0; i < count; i++) {
    const id = `w-${crypto.randomBytes(5).toString('hex')}`;
    ids.add(id);
    const at = now - Math.round((30 * 24 * 60 * MIN) * ((i + 1) / (count + 1)));
    const title = titles[i % titles.length];
    const lines = byProject.get(named(title) ?? slugs[i % slugs.length]);
    lines.push({ id, ts: at, source: 'system', patch: { title, status: 'open', kind: 'directive', priority: 5, labels: ['founder'] } });
    lines.push({ id, ts: at + 3, source: 'founder', patch: { title, model: 'opus' } });
    lines.push({ id, ts: at + 5 * MIN, source: 'agent', patch: { result: `Done: ${title}.` } });
    const r = i % 20;
    if (r === 0) lines.push({ id, ts: at + 6 * MIN, source: 'founder', patch: { runAt: now + 24 * 60 * MIN } });
    else if (r > 2) lines.push({ id, ts: at + 20 * MIN, source: 'founder', patch: { status: 'done' } });
  }
  for (const [slug, lines] of byProject) {
    const dir = machinery(state, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'work-items.jsonl'), lines.sort((a, b) => a.ts - b.ts).map((l) => `${JSON.stringify(l)}\n`).join(''));
  }
  return ids;
}

const setups = [];
for (const person of people) {
  const name = `power-${person.slug}`;
  const dir = path.join(root, person.slug);
  fs.mkdirSync(dir, { recursive: true });
  const shape = real ? [] : ['--logins', String(person.logins), ...(person.codex ? [] : ['--no-codex'])];
  say(`${person.name}: starting a copy of the app shaped like their setup`);
  const up = await live(name, 'up', ...(real ? ['--real'] : []), ...(cloud ? ['--cloud'] : []), ...(cloudAccounts ? ['--cloud-accounts', cloudAccounts] : []), ...shape, '--projects', person.projects.join(','), ...(team ? ['--team', team] : []), ...(alpha ? ['--alpha', alpha] : []));
  fs.writeFileSync(path.join(dir, 'up.log'), up.out);
  const stateFile = path.join(instanceDir(name), 'instance.json');
  const state = readJson(stateFile);
  if (up.code !== 0 || !state) { setups.push({ person, name, dir, failed: `its copy did not start: ${up.out.trim().split('\n').pop()}` }); continue; }
  await seedCode(state);
  const seeded = person.history ? seedHistory(state, person, person.history) : new Set();
  if (seeded.size) await live(name, 'restart');
  setups.push({ person, name, dir, stateFile, seeded, cmds: layCommands(dir, name) });
}

const startedAt = Date.now();
const deadline = startedAt + totalMs;
let stopping = false;
const testers = new Set();
const frozen = new Set();
// A whole Mac asleep: single processes, the cloud relay among them, not one group.
const frozenPids = new Set();
const progress = {};
const writeProgress = () => fs.writeFileSync(path.join(root, 'progress.json'), `${JSON.stringify({ startedAt, endsAt: deadline, people: progress }, null, 1)}\n`);
const killGroup = (child) => {
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ }
  setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }, 10_000).unref();
};
const wake = () => {
  for (const pid of frozen) { try { process.kill(-pid, 'SIGCONT'); } catch { /* gone */ } }
  for (const pid of frozenPids) { try { process.kill(pid, 'SIGCONT'); } catch { /* gone */ } }
  frozen.clear();
  frozenPids.clear();
};
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (stopping) process.exit(130);
    say('stopping: ending the testers, then writing the report and taking the copies down');
    stopping = true;
    for (const t of testers) killGroup(t);
    wake();
  });
}

function lastWords(file) {
  const events = readJsonl(file);
  const result = events.filter((e) => e.type === 'result').pop();
  if (result) return String(result.result ?? '');
  const said = events.filter((e) => e.type === 'assistant').flatMap((e) => e.message?.content ?? []).filter((c) => c.type === 'text').pop();
  return String(said?.text ?? '');
}

const since = (at) => { const m = Math.round((at - startedAt) / MIN); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
function diaryTail(dir) {
  const { entries, issues } = readDiary(path.join(dir, 'diary.jsonl'));
  return entries.slice(-30).map((e) => {
    const text = (s) => String(s ?? '').slice(0, 240);
    if (e.kind === 'note') return `[${since(e.at)}] ${text(e.text)}`;
    if (e.kind === 'issue') return `[${since(e.at)}] logged issue ${issues.findIndex((i) => i.at === e.at) + 1} (${e.severity}): ${text(e.title)}`;
    return `[${since(e.at)}] saw issue ${e.n} again: ${text(e.text)}`;
  });
}

/** One stretch run by the agent that started the test: its prompt on disk, over when round-NN.done appears. */
async function externalStretch({ dir, round, prompt, endsAt, person }) {
  const stem = path.join(dir, `round-${String(round).padStart(2, '0')}`);
  fs.writeFileSync(`${stem}.prompt.md`, `${prompt}\n\nWhen diary time says this stretch is over, stop and answer with one line saying what you did.\n`);
  progress[person.slug].waiting = `${stem}.prompt.md`;
  writeProgress();
  say(`${person.name}: stretch ${round} is waiting for its tester: run ${stem}.prompt.md as a subagent, then write ${stem}.done`);
  // Grace for a subagent that overruns its stretch, but the clock still ends the test.
  const giveUp = Math.min(endsAt + 15 * MIN, deadline + 2 * MIN);
  while (!stopping && !fs.existsSync(`${stem}.done`) && Date.now() < giveUp) await new Promise((r) => setTimeout(r, 2000));
  delete progress[person.slug].waiting;
  const done = fs.existsSync(`${stem}.done`);
  return { code: done ? 0 : null, words: done ? fs.readFileSync(`${stem}.done`, 'utf8').trim() : 'no tester ran this stretch' };
}

async function runPerson({ person, name, dir, stateFile, seeded, failed, cmds }) {
  const result = { slug: person.slug, name: person.name, role: person.role, dir, rounds: 0, stopped: failed ?? null, coverage: null };
  progress[person.slug] = { round: 0, stopped: result.stopped };
  if (failed) return result;
  const state = () => readJson(stateFile);
  const events = chaosPlan(chaos, totalMs, { real, cloud, logins: person.logins, codex: person.codex });
  const fired = new Set();
  let quietUntil = 0;
  let busy = false;
  let down = null;
  let worldText = null;
  const watcher = createWatcher({ state: state(), out: dir, seeded, afterMs: (real ? 30 : 10) * MIN, quiet: (now) => now < quietUntil, readState: state });

  const tick = async () => {
    if (busy || stopping) return;
    busy = true;
    try {
      const now = Date.now();
      const elapsed = now - startedAt;
      if (restartAgain({ down, now, deadline })) {
        down.tried = now;
        quietUntil = now + 2 * MIN;
        const r = await live(name, 'restart');
        if (r.code === 0) {
          const mins = Math.max(1, Math.round((Date.now() - down.since) / MIN));
          fs.appendFileSync(path.join(dir, 'timeline.jsonl'), `${JSON.stringify({ at: Date.now(), kind: 'restart-recovered', says: `The app came back after ${mins} min down.` })}\n`);
          say(`${person.name}'s app: came back after ${mins} min down`);
          down = null;
        }
      }
      if (!real) {
        const text = JSON.stringify(worldAt(events, elapsed));
        if (text !== worldText) { fs.writeFileSync(path.join(state().instance, 'world.json'), text); worldText = text; }
      }
      for (const e of events) {
        if (fired.has(e) || elapsed < e.at) continue;
        fired.add(e);
        const lasts = e.until - e.at;
        const says = e.until && e.kind !== 'agents' ? `${e.says} (for ${lasts >= MIN ? `${Math.round(lasts / MIN)} min` : `${Math.round(lasts / 1000)} s`})` : e.says;
        fs.appendFileSync(path.join(dir, 'timeline.jsonl'), `${JSON.stringify({ at: now, kind: e.kind, says })}\n`);
        say(`${person.name}'s app: ${says}`);
        if (e.kind === 'restart' || e.kind === 'crash' || e.kind === 'closed') {
          quietUntil = now + (e.kind === 'closed' ? e.ms : 0) + 2 * MIN;
          const r = await live(name, 'restart', ...(e.kind === 'crash' ? ['--ctrl-c'] : []), ...(e.kind === 'closed' ? ['--shut-for', String(Math.round(e.ms / 1000))] : []));
          if (r.code !== 0) {
            fs.appendFileSync(path.join(dir, 'timeline.jsonl'), `${JSON.stringify({ at: Date.now(), kind: 'restart-failed', says: `The app did not come back: ${r.out.trim().split('\n').pop()}` })}\n`);
            down = { since: now, tried: Date.now() };
          }
        }
        if (e.kind === 'sleep' && e.whole) {
          const pids = sleepTargets(state());
          quietUntil = now + e.ms + MIN;
          for (const pid of pids) { try { process.kill(pid, 'SIGSTOP'); frozenPids.add(pid); } catch { /* gone */ } }
          fs.appendFileSync(path.join(dir, 'timeline.jsonl'), `${JSON.stringify({ at: now, kind: 'sleep-stopped', says: `${pids.length} processes stopped` })}\n`);
          setTimeout(() => { for (const pid of pids) { try { process.kill(pid, 'SIGCONT'); } catch { /* gone */ } frozenPids.delete(pid); } }, e.ms);
        } else if (e.kind === 'sleep') {
          const pid = state().pid;
          quietUntil = now + e.ms + MIN;
          try { process.kill(-pid, 'SIGSTOP'); frozen.add(pid); } catch { /* gone */ }
          setTimeout(() => { try { process.kill(-pid, 'SIGCONT'); } catch { /* gone */ } frozen.delete(pid); }, e.ms);
        }
      }
    } finally { busy = false; }
  };
  await tick();
  const ticker = setInterval(tick, 5000);
  await watcher.tick();
  const watching = setInterval(() => { if (!stopping) watcher.tick().catch(() => {}); }, MIN);

  let idle = 0;
  let last = null;
  let early = 0;
  try {
    while (!stopping) {
      const next = nextRound({ now: Date.now(), deadline, roundMs, idleInARow: idle, lastOutcome: last });
      if (!next.go) { if (next.why !== 'time is up') result.stopped = next.why; break; }
      const round = ++result.rounds;
      const now = Date.now();
      const { issues } = readDiary(path.join(dir, 'diary.jsonl'));
      const cov = coverage({ actions: readJsonl(path.join(dir, 'actions.jsonl')), lines: readAllLines(state()), seeded, maxAtOnce: watcher.maxAtOnce, person });
      fs.writeFileSync(path.join(dir, 'clock.json'), JSON.stringify({ round, deadline, roundEnd: next.endsAt }));
      const prompt = testerPrompt({
        person, focus, room, browse: cmds.browse, diary: cmds.diary, shots: dir, round, real,
        totalMinutes: Math.round(totalMs / MIN), minutesLeft: Math.round((deadline - now) / MIN), roundMinutes: Math.round((next.endsAt - now) / MIN),
        fraction: (now - startedAt) / totalMs, diaryTail: diaryTail(dir),
        issues: issues.map((i) => `#${i.n} [${i.severity}] ${i.title} (seen ${i.seen})`), notYet: cov.notYet, stoppedEarlyMin: early,
      });
      let code;
      let words;
      if (external) ({ code, words } = await externalStretch({ dir, round, prompt, endsAt: next.endsAt, person }));
      else {
        const transcript = path.join(dir, `round-${String(round).padStart(2, '0')}.jsonl`);
        const fd = fs.openSync(transcript, 'a');
        const child = spawn(claude.path, testerArgs(prompt, dir), { cwd: dir, detached: true, stdio: ['ignore', fd, fd], env: testerEnv() });
        testers.add(child);
        const timer = setTimeout(() => killGroup(child), Math.max(0, next.endsAt - Date.now()));
        code = await new Promise((r) => child.on('exit', r));
        clearTimeout(timer);
        testers.delete(child);
        fs.closeSync(fd);
        words = lastWords(transcript);
      }
      const ended = Date.now();
      const actions = readJsonl(path.join(dir, 'actions.jsonl')).filter((a) => a.at >= now).length;
      last = roundOutcome({ actions, text: words });
      idle = last === 'idle' ? idle + 1 : 0;
      early = Math.max(0, Math.round((next.endsAt - ended) / MIN));
      fs.appendFileSync(path.join(dir, 'rounds.jsonl'), `${JSON.stringify({ round, startedAt: now, endedAt: ended, code, actions, outcome: last, words: words.slice(0, 600) })}\n`);
      const d = readDiary(path.join(dir, 'diary.jsonl'));
      Object.assign(progress[person.slug], { round, actions: readJsonl(path.join(dir, 'actions.jsonl')).length, issues: d.issues.length, notes: d.notes.length });
      writeProgress();
      say(`${person.name}: stretch ${round} ${last}, ${actions} actions, ${d.issues.length} issues and ${d.notes.length} notes so far`);
    }
  } finally {
    clearInterval(ticker);
    clearInterval(watching);
    await watcher.tick().catch(() => {});
    const found = watcher.finish();
    result.coverage = coverage({ actions: readJsonl(path.join(dir, 'actions.jsonl')), lines: readAllLines(state()), seeded, maxAtOnce: watcher.maxAtOnce, person });
    Object.assign(progress[person.slug], { machine: found.length, stopped: result.stopped, done: true });
    writeProgress();
    keepEvidence(state(), dir);
    await run(node, [BROWSE, 'close'], { env: { ...process.env, VERIFY_INSTANCE: name, BREAKER_OUT: dir }, timeoutMs: MIN });
  }
  return result;
}

writeProgress();
const results = await Promise.all(setups.map((s) => runPerson(s).catch((err) => ({
  slug: s.person.slug, name: s.person.name, role: s.person.role, dir: s.dir, rounds: 0, stopped: `the run failed: ${err.message}`,
}))));
wake();

const { file, counts } = writeReport({ root, startedAt, endedAt: Date.now(), focus, real, chaos, people: results });
if (!flag('keep')) for (const s of setups) await live(s.name, 'down');
say(`done: ${counts.issues} issue(s) from the testers (${counts.seenTwice} seen more than once), ${counts.machine} from the watcher.`);
for (const r of results) if (r.stopped) say(`${r.name} stopped early: ${r.stopped}`);
say(`report: ${file}`);
if (flag('keep')) say(`the copies are still up; take each down with VERIFY_INSTANCE=power-<who> node ${LIVE} down`);
process.exit(results.every((r) => r.stopped && r.rounds === 0) ? 1 : 0);
