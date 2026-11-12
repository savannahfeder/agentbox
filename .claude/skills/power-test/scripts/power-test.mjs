#!/usr/bin/env node
// A POWER TEST: PEOPLE AGENTBOX IS FOR, USING IT FOR HOURS, WHILE THINGS AROUND THEM GO WRONG.
//
//   node .claude/skills/power-test/scripts/power-test.mjs
//     --who startup-engineer,founder | random:2 | all   who tests (../people; default random:2)
//     --hours 2 | --minutes 45                         how long (default 1 hour)
//     --focus "what the team shipped"                  what the testers lean on
//                                                      the copies' agents are the real Claude Code and Codex on this computer's plans
//     --stand-ins "<the person's words agreeing>"      stand-in Claude Code instead, only with their explicit say-so for this run
//     --cloud                                          every thread in this Mac's cloud (implies --real); the Mac sleeps and shuts under the runs
//     --cloud-accounts a@x.com,b@y.com                 the cloud accounts the copies may spend, of those signed in (default all)
//     --free-hours 0.5                                 with --stand-in-cloud: start on the Free plan with that many hours
//     --chaos none|light|normal|heavy                  what goes wrong around them (default normal)
//     --round-minutes 20                               one tester session, before it is started again with its diary
//     --model <id>                                     the testers' Codex model
//     --codex-home ~/.codex-2                          the Codex login testers spend (default: the one on the best plan)
//     --keep                                           leave the copies up afterwards
//     --files <dir>                                    copied into every project's documents in every copy (a table, a deck under test)
//     --team <file> --room <name>                      one tester signs in to a real team (live.mjs --team) and talks in that room
//     --stand-in-team "<name>"                         every tester on one team, through a stand-in team cloud of the run's own;
//                                                      the first starts it, invites the rest and shares their first project
//     --share-stage /tmp/share-stage                   with --stand-in-team: the team on scripts/share-stage.mjs's cloud, so
//                                                      Share makes links and the link page opens them
//
// For each person: a copy of the app of their own (live.mjs with
// VERIFY_INSTANCE=power-<who>), shaped like their setup; a watcher reading it
// every minute (watch.mjs); the stand-ins' world changing on the clock
// (plan.mjs chaosPlan); and a Codex session playing them through two
// commands in their folder, `app` (browse.mjs) and `diary` (diary.mjs),
// started again with its diary until the clock runs out. Evidence and
// report.md go to /tmp/agentbox-verify/runs/<time>-power/.
//
// Testers are always Codex, never Claude Code: the person keeps a Codex plan
// for testing (codex-tester.mjs). They are not the app's workers. The copy and
// its workers get the clean environment live.mjs gives them; only the testers'
// Codex signs in, on the login codex-tester.mjs picks.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPeople, pickPeople, agentMode, chaosPlan, worldAt, nextRound, restartAgain, roundOutcome, coverage, testerPrompt, projectNamedIn, fixtureFor } from './plan.mjs';
import { createWatcher, freeMemoryMb, readAllLines, keepEvidence, sleepTargets } from './watch.mjs';
import { writeReport } from './report.mjs';
import { makeFilm, seedArtifacts } from './artifacts.mjs';
import { readDiary } from './diary.mjs';
import { writeTeamFiles, namePeople, doorOf, formTeam, teamWords } from './team.mjs';
import { testerLogin, codexCanSandbox, codexTesterArgv, codexTesterEnv, lastMessage, CODEX_CHECK_ARGV, codexCheckFailed } from './codex-tester.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const VERIFY = path.resolve(here, '../../verify-agentbox/scripts');
const LIVE = path.join(VERIFY, 'live.mjs');
const BROWSE = path.join(VERIFY, 'browse.mjs');
const DIARY = path.join(here, 'diary.mjs');
const { cleanEnv, RUNS, REPO, instanceDir } = await import(LIVE);
const { machinery } = await import(path.join(VERIFY, 'drives.mjs'));

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
const standInCloud = flag('stand-in-cloud');
// Every copy opens as a brand-new install, on the first run (live.mjs --fresh).
const fresh = flag('fresh');
if (standInCloud && cloud) stop('--stand-in-cloud is the stand-ins\' own cloud; it cannot go with --cloud.');
if (flag('stand-in-codex')) stop('--stand-in-codex is gone: the agents are real unless the person agreed to stand-ins (--stand-ins "<their words>").');
const freeHours = opt('free-hours');
// `owner:0.3,member:0.3`, one per person in --who order: each copy on a team's trial in that role.
const cloudTeams = (opt('cloud-team') || '').split(',').filter(Boolean);
if (cloudTeams.length && !standInCloud) stop('--cloud-team puts the stand-in cloud\'s account on a team: add --stand-in-cloud.');
if (freeHours && !standInCloud) stop('--free-hours starts the stand-in cloud\'s account on the Free plan: add --stand-in-cloud.');
let mode;
try { mode = agentMode({ standIns: args.includes('--stand-ins') ? (opt('stand-ins') ?? '') : null, standInCloud, cloud }); } catch (err) { stop(err.message); }
// With stand-ins agreed, Codex stays real on the testers' own login wherever it can.
const { real, codexReal, standIns } = mode;
const cloudAccounts = opt('cloud-accounts');
if (cloudAccounts && !cloud) stop('--cloud-accounts narrows the cloud\'s accounts: add --cloud.');
const focus = opt('focus');
const alpha = opt('alpha');
const model = opt('model');
if (opt('testers') || opt('tester-login')) stop('testers are always Codex now, started by this script: drop --testers and --tester-login, and name a Codex login with --codex-home if the best plan is not the one to spend.');
const team = opt('team');
const room = opt('room');
const files = opt('files') ? path.resolve(opt('files')) : null;
if (files && !fs.existsSync(files)) stop(`--files: there is no folder at ${files}.`);
const standInTeam = opt('stand-in-team');
const shareStage = opt('share-stage');
if (shareStage && !standInTeam) stop('--share-stage is where a stand-in team lives: add --stand-in-team.');
if (standInTeam && team) stop('--stand-in-team makes a team of its own: leave out --team.');
if (standInTeam && people.length < 2) stop('--stand-in-team is two or more testers on one team: name them with --who.');
if (team && people.length !== 1) stop('--team signs one account in, so it runs one tester: name them with --who.');
if (room && !team) stop('--room needs --team: a copy with no team is in no room.');
try { chaosPlan(chaos, totalMs); } catch (err) { stop(err.message); }

// A cloud run holds a stand-in of a few megabytes here, not an agent.
const need = people.reduce((mb, p) => mb + (real && !cloud ? 2500 : p.codex && codexReal ? 1700 : 1200), 1000);
const free = freeMemoryMb();
if (free < need) stop(`${people.length} ${people.length === 1 ? 'person needs' : 'people need'} about ${(need / 1024).toFixed(1)} GB free and this computer has ${(free / 1024).toFixed(1)} GB. Run fewer with --who.`);
const login = testerLogin({ given: opt('codex-home', process.env.CODEX_HOME || null) });
if (!login) stop('there is no Codex login on this computer for the testers to run on. Sign Codex in (codex login), then run this again.');
const sandboxed = codexCanSandbox();
const testerEnv = () => codexTesterEnv(cleanEnv(), login.home);

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
    // A machine whose Chrome is not at the Mac's path names it in CHROME (scripts/lib/chrome-guard.mjs).
    const chrome = (process.env.CHROME ? ` CHROME=${q(process.env.CHROME)}` : '') + (process.env.VERIFY_CHROME ? ` VERIFY_CHROME=${q(process.env.VERIFY_CHROME)}` : '');
    fs.writeFileSync(path.join(dir, cmd), `#!/bin/sh\nexport VERIFY_INSTANCE=${q(name)} BREAKER_OUT=${q(dir)} POWER_OUT=${q(dir)}${chrome}\nexec ${q(node)} ${q(script)} "$@"\n`, { mode: 0o755 });
  }
  return { browse: path.join(dir, 'app'), diary: path.join(dir, 'diary') };
}

const root = path.join(RUNS, `${new Date().toISOString().replace(/[:.]/g, '-')}-power`);
fs.mkdirSync(root, { recursive: true });
say(`power test: ${people.map((p) => p.name).join(', ')} for ${Math.round(totalMs / MIN)} min on ${cloud ? 'the real Claude Code and Codex in this Mac\'s cloud' : real ? 'the real Claude Code and Codex' : codexReal ? 'the real Codex and a Claude Code stand-in' : 'stand-ins'}, chaos ${chaos}.`);
if (standIns) {
  say(`STAND-INS, NOT REAL PLANS: the copies' Claude Code is a stand-in${codexReal ? '' : ', and so is their Codex'}, because the person agreed: "${standIns}"`);
  fs.writeFileSync(path.join(root, 'stand-ins.txt'), `${standIns}\n`);
}
say(`evidence: ${root}  (progress.json there says how it is going)`);

say(`testers: Codex on ${login.home} (${login.plan ?? 'plan unknown'}, ${login.why})${sandboxed ? '' : ', without Codex\'s sandbox, which this machine refuses'}.`);
const check = await run('codex', CODEX_CHECK_ARGV, { env: testerEnv(), timeoutMs: 3 * MIN, cwd: root });
const refused = codexCheckFailed(check, { home: login.home, onCloud: fs.existsSync('/opt/agentbox/server.mjs') });
if (refused) stop(refused);

/** The person's projects with real code in them, so real agents have work to do. */
function seedCode(state) {
  const git = (cwd, ...a) => run('git', a, { cwd, timeoutMs: MIN });
  return Promise.all(Object.entries(state.repos).map(async ([slug, repo], i) => {
    fs.cpSync(path.join(here, '..', 'fixtures', fixtureFor(slug, i)), repo, { recursive: true });
    await git(repo, 'add', '-A');
    await git(repo, '-c', 'user.email=power@agentbox.invalid', '-c', 'user.name=power test', 'commit', '-qm', 'The code so far');
    // A copy's home is a throwaway with no git identity, so a real agent could not commit without these.
    await git(repo, 'config', 'user.email', 'power@agentbox.invalid');
    await git(repo, 'config', 'user.name', 'power test');
  }));
}

/** `--files <dir>`: what is under test, laid into every project's documents, so a tester meets it as their own. */
function layFiles(state, from) {
  for (const d of fs.readdirSync(state.accountRoot)) {
    const docs = path.join(state.accountRoot, d);
    if (fs.existsSync(path.join(docs, 'project.json'))) fs.cpSync(from, docs, { recursive: true });
  }
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
  const first = slugs[0];
  const withFiles = seedArtifacts({
    accountRoot: state.accountRoot, slug: first, now,
    picture: path.join(REPO, 'docs', 'readme', 'priority-palette.png'),
    picture2: path.join(REPO, 'docs', 'readme', 'inbox-urgent.png'),
    film: makeFilm(path.join(state.accountRoot, 'demo-film.mp4')),
  });
  for (const l of withFiles) ids.add(l.id);
  byProject.get(first).push(...withFiles);
  for (const [slug, lines] of byProject) {
    const dir = machinery(state, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'work-items.jsonl'), lines.sort((a, b) => a.ts - b.ts).map((l) => `${JSON.stringify(l)}\n`).join(''));
  }
  return ids;
}

let teamCloud = null;
let teamFiles = {};
if (standInTeam) {
  const { startStandinCloud } = await import(path.join(REPO, 'cloud', 'standin', 'server.mjs'));
  fs.mkdirSync(path.join(root, 'team-cloud'), { recursive: true });
  // The stage's cloud has a link page beside it; it is the stage's to stop, not this run's.
  const staged = shareStage ? readJson(path.join(shareStage, 'standin.json')) : null;
  if (shareStage && !staged?.url) stop(`no stage at ${shareStage}: start it with node scripts/share-stage.mjs`);
  teamCloud = staged ? { url: staged.url, stop: async () => {} } : await startStandinCloud({ file: path.join(root, 'team-cloud', 'cloud.json') });
  teamFiles = writeTeamFiles({ root, url: teamCloud.url, people, site: staged?.phoneSite ?? null });
  await namePeople({ url: teamCloud.url, people });
  say(`${standInTeam}: a stand-in team cloud at ${teamCloud.url} for ${people.map((p) => p.name).join(', ')}${staged ? `, links at ${staged.phoneSite}` : ''}`);
}

const setups = [];
for (const person of people) {
  const name = `power-${person.slug}`;
  const dir = path.join(root, person.slug);
  fs.mkdirSync(dir, { recursive: true });
  const shape = real ? [] : ['--logins', String(person.logins), ...(person.codex ? [] : ['--no-codex']), ...(person.codex && codexReal ? ['--real-codex', login.home] : [])];
  say(`${person.name}: starting a copy of the app shaped like their setup`);
  const up = await live(name, 'up', ...(real ? ['--real'] : []), ...(cloud ? ['--cloud'] : []), ...(standInCloud ? ['--stand-in-cloud'] : []), ...(fresh ? ['--fresh'] : []), ...(freeHours ? ['--free-hours', freeHours] : []), ...(cloudTeams[people.indexOf(person)] ? ['--cloud-team', cloudTeams[people.indexOf(person)]] : []), ...(cloudAccounts ? ['--cloud-accounts', cloudAccounts] : []), ...shape, '--projects', person.projects.join(','), ...(team ? ['--team', team] : []), ...(teamFiles[person.slug] ? ['--team', teamFiles[person.slug]] : []), ...(alpha ? ['--alpha', alpha] : []));
  fs.writeFileSync(path.join(dir, 'up.log'), up.out);
  const stateFile = path.join(instanceDir(name), 'instance.json');
  const state = readJson(stateFile);
  if (up.code !== 0 || !state) { setups.push({ person, name, dir, failed: `its copy did not start: ${up.out.trim().split('\n').pop()}` }); continue; }
  await seedCode(state);
  if (files) layFiles(state, files);
  const seeded = person.history ? seedHistory(state, person, person.history) : new Set();
  if (seeded.size) await live(name, 'restart');
  setups.push({ person, name, dir, stateFile, seeded, cmds: layCommands(dir, name) });
}

let teamMade = null;
if (standInTeam) {
  const ready = setups.filter((s) => !s.failed);
  if (ready.length < 2) stop(`only ${ready.length} copy started, and a team needs two: ${setups.map((s) => s.failed).filter(Boolean).join('; ')}`);
  try {
    teamMade = await formTeam({
      teamName: standInTeam,
      copies: ready.map((s, i) => {
        const st = readJson(s.stateFile);
        return { person: s.person, call: doorOf(st), project: i === 0 ? Object.keys(st.repos)[0] : null };
      }),
    });
  } catch (err) {
    for (const s of setups) await live(s.name, 'down');
    await teamCloud.stop();
    stop(`the team did not form: ${err.message}`);
  }
  say(`${standInTeam}: formed, ${teamMade.shared ? `${teamMade.shared} shared` : 'nothing shared'}`);
}

// One at a time: three Chromes started in the same second all died before printing their address.
for (const s of setups.filter((x) => !x.failed)) {
  const r = await run(node, [BROWSE, 'open'], { env: { ...process.env, VERIFY_INSTANCE: s.name, BREAKER_OUT: s.dir }, timeoutMs: 2 * MIN });
  if (r.code !== 0) say(`${s.person.name}: the browser did not open before the test (${r.out.trim().split('\n').pop()}); their first look opens it again`);
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

async function runPerson({ person, name, dir, stateFile, seeded, failed, cmds }) {
  const result = { slug: person.slug, name: person.name, role: person.role, dir, rounds: 0, stopped: failed ?? null, coverage: null };
  progress[person.slug] = { round: 0, stopped: result.stopped };
  if (failed) return result;
  const state = () => readJson(stateFile);
  const events = chaosPlan(chaos, totalMs, { real, cloud, logins: person.logins, codex: person.codex, codexReal: person.codex && codexReal });
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
      // A sandboxed tester cannot start Chrome, and the last stretch's may have gone with it; open it from here.
      await run(node, [BROWSE, 'open'], { env: { ...process.env, VERIFY_INSTANCE: name, BREAKER_OUT: dir }, timeoutMs: 2 * MIN });
      const now = Date.now();
      const { issues } = readDiary(path.join(dir, 'diary.jsonl'));
      const cov = coverage({ actions: readJsonl(path.join(dir, 'actions.jsonl')), lines: readAllLines(state()), seeded, maxAtOnce: watcher.maxAtOnce, person });
      fs.writeFileSync(path.join(dir, 'clock.json'), JSON.stringify({ round, deadline, roundEnd: next.endsAt }));
      const prompt = testerPrompt({
        person, focus, room, team: standInTeam ? teamWords({ teamName: standInTeam, me: person, people, shared: teamMade?.shared }) : null, browse: cmds.browse, diary: cmds.diary, shots: dir, round, real, codexReal: person.codex && codexReal,
        totalMinutes: Math.round(totalMs / MIN), minutesLeft: Math.round((deadline - now) / MIN), roundMinutes: Math.round((next.endsAt - now) / MIN),
        fraction: (now - startedAt) / totalMs, diaryTail: diaryTail(dir),
        issues: issues.map((i) => `#${i.n} [${i.severity}] ${i.title} (seen ${i.seen})`), notYet: cov.notYet, stoppedEarlyMin: early,
      });
      const stem = path.join(dir, `round-${String(round).padStart(2, '0')}`);
      // Opened here, outside the tester's sandbox, so its commands only ever connect.
      await run(cmds.browse, ['open'], { env: process.env, timeoutMs: 2 * MIN, cwd: dir });
      const fd = fs.openSync(`${stem}.log`, 'a');
      const child = spawn('codex', codexTesterArgv({ dir, prompt, last: `${stem}.last.txt`, model, sandboxed }),
        { cwd: dir, detached: true, stdio: ['ignore', fd, fd], env: testerEnv() });
      testers.add(child);
      const timer = setTimeout(() => killGroup(child), Math.max(0, next.endsAt - Date.now()));
      const code = await new Promise((r) => child.on('exit', r));
      clearTimeout(timer);
      testers.delete(child);
      fs.closeSync(fd);
      // A sign-in or usage error never reaches the last message, only the log.
      const words = lastMessage(`${stem}.last.txt`) || lastMessage(`${stem}.log`).slice(-2000);
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

const { file, counts } = writeReport({ root, startedAt, endedAt: Date.now(), focus, real, codexReal, standIns, chaos, people: results });
if (!flag('keep')) for (const s of setups) await live(s.name, 'down');
if (teamCloud && !flag('keep')) await teamCloud.stop();
say(`done: ${counts.issues} issue(s) from the testers (${counts.seenTwice} seen more than once), ${counts.machine} from the watcher.`);
for (const r of results) if (r.stopped) say(`${r.name} stopped early: ${r.stopped}`);
say(`report: ${file}`);
if (flag('keep')) say(`the copies are still up; take each down with VERIFY_INSTANCE=power-<who> node ${LIVE} down`);
process.exit(results.every((r) => r.stopped && r.rounds === 0) ? 1 : 0);
