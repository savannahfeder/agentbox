#!/usr/bin/env node
// ONE WORKDAY OF SYNTHETIC USERS ON THE PHONE APP.
//
//   node workday.mjs --who founder,new-user [--minutes 30] [--stretches 2 | --pace [--hours 10]]
//                    [--engine codex|external] [--model <id>] [--focus "what to lean on"]
//                    [--codex-home ~/.codex-2] [--target 90] [--url <preview address>]
//                    [--out <folder>] [--detach]
//
// Each person (../../power-test/people) gets a folder with two commands,
// `phone` (phone.mjs, the app at an iPhone's size) and `diary` (the power
// test's), and a tester session playing them for --minutes. Every stretch
// after the first is told what was already logged, so testers confirm or go
// elsewhere rather than file the same thing twice. --pace keeps starting
// stretches while pace.mjs says the tester login's week is behind its line,
// waits out a full 5-hour window, and stops at --hours. report.md ranks every issue.
//
// Testers are always Codex, on the login codex-tester.mjs picks. --engine
// external only writes each stretch's prompt to <person>/stretch-N.prompt.md
// and waits for stretch-N.done, for whoever starts that Codex by hand.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readDiary } from '../../power-test/scripts/diary.mjs';
import { codexTesterArgv, codexTesterEnv, codexCanSandbox, testerLogin } from '../../power-test/scripts/codex-tester.mjs';
import { rerunWithStripTypes } from '../../../../scripts/lib/rerun-with-strip-types.mjs';

rerunWithStripTypes(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const PHONE = path.join(here, 'phone.mjs');
const DIARY = path.resolve(here, '../../power-test/scripts/diary.mjs');
const MIN = 60_000;
const SEVERITY = ['broken', 'wrong', 'slow', 'confusing'];

/** How a tester session starts. Synthetic testers run on Codex only. */
export function testerArgv(engine, { dir, prompt, model = null, last, sandboxed = true }) {
  if (engine === 'codex') return codexTesterArgv({ dir, prompt, model, last, sandboxed });
  throw new Error(`no tester engine called ${engine}: synthetic testers run on codex (or external, started by hand)`);
}

/** What a tester is told: who they are, the phone in their hand, and what others already found. */
export function phonePrompt(person, { dir, minutes, focus = null, logged = [] }) {
  return [
    `You are ${person.name}, ${person.role}. Stay in their shoes for this whole session.`,
    '', person.text, '',
    '## Today',
    `You have Agentbox on your iPhone. It is the inbox of the agents working on your computer: threads that need you, answers with options, approvals, chats, new threads. The threads in it are examples; treat them as yours. For the next ${minutes} minutes, use it the way you would on your phone during your day: between meetings, one-handed, in short bursts.`,
    ...(focus ? ['', `Lean on this today: ${focus}`] : []),
    '',
    '## Your two commands, run from this folder',
    `- \`${path.join(dir, 'phone')}\`: open, look, tap <n|"words">, type "<text>", press <key>, swipe up|down|left|right, shot <name>, away <minutes>, reload. The phone is already open; start with look.`,
    `- \`${path.join(dir, 'diary')}\`: note "<what you did and how it felt>", issue --severity broken|wrong|slow|confusing --title "…" --steps "…" --expected "…" --actual "…" --shot <name>, again <n> "<what you saw>", time.`,
    '',
    'Write in the diary as you go, not at the end: a session can be stopped at any moment. Take a shot before logging an issue and name it in --shot. Open a shot when you need to see the screen rather than its words.',
    'Log what a person in your shoes would notice: broken (it does not work), wrong (it works and says or does the wrong thing), slow, or confusing (you had to read twice or guess). Not a code review: you cannot see the code.',
    ...(logged.length ? ['', '## Already logged by you or others', 'If you meet one of these again, use `diary again <n>` with what you saw, and spend your time somewhere else.', ...logged.map((i) => `${i.n}. [${i.severity}] ${i.title}`)] : []),
    '',
    'Run `diary time` now and then. When it says the stretch is over, stop and reply with one line: what you spent the time on.',
  ].join('\n');
}

/** What a tester starts with: the chosen Codex login and no API key. */
export function testerEnv(engine, base, { codexHome = null } = {}) {
  return codexTesterEnv(base, codexHome);
}

/** The sweeper's own mark for a program meant to outlive its run; the day still ends at --hours. */
export function detachedEnv(env) {
  return { ...env, AGENTBOX_KEEP: '1' };
}

/** Kept from the sweeper, so it gives memory back itself: no stretch starts while memory is tight. */
export function stretchMayStart(pressure) {
  return pressure === 'normal';
}

/** The flags a --detach run restarts itself with: the same day, in the folder it chose. */
export function detachedArgv(args, root) {
  const rest = args.filter((a) => a !== '--detach');
  return rest.includes('--out') ? rest : [...rest, '--out', root];
}

/** Packages the app's package.json lists that its node_modules does not have. */
export function missingPackages(appDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    .filter((name) => !fs.existsSync(path.join(appDir, 'node_modules', name, 'package.json')));
}

/** Whether mobile/'s lock changed after its last install, as it does when main adds a package. */
export function packagesAreBehind(mobileDir) {
  const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return null; } };
  const lock = mtime(path.join(mobileDir, 'package-lock.json'));
  const installed = mtime(path.join(mobileDir, 'node_modules', '.package-lock.json'));
  if (lock === null) return false;
  return installed === null || lock > installed;
}

export function whyTheBuildFailed(err) {
  const printed = `${err?.stdout ?? ''}${err?.stderr ?? ''}`.trim();
  return `the phone app preview did not build: ${printed ? printed.slice(-3000) : err?.message}`;
}

/** Which preview build to reuse: the phone app bundles renderer/ and shared/ as well as mobile/. */
export function previewKeyOf({ mobile, renderer, shared }) {
  return crypto.createHash('sha1').update(`${mobile} ${renderer} ${shared}`).digest('hex');
}

/** The preview's build, clear of the bundler's cache: a cached transform once carried an old copy of the app's config. */
export function previewBuildArgv(built) {
  return ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', built];
}

/** Every issue from every diary, worst first, then most seen. */
export function rankIssues(byPerson) {
  const all = [];
  for (const [who, issues] of Object.entries(byPerson)) for (const i of issues) all.push({ ...i, who });
  return all.sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity) || (b.seen ?? 1) - (a.seen ?? 1));
}

/** report.md from every diary so far. `state` is 'running', 'done', or the signal that stopped the day. */
export function writeReport(root, { people, dirs, stretch, minutes, engine, state }) {
  const byPerson = Object.fromEntries(people.map((p) => [p.name, readDiary(path.join(dirs[p.slug], 'diary.jsonl')).issues]));
  const ranked = rankIssues(byPerson);
  // A day killed outright (SIGKILL, power) leaves this version, so it must not claim the day is alive now.
  const status = state === 'running' ? ` Written after stretch ${stretch}, while the day was still going.`
    : state === 'done' ? '' : ` Stopped by ${state}; this is what was logged by then.`;
  const lines = [`# Phone app workday, ${new Date().toDateString()}`, '', `${people.map((p) => p.name).join(', ')}, ${stretch} stretch${stretch === 1 ? '' : 'es'} of ${minutes} minutes on ${engine}.${status}`, ''];
  ranked.forEach((i, k) => {
    lines.push(`## ${k + 1}. [${i.severity}] ${i.title}`, '', `${i.who}${i.seen > 1 ? `, seen ${i.seen} times` : ''}.`, '');
    if (i.steps) lines.push(`Steps: ${i.steps}`, '');
    if (i.expected) lines.push(`Expected: ${i.expected}`, '');
    if (i.actual) lines.push(`Actual: ${i.actual}`, '');
    const dir = dirs[people.find((p) => p.name === i.who)?.slug];
    for (const s of i.shots ?? []) lines.push(`![${s}](${path.join(dir, s)})`, '');
  });
  if (!ranked.length) lines.push('Nobody logged an issue.');
  fs.writeFileSync(path.join(root, 'report.md'), `${lines.join('\n')}\n`);
  return ranked.length;
}

/** What the testers lean on: the person's own focus, then what reached the phone this week. */
export function focusFor(given, reached) {
  const week = reached.length ? `These reached the phone this week, so try each: ${reached.join(', ')}` : null;
  return [given, week].filter(Boolean).join('. ') || null;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (n, f = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : f; };
  const say = (s) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${s}`);
  const { readPeople, pickPeople } = await import(path.resolve(here, '../../power-test/scripts/plan.mjs'));
  const { paceFor, readingFor } = await import(path.join(here, 'pace.mjs'));
  const { readMacPressureWord } = await import(path.join(REPO, 'main/leftovers.mts'));
  const { stripTypesFlags } = await import(path.join(REPO, 'main/strip-types.mts'));
  const people = pickPeople(opt('who', 'random:2'), readPeople(path.resolve(here, '../../power-test/people')));
  const engine = opt('engine', 'codex');
  if (engine !== 'codex' && engine !== 'external') { console.error(`workday: synthetic testers run on Codex only, not ${engine}.`); process.exit(1); }
  const minutes = Number(opt('minutes', 30));
  const pace = args.includes('--pace');
  const deadline = Date.now() + Number(opt('hours', pace ? 10 : 24)) * 60 * MIN;
  const maxStretches = pace ? Infinity : Number(opt('stretches', 1));
  const login = testerLogin({ given: opt('codex-home', process.env.CODEX_HOME || null) });
  if (!login && engine === 'codex') { console.error('workday: there is no Codex login on this computer for the testers.'); process.exit(1); }
  const codexHome = login?.home ?? null;
  const root = path.resolve(opt('out', path.join(os.tmpdir(), 'agentbox-product-loop', `${new Date().toISOString().replace(/[:.]/g, '-')}-phone`)));
  fs.mkdirSync(root, { recursive: true });

  // A session of its own, so ending the run that started it does not end the day.
  if (args.includes('--detach')) {
    const log = fs.openSync(path.join(root, 'workday.log'), 'a');
    const child = spawn(process.execPath, [...stripTypesFlags(), fileURLToPath(import.meta.url), ...detachedArgv(args, root)], { detached: true, stdio: ['ignore', log, log], env: detachedEnv(process.env) });
    child.unref();
    console.log(`workday started, pid ${child.pid}. Log: ${path.join(root, 'workday.log')}. Report when it ends: ${path.join(root, 'report.md')}`);
    process.exit(0);
  }

  // The preview, built once per version of mobile/ and served from here.
  let url = opt('url');
  if (!url) {
    const [mobile, renderer, shared] = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD:mobile', 'HEAD:renderer', 'HEAD:shared'], { encoding: 'utf8' }).trim().split('\n');
    const tree = previewKeyOf({ mobile, renderer, shared });
    const built = path.join(os.tmpdir(), 'agentbox-phone-preview', tree);
    if (!fs.existsSync(path.join(built, 'index.html'))) {
      const mobileDir = path.join(REPO, 'mobile');
      const quietly = { cwd: mobileDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 15 * MIN };
      try {
        const missing = missingPackages(mobileDir);
        if (packagesAreBehind(mobileDir) || missing.length) {
          say(missing.length ? `installing the phone app's packages; missing ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}` : 'installing the phone app\'s packages, which are behind its lock file');
          execFileSync('npm', ['ci', '--no-audit', '--no-fund'], quietly);
        }
        say('building the phone app preview (a minute or two)');
        execFileSync('npx', previewBuildArgv(built), { ...quietly, env: { ...process.env, EXPO_PUBLIC_PREVIEW: '1', CI: '1' } });
      } catch (err) {
        say(whyTheBuildFailed(err));
        process.exit(1);
      }
    }
    url = await new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        let p = path.join(built, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!p.startsWith(built) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = fs.existsSync(`${p}.html`) ? `${p}.html` : path.join(built, 'index.html');
        res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf' }[path.extname(p)] ?? 'application/octet-stream' });
        fs.createReadStream(p).pipe(res);
      }).listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/`));
    });
  }
  const sandboxed = engine === 'codex' && codexCanSandbox();
  say(`${people.map((p) => p.name).join(', ')} on the phone app at ${url}, ${minutes}-minute stretches on ${engine === 'codex' ? `Codex at ${codexHome} (${login.plan ?? 'plan unknown'}, ${login.why})${sandboxed ? '' : ', without Codex\'s sandbox, which this machine refuses'}` : 'testers started by hand'}. Evidence: ${root}`);

  const dirs = Object.fromEntries(people.map((p) => {
    const dir = path.join(root, p.slug);
    fs.mkdirSync(dir, { recursive: true });
    const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
    for (const [cmd, script] of [['phone', PHONE], ['diary', DIARY]]) {
      fs.writeFileSync(path.join(dir, cmd), `#!/bin/sh\nexport PHONE_OUT=${q(dir)} PHONE_URL=${q(url)} POWER_OUT=${q(dir)}\nexec ${q(process.execPath)} ${q(script)} "$@"\n`, { mode: 0o755 });
    }
    return [p.slug, dir];
  }));
  const children = new Set();
  const run = (cmd, argv, opts) => new Promise((resolve) => {
    const child = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    children.add(child);
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => child.kill('SIGTERM'), (minutes + 10) * MIN);
    child.on('exit', (code) => { children.delete(child); clearTimeout(timer); resolve({ code, out: out.slice(-4000) }); });
  });
  const diaries = () => Object.fromEntries(people.map((p) => [p.name, readDiary(path.join(dirs[p.slug], 'diary.jsonl')).issues]));

  let reached = [];
  try { reached = await (await import(path.join(REPO, 'scripts/phone-parity.mjs'))).newOnThePhone(7); } catch (err) { say(`could not read what reached the phone this week: ${err.message}`); }
  const focus = focusFor(opt('focus'), reached);
  if (reached.length) say(`${reached.length} features reached the phone this week; the testers are told to try each`);

  let stretch = 0;
  const report = (state) => writeReport(root, { people, dirs, stretch, minutes, engine, state });
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.once(signal, () => {
      say(`stopped by ${signal} after ${stretch} stretch${stretch === 1 ? '' : 'es'}`);
      for (const c of children) { try { c.kill('SIGTERM'); } catch { /* gone */ } }
      for (const p of people) spawnSync(process.execPath, [PHONE, 'close'], { env: { ...process.env, PHONE_OUT: dirs[p.slug], PHONE_URL: url }, timeout: 10_000 });
      say(`report: ${path.join(root, 'report.md')} (${report(signal)} issues so far)`);
      process.exit(1);
    });
  }
  while (stretch < maxStretches && Date.now() < deadline) {
    if (pace && engine !== 'external') {
      const reading = await readingFor(codexHome);
      const p = paceFor(reading, { target: Number(opt('target', 90)) });
      say(`pace: ${p.verdict}. ${p.why}`);
      if (p.verdict === 'stop') break;
      if (p.verdict === 'wait' || p.verdict === 'hold') {
        if (p.until > deadline) break;
        await new Promise((r) => setTimeout(r, Math.max(0, p.until - Date.now()) + MIN));
        continue;
      }
    }
    const pressure = await readMacPressureWord();
    if (!stretchMayStart(pressure)) {
      say(`memory is ${pressure}, so the next stretch waits 10 minutes`);
      await new Promise((r) => setTimeout(r, 10 * MIN));
      continue;
    }
    stretch += 1;
    const ends = Date.now() + minutes * MIN;
    const logged = rankIssues(diaries()).map((i, k) => ({ ...i, n: k + 1 }));
    say(`stretch ${stretch}: ${people.length} testers for ${minutes} minutes`);
    await Promise.all(people.map(async (person) => {
      const dir = dirs[person.slug];
      fs.writeFileSync(path.join(dir, 'clock.json'), JSON.stringify({ round: stretch, roundEnd: ends, deadline: Math.min(deadline, ends) }));
      const opened = await run(process.execPath, [PHONE, 'open'], { env: { ...process.env, PHONE_OUT: dir, PHONE_URL: url } });
      if (opened.code !== 0) { say(`${person.name}: the phone did not open: ${opened.out.slice(-300)}`); return; }
      const prompt = phonePrompt(person, { dir, minutes, focus, logged });
      if (engine === 'external') {
        const file = path.join(dir, `stretch-${stretch}.prompt.md`);
        fs.writeFileSync(file, prompt);
        say(`${person.name}: waiting for a subagent to run ${file} and write stretch-${stretch}.done`);
        while (!fs.existsSync(path.join(dir, `stretch-${stretch}.done`)) && Date.now() < ends + 15 * MIN) await new Promise((r) => setTimeout(r, 5000));
        return;
      }
      const last = path.join(dir, `stretch-${stretch}.last.txt`);
      const r = await run('codex', testerArgv(engine, { dir, prompt, model: opt('model'), last, sandboxed }), { cwd: dir, env: testerEnv(engine, process.env, { codexHome }) });
      fs.writeFileSync(path.join(dir, `stretch-${stretch}.log`), r.out);
      say(`${person.name}: stretch ${stretch} ended (${r.code === 0 ? 'ok' : `exit ${r.code}`})`);
    }));
    for (const p of people) await run(process.execPath, [PHONE, 'close'], { env: { ...process.env, PHONE_OUT: dirs[p.slug], PHONE_URL: url } });
    report('running');
  }

  const n = report('done');
  say(`report: ${path.join(root, 'report.md')} (${n} issue${n === 1 ? '' : 's'})`);
  process.exit(0);
}
