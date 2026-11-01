// ONE CLOUD RUN, AS SEEN FROM THE MAC: A LOCAL PROCESS THAT COMPUTES ELSEWHERE.
//
// docs/cloud/PLAN.md. For a cloud run the supervisor spawns this in place of
// `claude`, with the same argv, env and cwd. To the supervisor it is a worker:
// what the agent prints arrives on stdout byte for byte, what the supervisor
// writes to stdin (the prompt, live replies, interrupts, the close at the end)
// reaches the agent in order, and it exits with the agent's exit code once the
// agent's work is back in the task folder.
//
// What it does in between:
//   1. Brings home any earlier cloud run in this folder that never came back,
//      before it does anything else; one the app left going when it quit is
//      joined and served until it finishes.
//   2. Packs the task folder (its branch, main, and any uncommitted work) and
//      the files the agent will need at the same absolute paths: the settings
//      file without the Mac-only memory hooks, an MCP config whose servers are
//      the sandbox's stubs, the transcript a `--resume` needs, the account's
//      skills, commands and agents, her CLAUDE.md and those of her own hooks
//      that can run there, and any file the prompt names.
//   3. Starts the sandbox, then pumps: events out (stdout, stderr, MCP lines),
//      input in (stdin, MCP replies), every input numbered and kept until the
//      sandbox has acknowledged it, so a resend after a lost reply is applied
//      once and nothing is skipped.
//   4. Runs the app's MCP servers HERE, from the original config, with the
//      worker's own environment, exactly as Claude Code would have, and joins
//      each to its stub in the sandbox. A call to `look_at_page` is refused:
//      it would look at this Mac's localhost, not the sandbox's.
//   5. When the sandbox reports its results uploaded, fetches them from S3 and,
//      only if the folder is exactly as it was when the run left, lays them in:
//      the branch moved to the cloud's tip, uncommitted work reapplied,
//      transcripts unpacked. Only then does the marker go. A folder that
//      changed here meanwhile keeps its own work, and the run's goes on a
//      branch `cloud/<item>` (`park`).
//   6. On SIGTERM (Stop, archive, preemption) it cancels the remote command
//      and still does 5, so the work and the transcript come home and the
//      app's ordinary resume can take it from there. On SIGHUP (the app
//      quitting) it leaves the run going instead (`leave`).
//   7. Lays what the agent writes in the project's documents folder into it
//      here, during the run and at its end (./docs.mjs).
//
// Exit codes: the agent's own, when its work came home. 75 (EX_TEMPFAIL) when
// the agent may have finished but its work is not here; the marker stays, so
// shipping and cleanup leave the folder alone, and the app tries again. 77
// (EX_NOPERM) when the account's cloud sign-in was missing, refused or ran
// out: the work that was done is home, and the account needs signing in (or
// its Codex login renewing) before its threads go to the cloud again.
//
// Reviewed by Codex in three rounds (2026-10-13); the rules each finding left
// behind are written where they apply.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { run } from './exec.mjs';
import { readMarker, writeMarker, clearMarker, addCloudNews, commonGitDirOf } from './marker.mjs';
import { Name, nameSlug } from '../../shared/product-name.mjs';
import { KEPT_ASIDE } from '../../shared/not-shipped.mjs';
import { codexTranscriptFile } from '../codex-session.mjs';
import { CLIENT_INFO } from '../codex-app-server.mjs';
import { appendCloudUsage } from './usage.mjs';
import { docsFolderFor, docsToSend, tarDocs, layDocs } from './docs.mjs';
import { troubleCause, limitResetMoment } from '../../shared/spawn-trouble.mjs';
import { HAND_BACK } from '../../shared/cloud-hand-back.mjs';
import { sentLine } from '../../shared/cloud-start.mjs';
import { referencedFiles } from '../../shared/referenced-files.mjs';
import { serveApprovals } from '../approval-prompt-core.mjs';
import { cacheKey, folderKey, sendOnce, pickBase, bundlePast, refsAt, sendConversation, sentRecordPath } from './reuse.mjs';
import { KIT_VERSION, checkKit, kitKey } from '../../shared/cloud-kit.mjs';
import { NEW_ITEM_MARK } from '../../shared/cloud-kit.mjs';
import { APPROVALS_SERVER } from '../../shared/cloud-kit.mjs';
import { asksPermission, approvalsHandshakes } from './kit.mjs';
import { snapshotSkills, filesInFolder } from './skills.mjs';
import { createResourceRequests, resourceContextFor, accountFolderFor } from './resources.mjs';

// WHAT A CLOUD RUN IS TOLD ABOUT WHERE IT IS. Without it an agent there found
// its film's files, ffmpeg and a key missing, and asked the person to move the
// thread (2026-10-16). Kept true to cloud/sandbox/Dockerfile and ./docs.mjs.
export const CLOUD_NOTE = [
  '# You are running on a cloud machine, not on the person\'s own computer',
  '',
  'This turn runs in a Linux cloud sandbox (Debian, 2 cores, 8 GB) that is yours for this run and thrown away after it. It has: this task folder (its git branch and main, at the same path as on their computer); the project\'s documents folder at its usual path, but only its small files (up to 256 KB each), plus this thread\'s own designs folder (its newest files, up to 50 MB) and any file or folder the request names under the account\'s documents (up to 25 MB a file, 100 MB a folder); the store tools (look_at_page excepted); git, node, npm, python3 and pip, make, g++, curl, wget, unzip; and Playwright with Chromium already installed (`require(\'playwright\')` works from any folder).',
  '',
  'Install whatever else the work needs: you have sudo (`sudo apt-get update && sudo apt-get install -y <package>`, `pip install --user`, `npm install`). When you install a program the project will need again, add the same lines to `.agentbox/cloud-setup.sh` in the task folder and commit it: that script runs before every cloud run of this project, and its output from this run is in /tmp/agentbox-cloud-setup.log.',
  '',
  'It does not have: the project\'s other branches (only this task\'s branch and main came up); any other file from their computer (other threads\' design folders, large media, files under the home folder); files an earlier turn left outside git (node_modules, gitignored folders such as scripts/scratch, /tmp); API keys, key files or tokens kept on their computer; their computer\'s apps (Xcode, a simulator, their browser and its sign-ins). Run `npm ci --ignore-scripts` before anything that needs node_modules. Open files are capped at 1024 here (the cloud fixes that ceiling), so a test runner that watches the whole project (`vitest related`, `npm run test:changed`) fails with EMFILE: run the test files you changed and the ones that import them by name with `npx vitest run <files>`.',
  '',
  `Only this task's own branch comes back to their computer. A commit, merge or reset on main or any other branch stays in this sandbox and is thrown away with it, so a merge done here has not happened. When the request includes merging into main, or changing any branch but this task's, do the rest of the work and commit it on this branch, then end your turn with the one line \`${HAND_BACK} merging into main\` (as below): the app merges on their computer.`,
  '',
  `For a missing installed skill or task file, first use the store tool request_cloud_resource. Request a skill by name, or a file or folder by its path: relative to this task or the product's documents, or any path under the account's documents, other products' folders included, written out in full as the request writes it (\`~/...\` works). It returns a separate scratch path when delivery succeeds; read the skill's SKILL.md there with its references and scripts. A folder answers with its files, which you then ask for. For something the request does not name, if it cannot be delivered, finish independent work and explain exactly what is missing. Do not transfer the whole thread solely for a missing skill or file the request does not name. For a key, one of their apps, a private repository this machine cannot reach, or a file, folder or skill the request names that request_cloud_resource cannot deliver, stop at once. Do not work around it, do not write to the work item, do not give the person commands to run, and do not offer to move the thread: the app moves it. End your turn with one line and nothing else: ${HAND_BACK} followed by what was missing, in a few words they would use (your AWS sign-in, the iOS simulator), since the app shows those words to them. A person who asks to have this thread moved to their computer is answered with this line as well. That line replaces your usual final answer and its options. The app then runs the same request again on their computer, where all of it is. A program you can install is not a reason to stop. Otherwise work as usual, and never write that line.`,
].join('\n');

// The same, for a project with no repository, whose agent works in the
// documents folder itself.
const notes = CLOUD_NOTE.split('\n\n');
export const PLAIN_CLOUD_NOTE = [
  notes[0],
  'This turn runs in a Linux cloud sandbox (Debian, 2 cores, 8 GB) that is yours for this run and thrown away after it. It has: the project\'s documents folder, which is the folder you work in, at the same path as on their computer, but only its small files (up to 256 KB each), plus this thread\'s own designs folder (its newest files, up to 50 MB) and any file or folder the request names under the account\'s documents (up to 25 MB a file, 100 MB a folder); what you write there goes back to their computer as you work. There is no git repository here. It also has the store tools (look_at_page excepted); git, node, npm, python3 and pip, make, g++, curl, wget, unzip; and Playwright with Chromium already installed (`require(\'playwright\')` works from any folder).',
  'Install whatever else the work needs: you have sudo (`sudo apt-get update && sudo apt-get install -y <package>`, `pip install --user`, `npm install`).',
  'It does not have: any other file from their computer (documents over 256 KB, other threads\' design folders, large media, files under the home folder, /tmp from an earlier turn); API keys, key files or tokens kept on their computer; their computer\'s apps (Xcode, a simulator, their browser and its sign-ins).',
  notes[notes.length - 1],
].join('\n\n');

// The app's own instructions with the cloud note after them.
export function argvForTheCloud(argv, { plain = false } = {}) {
  const note = plain ? PLAIN_CLOUD_NOTE : CLOUD_NOTE;
  const i = argv.indexOf('--append-system-prompt');
  if (i < 0 || i + 1 >= argv.length) return [...argv, '--append-system-prompt', note];
  const out = [...argv];
  out[i + 1] = `${argv[i + 1]}\n\n${note}`;
  return out;
}

// Claude Code keeps a conversation's system text from its first turn, so a
// conversation begun on the Mac never reads the note on a cloud turn's command
// line: a resumed run is told at the top of its first message instead.
export function claudeLineForTheCloud(line, { note }) {
  let msg;
  try { msg = JSON.parse(line); } catch { return line; }
  if (msg?.type !== 'user' || msg.message?.role !== 'user') return line;
  const said = msg.message.content;
  const content = Array.isArray(said) ? [{ type: 'text', text: note }, ...said] : `${note}\n\n${said ?? ''}`;
  return JSON.stringify({ ...msg, message: { ...msg.message, content } }) + (line.endsWith('\n') ? '\n' : '');
}

// How long a cloud account whose limit named no hour sits out.
const LIMIT_REST_MS = 30 * 60_000;

// THE CLOUD ACCOUNT'S LIMIT, off one line of Claude Code's stream: the moment
// it resets when the line is a failed result that says the account is at its
// limit, else null. A result that worked is never a limit, whatever it quotes.
export function limitInResultLine(line, now = Date.now()) {
  let msg;
  try { msg = JSON.parse(line); } catch { return null; }
  if (msg?.type !== 'result' || msg.is_error !== true) return null;
  const text = String(msg.result ?? '');
  if (troubleCause(text) !== 'at-limit') return null;
  return limitResetMoment(text, now) ?? now + LIMIT_REST_MS;
}

export const IMPORT_FAILED = 75;
// Said when the image turns down a run with no repository; the supervisor
// does not count it as the cloud failing (`_noteCloudOutcome`).
const NO_PLAIN_HERE ='this cloud image cannot take a project with no repository yet; rebuild it (node scripts/cloud-setup.mjs)';
export const LOGIN_TROUBLE = 77;
// A folder the cloud cannot take: the thread runs on this Mac instead, and is
// not tried in the cloud again (Supervisor#_cloudKeptOnMac).
export const KEEP_ON_MAC = 78;
// The cloud server had no room for this person (no plan, hours spent, every
// agent running, paused, terms not accepted): not a failure of the thread or
// the cloud, so the thread runs on this Mac meanwhile (Supervisor#_noteCloudNoRoom).
export const CLOUD_NO_ROOM = 79;
const NO_ROOM = new Set(['plan', 'hours', 'agents', 'paused', 'terms', 'storage']);
/** A refused start that is about room, as its exit and what it says; else null. */
export function refusedForRoom(answer) {
  if (!answer || answer.ok !== false || !NO_ROOM.has(answer.error)) return null;
  return { code: CLOUD_NO_ROOM, line: `no room in the cloud (${answer.error}): ${answer.message || ''}`.trim() };
}
// A link to a login is good for half an hour: a run fetches it while it is
// being prepared, never later.
const LOGIN_LINK_SECONDS = 30 * 60;
const STUB = '/opt/agentbox/mcp-stub.mjs';
// Where the image's sandbox server listens for stubs (cloud/sandbox/server.mjs).
const BRIDGE_SOCK = '/tmp/agentbox-bridge.sock';
// The image's node, by its full path: Codex starts an MCP server with a bare
// environment, in which a bare `node` may not be found.
const SANDBOX_NODE = '/usr/local/bin/node';
// Refused when called, but still listed: a tool missing from the list reads
// to the agent as its whole server having disconnected.
const WITHHELD_TOOLS = new Set(['look_at_page']);
const MAX_ATTACHMENT = 25 * 1024 * 1024;
const FOLDER_CAP = { files: 300, bytes: 100 * 1024 * 1024 };
const RESULTS_WAIT_MS = 3 * 60_000;
// How often a run's new documents are fetched while it works.
const DOCS_EVERY_MS = 10_000;
// How often a run's branch is sent home while it works, so a machine that dies
// takes at most this much of it.
const CHECKPOINT_EVERY_MS = 5 * 60_000;
const NO_CHECKPOINT = 'the run saved no commits before its machine stopped';
// Four missed reads of the run's events: asleep, or off the network for good.
const OFFLINE_AFTER_MS = 90_000;
export const INPUT_CLOSED_IN_CLOUD = 'agentbox_input_closed_in_cloud';
// A run the app left going when it quit, and the process bringing it home.
// The store's writes an agent may make while the Mac is away, kept in the cloud
// and made when it wakes: what it writes on its thread and its documents.
// Never a read, which has nothing to answer with, nor a claim, stale by then.
export const KEPT_WHILE_AWAY = { [nameSlug]: ['update_work_item', 'create_work_item', 'write_document'] };
// What a server opened afresh to make a kept write is told first.
const HANDSHAKE_LINES = [
  JSON.stringify({ jsonrpc: '2.0', id: 'kept-hello', method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: `${nameSlug}-cloud`, version: '1' } } }),
  JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
];
const LEFT_RUNNING = new Set(['detached', 'attached']);
const MAC_GONE = 'The app on the Mac restarted during this call, so its answer was lost. Check whether it took effect, then try again.';
// How long a run that is being left to carry on waits for its last inputs to
// reach the sandbox.
const LEAVE_FLUSH_MS = 10_000;
// The project's setup in the sandbox (cloud/sandbox/server.mjs), and how long
// it may take before it is worth saying.
const SETUP_FILE = '.agentbox/cloud-setup.sh';
const SETUP_LOG = '/tmp/agentbox-cloud-setup.log';
const SLOW_SETUP_MS = 3 * 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Where Claude Code keeps a folder's transcripts: every character that is not
// a letter or a digit becomes '-'. The supervisor's transcriptFile reads the
// same rule.
export function transcriptFolderName(cwd) { return cwd.replace(/[^a-zA-Z0-9]/g, '-'); }

// What the cloud sends home of a conversation it was given: only what the run
// added, listed in this file (the same name in cloud/sandbox/server.mjs).
const TAILS = '.agentbox-tails.json';

/**
 * Each tail the cloud sent into `dir`, added to the file it continues. A file
 * that still starts as it was sent becomes the cloud's copy exactly, as when
 * the whole file came home; one that changed here keeps its start and gains
 * the run's lines after it, once: an import that is tried again untars the
 * same tail, and a changed file that already ends with it is left alone. A
 * file gone from here starts again from the copy this Mac sent (`sentCopy`);
 * without that copy the tail stays beside it rather than pose as the whole.
 */
export async function layTails(dir, say = () => {}, { sentCopy = async () => false } = {}) {
  const list = path.join(dir, TAILS);
  let tails;
  try { tails = JSON.parse(fs.readFileSync(list, 'utf8')); } catch { return; }
  for (const t of Array.isArray(tails) ? tails : []) {
    const tail = plainFileIn(dir, t?.tail);
    if (!tail) continue;
    const file = plainFileIn(dir, t.file, { mayBeMissing: true });
    if (file && Number.isSafeInteger(t.from) && t.from >= 0 && typeof t.sha256 === 'string' && await layTail(file, tail, t, say, sentCopy) === 'kept') continue;
    fs.rmSync(tail, { force: true });
  }
  fs.rmSync(list, { force: true });
}

async function layTail(file, tail, t, say, sentCopy) {
  const adds = fs.statSync(tail).size;
  const size = fs.statSync(file, { throwIfNoEntry: false })?.size ?? -1;
  const name = path.basename(file);
  // Replaced in one rename, so a laying cut off part way leaves the old file.
  const next = `${file}.agentbox-laying`;
  try {
    if (size >= t.from && await sha256OfStart(file, t.from) === t.sha256) {
      fs.copyFileSync(file, next, fs.constants.COPYFILE_FICLONE);
      fs.truncateSync(next, t.from);
    } else if (size < 0) {
      const back = await sentCopy(t, next).catch(() => false) && fs.statSync(next).size === t.from && await sha256OfStart(next, t.from) === t.sha256;
      if (!back) {
        say(`${name} was gone from this Mac while its run was in the cloud; the run's new lines are kept beside it in ${path.basename(tail)}`);
        return 'kept';
      }
      say(`${name} was gone from this Mac while its run was in the cloud; it is laid again from the copy sent with the run`);
    } else if (size >= adds && await endsWith(file, size, tail, adds)) {
      return;
    } else {
      fs.copyFileSync(file, next, fs.constants.COPYFILE_FICLONE);
      say(`${name} changed on this Mac while its run was in the cloud; the run's new lines are added after it`);
    }
    await pipeline(fs.createReadStream(tail), fs.createWriteStream(next, { flags: 'a' }));
    fs.renameSync(next, file);
  } finally {
    fs.rmSync(next, { force: true });
  }
}

// `rel` inside `dir` as a plain file, reached through no link; or, when it may
// be missing, where one would go.
function plainFileIn(dir, rel, { mayBeMissing = false } = {}) {
  if (typeof rel !== 'string' || !rel) return null;
  const p = path.resolve(dir, rel);
  try {
    const parent = fs.realpathSync(path.dirname(p));
    const inside = path.relative(fs.realpathSync(dir), path.join(parent, path.basename(p)));
    if (!inside || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) return null;
    const st = fs.lstatSync(p, { throwIfNoEntry: false });
    if (!st) return mayBeMissing ? p : null;
    return st.isFile() ? p : null;
  } catch {
    return null;
  }
}

async function sha256OfStart(file, bytes) {
  const h = crypto.createHash('sha256');
  if (bytes > 0) for await (const chunk of fs.createReadStream(file, { start: 0, end: bytes - 1 })) h.update(chunk);
  return h.digest('hex');
}

async function endsWith(file, size, tail, bytes) {
  const [a, b] = await Promise.all([fs.promises.open(file, 'r'), fs.promises.open(tail, 'r')]);
  try {
    const x = Buffer.alloc(Math.min(4 * 1024 * 1024, bytes));
    const y = Buffer.alloc(x.length);
    for (let at = 0; at < bytes; at += x.length) {
      const n = Math.min(x.length, bytes - at);
      await a.read(x, 0, n, size - bytes + at);
      await b.read(y, 0, n, at);
      if (!x.subarray(0, n).equals(y.subarray(0, n))) return false;
    }
    return true;
  } finally {
    await a.close();
    await b.close();
  }
}

// THE PROJECT'S SAVED MEMORIES on this Mac, for a task folder that is a
// linked worktree: Claude Code keeps them under the main checkout's folder
// name. In the cloud the task folder is a repository of its own, so Claude
// Code looks under the task folder's name instead (its transcripts' folder).
// Null when there are none, or the folder is the main checkout.
export function memoryFolderFor(cwd, configDir) {
  const common = commonGitDirOf(cwd);
  if (!common) return null;
  const root = path.dirname(common);
  if (realOrNull(root) === realOrNull(cwd)) return null;
  const dir = path.join(configDir, 'projects', transcriptFolderName(root), 'memory');
  try { return fs.readdirSync(dir).length ? dir : null; } catch { return null; }
}

function folderWithFiles(dir) {
  try { return fs.readdirSync(dir).length ? dir : null; } catch { return null; }
}

export function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

function git(cwd, args, { buffer = false, env, input } = {}) {
  return run('git', args, { cwd, env, input, encoding: buffer ? null : 'utf8' });
}
const gitOk = (cwd, args) => git(cwd, args).then(() => true, () => false);

// The tree the folder's files make right now, committed or not, without
// touching the branch, the index or the files.
async function treeOfFolder(cwd) {
  const index = path.join(os.tmpdir(), `agentbox-cloud-index-${process.pid}-${crypto.randomUUID()}`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    await git(cwd, ['read-tree', 'HEAD'], { env });
    await git(cwd, ['add', '-A'], { env });
    return (await git(cwd, ['write-tree'], { env })).trim();
  } finally {
    fs.rmSync(index, { force: true });
  }
}

// What a folder is: its branch, its commit, and its files. A cloud run's work
// is laid into a folder only if all three are still what the run left with.
export async function folderState(cwd) {
  return {
    branch: (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim(),
    head: (await git(cwd, ['rev-parse', 'HEAD'])).trim(),
    tree: await treeOfFolder(cwd),
    // What is staged, apart from what is on disk: a change staged and then
    // undone on disk would otherwise read as no change at all.
    index: (await git(cwd, ['write-tree'])).trim(),
  };
}

// Commit what the folder holds that is not committed, onto its own ref,
// without touching the branch, the index or the files.
async function snapshotUncommitted(cwd, ref) {
  if (!(await git(cwd, ['status', '--porcelain', '--untracked-files=all'])).trim()) return false;
  const tree = await treeOfFolder(cwd);
  const commit = (await git(cwd, ['-c', `user.name=${Name}`, '-c', `user.email=${nameSlug}@localhost`, 'commit-tree', tree, '-p', 'HEAD', '-m', 'Uncommitted work kept by a cloud run'])).trim();
  await git(cwd, ['update-ref', ref, commit]);
  return true;
}

// The remote the sandbox may fetch from: https only, never with credentials
// in it. An ssh address is turned into its https twin; anything else is left
// out, and `git fetch origin` in the sandbox simply fails, as it would offline.
export function remoteForTheCloud(url) {
  const s = String(url || '').trim();
  const ssh = /^(?:ssh:\/\/)?git@([^:/]+)[:/](.+)$/.exec(s);
  let u;
  try { u = new URL(ssh ? `https://${ssh[1]}/${ssh[2]}` : s); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  u.username = ''; u.password = '';
  return u.toString();
}

/* ------------------------------ the launch ------------------------------- */

// The settings file the supervisor wrote, minus anything that runs a program
// on THIS Mac: the memory gate's hooks call a local script over a local socket.
export function settingsForTheCloud(text) {
  let s;
  try { s = JSON.parse(text); } catch { return text; }
  delete s.hooks;
  return JSON.stringify(s, null, 2);
}

// HER OWN HOOKS, the ones that can run in the cloud: one program from the
// system running a script in her Claude hooks folder, which goes up with the
// run. Anything else (an app, a script somewhere else, a chain of commands)
// needs this Mac and stays here. `~` and $HOME become the Mac's home, where the
// folder is laid, because the agent there has a home of its own. Null when
// nothing travels. Her words, on the guard that keeps her email out of web
// requests (2026-10-23): "Can it cover the cloud too?"
const SYSTEM_PROGRAMS = ['/usr/bin/', '/bin/', '/usr/local/bin/', '/usr/sbin/', '/sbin/'];
export function hooksForTheCloud(text, { hooksDir, homeDir }) {
  let s;
  try { s = JSON.parse(text); } catch { return null; }
  const kept = {};
  for (const [event, groups] of Object.entries(s?.hooks || {})) {
    if (!Array.isArray(groups)) continue;
    const left = [];
    for (const g of groups) {
      const hooks = (Array.isArray(g?.hooks) ? g.hooks : [])
        .filter((h) => h?.type === 'command' && typeof h.command === 'string')
        .map((h) => ({ ...h, command: h.command.replace(/(^|\s|["'])(?:~|\$HOME|\$\{HOME\})\//g, `$1${homeDir}/`) }))
        .filter((h) => runsOnlyFrom(h.command, hooksDir));
      if (hooks.length) left.push({ ...g, hooks });
    }
    if (left.length) kept[event] = left;
  }
  return Object.keys(kept).length ? kept : null;
}

function runsOnlyFrom(command, hooksDir) {
  if (/[;&|`]|\$\(/.test(command)) return false;
  let script = false;
  for (const word of command.trim().split(/\s+/)) {
    const w = word.replace(/^["']|["']$/g, '');
    if (!w.startsWith('/')) continue;
    const p = path.resolve(w);
    if (p !== hooksDir && inside(p, hooksDir)) script = true;
    else if (!SYSTEM_PROGRAMS.some((d) => w.startsWith(d))) return false;
  }
  return script;
}

export function mcpConfigForTheCloud(config, stubPath = STUB) {
  const servers = {};
  for (const name of Object.keys(config?.mcpServers || {})) servers[name] = { command: 'node', args: [stubPath, name], env: {} };
  return { mcpServers: servers };
}

function realOrNull(p) { try { return fs.realpathSync(p); } catch { return null; } }
const sameFolder = (a, b) => !!a && !!b && realOrNull(a) !== null && realOrNull(a) === realOrNull(b);
const inside = (p, root) => p === root || p.startsWith(root + path.sep);

// Absolute paths a prompt names that are real files the sandbox cannot have:
// outside the task folder (which travels in the bundle), under one of the
// roots the agent is allowed to read, and not too big to send. Containment is
// decided on the RESOLVED path, after `..` and symlinks, so `<root>/../secret`
// and a link inside the root pointing out of it are both refused.
// With no `cwd` (a run whose folder is the documents folder, which travels only
// in part), a file inside it is sent like any other.
//
// Given `docs`, a picture named only by its short link, `![…](attachments/x.png)`,
// is sent too: the documents folder travels without its attachments (./docs.mjs),
// and the app writes every pasted picture there.
//
// A folder goes with its files, all of them or none (`folderCap`), so the run
// never takes a part for the whole. Never a store root, a folder holding the
// task folder, or this product's documents (`docsFolder`), which travel by
// their own rules.
export function filesNamedIn(text, { cwd, roots, docs = null, home = null, docsFolder = docs, folderCap = FOLDER_CAP }) {
  const realRoots = roots.map(realOrNull).filter(Boolean);
  const realCwd = cwd ? realOrNull(cwd) || cwd : null;
  const realDocs = docsFolder ? realOrNull(docsFolder) : null;
  const found = new Set();
  const take = (named) => {
    const real = realOrNull(named);
    if (!real) return;
    if (realCwd && inside(real, realCwd)) return;
    const root = realRoots.find((r) => inside(real, r));
    if (!root) return;
    let st;
    try { st = fs.statSync(real); } catch { return; }
    if (st.isFile()) { if (st.size <= MAX_ATTACHMENT) found.add(named); return; }
    if (!st.isDirectory() || realRoots.some((r) => inside(r, real))) return;
    if ((realCwd && inside(realCwd, real)) || (realDocs && (inside(real, realDocs) || inside(realDocs, real)))) return;
    if (path.relative(root, real).split(path.sep).some((p) => p.startsWith('.'))) return;
    const folder = filesInFolder(named, { ...folderCap, file: MAX_ATTACHMENT });
    if (!folder.over) for (const f of folder.files) found.add(f.path);
  };
  const said = String(text || '');
  for (const m of said.matchAll(/(\/(?:[^\s"'`<>()\[\]{},;\\]|\\ )+)/g)) take(m[1].replace(/[.:]+$/, ''));
  if (home) for (const m of said.matchAll(/(?:^|[\s"'`(\[{<,;=])~(\/(?:[^\s"'`<>()\[\]{},;\\]|\\ )+)/g)) take(path.join(home, m[1].replace(/[.:]+$/, '')));
  const pasted = docs && path.isAbsolute(docs) ? realOrNull(path.join(docs, 'attachments')) : null;
  if (pasted) {
    for (const rel of referencedFiles(...stringsIn(text), { dir: docs })) {
      if (!rel.startsWith('attachments/')) continue;
      const named = path.join(docs, rel);
      const real = realOrNull(named);
      if (real && inside(real, pasted)) take(named);
    }
  }
  return [...found];
}

// The strings of a stream-json line, unescaped: in the raw line a path after a
// line break reads as `\nattachments/…`.
function stringsIn(text) {
  let msg;
  try { msg = JSON.parse(text); } catch { return [String(text || '')]; }
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk(msg);
  return out;
}

// COPYFILE_DISABLE: a Mac's tar can add a `._name` beside a file with
// extended attributes, which the cloud reads as one more skill or command.
export function tarOf(dir) {
  return run('tar', ['-czf', '-', '-C', dir, '-h', '.'], { encoding: null, env: { ...process.env, COPYFILE_DISABLE: '1' } });
}

/* -------------------------------- the run -------------------------------- */

// What a sandbox is sent of a file: its link, not the key it was put under.
const withoutKeys = (list) => list.map(({ key: _k, ...rest }) => rest);

// A NEW THREAD'S KIT is packed in the project's checkout and named for the
// task folder the thread will have (shared/cloud-kit.mjs fillNewThreadKit):
// its transcripts' folder, and what was sent into the checkout's, are that
// folder's.
function newThreadNames(n, { cwd, startSha, files, joins, bringDirs }) {
  const from = `${path.sep}${transcriptFolderName(cwd)}`;
  const to = `${path.sep}${transcriptFolderName(n.cwd)}`;
  const rename = (p) => (typeof p === 'string' ? p.split(from).join(to) : p);
  const dirs = bringDirs.map((b) => ({ ...b, dir: rename(b.dir) }));
  return {
    files: files.map((f) => ({ ...f, path: rename(f.path), ...(f.untar ? { untar: rename(f.untar) } : {}) })),
    joins: { ...joins, bringDirs: dirs },
    made: { cwd: n.cwd, bringDirs: dirs, newThread: { mainSha: startSha, brief: n.brief, model: n.model, effort: n.effort, ...(n.defaultEngine ? { defaultEngine: n.defaultEngine } : {}) } },
  };
}

// THE KIT, WRITTEN: what the run would have started with, by key, with the
// reply's place in the turn's prompt and what a computer joining the run
// needs to write its marker. A copy stays on this computer for that.
async function writeKit({ storage, kit, say, files, home, joins, made }) {
  const whole = {
    v: KIT_VERSION, madeAt: Date.now(), device: kit.device, project: kit.project, item: kit.item,
    ...made,
    files: files.map((f) => ({ path: f.path, key: f.key, ...(f.untar ? { untar: f.untar } : {}) })),
    homeFiles: home.map((h) => ({ rel: h.rel, key: h.key })),
    frame: kit.frame,
    marker: joins,
  };
  const problem = checkKit(whole);
  if (problem) { say(`no kit for the phone: ${problem}`); return 1; }
  await storage.put(kitKey(kit.device, kit.project, kit.item), JSON.stringify(whole));
  if (kit.copy) {
    fs.mkdirSync(path.dirname(kit.copy), { recursive: true });
    const tmp = `${kit.copy}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(whole), { mode: 0o600 });
    fs.renameSync(tmp, kit.copy);
  }
  return 0;
}

export async function cloudRun({
  argv, env = process.env, cwd,
  transport, storage,
  // THE ACCOUNT'S CLOUD SIGN-IN, by name only: { engine, id, key }, the
  // object the sandbox fetches it from (main/cloud/logins.mjs). The login
  // itself is never read here (docs/cloud/PLAN.md, "Sign-ins live in the
  // cloud").
  login = null,
  // Other sign-ins the run carries, in the same shape (./run-cli.mjs
  // `loginsCarriedBy`). The sandbox places them if it can and starts anyway.
  also = [],
  // Told when the sandbox says the login was missing, refused or ran out.
  onLoginTrouble = () => {},
  // Told the moment the account's limit resets, when a run ends on it.
  onLimit = () => {},
  stdin = process.stdin, stdout = process.stdout, stderr = process.stderr,
  remoteCommand = 'claude',
  homeDir = os.homedir(),
  pollWaitMs = 20_000,
  resultsWaitMs = RESULTS_WAIT_MS,
  watchParent = true,
  stubPath = STUB,
  signals = process,
  // Only bring an earlier run home, and start nothing: what the supervisor
  // runs for a folder whose cloud work is still outstanding.
  importOnly = false,
  // 'claude' or 'codex'. A Codex run is `codex app-server` in the sandbox,
  // spoken to over stdin/stdout by the supervisor's own Codex client.
  engine = 'claude',
  docsEveryMs = DOCS_EVERY_MS,
  checkpointEveryMs = CHECKPOINT_EVERY_MS,
  leaveFlushMs = LEAVE_FLUSH_MS,
  // How long the sandbox waits without word from this Mac before it counts
  // it asleep (cloud/sandbox/server.mjs "WHILE THE MAC IS AWAY").
  offlineAfterMs = OFFLINE_AFTER_MS,
  keptWhileAway = KEPT_WHILE_AWAY,
  // The process that stands for this run, written in its marker so another
  // can tell whether it is still alive: this one, or, when many runs share a
  // host process, the run's own small stand-in (main/cloud/host.mjs).
  pid: selfPid = process.pid,
  // What the cloud image said it can do at its last start (its `caps`), and
  // who to tell what this one says. 'base' lets a run send only the commits
  // past a base the bucket already has (./reuse.mjs).
  imageCaps = [],
  onCaps = () => {},
  // A KIT FOR THE PHONE, not a run (shared/cloud-kit.mjs): { device, project,
  // item, frame, copy }. The pack goes up under the thread's kit and the kit
  // names it; nothing starts, and this folder's marker is left alone.
  kit = null,
}) {
  const say = (msg) => stderr.write(`agentbox cloud: ${msg}\n`);
  const begunAt = Date.now();
  // Whether the sandbox keeps this run going while the Mac sleeps, so its
  // tool calls are asked about before they are made (`claimCalls`).
  let offlineOn = false;
  const codex = engine === 'codex';
  // A project with no repository: the agent works in the documents folder,
  // and the thread's marker is the file the supervisor named (./marker.mjs).
  const plain = !!env.AGENTBOX_CLOUD_MARKER;
  const here = plain ? { folder: cwd, file: env.AGENTBOX_CLOUD_MARKER } : cwd;
  const configDir = env.CLAUDE_CONFIG_DIR || path.join(homeDir, '.claude');
  const codexHome = env.CODEX_HOME || path.join(homeDir, '.codex');
  const projectsFor = (dir) => path.join(dir || configDir, 'projects', transcriptFolderName(cwd));
  const projectsDir = projectsFor(configDir);
  // WHAT COMES HOME BESIDES THE FOLDER: the conversation, wherever the
  // harness keeps it. Claude Code: this folder's transcripts under the
  // account. Codex: its sessions folder, which in the sandbox holds only
  // what this run wrote (and the one rollout a resume sent up).
  const bringDirs = codex
    ? [{ name: 'sessions.tgz', dir: path.join(codexHome, 'sessions') }]
    : [{ name: 'projects.tgz', dir: projectsDir }];
  const keyOf = (runId, name) => `runs/${runId}/${name}`;
  // The links a run uploads its results to. The folders are the RUN's, which
  // for a run being brought home are the ones its marker names, not whichever
  // account this process happens to have been started for.
  const resultUrls = async (runId, dirs = bringDirs) => ({
    bundleUrl: await storage.putUrl(keyOf(runId, 'out.bundle')),
    changesUrl: await storage.putUrl(keyOf(runId, 'changes.bundle')),
    docsUrl: await storage.putUrl(keyOf(runId, 'docs.tgz')),
    eventsUrl: await storage.putUrl(keyOf(runId, 'events.jsonl')),
    doneUrl: await storage.putUrl(keyOf(runId, 'done.json')),
    bring: await Promise.all(dirs.map(async (b) => ({ dir: b.dir, url: await storage.putUrl(keyOf(runId, b.name)) }))),
  });
  // A marker written before Codex runs existed names its account folder only.
  const dirsOf = (rec) => rec.bringDirs || [{ name: 'projects.tgz', dir: projectsFor(rec.configDir) }];

  // 1. An earlier run that never came home comes home first. One the app
  // left going when it quit is JOINED instead, by the process the supervisor
  // starts to bring it home: it serves the run's tools again and waits for it
  // to finish, rather than stopping it.
  if (kit && readMarker(here)) { say('this thread\'s cloud work is still on its way back, so no kit for the phone yet'); return IMPORT_FAILED; }
  const earlier = kit ? null : readMarker(here);
  let joining = null;
  let joinedAt = null;
  // A run whose relay died without a word (the shared host crashed) is left
  // going too, not stopped.
  const orphaned = earlier?.state === 'running' && earlier.pid && earlier.pid !== selfPid && !alive(earlier.pid);
  if (earlier && (LEFT_RUNNING.has(earlier.state) || orphaned)) {
    if (!importOnly) { say('an earlier cloud run in this folder is still going; it comes home before another starts'); return IMPORT_FAILED; }
    if (earlier.pid && earlier.pid !== selfPid && alive(earlier.pid)) { say('an earlier cloud run in this folder is already being brought home'); return IMPORT_FAILED; }
    const st = await retry(() => transport.invoke(earlier.sessionId, { action: 'status', runId: earlier.runId }), { what: 'reach the run the app left going', forever: false });
    if (!st) { say('the cloud could not be reached; the run the app left going is tried again later'); return IMPORT_FAILED; }
    if (st.runId === earlier.runId && (st.state === 'preparing' || st.state === 'running')) { joining = earlier; joinedAt = st; offlineOn = !!earlier.offline; }
  }
  // A run whose own relay is alive is that relay's to bring home. Two laying
  // it in at once each see the other's work as a change made on this Mac.
  if (importOnly && !joining && earlier?.pid && earlier.pid !== selfPid && alive(earlier.pid)) {
    say('this cloud run is already being brought home by its own process');
    return IMPORT_FAILED;
  }
  if (earlier && !joining) {
    // One the app left going that ended while it was away still has its
    // answer to give, from where the app stopped reading.
    const leftGoing = importOnly && (LEFT_RUNNING.has(earlier.state) || orphaned);
    const passOn = (e) => (e.kind === 'stdout' ? write(stdout, Buffer.from(e.data, 'base64')) : undefined);
    const back = await bringHome(earlier, { recovering: true, ...(leftGoing ? { cursor: earlier.cursor ?? 0, replay: passOn } : {}) });
    if (!back.ok) { say(`an earlier cloud run in this folder could not be brought back yet (${back.why}); not starting another`); return IMPORT_FAILED; }
  }
  if (importOnly && !joining) return 0;
  if (!joining && (!login || login.engine !== engine)) { say(`this ${engine === 'codex' ? 'Codex' : 'Claude'} account has not signed in for the cloud`); return LOGIN_TROUBLE; }

  let runId; let sessionId; let marker; let docs; let sentFiles; let sendFile; let resourceCapable = false;
  // Files that are a conversation, sent joined to the copy the bucket has.
  const conversations = new Set();
  let mcpConfig = { mcpServers: {} };
  let serverEnv = env;
  let startCursor = 0; let startN = 0; let stdinClosed = false; let startConns = {};
  const kitPrefix = kit ? kitKey(kit.device, kit.project, kit.item).replace(/\.json$/, '') : null;
  const key = (name) => (kitPrefix ? `${kitPrefix}/${name}` : keyOf(runId, name));
  const roots = [env.AGENTBOX_HOME, env.ZERO_STORE_ROOT, env.STORE_HOME].filter(Boolean).map((r) => path.resolve(r));
  // A QUIT WHILE THE RUN IS STILL STARTING is held until it has started, and
  // then leaves it going like any other (`leave`); one whose start never
  // answered is marked to be joined, not stopped.
  let quitEarly = false;
  const early = () => { quitEarly = true; };
  signals.on('SIGHUP', early);
  // The agent's input is taken from the first moment, so what the app wrote
  // before the run started is kept in order, and saved if the app goes.
  const outbox = [];
  let wake = null;
  const enqueue = (msg) => { outbox.push(msg); wake?.(); };
  // Stdin: the supervisor's stream-json lines, in order, each preceded by the
  // files it names. Decoded as one stream, so a character split across two
  // chunks is never broken.
  const inDecoder = new StringDecoder('utf8');
  let stdinBuf = '';
  let untold = !codex && !!argValue(argv, '--resume');
  if (!joining && !kit) stdin.on('data', (d) => {
    stdinBuf += typeof d === 'string' ? d : inDecoder.write(d);
    let i;
    while ((i = stdinBuf.indexOf('\n')) >= 0) {
      let line = stdinBuf.slice(0, i + 1);
      stdinBuf = stdinBuf.slice(i + 1);
      const named = filesNamedIn(line, { cwd: plain ? null : cwd, roots, docs: env.AGENTBOX_DOCS, home: homeDir });
      if (codex) {
        const c = codexLineForTheCloud(line, { stubPath, codexHome, keep: mcpConfig.mcpServers, note: plain ? PLAIN_CLOUD_NOTE : CLOUD_NOTE });
        line = c.line;
        if (c.conversation) conversations.add(c.conversation);
        named.push(...c.files.filter((f) => !named.includes(f)));
      } else if (untold) {
        const was = line;
        line = claudeLineForTheCloud(line, { note: plain ? PLAIN_CLOUD_NOTE : CLOUD_NOTE });
        untold = line === was;
      }
      if (named.length) enqueue({ action: 'files', paths: named });
      enqueue({ action: 'stdin', data: Buffer.from(line).toString('base64') });
    }
  });
  if (!joining && !kit) stdin.on('end', () => {
    if (stdinClosed) return;
    stdinClosed = true;
    stdinBuf += inDecoder.end();
    if (stdinBuf) enqueue({ action: 'stdin', data: Buffer.from(stdinBuf).toString('base64') });
    enqueue({ action: 'stdin', end: true });
  });
  // The app may be gone before the run is: a write to its closed pipe is
  // dropped rather than taking this process down.
  stdout.on?.('error', () => {});
  if (joining) {
    ({ runId, sessionId } = joining);
    const { state: _s, pid: _p, at: _a, cursor: c, n: sent, conns, ...kept } = joining;
    marker = kept;
    resourceCapable = !!marker.resourceCapable || !!joinedAt.caps?.includes('resources');
    docs = joining.docs || null;
    // The app's servers as they are now win over the ones the run started
    // with (the approvals key is new at every start); the run's own record
    // fills in any the app no longer names.
    let now = {};
    try { now = JSON.parse(fs.readFileSync(env.AGENTBOX_MCP_CONFIG, 'utf8')).mcpServers || {}; } catch { /* none given */ }
    mcpConfig = { mcpServers: { ...(joining.mcp || {}), ...now } };
    serverEnv = { ...env, ...(joining.toolEnv || {}) };
    // Numbered on from what the sandbox has applied, which a process that
    // died without saying knows better than its marker.
    void sent;
    startCursor = c || 0; startN = Number(joinedAt.inSeq) || 0; startConns = conns || {};
    stdinClosed = true;
    sentFiles = new Set();
    sendFile = async () => { throw new Error('a joined run sends no files'); };
    writeMarker(here,{ ...marker, pid: selfPid, state: 'attached', cursor: startCursor, n: startN, conns: startConns });
    say('joining the cloud run the app left going, to bring it home when it finishes');
  } else {
  runId = crypto.randomUUID();
  sessionId = `agentbox-${(env.ZERO_ITEM || 'run').replace(/[^a-zA-Z0-9-]/g, '')}-${runId}`;

  // 2. The pack.
  const docsDir = plain ? (sameFolder(env.AGENTBOX_DOCS, cwd) ? cwd : null) : docsFolderFor(env.AGENTBOX_DOCS, cwd);
  // The supervisor checks the image first (`_cloudTakesPlain`), so this is an
  // image that changed in between.
  if (plain && (!docsDir || !imageCaps.includes('plain'))) {
    say(docsDir ? NO_PLAIN_HERE : 'a project with no repository runs in its documents folder, and this is not it');
    return IMPORT_FAILED;
  }
  const sentAt = Date.now();
  let sent = null; let branch = null; let startSha = null;
  const outgoing = `refs/agentbox/outgoing/${runId}`;
  let hasOutgoing = false;
  const refs = [];
  if (!plain && kit?.newThread) {
    // A NEW THREAD'S KIT: main, as a task folder is branched from it
    // (main/task-folders.mjs baseRef), under the name of the thread to come.
    // None of the checkout's own branch or work goes.
    const main = (await gitOk(cwd, ['rev-parse', '--verify', '-q', 'refs/heads/main'])) ? 'refs/heads/main'
      : (await gitOk(cwd, ['rev-parse', '--verify', '-q', 'refs/heads/master'])) ? 'refs/heads/master' : null;
    if (!main) { say('this project has no main to start a new thread from'); return 1; }
    startSha = (await git(cwd, ['rev-parse', main])).trim();
    const tree = (await git(cwd, ['rev-parse', `${startSha}^{tree}`])).trim();
    branch = `agentbox/${NEW_ITEM_MARK}`;
    sent = { branch, head: startSha, tree, index: tree };
    refs.push(main);
    if (await gitOk(cwd, ['rev-parse', '--verify', '-q', 'refs/remotes/origin/main'])) refs.push('refs/remotes/origin/main');
  } else if (!plain) {
    try {
      if (await gitOk(cwd, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])) throw new Error('a merge in it is not finished');
      sent = await folderState(cwd);
    } catch (err) {
      say(`this folder cannot go to the cloud (${String(err?.message || err).split('\n')[0]}), so the thread runs on this Mac`);
      return KEEP_ON_MAC;
    }
    ({ branch, head: startSha } = sent);
    if (!branch || branch === 'HEAD') { say('the task folder is not on a branch'); return 1; }
    hasOutgoing = await snapshotUncommitted(cwd, outgoing);
    refs.push(`refs/heads/${branch}`);
    if (hasOutgoing) refs.push(outgoing);
    for (const r of ['refs/heads/main', 'refs/remotes/origin/main']) if (r !== `refs/heads/${branch}` && await gitOk(cwd, ['rev-parse', '--verify', '-q', r])) refs.push(r);
  }
  const bundleFile = path.join(os.tmpdir(), `agentbox-cloud-${runId}.bundle`);
  // Against a base the bucket already has, when the image can take one:
  // a reply then sends the commits past it, not the project's whole history.
  const thin = imageCaps.includes('base') && !!storage.exists;
  const packed = (async () => {
    if (plain) return { bundle: false, base: null, refs: null };
    try {
      if (!thin) {
        await git(cwd, ['bundle', 'create', '-q', bundleFile, ...refs]);
        await sendFromFile(storage, key('in.bundle'), bundleFile);
        return { bundle: true, base: null, refs: null };
      }
      const base = await pickBase(cwd, storage, { runId });
      const at = await refsAt(cwd, refs);
      const bundle = !!(await bundlePast(cwd, refs, base.sha, bundleFile));
      if (bundle) await sendFromFile(storage, key('in.bundle'), bundleFile);
      return { bundle, base, refs: at };
    } finally {
      fs.rmSync(bundleFile, { force: true });
      if (hasOutgoing) await gitOk(cwd, ['update-ref', '-d', outgoing]);
    }
  })();

  const sending = [];
  let fileCount = 0;
  sendFile = async (localPath, remotePath = localPath, body = null, untar = null) => {
    if (!body && conversations.has(localPath)) {
      const { key: k } = await sendConversation(storage, localPath, { record: sentRecordPath(here) });
      return { path: remotePath, url: await storage.getUrl(k), key: k };
    }
    fileCount += 1;
    const k = key(`files/${fileCount}`);
    await storage.put(k, body ?? fs.readFileSync(localPath));
    return { path: remotePath, url: await storage.getUrl(k), key: k, ...(untar ? { untar } : {}) };
  };
  // A folder unchanged since an earlier run is not sent again (./reuse.mjs).
  const sendFolder = async (dir, remotePath, untar) => {
    if (!storage.exists) return sendFile(null, remotePath, await tarOf(dir), untar);
    const { key: k } = await sendOnce(storage, cacheKey(`folder-${await folderKey(dir)}.tgz`), () => tarOf(dir));
    return { path: remotePath, url: await storage.getUrl(k), key: k, untar };
  };
  const settingsPath = argValue(argv, '--settings');
  if (settingsPath && fs.existsSync(settingsPath)) sending.push(sendFile(settingsPath, settingsPath, Buffer.from(settingsForTheCloud(fs.readFileSync(settingsPath, 'utf8')))));
  const mcpPath = argValue(argv, '--mcp-config');
  if (mcpPath && fs.existsSync(mcpPath)) {
    mcpConfig = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    sending.push(sendFile(mcpPath, mcpPath, Buffer.from(JSON.stringify(mcpConfigForTheCloud(mcpConfig, stubPath)))));
  }
  const resumeId = argValue(argv, '--resume');
  if (resumeId) {
    const t = path.join(projectsDir, `${resumeId}.jsonl`);
    if (!fs.existsSync(t)) say(`no transcript for ${resumeId} on this Mac; the cloud run starts without it`);
    else { conversations.add(t); sending.push(sendFile(t)); }
  }
  // Her saved memories for this project, where Claude Code in the cloud looks.
  const saved = codex ? null : plain ? folderWithFiles(path.join(projectsDir, 'memory')) : memoryFolderFor(cwd, configDir);
  if (saved) sending.push(sendFolder(saved, path.join(projectsDir, '.memory.tgz'), path.join(projectsDir, 'memory')));
  const skillFiles = (async () => {
    const snapshot = await snapshotSkills({ engine, homeDir, configDir, codexHome });
    try {
      for (const skipped of snapshot.skipped) say(`skill not sent: ${skipped.path} (${skipped.reason})`);
      const files = [];
      for (const bundle of snapshot.bundles) {
        const k = cacheKey(`skills-${bundle.hash}.tgz`);
        await sendOnce(storage, k, () => tarOf(bundle.dir));
        files.push({ path: path.join(path.dirname(bundle.path), `.skills-${bundle.hash}.tgz`), url: await storage.getUrl(k), key: k, untar: bundle.path });
      }
      return files;
    } finally { snapshot.close(); }
  })();
  // Commands and agents retain their existing account selection.
  if (!codex) {
    const tooling = path.join(homeDir, '.claude');
    const own = (name) => (fs.existsSync(path.join(configDir, name)) ? path.join(configDir, name) : path.join(tooling, name));
    for (const sub of ['commands', 'agents']) {
      const dir = own(sub);
      if (fs.existsSync(dir)) sending.push(sendFolder(dir, path.join(configDir, `.${sub}.tgz`), path.join(configDir, sub)));
    }
    // Her own hooks that can run there (`hooksForTheCloud`), with the folder
    // their scripts are in at its own path, so a guard she set on this Mac
    // guards the cloud run too. The sandbox's config folder has no settings of
    // its own, so these are all of them.
    const hooksDir = own('hooks');
    let mine = null;
    try { mine = hooksForTheCloud(fs.readFileSync(own('settings.json'), 'utf8'), { hooksDir, homeDir }); } catch { /* no settings */ }
    if (mine && fs.existsSync(hooksDir)) {
      sending.push(sendFolder(hooksDir, path.join(path.dirname(hooksDir), '.hooks.tgz'), hooksDir));
      sending.push(sendFile(null, path.join(configDir, 'settings.json'), Buffer.from(JSON.stringify({ hooks: mine }, null, 2))));
    }
    // Her own instructions to Claude, from the home folder whichever account
    // it runs on, laid in the config folder, which is where Claude Code reads
    // them: in the home folder there they were reported gone (2026-10-23).
    const memory = path.join(tooling, 'CLAUDE.md');
    if (fs.existsSync(memory) && fs.statSync(memory).size <= MAX_ATTACHMENT) sending.push(sendFile(memory, path.join(configDir, 'CLAUDE.md')));
  }
  // The few Codex settings that change how it runs a turn (model, effort,
  // tier), so a run in the cloud behaves as one here would. Nothing else of
  // her config goes: no MCP servers, hooks, providers or sockets, and never
  // her sign-in: the cloud has its own.
  if (codex) {
    let toml = '';
    try { toml = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8'); } catch { /* none */ }
    sending.push(sendFile(null, path.join(codexHome, 'config.toml'), Buffer.from(codexConfigForTheCloud(toml))));
  }
  // The project's documents folder (main/cloud/docs.mjs), at its own path.
  let docsSent = [];
  if (docsDir) {
    docsSent = docsToSend(docsDir, { item: env.ZERO_ITEM });
    if (docsSent.length) sending.push(tarDocs(docsDir, docsSent).then((tgz) => sendFile(null, path.join(docsDir, '.agentbox-docs.tgz'), tgz, docsDir)));
  }
  const system = argValue(argv, '--append-system-prompt') || '';
  for (const f of filesNamedIn(system, { cwd: plain ? null : cwd, roots, home: homeDir, docsFolder: env.AGENTBOX_DOCS })) sending.push(sendFile(f));
  const codexOpen = kit?.codex && codex ? codexKitOpen(kit.codex, { stubPath, codexHome, keep: mcpConfig.mcpServers, note: plain ? PLAIN_CLOUD_NOTE : CLOUD_NOTE }) : null;
  if (codexOpen) {
    for (const c of codexOpen.conversations) conversations.add(c);
    for (const f of codexOpen.files) sending.push(sendFile(f));
  }
  let pack; let files;
  try {
    const [packedFolder, otherFiles, skills] = await Promise.all([packed, Promise.all(sending), skillFiles]);
    pack = packedFolder; files = [...otherFiles, ...skills];
  } catch (err) {
    // The cloud server refuses a link that writes for the same reasons it
    // refuses a start, and before anything has gone up.
    const noRoom = refusedForRoom({ ok: false, error: err?.error, message: err?.said });
    if (!noRoom) throw err;
    say(noRoom.line);
    return noRoom.code;
  }
  const packedAt = Date.now();
  sentFiles = new Set(files.map((f) => f.path));

  const results = kit ? null : await resultUrls(runId);
  let remote = null;
  if (!plain) try { remote = remoteForTheCloud((await git(cwd, ['remote', 'get-url', 'origin'])).trim()); } catch { /* no origin */ }

  const remoteEnv = {
    ...(codex ? { CODEX_HOME: codexHome } : { CLAUDE_CONFIG_DIR: configDir }),
    MCP_TOOL_TIMEOUT: String(8 * 60 * 60 * 1000),
    DISABLE_AUTOUPDATER: '1',
    ...(env.ZERO_PRODUCT ? { ZERO_PRODUCT: env.ZERO_PRODUCT } : {}),
    ...(env.ZERO_ITEM ? { ZERO_ITEM: env.ZERO_ITEM } : {}),
    ...(await gitIdentity(cwd)),
  };

  // What this run has laid into the documents folder so far, kept with the
  // marker so a run brought home after a restart knows its own files.
  // `sent` is what it took, so a file it did not take is never written over.
  docs = docsDir ? { dir: docsDir, sentAt, sent: docsSent, laid: {}, ack: null } : null;
  // And what a process joining it after a restart needs to serve its tools:
  // the servers, and the worker's own variables they ran with.
  marker = { runId, sessionId, branch, startSha, sent, configDir, engine, bringDirs, docs, mcp: mcpConfig.mcpServers, toolEnv: toolVariables(env), resourceContext: { engine, homeDir, configDir, codexHome }, ...(plain ? { plain: true } : {}) };
  if (kit) {
    signals.off('SIGHUP', early);
    const { runId: _r, sessionId: _s, ...joins } = marker;
    const named = kit.newThread ? newThreadNames(kit.newThread, { cwd, startSha, files, joins, bringDirs }) : null;
    return writeKit({
      storage, kit, say, files: named?.files ?? files, home: [], joins: named?.joins ?? joins,
      made: {
        cwd, engine, ...(plain ? { plain: true } : { branch }), startSha,
        bundleKey: pack.bundle ? key('in.bundle') : null,
        ...(pack.base ? { base: { key: pack.base.key, sha: pack.base.sha }, refs: pack.refs } : {}),
        argv: [remoteCommand, ...(remoteCommand === 'claude' ? argvForTheCloud(argv, { plain }) : argv)], env: remoteEnv,
        ...(hasOutgoing ? { changesRef: outgoing } : {}),
        ...(remote ? { remote } : {}),
        ...(docsDir ? { docs: docsDir } : {}),
        login: { engine: login.engine, id: login.id, key: login.key },
        bringDirs, kept: keptWhileAway,
        // A conversation begun on the Mac is told it is in the cloud at the top of its message.
        note: untold ? (plain ? PLAIN_CLOUD_NOTE : CLOUD_NOTE) : null,
        // A run that asks permission has its cards held for her phone while the computer is shut.
        ...(!codex && asksPermission(argv) ? { hold: [APPROVALS_SERVER], handshakes: { [APPROVALS_SERVER]: await approvalsHandshakes() } } : {}),
        ...(codexOpen ? { codex: { open: codexOpen.lines, [kit.codex.start ? 'startId' : 'resumeId']: CODEX_RESUME_ID, firstTurnId: CODEX_RESUME_ID + 1, turn: kit.codex.turn } } : {}),
        ...(named ? named.made : {}),
      },
    });
  }
  writeMarker(here,{ ...marker, pid: selfPid, state: 'starting' });

  // 3. Start. Starting the same run twice is answered "already", so a start
  // whose reply was lost is simply asked again. A start that was REFUSED
  // started nothing; one whose answer never came may have, so its marker
  // stays and the next run in this folder finds out which.
  const bundleUrl = pack.bundle ? await storage.getUrl(key('in.bundle')) : undefined;
  const base = pack.base ? { url: await storage.getUrl(pack.base.key), sha: pack.base.sha } : null;
  const loginUrl = await storage.getUrl(login.key, LOGIN_LINK_SECONDS);
  const carried = await Promise.all(also.map(async (l) => ({ engine: l.engine, id: l.id, url: await storage.getUrl(l.key, LOGIN_LINK_SECONDS) })));
  const started = await retry(() => transport.invoke(sessionId, {
    action: 'start', runId, cwd, branch, bundleUrl,
    ...(env.AGENTBOX_PHONE_DEVICE ? { phone: { device: env.AGENTBOX_PHONE_DEVICE, project: env.ZERO_PRODUCT, item: env.ZERO_ITEM } } : {}),
    ...(plain ? { plain: true } : {}),
    ...(base ? { base, refs: pack.refs } : {}),
    argv: [remoteCommand, ...(remoteCommand === 'claude' ? argvForTheCloud(argv, { plain }) : argv)], env: remoteEnv, files: withoutKeys(files),
    changesRef: hasOutgoing ? outgoing : undefined,
    ...(remote ? { remote } : {}),
    ...(docsDir ? { docs: docsDir } : {}),
    login: { engine: login.engine, id: login.id, url: loginUrl },
    ...(carried.length ? { also: carried } : {}),
    results,
    // A conversation comes home as only what the run added (`layTails`). An
    // image that does not know this ignores it and sends it whole.
    tails: true,
    // The run carries on while this Mac sleeps: a tool call is told it could
    // not reach the app, and a Claude Code turn that has ended has its input
    // closed there. A Codex turn ends only with the Mac, as before.
    offline: { afterMs: offlineAfterMs, endTurn: codex ? null : 'claude-stream-json', kept: keptWhileAway },
  }), { what: 'start the cloud run', forever: false });
  if (!started) {
    signals.off('SIGHUP', early);
    if (quitEarly) {
      const unsent = outbox.filter((m) => m.action === 'stdin');
      writeMarker(here,{ ...marker, pid: null, state: 'detached', cursor: 0, conns: {}, unsent: stdinClosed ? unsent : [...unsent, { action: 'stdin', end: true }] });
      say('the app quit while the cloud run was starting; it is joined when the app next opens');
      return IMPORT_FAILED;
    }
    writeMarker(here,{ ...marker, pid: null, state: 'start-unknown' });
    say('the cloud did not answer the start; whether it began will be checked before the next run here');
    return IMPORT_FAILED;
  }
  if (!started.ok) {
    signals.off('SIGHUP', early);
    // An image that refused a start sent against a base, or with no
    // repository, may not take one.
    // Such a start is tried again without them, so the reply is not spent.
    const outgrown = (base || plain) && started.error === 'bad-start';
    if (outgrown) { try { onCaps(started.caps || []); } catch { /* a hint */ } }
    const noRoom = refusedForRoom(started);
    say(noRoom ? noRoom.line : outgrown && plain ? NO_PLAIN_HERE : `the cloud run could not start: ${started.error || 'no answer'} ${started.message || ''}`.trim());
    clearMarker(here);
    if (noRoom) return noRoom.code;
    return outgrown ? IMPORT_FAILED : 1;
  }
  stderr.write(sentLine({ packMs: packedAt - begunAt, startMs: Date.now() - packedAt }));
  try { onCaps(started.caps || []); } catch { /* only a hint for the next run */ }
  offlineOn = (started.caps || []).includes('offline');
  resourceCapable = (started.caps || []).includes('resources');
  marker.resourceCapable = resourceCapable;
  if (!resourceCapable) say('this cloud image cannot take a file or skill the run asks this Mac for; rebuild it (npm run deploy, or node scripts/cloud-setup.mjs)');
  if (!offlineOn) say('this cloud image stops at its next tool call while this Mac sleeps; rebuild it (node scripts/cloud-setup.mjs) to keep runs going');
  marker.offline = offlineOn;
  writeMarker(here,{ ...marker, pid: selfPid, state: 'running' });
  }

  // 4. The pump.
  let cursor = startCursor;
  let n = startN;
  let leaving = false;
  let cancelled = false;
  let cancelledAt = 0;
  let finished = null; // 'collected' | 'collect-failed' | 'failed' | 'lost'
  // The sandbox answered with no run at all: its machine is gone.
  let machineGone = false;
  let loginTrouble = null; // { state: 'missing'|'refused'|'expired', id }
  const servers = new Map(); // conn -> { proc, name, init, pending, swallow }
  let awayNoted = false;
  // Calls in this page the sandbox said not to make, by event number.
  const refused = new Set();
  async function claimCalls(events) {
    const asks = [];
    for (const e of events) {
      if (e.kind !== 'mcp' || e.seq <= cursor) continue;
      try { const msg = JSON.parse(e.line); if (msg?.method !== undefined && msg.id !== undefined) asks.push({ seq: e.seq, conn: e.conn, id: msg.id }); } catch { /* not a call */ }
    }
    if (!asks.length) return;
    const res = await retry(() => transport.invoke(sessionId, { action: 'mcp-claim', runId, calls: asks.map(({ conn, id }) => ({ conn, id })) }), { what: 'ask about its tool calls', forever: true, stop: () => overdue() || leaving });
    const said = new Map((res?.calls || []).map((c) => [`${c.conn}\u0000${JSON.stringify(c.id)}`, c.go]));
    for (const a of asks) if (said.get(`${a.conn}\u0000${JSON.stringify(a.id)}`) === false) refused.add(a.seq);
  }
  const outDecoder = new StringDecoder('utf8');
  let outLine = '';
  const overdue = () => cancelled && Date.now() - cancelledAt > resultsWaitMs;
  const requestCloudResource = createResourceRequests({
    cwd, docs: docs?.dir, account: accountFolderFor({ accountId: env.STORE_ACCOUNT_ID, roots, docs: docs?.dir || env.AGENTBOX_DOCS }),
    ...resourceContextFor(marker, { engine, homeDir, configDir, codexHome }), runId,
    state: marker.resources ??= {}, save: () => saveMarker(),
    stopped: () => !!finished || leaving || cancelled,
    capable: () => resourceCapable,
    log: say,
    upload: async (name, body) => {
      const k = cacheKey(name);
      await sendOnce(storage, k, () => body);
      return storage.getUrl(k);
    },
    deliver: (files, signal) => new Promise((resolve) => {
      if (signal.aborted || finished || leaving || cancelled) { resolve(false); return; }
      const done = (ok) => { signal.removeEventListener('abort', abort); resolve(ok); };
      const message = { action: 'files', resource: true, files, onAck: (res) => done(!!(res.ok || res.dup) && !res.error) };
      const abort = () => {
        const at = outbox.indexOf(message);
        if (at >= 0 && message.n === undefined) outbox.splice(at, 1);
        done(false);
      };
      signal.addEventListener('abort', abort, { once: true });
      enqueue(message);
    }),
  });

  // ONE INPUT AT A TIME, KEPT UNTIL ACKNOWLEDGED. Each gets its number once,
  // and is sent again with that same number until the sandbox has applied it
  // (or says it was consumed with nothing to apply it to). A gap means the two
  // sides disagree about what was sent, which nothing can repair: the run is
  // stopped rather than left talking past itself.
  const sender = (async () => {
    for (;;) {
      if (!outbox.length) {
        if (finished || leaving) return;
        await new Promise((r) => { wake = r; setTimeout(r, 1000); });
        wake = null;
        continue;
      }
      const msg = outbox[0];
      if (msg.action === 'files' && !msg.files) {
        // An attachment that cannot be uploaded is left out and said so; the
        // prompt behind it still goes, rather than everything stopping here.
        const list = [];
        for (const f of msg.paths) {
          if (sentFiles.has(f)) continue;
          const sentOne = await retry(() => sendFile(f), { what: `send ${path.basename(f)}`, forever: false, stop: () => !!finished });
          if (sentOne) { list.push(sentOne); sentFiles.add(f); } else say(`${f} could not be sent to the cloud run; it goes on without it`);
        }
        if (!list.length) { outbox.shift(); continue; }
        msg.files = withoutKeys(list);
      }
      if (msg.n === undefined) { n += 1; msg.n = n; }
      const { paths: _p, onAck: _a, ...payload } = msg;
      let failures = 0;
      for (;;) {
        const res = await retry(() => transport.invoke(sessionId, { ...payload, runId }), { what: msg.action, forever: true, stop: () => !!finished || overdue() });
        if (!res) return;
        if (res.ok || res.dup || res.consumed) { msg.onAck?.(res); break; }
        if (res.error === 'no-run') return;
        if (res.error === 'gap') { say(`the sandbox and this Mac disagree about what was sent (it expected ${res.expect}, this was ${msg.n}); stopping the run`); outbox.length = 0; cancel('input out of step'); return; }
        failures += 1;
        if (failures >= 5) { say(`could not ${msg.action} after 5 tries (${res.error} ${res.message || ''}); stopping the run`); outbox.length = 0; cancel('input refused'); return; }
        await sleep(1000 * failures);
      }
      outbox.shift();
    }
  })().catch((err) => say(`the input to the cloud run stopped: ${err.message}`));

  // THE DOCUMENTS, WHILE IT WORKS. A picture the agent draws reaches the Mac
  // within seconds rather than when the run ends. Each archive holds every
  // file the Mac has not yet said it laid (`ack`), so an archive lost on the
  // way is simply in the next one, and the last one at the end.
  let docsCount = 0;
  const docsLoop = docs ? (async () => {
    for (;;) {
      const until = Date.now() + docsEveryMs;
      while (Date.now() < until && !finished && !cancelled && !leaving) await sleep(Math.min(500, docsEveryMs));
      if (finished || cancelled || leaving) return;
      docsCount += 1;
      // Named by this process as well, so a process joining the run later
      // never writes over an archive an earlier one has yet to fetch.
      const k = key(`docs/${process.pid}-${Date.now()}-${docsCount}.tgz`);
      const res = await retry(async () => transport.invoke(sessionId, { action: 'docs', runId, id: k, ack: docs.ack, url: await storage.putUrl(k) }), { what: 'read the run\'s documents', forever: false, stop: () => !!finished || leaving });
      if (!res?.ok || !res.files?.length) continue;
      const tgz = await storage.get(k).catch(() => null);
      if (!tgz) continue;
      // Confirmed only once laid: a write that failed here goes again.
      if (!(await layArchive(docs, tgz))) continue;
      docs.ack = k;
      saveMarker();
    }
  })().catch((err) => say(`the run's documents stopped coming back early: ${err.message}`)) : null;

  // THE BRANCH, WHILE IT WORKS, into one object the next send replaces. It is
  // only read if the machine dies before the run's own results go up
  // (`layCheckpoint`). A run with nothing new yet answers with a refusal,
  // which is simply asked again next time.
  const checkpointLoop = plain ? null : (async () => {
    for (;;) {
      const until = Date.now() + checkpointEveryMs;
      while (Date.now() < until && !finished && !cancelled && !leaving) await sleep(Math.min(500, checkpointEveryMs));
      if (finished || cancelled || leaving) return;
      await retry(async () => transport.invoke(sessionId, { action: 'checkpoint', runId, bundleUrl: await storage.putUrl(keyOf(runId, 'checkpoint.bundle')) }), { what: 'save the run\'s commits', forever: false, stop: () => !!finished || cancelled || leaving });
    }
  })().catch((err) => say(`the run's commits stopped being saved as it works: ${err.message}`));


  // `init` is the handshake an earlier process had with this connection's
  // server, said again to a fresh one so a joined run's tools answer as before;
  // its replies are not passed on, the agent had them long ago.
  function openServer(conn, name, init = []) {
    const cfg = mcpConfig.mcpServers?.[name];
    if (!cfg) { enqueue({ action: 'mcp-close', conn }); return; }
    const proc = servedHere(cfg, toolEnv({ ...serverEnv, ...(cfg.env || {}) }), `${runId}-${conn}`, { requestCloudResource })
      ?? spawn(cfg.command, cfg.args || [], { cwd, env: toolEnv({ ...serverEnv, ...(cfg.env || {}) }), stdio: ['pipe', 'pipe', 'pipe'] });
    const s = { proc, name, buf: '', closed: false, init: [...init], pending: new Set(), swallow: new Set() };
    servers.set(conn, s);
    for (const line of init) {
      try { const m = JSON.parse(line); if (m?.id !== undefined && m.method) s.swallow.add(m.id); } catch { /* sent as it is */ }
      proc.stdin.write(line + '\n');
    }
    const closeOnce = () => { if (s.closed) return; s.closed = true; if (servers.get(conn) === s) servers.delete(conn); enqueue({ action: 'mcp-close', conn }); };
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d) => {
      s.buf += d;
      let i;
      while ((i = s.buf.indexOf('\n')) >= 0) {
        const line = s.buf.slice(0, i);
        s.buf = s.buf.slice(i + 1);
        let reply = null;
        try { reply = JSON.parse(line); } catch { /* passed on as it is */ }
        // A call stays owed until the sandbox has its answer, so a restart
        // before then answers it rather than forgetting it.
        let onAck;
        if (reply && reply.id !== undefined && !reply.method) {
          if (s.swallow.delete(reply.id)) {
            const kept = keptOut.get(`${conn}\0${reply.id}`);
            if (kept) { kept(); if (reply.error || reply.result?.isError) say(`a write the run made while this Mac was asleep was turned down: ${reply.error?.message ?? reply.result?.content?.map((c) => c.text).join(' ') ?? 'no reason given'}`); }
            continue;
          }
          onAck = () => s.pending.delete(reply.id);
        }
        enqueue({ action: 'mcp', conn, line, onAck });
      }
    });
    proc.stderr.on('data', (d) => stderr.write(d));
    proc.stdin.on('error', () => {});
    // `close`, after its stdout has ended, so the server's last reply is
    // queued before the stub is told it has gone.
    proc.on('close', closeOnce);
    proc.on('error', (err) => { say(`the ${name} server could not run here: ${err.message}`); closeOnce(); });
  }

  // A write the run made while this Mac was away, kept in the cloud: made now
  // through the same server, its answer dropped (the agent had one).
  const keptOut = new Map();
  let keptMade = 0;
  function makeKept(e) {
    let msg = null;
    try { msg = JSON.parse(e.line); } catch { return; }
    if (!msg || msg.method !== 'tools/call') return;
    if (!servers.get(e.conn) || servers.get(e.conn).closed) openServer(e.conn, e.server, HANDSHAKE_LINES);
    const s = servers.get(e.conn);
    if (!s) return;
    const id = `kept-${e.seq}`;
    s.swallow.add(id);
    keptOut.set(`${e.conn}\0${id}`, () => keptOut.delete(`${e.conn}\0${id}`));
    s.proc.stdin.write(`${JSON.stringify({ ...msg, id })}\n`);
    keptMade += 1;
  }
  async function keptSettled(ms) {
    for (const end = Date.now() + ms; keptOut.size && Date.now() < end;) await sleep(50);
    if (keptMade) say(`${keptMade} ${keptMade === 1 ? 'thing' : 'things'} the run wrote while this Mac was asleep ${keptMade === 1 ? 'was' : 'were'} made now`);
  }

  function toServer(conn, line) {
    const s = servers.get(conn);
    if (!s) return;
    let msg = null;
    try { msg = JSON.parse(line); } catch { /* pass through as is */ }
    if ((msg?.method === 'initialize' || msg?.method === 'notifications/initialized') && s.init.length < 2) s.init.push(line);
    if (msg?.method && msg.id !== undefined) s.pending.add(msg.id);
    if (msg?.method === 'tools/call' && WITHHELD_TOOLS.has(msg.params?.name)) {
      enqueue({ action: 'mcp', conn, line: JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { isError: true, content: [{ type: 'text', text: `${msg.params.name} is not available to a cloud run: it would look at the Mac's own pages, not the sandbox's.` }] } }) });
      return;
    }
    s.proc.stdin.write(line + '\n');
  }

  function noteLimit(buf) {
    outLine += outDecoder.write(buf);
    let i;
    while ((i = outLine.indexOf('\n')) >= 0) {
      const line = outLine.slice(0, i);
      outLine = outLine.slice(i + 1);
      if (!line.includes('"result"')) continue;
      const until = limitInResultLine(line);
      if (until) { try { onLimit({ until }); } catch { /* noted elsewhere */ } }
    }
  }

  async function write(stream, buf) {
    if (!stream.write(buf)) await new Promise((r) => stream.once('drain', r));
  }

  async function absorb(e) {
    if (e.seq <= cursor) return;
    cursor = e.seq;
    // AGENTBOX_CLOUD_DEBUG=1 traces the tool traffic, names and sizes only.
    if (env.AGENTBOX_CLOUD_DEBUG && e.kind.startsWith('mcp')) say(`${e.kind} ${e.conn}${e.server ? ` ${e.server}` : ''}${e.line ? ` ${String(e.line).slice(0, 80)}` : ''}`);
    // A joined run's stream goes to the app too: it is how its thread hears
    // the steps and the answer made while the app was away
    // (main/supervisor.mjs `_followComingHome`).
    if (e.kind === 'stdout') {
      const buf = Buffer.from(e.data, 'base64');
      if (!codex) noteLimit(buf);
      await write(stdout, buf);
    }
    else if (e.kind === 'stderr') { if (!joining) await write(stderr, Buffer.from(e.data, 'base64')); }
    else if (e.kind === 'mcp-open') openServer(e.conn, e.server);
    else if (e.kind === 'mcp') { if (!refused.has(e.seq)) toServer(e.conn, e.line); refused.delete(e.seq); }
    else if (e.kind === 'mcp-kept') makeKept(e);
    else if (e.kind === 'mcp-offline' || e.kind === 'mcp-abandoned') {
      if (!awayNoted) { awayNoted = true; say('this Mac was asleep; the cloud run carried on, and the tool calls it made meanwhile did not reach the app'); }
    }
    // Its input closed in the cloud at the end of a turn while this Mac was
    // away: said to the app's own reader (main/claude-input.mjs) as the end
    // of the run it is.
    else if (e.kind === 'input-closed') { if (!joining) await write(stdout, Buffer.from(`${JSON.stringify({ type: 'system', subtype: INPUT_CLOSED_IN_CLOUD })}\n`)); }
    else if (e.kind === 'mcp-close') { const s = servers.get(e.conn); servers.delete(e.conn); if (s) { s.closed = true; s.proc.stdin.end(); setTimeout(() => s.proc.kill(), 2000); } }
    else if (e.kind === 'error') say(e.message);
    else if (e.kind === 'setup') noteSetup(e);
    else if (e.kind === 'login') loginTrouble = { state: e.state, id: e.id ?? login?.id ?? null };
    else if (e.kind === 'state' && ['collected', 'collect-failed', 'failed'].includes(e.state)) finished = e.state;
  }

  // THE PROJECT'S OWN SETUP (.agentbox/cloud-setup.sh), which the sandbox
  // runs before the agent and goes on past when it fails or overruns. Said
  // here, or a broken or slow setup is invisible from the thread.
  let setupAt = null;
  function noteSetup(e) {
    if (e.state === 'running') { setupAt = e.at ?? Date.now(); return; }
    const where = `its output is in ${SETUP_LOG} on the cloud machine`;
    if (e.state === 'failed') {
      const how = e.message || (e.signal === 'SIGKILL' ? `${SETUP_FILE} ran past its time limit and was stopped` : e.signal ? `${SETUP_FILE} was stopped by ${e.signal}` : `${SETUP_FILE} exited with ${e.code}`);
      say(`the project's cloud setup failed: ${how}; the agent went on without it, and ${where}`);
    } else if (setupAt && (e.at ?? Date.now()) - setupAt > SLOW_SETUP_MS) {
      say(`the project's cloud setup took ${Math.round(((e.at ?? Date.now()) - setupAt) / 60_000)} minutes before the agent could start; ${where}`);
    }
  }

  function cancel(why) {
    if (cancelled || finished) return;
    cancelled = true;
    cancelledAt = Date.now();
    say(`stopping the cloud run (${why})`);
    retry(() => transport.invoke(sessionId, { action: 'signal', runId, signal: 'SIGTERM' }), { what: 'stop the cloud run', forever: false }).catch(() => {});
  }
  // THE APP IS QUITTING, NOT STOPPING THE THREAD: the run in the cloud
  // carries on. It is told no more is coming, so it ends after the turn it is
  // in; a tool call left unanswered here is answered with why; and the marker
  // says where this process got to, for the one that joins it when the app
  // next opens. A Codex run is stopped as before: its app-server would end at
  // once, mid-turn, on the same signal.
  function leave(why) {
    if (leaving || finished || cancelled) return;
    if (codex) { cancel(why); return; }
    leaving = true;
    say(`leaving the cloud run going (${why}); it comes home when the app next opens`);
    for (const [conn, sv] of servers) answerUnanswered(conn, sv.pending);
    if (!stdinClosed) { stdinClosed = true; enqueue({ action: 'stdin', end: true }); }
    // Said at once, in case this process is cut off before it finishes: the
    // run is then still joined later rather than stopped. Its pid holds a
    // joiner back until its last inputs are in.
    saveMarker();
  }
  // A call the app can no longer answer is answered with why. It counts as
  // answered once the sandbox has the reply; until then a joiner says it.
  function answerUnanswered(conn, ids) {
    for (const id of [...ids]) {
      servers.get(conn)?.pending.add(id);
      enqueue({ action: 'mcp', conn, line: JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: MAC_GONE } }), onAck: () => servers.get(conn)?.pending.delete(id) });
    }
  }
  function connsNow() {
    const conns = {};
    for (const [conn, sv] of servers) conns[conn] = { name: sv.name, init: sv.init, pending: [...sv.pending] };
    return conns;
  }
  // WHERE THIS PROCESS HAS GOT TO, for whichever process carries the run on:
  // its place in the events, the connections and the calls they still owe,
  // and anything for the agent's input not yet sent.
  function saveMarker(extra = {}) {
    const unsent = outbox.filter((m) => m.action === 'stdin').map(({ n: num, ...m }) => ({ ...m, ...(num ? { n: num } : {}) }));
    const state = leaving ? 'detached' : joining ? 'attached' : 'running';
    try {
      writeMarker(here,{ ...marker, pid: selfPid, state, cursor, conns: connsNow(), unsent, ...extra });
    } catch (err) { say(`could not note where the cloud run got to: ${err.message}`); }
  }
  // A joined run is left going by a SIGTERM, which is the Mac or the app
  // going. Its thread shows it running, so its Stop arrives as SIGINT.
  const onTerm = () => (joining ? leave('the app is going') : cancel('asked to stop'));
  const onInt = () => cancel('asked to stop');
  const onHup = () => leave('the app is quitting');
  signals.on('SIGTERM', onTerm);
  signals.on('SIGINT', onInt);
  signals.on('SIGHUP', onHup);
  signals.off('SIGHUP', early);
  const parentWatch = watchParent ? setInterval(() => { if (process.ppid === 1) leave('the app is gone'); }, 5000) : null;
  // A joined run's connections come back, the calls they still owed are
  // answered with why, and the agent's input the last process never sent goes.
  for (const [conn, c] of Object.entries(startConns)) { openServer(conn, c.name, c.init || []); answerUnanswered(conn, c.pending || []); }
  for (const m of joining?.unsent || []) { const { n: num, ...rest } = m; if (!(num && num <= startN)) enqueue(rest); }
  if (joining?.state === 'running') enqueue({ action: 'stdin', end: true });
  if (quitEarly) leave('the app quit while the run was starting');

  try {
    while (!finished) {
      if (leaving) break;
      if (overdue()) { finished = 'lost'; break; }
      // Abandoned, not retried forever, once a cancel has waited long enough:
      // a Stop must end even when AWS cannot be reached.
      const page = await retry(() => transport.invoke(sessionId, { action: 'events', runId, since: cursor, waitMs: pollWaitMs }), { what: 'read the cloud run', forever: true, stop: () => overdue() || leaving });
      if (!page) continue;
      if (!page.ok && page.error === 'no-run') { finished = 'lost'; machineGone = true; break; }
      // A call the sandbox may have given up on while this Mac was away is
      // made only once the sandbox says it has not: the agent was told it
      // did not reach the app (cloud/sandbox/server.mjs `mcp-claim`).
      if (offlineOn) await claimCalls(page.events || []);
      for (const e of page.events || []) { if (leaving) break; await absorb(e); }
      // Every run keeps its place as it goes: a process that died without
      // saying must not hand its tools the same calls twice.
      if (!leaving && page.events?.some((e) => e.kind.startsWith('mcp'))) saveMarker();
    }
  } finally {
    requestCloudResource.close();
    signals.off('SIGTERM', onTerm);
    signals.off('SIGINT', onInt);
    signals.off('SIGHUP', onHup);
    if (parentWatch) clearInterval(parentWatch);
  }

  if (leaving && !finished) {
    // The sender stops by itself once nothing is left to send; `finished`
    // waits until then, or its retries would give up at once.
    wake?.();
    await Promise.race([sender, sleep(leaveFlushMs)]);
    finished = 'left';
    wake?.();
    await Promise.race([docsLoop, sleep(leaveFlushMs)]);
    await Promise.race([checkpointLoop, sleep(leaveFlushMs)]);
    saveMarker({ pid: null });
    for (const sv of servers.values()) { sv.closed = true; sv.proc.stdin.end(); sv.proc.kill(); }
    return IMPORT_FAILED;
  }

  // A collect that failed in the sandbox is asked once more, with fresh links.
  if (finished === 'collect-failed') {
    const again = await retry(async () => transport.invoke(sessionId, { action: 'collect', runId, ...(await resultUrls(runId)) }), { what: 'collect the results', forever: false });
    if (again?.ok) finished = 'collected';
  }
  wake?.();
  await sender;
  await docsLoop;
  await checkpointLoop;
  await keptSettled(10_000);
  for (const s of servers.values()) { s.closed = true; s.proc.stdin.end(); s.proc.kill(); }

  const troubleWithLogin = () => {
    if (!loginTrouble) return false;
    say(loginTrouble.state === 'expired' ? 'this account\'s cloud sign-in needs renewing' : 'this account\'s cloud sign-in no longer works; sign in again from the cloud menu');
    try { onLoginTrouble(loginTrouble); } catch { /* noted elsewhere */ }
    return true;
  };
  // A run that failed or came home needs its machine no more; the cloud
  // server counts a run until it is stopped (cloud/gateway/).
  const letGo = () => Promise.race([Promise.resolve(transport.stop?.(sessionId)).catch(() => {}), sleep(15_000)]);
  if (finished === 'failed') { clearMarker(here); await letGo(); return troubleWithLogin() ? LOGIN_TROUBLE : 1; }
  const back = await bringHome({ ...marker }, { recovering: machineGone, cursor, replay: (e) => absorb(e) });
  if (back.ok) await letGo();
  if (!back.ok) {
    const held = back.held || !!(await storage.get(keyOf(runId, 'done.json')).catch(() => null));
    say(held
      ? `the cloud run's work could not be brought back (${back.why}); it is kept in the cloud for 7 days and will be tried again`
      : `the cloud run's work could not be brought back (${back.why}) and has not reached the cloud; its machine is asked again before the next run here`);
    writeMarker(here,{ ...marker, pid: null, state: back.state || 'import-failed', ...(back.laying ? { laying: back.laying } : {}) });
    // Its marker stays either way, so nothing ships the folder until its work
    // is home; a login that failed is still said, so no account here is
    // struck for it.
    return troubleWithLogin() ? LOGIN_TROUBLE : IMPORT_FAILED;
  }
  if (troubleWithLogin()) return LOGIN_TROUBLE;
  // The machine's fault, not the thread's: its turn is asked again.
  if (back.lost) return IMPORT_FAILED;
  return exitCodeOf(back.record);

  /* --------------------------- bringing it home -------------------------- */
  // Never throws: every failure is an answer, { ok: false, why }, and the
  // marker stays, because a run whose work is not here is not finished here.
  async function bringHome(rec, { recovering = false, cursor: from = 0, replay = null } = {}) {
    try {
      return await bringHomeOnce(rec, { recovering, from, replay });
    } catch (err) {
      return { ok: false, why: String(err?.message || err).split('\n')[0] };
    }
  }

  async function bringHomeOnce(rec, { recovering, from, replay }) {
    const k = (name) => keyOf(rec.runId, name);
    if (rec.state === 'importing' && rec.pid && rec.pid !== selfPid && alive(rec.pid)) return { ok: false, why: 'its own process is still bringing it back' };
    let done = await storage.get(k('done.json'));
    // Marked by an older app, whose results may have gone from the bucket:
    // what it kept here goes on a branch of its own.
    if (!done && rec.state === 'diverged') return park(rec, { why: rec.why || 'it could not be laid into this folder' });
    if (!done && recovering) {
      if (rec.pid && rec.pid !== selfPid && alive(rec.pid)) return { ok: false, why: 'its own process is still bringing it back' };
      // Ask the sandbox where the run stands. No answer is not an answer: the
      // run may be alive, so nothing is given up.
      const st = await retry(() => transport.invoke(rec.sessionId, { action: 'status', runId: rec.runId }), { what: 'reach the earlier run', forever: false });
      if (!st) return { ok: false, why: 'the cloud could not be reached' };
      if (st.state === 'none' || st.error === 'no-run') {
        // The session holds no run: it ended, and AgentCore has just made a
        // fresh one for this id by being asked. Let that one go, and look for
        // the results one last time; without them the run is gone for good.
        await transport.stop?.(rec.sessionId).catch(() => {});
        done = await storage.get(k('done.json'));
        if (!done) return layCheckpoint(rec);
      } else {
        if (st.state === 'preparing' || st.state === 'running') {
          await retry(() => transport.invoke(rec.sessionId, { action: 'signal', runId: rec.runId, signal: 'SIGTERM' }), { what: 'stop the earlier run', forever: false });
        }
        const until = Date.now() + resultsWaitMs;
        let asked = false;
        while (!done && Date.now() < until) {
          const now = await retry(() => transport.invoke(rec.sessionId, { action: 'status', runId: rec.runId }), { what: 'watch the earlier run', forever: false });
          if (!asked && (now?.state === 'exited' || now?.state === 'collect-failed')) {
            // Finished but never uploaded (or its links ran out): fresh links.
            asked = true;
            await retry(async () => transport.invoke(rec.sessionId, { action: 'collect', runId: rec.runId, ...(await resultUrls(rec.runId, dirsOf(rec))) }), { what: 'collect the earlier run', forever: false });
          }
          done = await storage.get(k('done.json'));
          if (!done) await sleep(3000);
        }
        if (!done) return { ok: false, why: 'its results have not arrived yet' };
      }
    }
    if (!done) return { ok: false, why: 'its results never arrived' };
    const record = JSON.parse(done.toString('utf8'));
    return inSpool((spool) => layHome(rec, record, { recovering, replay, from, spool }));
  }

  // The heavy half, two runs at a time across every cloud run on this Mac,
  // and through files rather than memory: twenty runs finishing together
  // must not unpack twenty sets of bundles and transcripts at once.
  async function inSpool(fn) {
    const release = await takeImportSlot();
    try {
      const spool = fs.mkdtempSync(path.join(os.tmpdir(), `${nameSlug}-cloud-home-`));
      try {
        return await fn(spool);
      } finally {
        try { fs.rmSync(spool, { recursive: true, force: true }); } catch { /* the tmp folder's own cleaning */ }
      }
    } finally {
      release();
    }
  }

  // A RUN WHOSE MACHINE DIED before its results went up. The commits it sent
  // while it worked (`checkpointLoop`) are laid in as if it had ended there;
  // its uncommitted files and conversation went with the machine. The row is
  // told either way, or the next run starts as if nothing had happened.
  async function layCheckpoint(rec) {
    const item = rec.toolEnv?.ZERO_ITEM || env.ZERO_ITEM || null;
    const product = rec.toolEnv?.ZERO_PRODUCT || env.ZERO_PRODUCT || null;
    const stopped = 'This thread\'s cloud machine stopped before its run finished, so the run never sent its work back.';
    const tell = (note) => { say(note); addCloudNews(cwd, { runId: rec.runId, item, product, note, lost: true }); };
    if (rec.plain) {
      clearMarker(here);
      say(`${stopped} The documents it wrote came back as it worked; its conversation since it started is lost.`);
      return { ok: true, exitCode: null, lost: true };
    }
    let back = null;
    try {
      back = await inSpool((spool) => layHome(rec, { checkpoint: true, exitCode: null, commits: 1 }, { recovering: false, replay: null, from: 0, spool }));
    } catch (err) {
      if (err.message !== NO_CHECKPOINT) throw err;
    }
    if (!back) {
      clearMarker(here);
      tell(`${stopped} None of its work had been saved yet, so that run's commits, files and conversation are lost. The thread picks up from where it was before that run.`);
      return { ok: true, exitCode: null, lost: true };
    }
    if (!back.ok) return { ...back, held: true };
    const last = (await git(cwd, ['log', '-1', '--format=%s', back.parked || 'HEAD']).catch(() => '')).trim();
    tell(`${stopped} The commits it saved on the way are ${back.parked ? `on the branch ${back.parked}` : 'in the task folder'}${last ? `, the last one "${last}"` : ''}. Anything after that, its uncommitted files and its conversation since are lost.`);
    return { ...back, lost: true };
  }

  async function layHome(rec, record, { recovering, replay, from, spool }) {
    const k = (name) => keyOf(rec.runId, name);
    // WHAT THE RUN USED, for setting the plan limits from real work
    // (main/cloud/usage.mjs). Recorded as soon as its results are here,
    // whatever laying them into the folder does next: the machine ran either
    // way. Once per run, however many times this is tried.
    if (!record.checkpoint) appendCloudUsage({ runId: rec.runId, item: env.ZERO_ITEM, engine: rec.engine || engine, exitCode: record.exitCode, usage: record.usage }, { home: homeDir });

    // Anything the stream never delivered (the session was gone before the
    // Mac could read it) is replayed from the copy in S3, and so is what the
    // sandbox said about the login, even for an earlier run brought home now
    // (Codex's review, finding 4).
    if (replay || recovering) {
      const logFile = path.join(spool, 'events.jsonl');
      const lines = (await fetchToFile(storage, k('events.jsonl'), logFile)) ? linesOf(logFile) : [];
      for await (const l of lines) {
        if (!l) continue;
        const e = JSON.parse(l);
        if (replay && e.seq > from && (e.kind === 'stdout' || e.kind === 'stderr' || e.kind === 'login' || e.kind === 'input-closed')) await replay(e);
        else if (recovering && e.kind === 'login') { try { onLoginTrouble({ state: e.state, id: e.id ?? null }); } catch { /* noted elsewhere */ } }
      }
    }

    // EVERYTHING IS FETCHED BEFORE ANYTHING IN THE FOLDER IS TOUCHED. An import
    // that moved the branch and then failed to download the rest would leave a
    // folder that no longer matches what the run left with, and its own retry
    // would read that as somebody else's work (Codex, 2026-10-13). So: the
    // commits into refs, the uncommitted work into a ref, the transcripts into
    // memory, and only then, with nothing left that can be missing, the folder.
    const keep = `refs/agentbox/cloud/${rec.runId}`;
    const keepChanges = `refs/agentbox/cloud-changes/${rec.runId}`;
    const fetchBundle = async (name, specs, why) => {
      const f = path.join(spool, name);
      if (!(await fetchToFile(storage, k(name), f))) throw new Error(why);
      try { await git(cwd, ['fetch', '-q', f, ...specs]); } finally { fs.rmSync(f, { force: true }); }
    };
    if (record.commits > 0 || record.strayHead) {
      const specs = [];
      if (record.commits > 0) specs.push(`refs/heads/${rec.branch}:${keep}`);
      if (record.strayHead) specs.push(`refs/agentbox/head:${keep}-head`);
      if (record.checkpoint) await fetchBundle('checkpoint.bundle', specs, NO_CHECKPOINT);
      else await fetchBundle('out.bundle', specs, 'the commits bundle is missing');
    }
    if (record.uncommitted) await fetchBundle('changes.bundle', [`refs/agentbox/changes:${keepChanges}`], 'the uncommitted work is missing');
    // The conversation's folders, each one the run said it uploaded.
    const conversations = [];
    for (const [i, b] of dirsOf(rec).entries()) {
      const file = path.join(spool, `conversation-${i}.tgz`);
      if (await fetchToFile(storage, k(b.name), file)) conversations.push({ dir: b.dir, file });
      else if ((record.brought || []).includes(b.dir)) return { ok: false, why: 'the transcript is missing' };
    }

    // The documents go in whatever happens to the task folder below: they are
    // not in it.
    if (rec.docs?.dir && (record.docs || []).length) {
      const tgz = await storage.get(k('docs.tgz'));
      if (!tgz) return { ok: false, why: 'the documents it wrote are missing' };
      if (!(await layArchive(rec.docs, tgz))) return { ok: false, why: 'the documents it wrote could not be laid in' };
    }
    // With no repository, the documents and the conversation are all of it.
    if (rec.plain) {
      await layConversations(conversations);
      clearMarker(here);
      return { ok: true, exitCode: record.exitCode, record };
    }

    // The agent must have ended on the branch it was given.
    if (record.strayHead || (record.headRef && record.headRef !== rec.branch)) {
      return park(rec, { record, conversations, why: `the agent finished on ${record.headRef || 'a detached commit'} instead of ${rec.branch}` });
    }

    // Where the branch ends: the cloud's tip, which an agent that amended or
    // rebased has taken off the line it started on.
    const startHead = rec.sent?.head ?? (await git(cwd, ['rev-parse', 'HEAD'])).trim();
    let target = startHead;
    if (record.commits > 0) target = (await git(cwd, ['rev-parse', keep])).trim();
    else if (record.tip && record.tip !== startHead && await gitOk(cwd, ['cat-file', '-e', `${record.tip}^{commit}`])) target = record.tip;

    // THE FOLDER MUST BE AS THE RUN LEFT IT: same branch, commit, files and
    // staged changes; or as an import cut off part way left it, at one of its
    // own steps. Anything else is work done here while the run was away.
    if (rec.sent) {
      const now = await folderState(cwd);
      const at = (head, tree, index = tree) => now.branch === rec.sent.branch && now.head === head && now.tree === tree && now.index === index;
      let fits = now.branch === rec.sent.branch && now.head === rec.sent.head && now.tree === rec.sent.tree && (!rec.sent.index || now.index === rec.sent.index);
      if (!fits && rec.laying) {
        const treeOf = async (c) => (await git(cwd, ['rev-parse', `${c}^{tree}`])).trim();
        const startTree = await treeOf(startHead);
        const targetTree = await treeOf(target);
        const endTree = record.uncommitted ? await treeOf(keepChanges) : targetTree;
        fits = at(startHead, startTree) || at(target, targetTree) || at(target, endTree, targetTree);
      }
      if (!fits) return park(rec, { record, conversations, why: 'this folder changed on this Mac while the run was in the cloud' });
    }

    // Said before the folder is touched, so an import cut off part way is
    // known for one when it is tried again.
    const tries = (rec.laying?.tries ?? 0) + 1;
    rec.laying = { tries };
    writeMarker(here,{ ...rec, pid: selfPid, state: 'importing' });

    // What it held when the run began went up with it and comes back in the
    // run's own state; a copy of the files AND of what was staged is set aside
    // first anyway, under names no later run reuses, and so is a tip the
    // cloud's does not descend from.
    const stamp = `${rec.runId}-${Date.now()}`;
    try {
      await snapshotUncommitted(cwd, `refs/agentbox/before-cloud/${stamp}`);
      const stagedTree = (await git(cwd, ['write-tree'])).trim();
      const stagedCommit = (await git(cwd, ['-c', `user.name=${Name}`, '-c', `user.email=${nameSlug}@localhost`, 'commit-tree', stagedTree, '-p', 'HEAD', '-m', 'What was staged before a cloud run came home'])).trim();
      await git(cwd, ['update-ref', `refs/agentbox/before-cloud/${stamp}-staged`, stagedCommit]);
      if (!(await gitOk(cwd, ['merge-base', '--is-ancestor', startHead, target]))) await git(cwd, ['update-ref', `refs/agentbox/before-cloud/${rec.runId}`, startHead]);
      await git(cwd, ['reset', '-q', '--hard', target]);
      await git(cwd, ['clean', '-q', '-fd']);
      if (record.uncommitted) {
        const patch = await git(cwd, ['diff', '--binary', 'HEAD', keepChanges], { buffer: true });
        if (patch.length) await git(cwd, ['apply', '--whitespace=nowarn'], { input: patch });
      }
      await layConversations(conversations);
    } catch (err) {
      const said = String(err.message).split('\n')[0];
      if (tries >= 3) return park(rec, { record, conversations, why: `laying it into this folder failed ${tries} times (${said}); what the folder held before is on refs/agentbox/before-cloud/${stamp}` });
      writeMarker(here,{ ...rec, pid: null, state: 'import-failed' });
      return { ok: false, state: 'import-failed', laying: rec.laying, why: `laying the run into the folder failed (${said}); the earlier state is on refs/agentbox/before-cloud/${stamp}` };
    }
    await gitOk(cwd, ['update-ref', '-d', keepChanges]);
    if (record.commits > 0) await gitOk(cwd, ['update-ref', '-d', keep]);
    clearMarker(here);
    return { ok: true, exitCode: record.exitCode, record };
  }

  async function layConversations(conversations) {
    // The conversation as this Mac sent it, for one gone from here.
    const sentCopy = async (t, into) => {
      const had = JSON.parse(fs.readFileSync(sentRecordPath(here), 'utf8'));
      return had?.sha === t.sha256 && had.size === t.from && fetchToFile(storage, had.key, into);
    };
    for (const c of conversations) {
      fs.mkdirSync(c.dir, { recursive: true });
      await run('tar', ['-xzf', c.file, '-C', c.dir]);
      await layTails(c.dir, say, { sentCopy });
    }
  }

  // A RUN WHOSE WORK CANNOT GO INTO ITS FOLDER WITHOUT UNDOING WORK DONE HERE
  // goes on a branch of its own, `cloud/<item>`, and the folder is left as it
  // is. Neither side's work is lost, the marker goes so the thread can run
  // again, and the row is told (`addCloudNews`). A run that changed nothing
  // the folder does not already hold needs no branch and no word.
  async function park(rec, { record = null, conversations = [], why }) {
    const keep = `refs/agentbox/cloud/${rec.runId}`;
    const keepChanges = `refs/agentbox/cloud-changes/${rec.runId}`;
    const has = (ref) => gitOk(cwd, ['rev-parse', '--verify', '-q', ref]);
    let tip = null;
    for (const ref of [keepChanges, `${keep}-head`, keep]) if (!tip && await has(ref)) tip = ref;
    let nothingNew = !tip;
    if (tip && rec.sent) {
      const rev = async (spec) => (await git(cwd, ['rev-parse', spec])).trim();
      nothingNew = (await rev(`${tip}^{tree}`)) === rec.sent.tree && (await rev(tip === keepChanges ? `${tip}^` : tip)) === rec.sent.head;
    }
    await layConversations(conversations);
    const item = rec.toolEnv?.ZERO_ITEM || env.ZERO_ITEM || null;
    const product = rec.toolEnv?.ZERO_PRODUCT || env.ZERO_PRODUCT || null;
    let branch = null;
    if (!nothingNew) {
      const base = `cloud/${String(item || rec.branch.replace(/^agentbox\//, '') || rec.runId.slice(0, 8)).replace(/[^A-Za-z0-9._-]/g, '-')}`;
      branch = base;
      for (let i = 2; await has(`refs/heads/${branch}`); i += 1) branch = `${base}-${i}`;
      await git(cwd, ['branch', branch, tip]);
    }
    for (const ref of [keepChanges, `${keep}-head`, keep]) {
      if (await has(ref) && (nothingNew || await gitOk(cwd, ['merge-base', '--is-ancestor', ref, branch]))) await gitOk(cwd, ['update-ref', '-d', ref]);
    }
    if (branch) {
      const note = `${KEPT_ASIDE}${why}. Nothing is lost. The folder is as this Mac left it, and the run's version is on the branch ${branch}. Reply to have the agent bring the two together; it will not ship until then.`;
      say(note);
      addCloudNews(cwd, { runId: rec.runId, item, product, branch, note });
    }
    clearMarker(here);
    return { ok: true, exitCode: record?.exitCode ?? null, record, parked: branch };
  }

  async function layArchive(d, tgz) {
    try {
      const out = await layDocs({ tgz, dir: d.dir, sentAt: d.sentAt, laid: d.laid, sent: d.sent ?? null });
      for (const b of out.beside) say(`${b} was changed on this Mac while the run had it; the run's copy is beside it`);
      for (const m of out.moved) say(`the run's ${m} could not go where it was written, through a link out of the folder, so it is there instead`);
      return true;
    } catch (err) {
      say(`some of the run's documents could not be laid in yet (${String(err.message).split('\n')[0]})`);
      return false;
    }
  }

  // Calls that throw (network, AWS) are retried with backoff; `forever` for
  // the ones a run cannot do without, bounded otherwise; `stop` ends either.
  // Returns null when it gave up, never throws.
  async function retry(fn, { what, forever = false, stop = () => false }) {
    let delay = 500;
    for (let i = 0; ; i += 1) {
      try { return await fn(); } catch (err) {
        if (stop()) return null;
        if (!forever && i >= 5) { say(`could not ${what}: ${err.message}`); return null; }
        if (i === 3) say(`still trying to ${what} (${err.message})`);
        await sleep(delay);
        delay = Math.min(delay * 2, 30_000);
        if (stop()) return null;
      }
    }
  }
}

// A CODEX KIT'S OPENING LINES (shared/cloud-kit.mjs): what the computer's own
// client (main/codex-app-server.mjs) sends to open the thread, the resume
// rewritten here as a run's is, so the store is the sandbox's stub and the
// rollout the resume needs goes with the pack. The ids are the kit's own.
export const CODEX_RESUME_ID = 2;
// A new thread's kit starts its thread, as the client's `startThread` does.
export function codexKitOpen({ resume, start }, { stubPath = STUB, codexHome, keep, note = null, findRollout = codexTranscriptFile }) {
  const asked = start
    ? { jsonrpc: '2.0', id: CODEX_RESUME_ID, method: 'thread/start', params: { ephemeral: false, ...start } }
    : { jsonrpc: '2.0', id: CODEX_RESUME_ID, method: 'thread/resume', params: resume };
  const rewritten = codexLineForTheCloud(`${JSON.stringify(asked)}\n`, { stubPath, codexHome, keep, note, findRollout });
  return {
    lines: [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: CLIENT_INFO } }),
      JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }),
      rewritten.line.replace(/\n$/, ''),
    ],
    files: rewritten.files,
    conversations: rewritten.conversation ? [rewritten.conversation] : [],
  };
}

// ONE LINE FROM THE SUPERVISOR'S CODEX CLIENT, MADE READY FOR THE SANDBOX.
//
// Codex is told its MCP servers inside `thread/start` and `thread/resume`
// (`config.mcp_servers`), not on a command line. Each server that has a
// command (the store; her own come switched off, `{ enabled: false }`, and
// pass untouched) is swapped for the sandbox's stub, and the original is kept
// in `keep` to run here when the stub calls. A `thread/resume` also names the
// one file Codex will need to find that thread: its rollout, sent up first
// (`conversation`, sent as a Claude Code transcript is).
// Any other line, or one that is not JSON, passes exactly as it came.
// `note` is what the run is told about the cloud, which Claude Code gets on its
// command line (`argvForTheCloud`) and Codex only here.
export function codexLineForTheCloud(line, { stubPath = STUB, codexHome, keep, findRollout = codexTranscriptFile, note = null }) {
  let msg;
  try { msg = JSON.parse(line); } catch { return { line, files: [] }; }
  // A picture rides in a turn as `localImage` with a path on this Mac; the
  // file goes up first, at that same path (Codex's review, finding 5).
  if (msg?.method === 'turn/start' || msg?.method === 'turn/steer') {
    const files = (Array.isArray(msg.params?.input) ? msg.params.input : [])
      .filter((i) => i && i.type === 'localImage' && typeof i.path === 'string' && path.isAbsolute(i.path))
      .map((i) => i.path);
    return { line, files };
  }
  if (msg?.method !== 'thread/start' && msg?.method !== 'thread/resume') return { line, files: [] };
  const files = [];
  const servers = msg.params?.config?.mcp_servers;
  if (servers && typeof servers === 'object') {
    for (const name of Object.keys(servers)) {
      const s = servers[name];
      if (!s || typeof s !== 'object' || !s.command) continue;
      keep[name] = { command: s.command, args: s.args || [], env: s.env || {} };
      // Codex starts an MCP server with a bare environment, so the stub is
      // told where the sandbox's bridge is in its own entry (measured
      // 2026-10-13: without it the stub never connected).
      servers[name] = { ...s, command: SANDBOX_NODE, args: [stubPath, name], env: { AGENTBOX_BRIDGE_SOCK: BRIDGE_SOCK } };
    }
  }
  // THE CLOUD MACHINE IS CODEX'S SANDBOX (her decision, 2026-10-13: "Yes, let
  // the cloud machine be Codex's sandbox"). Codex's own command sandbox
  // (bubblewrap) cannot nest inside an AgentCore microVM: measured that day,
  // every write and every command was refused ("bwrap: Can't mkdir parents
  // ... Permission denied"). OpenAI's docs say to use full access inside a
  // container or VM, which is then the boundary. This one holds only the
  // task's folder and a Codex sign-in that cannot renew, and is thrown away
  // after the run. A read-only run stays read-only; approvals are untouched.
  if (msg.params && msg.params.sandbox === 'workspace-write') msg.params.sandbox = 'danger-full-access';
  if (note && msg.params) {
    const mine = msg.params.developerInstructions;
    msg.params.developerInstructions = mine ? `${mine}\n\n${note}` : note;
  }
  let conversation = null;
  if (msg.method === 'thread/resume' && msg.params?.threadId) {
    conversation = findRollout(msg.params.threadId, { home: codexHome });
    if (conversation) files.push(conversation);
  }
  return { line: JSON.stringify(msg) + (line.endsWith('\n') ? '\n' : ''), files, ...(conversation ? { conversation } : {}) };
}

// THE PART OF HER CODEX CONFIG A CLOUD RUN TAKES: the top-level model, effort
// and service tier, each a plain quoted string, and nothing else. Read by
// line rather than by a TOML parser because only these three are wanted, and
// anything that is not exactly `key = "value"` before the first [section] is
// left behind rather than guessed at.
const CODEX_SETTINGS = new Set(['model', 'model_reasoning_effort', 'service_tier']);
export function codexConfigForTheCloud(toml) {
  const out = [];
  for (const raw of String(toml || '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) break;
    const m = /^([A-Za-z_]+)\s*=\s*"([^"\\\n]*)"\s*(#.*)?$/.exec(line);
    if (m && CODEX_SETTINGS.has(m[1])) out.push(`${m[1]} = "${m[2]}"`);
  }
  return out.join('\n') + (out.length ? '\n' : '');
}

// THE ENVIRONMENT THE APP'S OWN TOOLS RUN IN, HERE. The worker's, as Claude
// Code would have given it, minus anything that signs in to AWS: this process
// signs as the cloud runs' own AWS user, and an app started from a shell that
// was signed in to AWS would otherwise hand that sign-in to every tool.
export function toolEnv(env) {
  const out = { ...env };
  for (const k of Object.keys(out)) {
    if (/^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|SECURITY_TOKEN|PROFILE|DEFAULT_PROFILE|CREDENTIAL_EXPIRATION|WEB_IDENTITY_TOKEN_FILE|ROLE_ARN)$/.test(k)) delete out[k];
    if (k === 'CLAUDE_CODE_OAUTH_TOKEN') delete out[k];
  }
  return out;
}

// The remote command's exit, as one number: its own code, or for a command a
// signal ended, 128 plus the signal's number, the way a shell reports it.
export function exitCodeOf(record) {
  if (Number.isInteger(record?.exitCode)) return record.exitCode;
  const num = record?.exitSignal ? os.constants.signals[record.exitSignal] : null;
  return num ? 128 + num : 1;
}

// The worker's own variables its tools ran with, kept for a process that joins
// the run after a restart and so was not started with them. Names only this
// app sets; never a key or a login.
export function toolVariables(env) {
  const out = {};
  for (const [k, v] of Object.entries(env || {})) {
    if (/^(ZERO_|STORE_|AGENTBOX_)/.test(k) && !/(KEY|TOKEN|SECRET|PASSWORD)/.test(k)) out[k] = v;
  }
  return out;
}


async function gitIdentity(cwd) {
  const get = (k) => git(cwd, ['config', k]).then((v) => v.trim(), () => '');
  const name = await get('user.name'); const email = await get('user.email');
  return {
    ...(name ? { GIT_AUTHOR_NAME: name, GIT_COMMITTER_NAME: name } : {}),
    ...(email ? { GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_EMAIL: email } : {}),
  };
}

function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

// A stored object straight to a file, and a file straight to storage, when the
// storage can (main/cloud/aws.mjs); a stand-in that cannot goes through memory.
async function fetchToFile(storage, k, file) {
  if (storage.getToFile) return storage.getToFile(k, file);
  const body = await storage.get(k);
  if (!body) return false;
  fs.writeFileSync(file, body);
  return true;
}
async function sendFromFile(storage, k, file) {
  if (storage.putFile) return storage.putFile(k, file);
  return storage.put(k, fs.readFileSync(file));
}
async function* linesOf(file) {
  const { createInterface } = await import('node:readline');
  yield* createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
}

// AT MOST TWO CLOUD RUNS BRING THEIR WORK HOME AT ONCE on this Mac, whichever
// process each runs in. The slots are files in one folder, looked at and
// changed only while holding that folder's guard (a directory made only if
// absent, held for milliseconds), so two processes never both reclaim one.
// A slot names its holder's process and a token of its own, and its holder
// touches it while it works: one whose process is gone, or that nobody has
// touched for ten minutes (a process id reused by something else), is free.
// If the folder cannot be used at all, the import goes ahead unlimited rather
// than never.
export const IMPORT_SLOTS = 2;
const SLOT_STALE_MS = 10 * 60_000;
const GUARD_STALE_MS = 30_000;
export async function takeImportSlot({ dir = path.join(os.tmpdir(), `${nameSlug}-cloud-imports`), slots = IMPORT_SLOTS, everyMs = 500, staleMs = SLOT_STALE_MS } = {}) {
  const token = `${process.pid}:${crypto.randomUUID()}`;
  const guard = path.join(dir, 'guard');
  const unlimited = () => () => {};
  try { fs.mkdirSync(dir, { recursive: true }); } catch { return unlimited(); }
  const tryOnce = () => {
    try { fs.mkdirSync(guard); } catch (err) {
      if (err?.code !== 'EEXIST') throw err;
      try { if (Date.now() - fs.statSync(guard).mtimeMs > GUARD_STALE_MS) fs.rmSync(guard, { recursive: true, force: true }); } catch { /* freed meanwhile */ }
      return null;
    }
    try {
      for (let i = 0; i < slots; i += 1) {
        const file = path.join(dir, `slot-${i}`);
        let held = null;
        try { held = { text: fs.readFileSync(file, 'utf8'), at: fs.statSync(file).mtimeMs }; } catch { /* free */ }
        const pid = held ? Number(held.text.split(':')[0]) : 0;
        if (held && pid && alive(pid) && Date.now() - held.at < staleMs) continue;
        fs.writeFileSync(file, token);
        return file;
      }
      return null;
    } finally {
      fs.rmSync(guard, { recursive: true, force: true });
    }
  };
  for (let failures = 0; ;) {
    let file = null;
    try { file = tryOnce(); } catch {
      failures += 1;
      if (failures >= 20) return unlimited();
    }
    if (file) {
      const touch = setInterval(() => { try { const t = new Date(); fs.utimesSync(file, t, t); } catch { /* gone */ } }, 30_000);
      touch.unref?.();
      return () => {
        clearInterval(touch);
        try { if (fs.readFileSync(file, 'utf8') === token) fs.rmSync(file, { force: true }); } catch { /* gone */ }
      };
    }
    await sleep(everyMs);
  }
}

// THE APP'S OWN TWO TOOL SERVERS, SERVED IN THIS PROCESS. Each was a process of
// its own per cloud run (the approvals server about 46 MB, measured on her Mac
// 2026-10-17), most of it the runtime starting up, not work. In here each
// connection gets its own channel: the approvals for its own row, the store
// with its own claims. Any other server is still started as configured.
export function servedHere(cfg, env, holder, { requestCloudResource } = {}) {
  const cmd = String(cfg?.command || '');
  if (cmd.endsWith('/approval-server.sh')) return channel((io) => serveApprovals({ env, ...io, warn: (m) => io.output.emit('warn', m) }));
  if (cmd.endsWith(`/${nameSlug}-mcp.sh`)) {
    // One store, one account, for every run on this Mac: the store reads where
    // it is and whose lines it writes from the environment, so this run's are
    // set on it, the server's own winning as they would for a server of its
    // own, and a person id this run has none of is taken away.
    const want = { AGENTBOX_PERSON_ID: env.AGENTBOX_PERSON_ID, ...cfg.env };
    for (const [k, v] of Object.entries(want)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
    // Named here: runs share this process, so its own ZERO_ITEM is whichever run set it last.
    const ownItem = cfg.env?.ZERO_ITEM || env.ZERO_ITEM || null;
    return channel(async (io) => (await import('../../mcp/stdio.mjs')).serveStore({ ...io, holder: `mcp-cloud-${holder}`, ownItem, requestCloudResource }));
  }
  return null;
}

// A server in this process, shaped like the child process the relay would
// otherwise have started: lines in on `stdin`, lines out on `stdout`, `close`
// once it has said its last.
function channel(serve) {
  const proc = new EventEmitter();
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.stdout.on('warn', (m) => proc.stderr.write(`${m}\n`));
  let handle = null;
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    Promise.resolve(handle?.close?.()).catch(() => {}).finally(() => proc.stdout.end());
  };
  proc.stdout.on('end', () => proc.emit('close', 0, null));
  proc.stdin.on('finish', end);
  proc.kill = () => { end(); return true; };
  Promise.resolve().then(() => serve({ input: proc.stdin, output: proc.stdout }))
    .then((h) => { handle = h; if (ended) Promise.resolve(h?.close?.()).catch(() => {}); })
    .catch((err) => { proc.stderr.write(`${err?.message ?? err}\n`); if (proc.listenerCount('error')) proc.emit('error', err); end(); });
  return proc;
}
