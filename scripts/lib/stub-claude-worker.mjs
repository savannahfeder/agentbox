#!/usr/bin/env node
// A STAND-IN FOR `claude -p`, FOR THE PROOF SCRIPTS ONLY.
//
// BE PRECISE ABOUT WHAT THIS IS, because a stand-in believed to be more than it
// is, is worse than none. It is NOT Claude Code and it proves nothing about
// Claude Code's own behaviour. What it is, is a process the supervisor spawns
// through the identical code path -- the same argv, the same environment, the
// same stdout contract, the same exit semantics -- so that everything on
// AGENTBOX'S side of that boundary can be watched end to end without spending the
// founder's subscription and without writing a transcript into her ~/.claude.
//
// WHY A STAND-IN AT ALL. The engineer writing these proofs was told not to read
// or write ~/.claude, and Claude Code has no way to run signed-out: pointing
// CLAUDE_CONFIG_DIR at a scratch folder gives an unauthenticated CLI that dies
// on arrival. There is no equivalent of the model-provider trick that lets the
// Codex proofs use the real binary (scripts/lib/codex-stub-model.mjs). So the
// honest options were this, clearly labelled, or nothing -- and "the Claude
// path still works" is too important to leave unexamined.
//
// WHAT IT REALLY DOES, and this is the part that is not pretend:
//
//   IT ANSWERS ON THE REAL STDOUT CONTRACT. `session_id` on its first line and
//   a `type: "result"` frame at the end are exactly what main/supervisor.mts's
//   `captureStream` reads, and they are what make a run resumable and readable.
//
//   IT RAISES A REAL APPROVAL. Given `approval` in its plan it reads the
//   `--mcp-config` file Agentbox wrote for it, launches the `zero-approvals`
//   server named in it with the environment Agentbox chose, and calls
//   `approval_prompt` over MCP stdio -- the same server, the same spool, the
//   same signed answer, the same fifteen-minute deadline a real worker gets.
//   Nothing about the gate is simulated; only the reason for asking is.
//
//   IT DIES LIKE THE REAL ONE. The CLI traps SIGTERM and exits 143 under its
//   own power, which is why main/supervisor.mts's `_kill` writes the intent
//   down instead of reading a signal. This does the same, so a proof about a
//   kill is a proof about the same numbers.
//
// It also writes down the argv and environment it was handed, which is how a
// proof can show that the command line Agentbox builds for Claude Code has not
// moved.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { readWorld, worldTurn, worldAnswer, titleIn, stepEvery, workStep } from './stand-in-world.mjs';

const argv = process.argv.slice(2);
const say = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const sessionId = `stub-${crypto.randomUUID()}`;

const planFile = process.env.STUB_CLAUDE_PLAN ?? null;
let plan = {};
try { plan = planFile ? JSON.parse(fs.readFileSync(planFile, 'utf8')) : {}; } catch { plan = {}; }

// THE RECEIPT. What Agentbox actually handed this worker, written where the proof
// can read it: the whole argv, the environment variables that decide billing
// and identity, and the working directory.
if (plan.receipts) {
  try {
    fs.mkdirSync(plan.receipts, { recursive: true });
    fs.writeFileSync(path.join(plan.receipts, `${process.env.ZERO_ITEM ?? 'no-item'}.json`), JSON.stringify({
      argv,
      cwd: process.cwd(),
      sessionId,
      mcp: Object.fromEntries(Object.entries(mcpServers()).map(([name, server]) => [name, server?.type ?? 'stdio'])),
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => (
        k.startsWith('ZERO_') || k.startsWith('STORE_') || k.startsWith('ANTHROPIC_')
        || k.startsWith('CLAUDE') || k.startsWith('OPENAI_') || k.startsWith('CODEX_')
      ))),
    }, null, 1));
  } catch { /* a receipt is never worth the run */ }
}

say({ type: 'system', subtype: 'init', session_id: sessionId, tools: [], model: 'stub' });

// OUR OWN KILL, ANSWERED THE WAY THE REAL CLI ANSWERS IT. 143 and not a signal:
// see the note at the top, and main/supervisor.mts `_kill`.
let stopping = false;
process.on('SIGTERM', () => { stopping = true; process.exit(143); });
process.on('SIGINT', () => { stopping = true; process.exit(143); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// THE INPUT PROTOCOL, WHEN AGENTBOX SPEAKS IT. A worker spawned with
// `--input-format stream-json --replay-user-messages` (main/claude-input.mts)
// gets its prompt as a `user` line on stdin, and Agentbox waits for Claude Code
// to replay that line, by uuid, before it will treat a result as the end of the
// run. A stand-in that never replayed it left every run "unfinished": the app
// never closed its input and never wrote the answer onto the row (found
// 2026-10-11 by the verify-agentbox live drive). So: replay every user line, as
// the CLI does, and wait for the first before working on it.
const streamInput = argv.includes('--input-format');
let firstUserLine = null;
let stdinEnded = !streamInput;
const inputEnded = new Promise((resolve) => {
  if (!streamInput) return resolve();
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      let msg = null;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg?.type !== 'user') continue;
      say({ ...msg, session_id: sessionId });
      firstUserLine ??= msg;
    }
  });
  const end = () => { stdinEnded = true; resolve(); };
  process.stdin.on('end', end);
  process.stdin.on('error', end);
});
if (streamInput) {
  const until = Date.now() + 10_000;
  while (!firstUserLine && !stdinEnded && Date.now() < until) await wait(20);
}

function mcpServers() {
  const at = argv.indexOf('--mcp-config');
  if (at < 0) return {};
  const raw = argv[at + 1] ?? '';
  try { return JSON.parse(raw.trim().startsWith('{') ? raw : fs.readFileSync(raw, 'utf8')).mcpServers ?? {}; } catch { return {}; }
}

/** The approvals server Agentbox wrote into this worker's --mcp-config, spoken to
 *  exactly the way Claude Code speaks to it: over the child's stdio, or HTTP when shared. */
async function askTheFounder({ tool_name: toolName, input }) {
  if (argv.indexOf('--mcp-config') < 0) throw new Error('no --mcp-config was passed, so there is no approvals channel to use');
  const server = mcpServers()['zero-approvals'];
  if (!server) throw new Error('the mcp config Agentbox wrote has no zero-approvals server in it');
  const session = mcpSession(server);
  const answer = await session.call('approval_prompt', { tool_name: toolName, input });
  session.close();
  // The server answers with the decision as JSON text inside the MCP result,
  // which is the shape Claude Code's --permission-prompt-tool contract expects.
  const text = answer?.result?.content?.[0]?.text ?? '{}';
  try { return JSON.parse(text); } catch { return { behavior: 'deny', message: `unreadable answer: ${text}` }; }
}

// The store server: one of its own carries the account, a shared one is reached by its address.
function storeServer() {
  return Object.entries(mcpServers()).find(([name, s]) => name !== 'zero-approvals' && (s?.env?.STORE_ACCOUNT_ID || (s?.type === 'http' && /\/store$/.test(s.url ?? ''))))?.[1];
}

// A server the app shares between runs (main/tool-host.mjs), spoken to over
// HTTP as Claude Code speaks to it.
function httpSession(server) {
  let sid = null;
  let nextId = 1;
  const call = async (method, params) => {
    const id = nextId++;
    try {
      const res = await fetch(server.url, {
        method: 'POST',
        headers: { ...server.headers, 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(sid ? { 'mcp-session-id': sid } : {}) },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: AbortSignal.timeout(20_000),
      });
      sid = res.headers.get('mcp-session-id') ?? sid;
      if (!res.ok) return { error: { message: `${method} was refused (${res.status})` } };
      const answer = (await res.text()).split('\n\n').filter((e) => e.startsWith('event: message'))
        .map((e) => JSON.parse(e.slice(e.indexOf('data: ') + 6))).find((m) => m.id === id);
      return answer ?? { error: { message: `${method} had no answer` } };
    } catch (err) {
      return { error: { message: `${method} had no answer in 20 s: ${err.message}` } };
    }
  };
  const ready = call('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'agentbox-proof-stub', version: '1.0.0' }, capabilities: {} });
  return {
    call: async (name, args) => { await ready; return call('tools/call', { name, arguments: args }); },
    close: () => { if (sid) fetch(server.url, { method: 'DELETE', headers: { ...server.headers, 'mcp-session-id': sid }, signal: AbortSignal.timeout(5_000) }).catch(() => {}); },
  };
}

function mcpSession(server) {
  if (server.type === 'http') return httpSession(server);
  const child = spawn(server.command, server.args ?? [], {
    env: { ...process.env, ...(server.env ?? {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  const waiting = new Map();
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let at2;
    while ((at2 = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at2).trim();
      buffer = buffer.slice(at2 + 1);
      if (!line) continue;
      let msg = null;
      try { msg = JSON.parse(line); } catch { continue; }
      const settle = waiting.get(msg.id);
      if (settle) { waiting.delete(msg.id); settle(msg); }
    }
  });
  let nextId = 1;
  const call = (method, params) => new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    setTimeout(() => { if (waiting.delete(id)) resolve({ error: { message: `${method} had no answer in 20 s` } }); }, 20_000).unref();
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

  const ready = call('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'agentbox-proof-stub', version: '1.0.0' }, capabilities: {} });
  return {
    call: async (name, args) => { await ready; return call('tools/call', { name, arguments: args }); },
    close: () => { try { child.kill(); } catch { /* done with it */ } },
  };
}

// A TEAMMATE'S RUN, PLAYED, through the store server a real run is given:
// it asks its setup question, sets itself up once answered, and otherwise
// answers in the chat. Without it no teammate on stand-ins ever finished setup.
const ROLES = [[/\b(ci|tests?|flaky|bugs?|qa|quality)\b/i, 'Quality lead'], [/\b(api|backend|endpoints?|server|deploys?|infra)\b/i, 'Engineering lead'],
  [/\b(investors?|fundrais\w*|raise)\b/i, 'Fundraiser'], [/\b(support|customers?|tickets?)\b/i, 'Support lead'], [/\b(summar\w*|changelog|digest|shipped)\b/i, 'Release notes lead'],
  [/\b(marketing|posts?|tweets?|videos?|launch)\b/i, 'Marketing lead'], [/\b(growth|signups?|metrics?)\b/i, 'Growth lead']];
async function actAsTeammate(brief, prompt, answer) {
  const server = storeServer();
  if (!server) return;
  const session = mcpSession(server);
  const text = (r) => r?.result?.content?.[0]?.text ?? '';
  const failed = (r) => !!(r?.error || r?.result?.isError);
  try {
    if (brief.includes('You are a new teammate, still being set up.')) {
      let you = null;
      try { you = JSON.parse(text(await session.call('team_roster', {}))).you; } catch { /* named from the ask */ }
      const name = you && you !== 'New teammate' ? you : ROLES.find(([re]) => re.test(prompt.split('\n').filter((l) => !/^(#|Title:)/.test(l)).join('\n')))?.[1] ?? 'Operations lead';
      const fields = {
        role: name, job: `Looks after ${name.toLowerCase().replace(/ lead$/, '')} for you, and brings you what needs a decision.`,
        goal: 'Nothing in its area waits on you without a reason', asksFirst: 'Anything that goes out in public or costs money',
        duties: [{ what: 'Look over what changed today', every: 'weekday', at: ['10:00'] }],
      };
      let named = await session.call('team_setup', { ...fields, name });
      if (failed(named) && /taken/.test(text(named))) named = await session.call('team_setup', { ...fields, name: `${name} 2` });
      const go = await session.call('team_setup', { ready: true });
      if (failed(go)) await session.call('team_post', { text: 'Before I start: should I bring you everything I find, or only what needs a decision?', options: ['Everything', 'Only decisions'] });
      return;
    }
    await session.call('team_post', { text: answer });
  } finally {
    session.close();
  }
}

let said = plan.say ?? 'the stub worker ran';

// [[stub:act:<name>]] makes the store-tool calls its plan lists under
// acts.<name> ({ calls: [{ tool, args }], say }), so a proof can have an agent
// write a document or attach a file. A refused call is said in the answer.
async function actFromPlan({ calls = [], say: words }) {
  const server = storeServer();
  if (!server) return 'the stub had no store tools to act with';
  const session = mcpSession(server);
  const refused = [];
  try {
    for (const { tool, args } of calls) {
      const r = await session.call(tool, args ?? {});
      if (r?.error || r?.result?.isError) refused.push(`${tool}: ${r?.error?.message ?? r?.result?.content?.[0]?.text ?? 'refused'}`);
    }
  } finally {
    session.close();
  }
  return [words ?? 'Done.', ...refused].join('\n\n');
}

// WHAT THE TASK ITSELF ASKS OF THE STAND-IN. A proof that runs several threads
// at once needs each worker to behave differently, and one plan file is shared
// by all of them, so the task's own words carry the script:
//
//   [[tok:abc]]          answer with "abc" in the result, so a proof can tell
//                        whose answer landed on which thread
//   [[stub:slow:4000]]   take 4 s before answering (several running at once)
//   [[stub:hang]]        never answer, until stopped
//   [[stub:limit]]       run out of usage, as Claude Code says it
//   [[stub:limit-first]] run out on the first attempt only, so a retry or a
//                        second login can finish it
//   [[stub:work-then-die]] run a tool, then die with no answer
//   [[stub:file:leads/x.csv]] end the answer with that path on a line of its
//                        own, as an agent hands over a file it made
//
// The words a limit is reported in are the CLI's own ("You've hit your session
// limit · resets …"), which is what shared/spawn-trouble.mts reads.
const promptText = (() => {
  const c = firstUserLine?.message?.content;
  const fromStdin = typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => b?.text ?? '').join('\n') : '';
  const at = argv.indexOf('-p');
  const fromArg = at >= 0 && argv[at + 1] && !argv[at + 1].startsWith('--') ? argv[at + 1] : '';
  return `${fromStdin}\n${fromArg}`;
})();
const directive = (name) => promptText.match(new RegExp(`\\[\\[${name}(?::([^\\]]*))?\\]\\]`));
const token = directive('tok')?.[1];
if (token) said = `${said} [${token}]`;
const attemptsFile = plan.receipts && process.env.ZERO_ITEM ? path.join(plan.receipts, `${process.env.ZERO_ITEM}.attempts`) : null;
const attempt = (() => {
  if (!attemptsFile) return 1;
  let n = 0;
  try { n = Number(fs.readFileSync(attemptsFile, 'utf8')) || 0; } catch { /* first */ }
  try { fs.writeFileSync(attemptsFile, String(n + 1)); } catch { /* best effort */ }
  return n + 1;
})();
// One line per start, so a proof can see which login each attempt ran on and when.
if (plan.receipts && process.env.ZERO_ITEM) {
  try {
    fs.appendFileSync(path.join(plan.receipts, `${process.env.ZERO_ITEM}.spawns.jsonl`), `${JSON.stringify({
      at: Date.now(), attempt, login: process.env.CLAUDE_CONFIG_DIR ?? 'default', resume: argv.includes('--resume'), pid: process.pid,
    })}\n`);
  } catch { /* a receipt is never worth the run */ }
}
// [[stub:limit-on:.claude-second]] runs out only on the login whose folder has
// that name ('default' for the main one), so a proof can put one login out of
// time and leave another free.
const loginName = process.env.CLAUDE_CONFIG_DIR ? path.basename(process.env.CLAUDE_CONFIG_DIR) : 'default';
const limitOn = directive('stub:limit-on')?.[1];
// What a power test's world says happens to this start (scripts/lib/stand-in-world.mjs).
// Only a task run: the app's sign-in check times out at 15 s.
const world = argv.includes('-p') ? readWorld(plan.world) : {};
const turn = worldTurn(world, loginName);
if (Object.keys(world).length) said = worldAnswer(said, turn, titleIn(promptText), attempt);
// WHAT ONLY THE PERSON CAN GIVE, ASKED FOR THE WAY A CLOUD RUN IS TOLD TO
// (main/cloud/run.mjs cloudNote, shared/cloud-needs.mjs), and only by a run that
// was told it may. The task's own words say what it needs: a service names a
// sign-in, found in the environment once saved; "the original film" a file;
// "npm publish" a one-time code; Xcode or the simulator the computer itself.
const SIGN_INS = [
  [/supabase/i, 'supabase', 'Supabase', ['SUPABASE_ACCESS_TOKEN'], 'to apply the change to the database'],
  [/vercel/i, 'vercel', 'Vercel', ['VERCEL_TOKEN'], 'to deploy the site'],
  [/stripe/i, 'stripe', 'Stripe', ['STRIPE_SECRET_KEY'], 'to run it against Stripe test mode'],
  [/\bexpo\b|\beas\b/i, 'expo', 'Expo', ['EXPO_TOKEN'], 'to start the build'],
  [/\baws\b|\bs3\b/i, 'aws', 'AWS', ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'], 'to upload to S3'],
  [/sentry/i, 'sentry', 'Sentry', ['SENTRY_AUTH_TOKEN'], 'to read the errors'],
  [/github/i, 'github', 'GitHub', ['GH_TOKEN'], 'to open the pull request'],
];
// Round six: testers asking in their own words ("the launch film", "the .mov") got no file card.
const FILE_ASK = /\b(film|video|footage|recording|\.mov|\.mp4)\b|\bfrom my (movies|desktop|downloads)\b/i;
const FILM = '~/Movies/launch-film-original.mov';
const CODE_ASK = /\bnpm\b.*\bpublish|\bpublish\b.*\bnpm\b|one-time|\botp\b|\b2fa\b|verification code/i;
const COMPUTER_ASK = /\bxcode\b|simulator|testflight/i;
{
  const brief = (() => { const at = argv.indexOf('--append-system-prompt'); return at >= 0 ? argv[at + 1] ?? '' : ''; })();
  // Only a cloud run is told it may ask; on the computer the person's own sign-ins and files are there.
  const inCloud = `${brief}\n${promptText}`.includes('# You are running on a cloud machine');
  const told = inCloud && `${brief}\n${promptText}`.includes('AGENTBOX-NEEDS:');
  const task = promptText.match(/^Title: [\s\S]*?(?=\n# |(?![\s\S]))/m)?.[0] ?? '';
  const asked = promptText.match(/# The founder has answered[\s\S]*?\n> (.*)/)?.[1] ?? '';
  const title = titleIn(promptText) ?? 'this';
  const services = SIGN_INS.filter(([re]) => re.test(task));
  // A file the person named is asked for by name (round eight: a signed pdf was asked for as the launch film).
  const named = `${task}\n${asked}`.match(/\b([\w-]+\.(pdf|sql|csv|mov|mp4|zip|png|jpe?g|docx?|xlsx?|json|txt))\b/i)?.[1];
  const file = named ? `~/${/\.(mov|mp4)$/i.test(named) ? 'Movies' : 'Downloads'}/${named}` : FILM;
  const wantsFile = !!named || FILE_ASK.test(task) || FILE_ASK.test(asked);
  // The file the person named is on their (stand-in) computer, as it would be, so the card can send it.
  if (named && process.env.STUB_PERSON_HOME) {
    const there = path.join(process.env.STUB_PERSON_HOME, file.slice(2));
    if (!fs.existsSync(there)) { fs.mkdirSync(path.dirname(there), { recursive: true }); fs.writeFileSync(there, `stand-in ${named}\n`); }
  }
  const wantsCode = CODE_ASK.test(task) || CODE_ASK.test(asked);
  // Only the card's own way out, not any reply that mentions the computer (round six).
  const onComputer = /^do it (from|on) my computer( instead)?\.?$/i.test(asked.trim());
  if (inCloud && COMPUTER_ASK.test(task)) said = 'AGENTBOX-NEEDS-THE-COMPUTER: Xcode and the iOS simulator';
  else if (!inCloud && onComputer) said = `Did it on your computer${services.length ? ` with your own ${services.map((x) => x[2]).join(' and ')} sign-in` : ''}. It is done.`;
  else if (told && onComputer) said = `AGENTBOX-NEEDS-THE-COMPUTER: ${services[0]?.[2] ?? 'your'} sign-in, on your computer`;
  else if (told && (services.length || wantsFile || wantsCode)) {
    // Earlier answers on the thread say what the person already gave.
    const gaveFile = /I sent \S/.test(promptText);
    const gaveCode = /code is [A-Za-z0-9-]{4,}/.test(promptText);
    const missingSignIns = services.filter((x) => x[3].some((k) => !process.env[k]));
    const lines = [
      ...missingSignIns.map(([, id, , , why]) => `AGENTBOX-NEEDS: sign-in ${id} | ${why}`),
      ...(wantsFile && !gaveFile ? [`AGENTBOX-NEEDS: file ${file} | ${named ? 'it is on your computer, not in the repository' : 'the cut is made from the original'}`] : []),
      ...(wantsCode && !gaveCode ? ['AGENTBOX-NEEDS: code npm | the one-time password for npm publish'] : []),
    ];
    const what = [...missingSignIns.map((x) => `your ${x[2]} sign-in`), ...(wantsFile && !gaveFile ? [named ? `${named} from your computer` : 'the original film from your computer'] : []), ...(wantsCode && !gaveCode ? ['the npm one-time password'] : [])];
    said = lines.length
      ? [`**I need ${what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what.at(-1)}` : what[0]} to finish.**`, '', 'Everything that does not need it is done.', '', ...lines].join('\n')
      : `Finished "${title}" with ${[...services.map((x) => `your saved ${x[2]} sign-in`), ...(wantsFile ? [named ? `the ${named} you sent` : 'the film you sent'] : []), ...(wantsCode ? ['the code you sent'] : [])].join(', ')}. It is done.`;
  }
}
const handsOver = directive('stub:file')?.[1];
if (handsOver) said = `${said}\n\n${handsOver}\n`;
if (directive('stub:limit') || (directive('stub:limit-first') && attempt === 1) || (limitOn && limitOn === loginName) || turn.limit) {
  say({ type: 'result', subtype: 'success', result: "You've hit your session limit · resets 11:59pm", is_error: true, session_id: sessionId });
  await Promise.race([inputEnded, wait(2000)]);
  process.exit(1);
}
if (directive('stub:work-then-die') || turn.die) {
  say({ type: 'assistant', session_id: sessionId, message: { content: [{ type: 'text', text: 'Starting on this now.' }] } });
  say({ type: 'assistant', session_id: sessionId, message: { content: [{ type: 'tool_use', id: 'toolu_stub', name: 'Bash', input: { command: 'ls' } }] } });
  await wait(200);
  process.exit(1);
}
if (directive('stub:hang') || turn.hang) {
  while (!stopping) await wait(100);
}
const slow = Number(directive('stub:slow')?.[1]) || turn.delayMs;
if (slow > 0) {
  const until = Date.now() + slow;
  // The world's pace stands in for real work, and real work shows its steps.
  const every = directive('stub:slow') ? 0 : stepEvery(world);
  let next = every ? Date.now() + every : Infinity;
  let step = 0;
  while (!stopping && Date.now() < until) {
    if (Date.now() >= next) {
      step += 1;
      next += every;
      say({ type: 'assistant', session_id: sessionId, message: { content: [workStep(step, titleIn(promptText))] } });
    }
    await wait(50);
  }
}

try {
  const brief = (() => { const at = argv.indexOf('--append-system-prompt'); return at >= 0 ? argv[at + 1] ?? '' : ''; })();
  if (brief.includes('team_post') && process.env.ZERO_ITEM) await actAsTeammate(brief, promptText, said);
  const act = directive('stub:act')?.[1];
  if (act && plan.acts?.[act]) said = await actFromPlan(plan.acts[act]);
  if (plan.approval) {
    const decision = await askTheFounder(plan.approval);
    say({ type: 'assistant', message: { content: [{ type: 'text', text: `the founder said: ${decision.behavior}` }] } });
    said = `${said} — approval ${decision.behavior}`;
    if (plan.markWhenAllowed && decision.behavior === 'allow') {
      fs.writeFileSync(path.join(process.cwd(), plan.markWhenAllowed), 'the founder said yes\n');
    }
  }
  if (plan.holdMs) {
    const until = Date.now() + plan.holdMs;
    while (!stopping && Date.now() < until) await wait(50);
  }
} catch (err) {
  say({ type: 'result', subtype: 'error', result: String(err?.message ?? err), is_error: true, session_id: sessionId });
  process.exit(1);
}

say({ type: 'result', subtype: 'success', result: said, is_error: false, session_id: sessionId });
// AND IT LEAVES WHEN IT IS LET GO, LIKE THE REAL ONE: with streamed input,
// Claude Code does not exit at its result but when Agentbox closes its input.
// Capped, so a stand-in nobody lets go of cannot outlive its proof.
await Promise.race([inputEnded, wait(30_000)]);
process.exit(0);
