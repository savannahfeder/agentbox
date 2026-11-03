#!/usr/bin/env node
// ONE WORKDAY OF SYNTHETIC USERS ON THE PHONE APP.
//
//   node workday.mjs --who founder,new-user [--minutes 30] [--stretches 2 | --pace [--hours 10]]
//                    [--engine codex|claude|external] [--model <id>] [--focus "what to lean on"]
//                    [--codex-home ~/.codex] [--target 90] [--url <preview address>] [--out <folder>] [--detach]
//
// Each person (../../power-test/people) gets a folder with two commands,
// `phone` (phone.mjs, the app at an iPhone's size) and `diary` (the power
// test's), and a tester session playing them for --minutes. Every stretch
// after the first is told what was already logged, so testers confirm or go
// elsewhere rather than file the same thing twice. --pace keeps starting
// stretches while pace.mjs says the Codex week is behind its line, waits out a
// full 5-hour window, and stops at --hours. report.md ranks every issue.
//
// --engine external writes each stretch's prompt to <person>/stretch-N.prompt.md
// and waits for stretch-N.done, for an agent that runs testers as subagents
// (the Agentbox cloud, where nothing it starts can sign in).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const PHONE = path.join(here, 'phone.mjs');
const DIARY = path.resolve(here, '../../power-test/scripts/diary.mjs');
const MIN = 60_000;
const SEVERITY = ['broken', 'wrong', 'slow', 'confusing'];

/** How a tester session starts on each engine. Codex keeps its session log, which is what the pacer reads. */
export function testerArgv(engine, { dir, prompt, model = null, last }) {
  if (engine === 'codex') {
    return ['exec', '-C', dir, '-s', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=true',
      '--skip-git-repo-check', '-o', last, ...(model ? ['-m', model] : []), prompt];
  }
  if (engine === 'claude') {
    return ['-p', prompt, '--output-format', 'json',
      '--allowedTools', `Bash(${path.join(dir, 'phone')}:*)`, `Bash(${path.join(dir, 'diary')}:*)`, `Read(/${dir}/**)`,
      '--disallowedTools', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'Write', 'Edit', 'NotebookEdit',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', ...(model ? ['--model', model] : [])];
  }
  throw new Error(`no tester engine called ${engine}: codex, claude or external`);
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
    'Write in the diary as you go, not at the end: a session can be stopped at any moment. Take a shot before logging an issue and name it in --shot. Read a shot with the Read tool when you need to see the screen rather than its words.',
    'Log what a person in your shoes would notice: broken (it does not work), wrong (it works and says or does the wrong thing), slow, or confusing (you had to read twice or guess). Not a code review: you cannot see the code.',
    ...(logged.length ? ['', '## Already logged by you or others', 'If you meet one of these again, use `diary again <n>` with what you saw, and spend your time somewhere else.', ...logged.map((i) => `${i.n}. [${i.severity}] ${i.title}`)] : []),
    '',
    'Run `diary time` now and then. When it says the stretch is over, stop and reply with one line: what you spent the time on.',
  ].join('\n');
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

/** Every issue from every diary, worst first, then most seen. */
export function rankIssues(byPerson) {
  const all = [];
  for (const [who, issues] of Object.entries(byPerson)) for (const i of issues) all.push({ ...i, who });
  return all.sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity) || (b.seen ?? 1) - (a.seen ?? 1));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (n, f = null) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : f; };
  const say = (s) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${s}`);
  const { readPeople, pickPeople } = await import(path.resolve(here, '../../power-test/scripts/plan.mjs'));
  const { readDiary } = await import(DIARY);
  const { paceFor, readingFromLimits } = await import(path.join(here, 'pace.mjs'));
  const people = pickPeople(opt('who', 'random:2'), readPeople(path.resolve(here, '../../power-test/people')));
  const engine = opt('engine', 'codex');
  const minutes = Number(opt('minutes', 30));
  const pace = args.includes('--pace');
  const deadline = Date.now() + Number(opt('hours', pace ? 10 : 24)) * 60 * MIN;
  const maxStretches = pace ? Infinity : Number(opt('stretches', 1));
  const codexHome = String(opt('codex-home', process.env.CODEX_HOME || path.join(os.homedir(), '.codex'))).replace(/^~(?=\/)/, os.homedir());
  const root = path.resolve(opt('out', path.join(os.tmpdir(), 'agentbox-product-loop', `${new Date().toISOString().replace(/[:.]/g, '-')}-phone`)));
  fs.mkdirSync(root, { recursive: true });

  // A session of its own, so ending the run that started it does not end the day.
  if (args.includes('--detach')) {
    const log = fs.openSync(path.join(root, 'workday.log'), 'a');
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...detachedArgv(args, root)], { detached: true, stdio: ['ignore', log, log] });
    child.unref();
    console.log(`workday started, pid ${child.pid}. Log: ${path.join(root, 'workday.log')}. Report when it ends: ${path.join(root, 'report.md')}`);
    process.exit(0);
  }

  // The preview, built once per version of mobile/ and served from here.
  let url = opt('url');
  if (!url) {
    const tree = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD:mobile'], { encoding: 'utf8' }).trim();
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
        execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', built], { ...quietly, env: { ...process.env, EXPO_PUBLIC_PREVIEW: '1', CI: '1' } });
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
  say(`${people.map((p) => p.name).join(', ')} on the phone app at ${url}, ${minutes}-minute stretches on ${engine}. Evidence: ${root}`);

  const dirs = Object.fromEntries(people.map((p) => {
    const dir = path.join(root, p.slug);
    fs.mkdirSync(dir, { recursive: true });
    const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
    for (const [cmd, script] of [['phone', PHONE], ['diary', DIARY]]) {
      fs.writeFileSync(path.join(dir, cmd), `#!/bin/sh\nexport PHONE_OUT=${q(dir)} PHONE_URL=${q(url)} POWER_OUT=${q(dir)}\nexec ${q(process.execPath)} ${q(script)} "$@"\n`, { mode: 0o755 });
    }
    return [p.slug, dir];
  }));
  const run = (cmd, argv, opts) => new Promise((resolve) => {
    const child = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => child.kill('SIGTERM'), (minutes + 10) * MIN);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out: out.slice(-4000) }); });
  });
  const diaries = () => Object.fromEntries(people.map((p) => [p.name, readDiary(path.join(dirs[p.slug], 'diary.jsonl')).issues]));

  let stretch = 0;
  while (stretch < maxStretches && Date.now() < deadline) {
    if (pace && engine === 'codex') {
      const { loggedCodexLimits } = await import(path.join(REPO, 'main/codex-usage-file.mjs'));
      const { codexLimits } = await import(path.join(REPO, 'shared/codex-usage.mjs'));
      const logged = loggedCodexLimits(codexHome);
      const p = paceFor(logged ? readingFromLimits(codexLimits(logged.snapshot)) : null, { target: Number(opt('target', 90)) });
      say(`pace: ${p.verdict}. ${p.why}`);
      if (p.verdict === 'stop') break;
      if (p.verdict === 'wait' || p.verdict === 'hold') {
        if (p.until > deadline) break;
        await new Promise((r) => setTimeout(r, Math.max(0, p.until - Date.now()) + MIN));
        continue;
      }
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
      const prompt = phonePrompt(person, { dir, minutes, focus: opt('focus'), logged });
      if (engine === 'external') {
        const file = path.join(dir, `stretch-${stretch}.prompt.md`);
        fs.writeFileSync(file, prompt);
        say(`${person.name}: waiting for a subagent to run ${file} and write stretch-${stretch}.done`);
        while (!fs.existsSync(path.join(dir, `stretch-${stretch}.done`)) && Date.now() < ends + 15 * MIN) await new Promise((r) => setTimeout(r, 5000));
        return;
      }
      const last = path.join(dir, `stretch-${stretch}.last.txt`);
      const bin = engine === 'codex' ? 'codex' : 'claude';
      const r = await run(bin, testerArgv(engine, { dir, prompt, model: opt('model'), last }), { cwd: dir, env: { ...process.env, CODEX_HOME: codexHome } });
      fs.writeFileSync(path.join(dir, `stretch-${stretch}.log`), r.out);
      say(`${person.name}: stretch ${stretch} ended (${r.code === 0 ? 'ok' : `exit ${r.code}`})`);
    }));
    for (const p of people) await run(process.execPath, [PHONE, 'close'], { env: { ...process.env, PHONE_OUT: dirs[p.slug], PHONE_URL: url } });
  }

  const ranked = rankIssues(diaries());
  const lines = [`# Phone app workday, ${new Date().toDateString()}`, '', `${people.map((p) => p.name).join(', ')}, ${stretch} stretch${stretch === 1 ? '' : 'es'} of ${minutes} minutes on ${engine}.`, ''];
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
  say(`report: ${path.join(root, 'report.md')} (${ranked.length} issue${ranked.length === 1 ? '' : 's'})`);
  process.exit(0);
}
