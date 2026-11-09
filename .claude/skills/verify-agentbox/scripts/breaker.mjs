#!/usr/bin/env node
// AN AGENT WHOSE ONLY JOB IS TO BREAK THE APP, THROUGH THE SCREEN.
//
//   node .claude/skills/verify-agentbox/scripts/breaker.mjs [--minutes 15] [--model <alias>] [--out <dir>]
//
// The drives check what we thought of. This is for what nobody thought of: a
// Claude Code session is handed the live copy (`live.mjs up` first) and one
// command, browse.mjs, that presses keys and clicks in that copy's own
// headless Chrome, and is told to make the app misbehave the way a person
// would. It writes what it found, reproduced, to findings.json beside its
// pictures.
//
// WHAT IT CAN AND CANNOT TOUCH, AND WHY.
//   - Its tools are browse.mjs (through Bash, that command only) and reading and
//     writing its own run folder. No other shell, no web, no subagents.
//   - No MCP servers at all (--strict-mcp-config with an empty list), so it has
//     no way to reach the real store or anybody's threads.
//   - The Chrome it drives is a throwaway on a profile inside the instance
//     folder. Never `--chrome`: no worker of this app ever drives a person's own
//     browser (tests/no-worker-drives-her-own-browser.test.mts).
//   - It runs on this Mac's Claude Code login like any session; no API key is
//     passed (cleanEnv strips them).
// It is stopped at --minutes whatever it is doing.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { readState, doctor, cleanEnv, RUNS, REPO } = await import(path.join(here, 'live.mjs'));
const { findClaudeBin } = await import(path.join(REPO, 'main', 'claude-bin.mts'));

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const minutes = Number(opt('minutes', 15));
const model = opt('model', null);
const out = path.resolve(opt('out', path.join(RUNS, `${new Date().toISOString().replace(/[:.]/g, '-')}-breaker`)));
fs.mkdirSync(out, { recursive: true });

const wrong = await doctor({ quiet: true });
if (wrong.length) { console.error(`breaker: the live copy is not healthy:\n  ${wrong.join('\n  ')}`); process.exit(1); }
const state = readState();
const claude = findClaudeBin({});
if (!claude.found) { console.error('breaker: no Claude Code on this Mac to run the breaker with.'); process.exit(1); }

const browse = path.join(here, 'browse.mjs');
const node = process.execPath;
const B = `"${node}" "${browse}"`;
const stub = state.engine === 'stub';
const findings = path.join(out, 'findings.json');

const prompt = `You are testing Agentbox, an app where a person writes tasks into an inbox and AI agents (Claude Code and Codex) do them and answer back in the thread. Your job for the next ${minutes} minutes is to find bugs a real person would hit, by using the app through its screen and nothing else. You are not reading code. You are a demanding user trying to make it misbehave.

You control a copy of the app running in a browser with one command. Run it through Bash, exactly like this:
  ${B} open            (once, first)
  ${B} look            (what is on screen, and numbered things you can press)
  ${B} click 7         (press thing 7 from the last look; or click "New thread")
  ${B} type "some text"
  ${B} press n         (one key; add modifiers after: press Enter meta, press k meta)
  ${B} shot name       (save a picture as evidence)
  ${B} reload
Run look after anything that changes the screen. Do not run any other command.

The app's own keys: N new thread; ⌘↵ (press Enter meta) sends; J/K or arrows move in the list; ↵ opens; esc goes back; R replies in an open thread; E closes a thread; L snoozes; Z undoes; ⌘K (press k meta) opens the command bar; / searches; B switches list and board; tab moves between list tabs; S toggles the summary; 1-9 pick an option an agent offered.

There are two projects, Sandbox and Second. ${stub
    ? `The agents here are stand-ins that obey words you put in the task text, so you can make agents misbehave on purpose:
  [[stub:slow:20000]]  the agent takes 20 seconds
  [[stub:hang]]        the agent never answers
  [[stub:limit]]       the agent's account is out of usage
  [[stub:limit-on:.claude-second]]  only the second of two Claude accounts is out
  [[tok:abc]]          the agent's answer contains "abc", so you can tell whose answer landed where
Codex can be picked in the composer's Model menu (All models, Codex column).`
    : 'The agents are real Claude Code and Codex. Keep every task tiny (for example: "reply with the word OK and nothing else, do not run commands") so each costs almost nothing.'}

What matters most to the person who owns this app, in order:
1. Agents that do not run, or whose answer never comes back, or comes back to the wrong thread, the wrong project, or the wrong tab of the inbox.
2. Several agents at once: send many tasks quickly, mix Claude and Codex, mix projects, reply while one is still running, close or undo a running one, and check every answer lands where it should.
3. Agents running out of usage or time, and what the screen tells the person then.
4. Anything that loses what the person typed, shows something false, or leaves them unsure what happens next.
5. Page errors (look prints PAGE ERRORS when the page throws).

Rules:
- Before you report something, reproduce it a second time from a fresh start (reload, or a new task) and take a shot of it.
- Report only what you saw happen, with the exact steps. Do not guess at causes.
- Things that are merely a matter of taste are not bugs.
- Keep a list as you go. Before your time runs out, write your findings as JSON to ${findings} with this shape:
  [{"title": "...", "severity": "broken" | "wrong" | "confusing", "steps": ["..."], "expected": "...", "actual": "...", "reproduced": true, "shots": ["name.png"]}]
  Write the file even if it is an empty list, and rewrite it whenever you confirm a new finding, so nothing is lost if you are stopped.
- Finish with one short paragraph: what you tried and what held up.`;

const env = { ...cleanEnv(), BREAKER_OUT: out };
const transcript = fs.openSync(path.join(out, 'transcript.jsonl'), 'a');
const child = spawn(claude.path, [
  '-p', prompt,
  '--output-format', 'stream-json', '--verbose',
  // A path rule starting `//` is an absolute path (`/Users/…` alone reads as
  // relative to the settings file, which is why the first trial could not
  // write its findings). Edits are accepted inside its own folder, its cwd.
  '--allowedTools', `Bash(${node} ${browse}:*)`, `Bash("${node}" "${browse}":*)`, `Read(/${out}/**)`, `Write(/${out}/**)`, `Edit(/${out}/**)`,
  '--permission-mode', 'acceptEdits',
  '--disallowedTools', 'WebFetch', 'WebSearch', 'Task', 'Agent',
  '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
  ...(model ? ['--model', model] : []),
], { cwd: out, env, stdio: ['ignore', transcript, transcript] });

console.log(`breaker: running for up to ${minutes} min on the ${stub ? 'stand-in' : 'real'} copy. Evidence: ${out}`);
const timer = setTimeout(() => { console.log('breaker: time is up, stopping it.'); child.kill('SIGTERM'); }, minutes * 60_000);
const code = await new Promise((r) => child.on('exit', r));
clearTimeout(timer);
spawnSync(node, [browse, 'close'], { env: { ...process.env, BREAKER_OUT: out }, stdio: 'ignore' });

let found = [];
try { found = JSON.parse(fs.readFileSync(findings, 'utf8')); } catch { /* none written */ }
const lines = fs.readFileSync(path.join(out, 'transcript.jsonl'), 'utf8').split('\n').filter(Boolean);
const last = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e) => e?.type === 'result').pop();
const commands = lines.filter((l) => l.includes(browse) && l.includes('"tool_use"')).length;
console.log(`\nbreaker: ${commands} actions in the app, exit ${code}${fs.existsSync(findings) ? '' : ', and it wrote no findings file'}.`);
for (const f of found) console.log(`  ${String(f.severity ?? '?').toUpperCase().padEnd(9)} ${f.title}${f.reproduced ? '' : ' (not reproduced)'}`);
if (!found.length) console.log('  no findings');
if (last?.result) console.log(`\n${String(last.result).trim()}`);
console.log(`\nEvidence: ${out}`);
// Findings are judgement, not proof, so they are reported and do not fail the
// run on their own; the person reads them.
process.exit(fs.existsSync(findings) ? 0 : 1);
