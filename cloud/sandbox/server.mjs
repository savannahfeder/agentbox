// THE SANDBOX'S ONE SERVER: A PLAIN REMOTE COMPUTER FOR ONE RUN.
//
// Cloud runs (docs/cloud/PLAN.md) put a thread's agent in an AWS AgentCore
// microVM. This is the only program of ours inside it. It knows nothing about
// Claude Code, the store or approvals: it is handed a git bundle, a folder
// path, a command and an environment, and it runs the command there.
// Everything the command prints is numbered and written to disk, so the Mac
// can read it over a connection that drops (the lid closes, the app restarts)
// and pick up from the last number it saw. The app's tools travel through it
// as raw lines (see "THE BRIDGE"), so a new tool costs this file nothing.
//
// AgentCore's contract: HTTP on :8080, POST /invocations and GET /ping, an
// arm64 image. A session that answers "Healthy" for 15 minutes is reaped, so
// /ping says "HealthyBusy" from the moment a run starts until its results are
// safely uploaded, however long ago the command itself exited.
//
// The rules this file keeps, each one a way a cloud run was found to go wrong
// in review (Codex, two rounds, 2026-10-13):
//   - Results leave by themselves when the command exits, to presigned URLs
//     the Mac gave at the start, so a Mac that is asleep loses nothing, and
//     `done.json` goes last, so its presence means everything else is there.
//   - Input is numbered. A stdin write or a tool reply the Mac sends twice,
//     because the first answer was lost, is applied once.
//   - Cancelling is latched: a cancel that arrives while the run is still
//     being prepared stops it from ever starting, and a cancel kills the
//     command's whole process group, with SIGKILL after a grace period.
//   - The event log lives on disk, and a poll returns a page bounded by bytes,
//     well under AgentCore's 100 MB response limit.
//   - A run near AgentCore's 8-hour ceiling is stopped and its work uploaded
//     before the ceiling stops it with nothing saved.
//
// One run per microVM, which is what AgentCore gives a session anyway.

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { usageMeter } from './usage.mjs';

// One stdout event at most this many bytes of output.
const CHUNK = 48 * 1024;
// One poll returns at most this many bytes of events.
const PAGE_BYTES = 8 * 1024 * 1024;
// A single MCP line from the harness larger than this is refused.
const MAX_MCP_LINE = 32 * 1024 * 1024;
// What this server can do beyond the first version, said in a start's answer,
// so a Mac knows rather than guesses whether its asks are honoured.
const CAPS = ['offline', 'setup', 'kept', 'base', 'plain', 'hold'];
// A conversation sent home as only what the run added is listed in this file
// (the same name in main/cloud/run.mjs).
const TAILS = '.agentbox-tails.json';
// A PROJECT'S OWN SETUP: `.agentbox/cloud-setup.sh` in its task folder, run as
// the agent before the agent, on every cloud run, so a project needing a
// program the image lacks says so in its own repository rather than in a new
// image. Its output is kept where the agent can read it.
export const SETUP_LOG = '/tmp/agentbox-cloud-setup.log';
const SETUP_FILE = '.agentbox/cloud-setup.sh';
const SETUP_TIMEOUT_MS = 15 * 60 * 1000;
// The command and its setup start with as many open files as the machine
// allows: test runners watch thousands, and the default is 1024.
const RAISE_OPEN_FILES = 'ulimit -n 65536 2>/dev/null || ulimit -n "$(ulimit -Hn)" 2>/dev/null; exec "$0" "$@"';
// As root the ceiling itself can be raised, and only then is the command
// handed to the agent's user (measured 2026-10-17: the agent alone stayed at
// 1024, its hard limit).
const RAISE_THEN_DROP = (uid, gid) => `ulimit -Hn 65536 2>/dev/null; ulimit -n 65536 2>/dev/null || ulimit -n "$(ulimit -Hn)" 2>/dev/null; exec setpriv --reuid=${uid} --regid=${gid} --init-groups -- "$0" "$@"`;
const SETPRIV = '/usr/bin/setpriv';
// WHILE THE MAC IS AWAY (a start's `offline`). Never a made-up success: the
// agent is told the call did not reach the app, and carries on.
const KEPT = 'The computer this run reports to is asleep, so this was kept and is made when your computer is back. Carry on.';
const NOT_MADE = 'The computer this run reports to is asleep, so this call could not reach the app and was not made. Carry on without it, and say in your last message what you could not record.';
const MAYBE_MADE = 'The computer this run reports to went to sleep during this call, so its answer did not arrive: it may or may not have happened. Carry on without it, and say in your last message what you could not check.';
// A finished background job wakes the agent within seconds; a turn whose last
// job ended is left this long for that wake before its input is closed.
const WAKE_GRACE_MS = 2 * 60 * 1000;
// How long a cancelled command gets before its group is killed outright.
const KILL_GRACE_MS = 15_000;
// AgentCore ends a session at 8 hours; stop the command a quarter hour before.
const DEFAULT_DEADLINE_MS = (8 * 60 - 15) * 60_000;

const DONE_STATES = new Set(['collected', 'failed']);

// THE SIGN-INS (docs/cloud/PLAN.md, "Sign-ins live in the cloud"). A person
// signs in to Claude or Codex HERE, through the vendor's own command, and the
// login is kept in the cloud: it is never an event, never in the log, and the
// Mac only ever hears the link to open, the code to type, and how it ended.
// How long a person gets to finish signing in: Codex's code lasts 15 minutes.
const SIGNIN_MS = 20 * 60_000;
// Claude Code prints its one-year token on a line of its own. Taken only once
// something follows it, so a token split across two reads is never half-read.
// Ended by anything that cannot be part of it: a space, a line end, or the
// edge of a box a newer Claude Code draws round it.
const CLAUDE_TOKEN = /(sk-ant-oat\d*-[A-Za-z0-9_-]{20,})(?=[^A-Za-z0-9_-])/;
// WHAT CLAUDE SAYS WHEN IT DOES NOT TAKE A CODE, and then waits on forever
// (2.1.301, 2026-10-15: "OAuth error: Request failed with status code 400
// Press Enter to retry."). Read only from what it printed after the code.
const CLAUDE_CODE_REFUSED = /OAuth error|Press Enter to retry|Invalid code/i;
// After the code, Claude answers within seconds; this long with neither a
// token nor an error is a sign-in that will not finish.
const CODE_ANSWER_MS = 60_000;
// A link is taken only once something ends it: a half-read link is not one.
const CLAUDE_SIGNIN_URL = /(https:\/\/claude\.(?:com|ai)\/\S*oauth\/authorize\?[^\s"'<>]+)\s/;
const CODEX_DEVICE_URL = /(https:\/\/auth\.openai\.com\/[^\s"'<>]+)\s/;
// A code is taken only once something ends it: `WY6D-YCCO` read a moment
// before its last letter arrived is not the code.
const CODEX_DEVICE_CODE = /\b([A-Z0-9]{4}-[A-Z0-9]{4,6})\s/;
// CODEX'S BROWSER SIGN-IN (`flow: 'browser'`). ChatGPT refuses a device code
// unless the account turned device code sign-in on, so a Mac that can asks
// for `codex login`, whose link sends the browser back to Codex's own server
// here. The Mac passes that return on as a query.
const CODEX_BROWSER_URL = /(https:\/\/auth\.openai\.com\/oauth\/authorize\?[^\s"'<>]+)\s/;
// RFC 3986's query characters, so nothing but a query reaches Codex's server.
const RETURN_QUERY = /^[A-Za-z0-9\-._~%!$&'()*+,;=:@/?]{1,8192}$/;
// What each vendor's command says when the login itself is refused, read
// only from our own check, never from an agent's output.
const CLAUDE_REFUSED = /invalid bearer token|oauth token (?:has )?(?:expired|been revoked|revoked)|authentication_error|please run \/login|invalid api key|\b401\b/i;
const CODEX_SIGNED_OUT = /refresh_token_(?:reused|expired|invalidated)|invalid_grant|token_expired|\b401\b|unauthorized|sign in again|log in again|not signed in/i;
// A run's Codex login cannot renew itself: renewing rotates the login under
// every other run of the account. The renewal is its own session (`renew`).
export const CODEX_REFRESH_PLACEHOLDER = 'agentbox-cloud-cannot-refresh';
// What a login's text becomes wherever a run prints it.
export const REDACTED = '[cloud sign-in]';
// `claude setup-token` draws its screen only on a terminal. util-linux
// `script` gives it one: its record goes to /dev/null (never a `typescript`
// file holding the token) and the code typed into it is not echoed back.
// The line sets the terminal wide enough that neither the link nor the token
// is ever wrapped onto two lines.
const linuxTerminal = (line) => ['script', '-qe', '--echo=never', '-c', line, '/dev/null'];
// A Codex access token with less than this left does not start a run.
const CODEX_MIN_LEFT_MS = 30 * 60_000;
const plain = (s) => String(s).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');

export function createSandbox({
  workRoot = '/tmp',
  bridgeSocket = path.join(process.env.TMPDIR || '/tmp', `agentbox-bridge-${process.pid}.sock`),
  baseEnv = pickBaseEnv(process.env),
  fetchImpl = globalThis.fetch,
  uploadRetryMs = 5_000,
  killGraceMs = KILL_GRACE_MS,
  // FOR TESTS ONLY: a test runs the "sandbox" on the same machine as the
  // "Mac", so the paths a run names would land on top of the Mac's own
  // folders. A root puts them under a scratch directory instead. In the
  // image this is never set and every path is used exactly as sent.
  pathRoot = null,
  // WHO THE COMMAND RUNS AS. In the image the server is root, because the
  // paths it must recreate are anyone's (/Users/<name>/..., and the Mac's own
  // temp folder for the per-run settings), and the command runs as the
  // unprivileged `agent` user, owning only its folder and its account folder.
  // { uid, gid, home, user }, or null to run as whoever the server is.
  runAs = null,
  // Where a project's setup output is kept (SETUP_LOG); a test points it elsewhere.
  setupLog = SETUP_LOG,
  // Where `sudo` (cloud/sandbox/sudo.mjs) hands its commands to this server,
  // which runs them as itself (root, in the image). Null: no helper.
  rootSocket = null,
  // Where the usage meter reads the machine (cloud/sandbox/usage.mjs); a
  // test points it at a fake /sys/fs/cgroup and /proc.
  usage = {},
  // How a command gets a terminal (`claude setup-token` needs one). A test on
  // a Mac, whose `script` takes other flags, passes a plain shell.
  terminal = linuxTerminal,
  signinMs = SIGNIN_MS,
  // Where the sign-in's steps are told, for the runtime's own log. Never a
  // secret: `shape` masks every long run of key-like characters first.
  log = () => {},
  codeAnswerMs = CODE_ANSWER_MS,
  enterAfterMs = 400,
  // Which Claude account a new token belongs to, so the Mac can name it.
  // Best effort: a token that cannot say is kept all the same, unnamed.
  whoIs = claudeAccountEmail,
} = {}) {
  const at = (p) => (pathRoot ? path.join(pathRoot, p) : p);
  let run = null;
  let bridge = null;
  // A start answers the Mac at once and lays the folder out behind it, so a
  // close ends that preparation as well as the command: until it stops, git is
  // writing in a folder whose owner believes the server is done with it.
  let preparing = null;
  const stopping = new AbortController();
  const closed = () => stopping.signal.aborted;
  const stillOpen = () => { if (closed()) throw new Error('the sandbox is closing'); };
  const rootHelper = rootSocket ? openRootHelper(rootSocket) : null;
  let statusChangedAt = Math.floor(Date.now() / 1000);
  let lastPing = null;

  /* ------------------------------ THE LOG --------------------------------- */
  function openLog(r) {
    fs.mkdirSync(r.dir, { recursive: true });
    const file = path.join(r.dir, 'events.jsonl');
    r.log = { file, fd: fs.openSync(file, 'w+'), size: 0, index: [], closed: false };
  }

  function closeLog(r) {
    if (!r?.log || r.log.closed) return;
    r.log.closed = true;
    try { fs.closeSync(r.log.fd); } catch { /* closed */ }
  }

  function emit(event, r = run) {
    // A run already replaced or shut down keeps nothing: its descriptor may
    // by now belong to some other file.
    if (r.log.closed) return null;
    const e = { seq: r.log.index.length + 1, at: Date.now(), ...event };
    const line = Buffer.from(JSON.stringify(e) + '\n');
    fs.writeSync(r.log.fd, line, 0, line.length, r.log.size);
    r.log.index.push({ off: r.log.size, len: line.length });
    r.log.size += line.length;
    for (const w of [...r.waiters]) w();
    return e;
  }

  function readEvents(r, since, maxBytes = PAGE_BYTES) {
    const idx = r.log.index;
    if (since >= idx.length) return { events: [], more: false };
    let end = since;
    let bytes = 0;
    while (end < idx.length && (end === since || bytes + idx[end].len <= maxBytes)) { bytes += idx[end].len; end += 1; }
    const buf = Buffer.allocUnsafe(bytes);
    fs.readSync(r.log.fd, buf, 0, bytes, idx[since].off);
    const events = buf.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return { events, more: end < idx.length };
  }

  function setState(state, extra = {}, r = run) {
    r.state = state;
    statusChangedAt = Math.floor(Date.now() / 1000);
    emit({ kind: 'state', state, ...extra }, r);
  }

  function emitChunks(kind, buf, r) {
    if (r.secrets?.length) buf = redactStream(r, kind, buf);
    for (let i = 0; i < buf.length; i += CHUNK) emit({ kind, data: buf.subarray(i, i + CHUNK).toString('base64') }, r);
  }

  // A RUN NEVER PRINTS ITS LOGIN TO THE MAC. The agent can read its own
  // token (it is in its environment, or in its auth file), and an agent that
  // echoes it would otherwise send it home in the stream. Each stream keeps
  // back only a tail that could be the start of a login, until the next
  // bytes say whether it was; a line's end never is, so a whole line is never
  // held. `flush` lets the held tail go when the command exits.
  function redactStream(r, kind, buf, flush = false) {
    r.redact ??= {};
    const st = (r.redact[kind] ??= { decoder: new StringDecoder('utf8'), held: '' });
    let text = st.held + (flush ? st.decoder.end() : st.decoder.write(buf));
    for (const s of r.secrets) text = text.split(s).join(REDACTED);
    st.held = '';
    if (!flush) {
      const keep = heldTail(text, r.secrets);
      if (keep) { st.held = text.slice(text.length - keep); text = text.slice(0, text.length - keep); }
    }
    return Buffer.from(text, 'utf8');
  }
  const redactLine = (r, line) => {
    let text = String(line);
    for (const s of r?.secrets || []) text = text.split(s).join(REDACTED);
    return text;
  };

  /* ------------------------------ SUDO ----------------------------------- */
  // AgentCore's containers carry no_new_privs, so the real sudo cannot raise
  // anything; `sudo` in the image hands its command here instead, and this
  // runs it as itself. The machine is the agent's for one run, and holds
  // nothing it does not already have. Lines: in `i <b64>` input, `I` end of
  // input, `k <signal>`; out `o <b64>`, `e <b64>`, then `x <code>`.
  function openRootHelper(sockPath) {
    try { fs.unlinkSync(sockPath); } catch { /* not there */ }
    const server = net.createServer((sock) => {
      let buf = '';
      let child = null;
      sock.setEncoding('utf8');
      const send = (line) => { try { sock.write(line + '\n'); } catch { /* gone */ } };
      sock.on('data', (d) => {
        buf += d;
        let n;
        while ((n = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, n);
          buf = buf.slice(n + 1);
          if (!child) {
            let req = null;
            try { req = JSON.parse(line); } catch { /* not a request */ }
            if (!Array.isArray(req?.argv) || !req.argv.length || !req.argv.every((a) => typeof a === 'string')) { send('e ' + Buffer.from('sudo: a command is needed\n').toString('base64')); send('x 1'); sock.end(); return; }
            const asked = req.env && typeof req.env === 'object' ? Object.fromEntries(Object.entries(req.env).filter(([k, v]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && typeof v === 'string')) : {};
            const cwd = typeof req.cwd === 'string' && fs.existsSync(req.cwd) ? req.cwd : '/';
            try {
              child = spawn(req.argv[0], req.argv.slice(1), {
                cwd,
                env: { PATH: baseEnv.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', HOME: process.env.HOME || '/root', DEBIAN_FRONTEND: 'noninteractive', LANG: 'C.UTF-8', ...asked },
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: true,
              });
            } catch (err) {
              send('e ' + Buffer.from(`sudo: ${err.message}\n`).toString('base64'));
              send('x 1');
              sock.end();
              return;
            }
            child.stdin.on('error', () => {});
            child.stdout.on('data', (b) => send('o ' + b.toString('base64')));
            child.stderr.on('data', (b) => send('e ' + b.toString('base64')));
            child.on('error', (err) => { send('e ' + Buffer.from(`sudo: ${req.argv[0]}: ${err.code === 'ENOENT' ? 'command not found' : err.message}\n`).toString('base64')); });
            child.on('close', (code, signal) => { send(`x ${code ?? 128 + 15}`); sock.end(); void signal; });
            continue;
          }
          if (line.startsWith('i ')) child.stdin.write(Buffer.from(line.slice(2), 'base64'));
          else if (line === 'I') child.stdin.end();
          else if (line.startsWith('k ')) { try { process.kill(-child.pid, /^SIG[A-Z]+$/.test(line.slice(2)) ? line.slice(2) : 'SIGTERM'); } catch { /* gone */ } }
        }
      });
      sock.on('close', () => { if (child && child.exitCode === null) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ } } });
      sock.on('error', () => {});
    });
    server.listen(sockPath, () => { try { fs.chmodSync(sockPath, 0o666); } catch { /* gone */ } });
    return server;
  }

  /* --------------------------- WHILE THE MAC IS AWAY ---------------------- */
  // The Mac reads a run's events every 20 seconds or so; one it has not heard
  // from for `afterMs` is asleep or gone. Then a tool call is answered here,
  // with why; a call it was sent and has not taken up is answered "maybe" and
  // can no longer be taken up (`mcp-claim`); and a finished turn has its input
  // closed so the run ends and its results go up. While the Mac is there it
  // does all of this itself.
  const macAway = (r) => !!r.offline && Date.now() - r.macSeenAt > r.offline.afterMs;
  const callKey = (conn, id) => `${conn}\u0000${JSON.stringify(id)}`;
  // The handshake and the tool list are the app's own answers, kept from when
  // the Mac was there, so a server opened while it is away still opens.
  const HANDSHAKE = new Set(['initialize', 'tools/list']);
  function answerHere(sock, msg, text) {
    const reply = msg.method === 'tools/call'
      ? { jsonrpc: '2.0', id: msg.id, result: { isError: true, content: [{ type: 'text', text }] } }
      : { jsonrpc: '2.0', id: msg.id, error: { code: -32001, message: text } };
    try { sock.write(JSON.stringify(reply) + '\n'); } catch { /* the agent went */ }
  }
  // True when the call was answered here and must not go to the Mac.
  function offlineCall(r, conn, sock, line) {
    let msg = null;
    try { msg = JSON.parse(line); } catch { return false; }
    if (msg?.id === undefined || typeof msg.method !== 'string') return false;
    const k = callKey(conn, msg.id);
    if (macAway(r)) {
      const kept = r.handshakes.get(`${r.connServer.get(conn)}\u0000${msg.method}`) ?? r.offline.handshakes?.[r.connServer.get(conn)]?.[msg.method];
      if (HANDSHAKE.has(msg.method) && kept) {
        // Answered with what the app said before, and still sent on, so the
        // Mac's own server is opened too; its answer is dropped.
        try { sock.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: kept }) + '\n'); } catch { /* gone */ }
        r.calls.set(k, { conn, msg, sock, state: 'answered-here', handshake: true });
        return false;
      }
      // A write the Mac named as safe to make late is kept for it, in the
      // run's own events, and made when it next reads them.
      const server = r.connServer.get(conn);
      const tool = msg.method === 'tools/call' ? msg.params?.name : null;
      if (tool && r.offline.kept?.[server]?.includes(tool)) {
        try { sock.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: KEPT }] } }) + '\n'); } catch { /* the agent went */ }
        emit({ kind: 'mcp-kept', conn, server, line }, r);
        return true;
      }
      if (tool && heldServer(r, server)) {
        r.calls.set(k, { conn, msg, sock, state: 'sent' });
        hold(r, k);
        return false;
      }
      answerHere(sock, msg, NOT_MADE);
      emit({ kind: 'mcp-offline', conn, id: msg.id }, r);
      return true;
    }
    r.calls.set(k, { conn, msg, sock, state: 'sent' });
    return false;
  }
  // A HELD SERVER (a start's `offline.hold`): its calls wait while the Mac is
  // away instead of being refused, each said as an `ask` event, and the first
  // answer to arrive, the cloud server's or a Mac's that joins, is the one
  // the agent gets. The app's approvals server is held so a permission card
  // can be answered from the phone (cloud/gateway/phone.mjs).
  const heldServer = (r, server) => !!server && Array.isArray(r.offline?.hold) && r.offline.hold.includes(server);
  function hold(r, k) {
    const c = r.calls.get(k);
    if (!c || c.held) return;
    c.held = true;
    c.state = 'held';
    emit({ kind: 'ask', conn: c.conn, id: c.msg.id, server: r.connServer.get(c.conn), tool: c.msg.params?.name ?? null, input: c.msg.params?.arguments ?? null }, r);
  }
  // The Mac asks before it makes a call: one given up on here is not made.
  function claimCalls(r, calls) {
    return (Array.isArray(calls) ? calls : []).map(({ conn, id }) => {
      const k = callKey(conn, id);
      const c = r.calls.get(k);
      if (!c) return { conn, id, go: false };
      if (c.state === 'abandoned') { r.calls.delete(k); return { conn, id, go: false }; }
      if (c.held) return { conn, id, go: c.state === 'held' };
      if (c.state === 'sent') c.state = 'claimed';
      return { conn, id, go: true };
    });
  }
  // The Mac's answer to a call: true when this side already answered it.
  function fromMac(r, conn, line) {
    if (!r.offline) return false;
    let msg = null;
    try { msg = JSON.parse(line); } catch { return false; }
    if (msg?.id === undefined || msg.method !== undefined) return false;
    const k = callKey(conn, msg.id);
    const c = r.calls.get(k);
    // The first answer to a held call goes to the agent; a later one is dropped.
    if (c?.held && c.state === 'held') {
      c.state = 'answered-here';
      emit({ kind: 'ask-answered', conn, id: msg.id }, r);
      return false;
    }
    r.calls.delete(k);
    if (!c) return false;
    if (HANDSHAKE.has(c.msg.method) && msg.result !== undefined) r.handshakes.set(`${r.connServer.get(conn)}\u0000${c.msg.method}`, msg.result);
    return c.state === 'abandoned' || c.state === 'answered-here';
  }
  function forgetConn(r, conn) {
    for (const [k, c] of r.calls) if (c.conn === conn) r.calls.delete(k);
    r.connServer.delete(conn);
  }
  // The agent's own lines, read for where its turn is (Claude Code's
  // stream-json). A result ends a turn; the agent speaking, a tool, a new
  // session or its own stream starts one; control answers and other notes do
  // neither. A message the Mac wrote that the agent has not said back yet
  // (it says back each one it takes, --replay-user-messages) is a turn still
  // to come, unless two turns have ended since without it: then it was
  // dropped (an interrupted or internal message), and waiting for it would
  // keep the run open for good.
  const TURN_GOING = (e) => e?.type === 'assistant' || e?.type === 'stream_event'
    || (e?.type === 'user') || (e?.type === 'system' && e.subtype === 'init');
  function readTurn(r, buf) {
    if (r.offline?.endTurn !== 'claude-stream-json') return;
    const t = r.turn;
    t.line += buf.toString('utf8');
    if (t.line.length > MAX_MCP_LINE) t.line = t.line.slice(-MAX_MCP_LINE);
    let i;
    while ((i = t.line.indexOf('\n')) >= 0) {
      const line = t.line.slice(0, i);
      t.line = t.line.slice(i + 1);
      let e = null;
      try { e = JSON.parse(line); } catch { continue; }
      if (e?.type === 'result') {
        t.atResult = true;
        for (const [id, m] of t.unread) { m.results += 1; if (m.results >= 2) t.unread.delete(id); }
        continue;
      }
      if (e?.type === 'system' && e.subtype === 'background_tasks_changed' && Array.isArray(e.tasks)) {
        const before = t.waiting;
        t.waiting = e.tasks.length;
        if (before && !t.waiting) t.lastJobEndedAt = Date.now();
        continue;
      }
      if (e?.type === 'user' && !e.parent_tool_use_id) {
        if (typeof e.uuid === 'string' && t.unread.has(e.uuid)) t.unread.delete(e.uuid);
        else for (const [id, m] of t.unread) if (m.anonymous) { t.unread.delete(id); break; }
      }
      if (TURN_GOING(e)) t.atResult = false;
    }
  }
  // Messages the Mac writes to the agent, by their own id where they carry one.
  function noteInput(r, data) {
    if (r.offline?.endTurn !== 'claude-stream-json' || !data) return;
    for (const line of Buffer.from(data, 'base64').toString('utf8').split('\n')) {
      let m = null;
      try { m = JSON.parse(line); } catch { continue; }
      if (m?.type !== 'user') continue;
      const id = typeof m.uuid === 'string' ? m.uuid : `anon-${r.turn.anonymous += 1}`;
      r.turn.unread.set(id, { results: 0, anonymous: typeof m.uuid !== 'string' });
    }
  }
  function watchWhileAway(r) {
    if (r.awayTimer) return;
    r.awayTimer = setInterval(() => {
      if (!macAway(r) || DONE_STATES.has(r.state)) return;
      for (const [k, c] of r.calls) {
        if (c.state !== 'sent' && c.state !== 'claimed') continue;
        // A held server's call waits for an answer from the phone, or the Mac's when it is back.
        if (c.msg.method === 'tools/call' && heldServer(r, r.connServer.get(c.conn))) { hold(r, k); continue; }
        // Kept until the Mac's late answer arrives (dropped) or the connection
        // closes: answered once is answered.
        c.state = c.state === 'claimed' ? 'answered-here' : 'abandoned';
        answerHere(c.sock, c.msg, MAYBE_MADE);
        emit({ kind: 'mcp-abandoned', conn: c.conn, id: c.msg.id }, r);
      }
      const t = r.turn;
      const woken = !t.lastJobEndedAt || Date.now() - t.lastJobEndedAt > WAKE_GRACE_MS;
      if (r.child && !r.inputClosed && t.atResult && !t.waiting && !t.unread.size && woken) {
        r.inputClosed = 'cloud';
        try { r.child.stdin.end(); } catch { /* gone */ }
        emit({ kind: 'input-closed', by: 'cloud' }, r);
      }
    }, Math.min(1000, Math.max(50, Math.floor(r.offline.afterMs / 4))));
    r.awayTimer.unref?.();
  }

  /* ------------------------------ THE BRIDGE ------------------------------ */
  // Each MCP server the harness is configured with is replaced, in here, by
  // cloud/sandbox/mcp-stub.mjs. A stub connects to this socket and names its
  // server; from then on every line the harness writes to it becomes an `mcp`
  // event for the Mac, and every `mcp` action the Mac sends becomes a line the
  // stub writes back. The Mac runs the REAL server and feeds it these lines.
  function openBridge() {
    if (bridge) return;
    try { fs.unlinkSync(bridgeSocket); } catch { /* not there */ }
    let next = 0;
    bridge = { conns: new Map(), server: null };
    bridge.server = net.createServer((sock) => {
      const r = run;
      let conn = null;
      let buf = '';
      sock.setEncoding('utf8');
      sock.on('data', (d) => {
        buf += d;
        if (buf.length > MAX_MCP_LINE && buf.indexOf('\n') < 0) {
          if (conn) emit({ kind: 'error', message: `a line from ${conn} was over ${MAX_MCP_LINE} bytes and was refused` }, r);
          sock.destroy();
          return;
        }
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (conn === null) {
            let hello = null;
            try { hello = JSON.parse(line); } catch { /* not a hello */ }
            if (!hello?.server || !r || r !== run) { sock.destroy(); return; }
            next += 1;
            conn = `c${next}`;
            bridge.conns.set(conn, { sock, run: r });
            r.connServer?.set(conn, String(hello.server));
            emit({ kind: 'mcp-open', conn, server: String(hello.server) }, r);
            continue;
          }
          if (r.offline && offlineCall(r, conn, sock, line)) continue;
          emit({ kind: 'mcp', conn, line: redactLine(r, line) }, r);
        }
      });
      sock.on('close', () => {
        if (conn && bridge?.conns.get(conn)?.sock === sock) {
          bridge.conns.delete(conn);
          if (r?.offline) forgetConn(r, conn);
          emit({ kind: 'mcp-close', conn }, r);
        }
      });
      sock.on('error', () => {});
    });
    // The stubs run as the command's user, so they must be able to connect.
    bridge.server.listen(bridgeSocket, () => { try { fs.chmodSync(bridgeSocket, 0o777); } catch { /* gone */ } });
  }

  /* ------------------------------- THE RUN -------------------------------- */
  // The project's setup, as the agent (who may sudo), never with the run's
  // sign-in. A setup that fails or overruns is said, and the agent starts all
  // the same: it can read why in the log and do the rest itself.
  // A command as the agent, with as many open files as the machine allows.
  function spawnAsAgent(argv, opts) {
    const asRoot = runAs && process.getuid?.() === 0 && fs.existsSync(SETPRIV);
    if (asRoot) return spawn('/bin/sh', ['-c', RAISE_THEN_DROP(runAs.uid, runAs.gid), ...argv], opts);
    return spawn('/bin/sh', ['-c', RAISE_OPEN_FILES, ...argv], { ...opts, ...(runAs ? { uid: runAs.uid, gid: runAs.gid } : {}) });
  }

  function runSetup(r, cwd, env) {
    emit({ kind: 'setup', state: 'running' }, r);
    return new Promise((resolve) => {
      let log;
      try { log = fs.openSync(setupLog, 'w', 0o644); } catch { log = 'ignore'; }
      let child;
      try {
        child = spawnAsAgent(['bash', SETUP_FILE], {
          cwd,
          env: { ...baseEnv, ...(runAs ? { HOME: runAs.home, USER: runAs.user, LOGNAME: runAs.user, TMPDIR: '/tmp' } : {}), ...env },
          stdio: ['ignore', log, log],
          detached: true,
        });
      } catch (err) {
        emit({ kind: 'setup', state: 'failed', code: null, message: err.message }, r);
        if (typeof log === 'number') fs.closeSync(log);
        resolve();
        return;
      }
      const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }, SETUP_TIMEOUT_MS);
      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        if (typeof log === 'number') { try { fs.closeSync(log); fs.chmodSync(setupLog, 0o644); } catch { /* gone */ } }
        emit({ kind: 'setup', state: code === 0 ? 'done' : 'failed', code, ...(signal ? { signal } : {}) }, r);
        resolve();
      });
      child.on('error', () => {});
    });
  }

  async function prepareAndSpawn(r) {
    const { cwd, branch, bundleUrl, argv, env = {}, files = [], remote, changesRef, base, refs } = r.spec;
    try {
      const bundle = path.join(r.dir, 'in.bundle');
      fs.mkdirSync(cwd, { recursive: true });
      // A project with no repository runs in its documents folder, which
      // arrives with the files below: nothing to check out.
      if (!r.spec.plain) {
        await sh('git', ['init', '-q'], cwd);
        // The history the bucket already had, then only the commits past it.
        if (base) {
          const file = path.join(r.dir, 'base.bundle');
          await download(fetchImpl, base.url, file, stopping.signal);
          stillOpen();
          await sh('git', ['fetch', '-q', file, '+refs/*:refs/agentbox/base/*'], cwd);
          fs.rmSync(file, { force: true });
        }
        // Every ref the Mac packed lands where it was. `--update-head-ok`: a
        // fresh repository's HEAD already names a branch, and git otherwise
        // refuses to fetch into the checked-out one.
        if (bundleUrl) {
          await download(fetchImpl, bundleUrl, bundle, stopping.signal);
          stillOpen();
          await sh('git', ['fetch', '-q', '--update-head-ok', bundle, '+refs/*:refs/*'], cwd);
        }
        // A thin bundle leaves out each ref whose commit the base holds.
        for (const [ref, sha] of Object.entries(refs || {})) await sh('git', ['update-ref', ref, sha], cwd);
        if (base) {
          const left = (await sh('git', ['for-each-ref', '--format=%(refname)', 'refs/agentbox/base/'], cwd)).split('\n').filter(Boolean);
          for (const ref of left) await sh('git', ['update-ref', '-d', ref], cwd);
        }
        await sh('git', ['checkout', '-q', branch], cwd);
        if (remote) await sh('git', ['remote', 'add', 'origin', remote], cwd).catch(() => {});
        r.startSha = (await sh('git', ['rev-parse', 'HEAD'], cwd)).trim();
        r.lastCheckpoint = r.startSha;
        // Work the task folder held uncommitted on the Mac, carried as one
        // commit on its own ref and laid back down as uncommitted work here.
        if (changesRef) {
          const patch = await sh('git', ['diff', '--binary', 'HEAD', changesRef], cwd, {}, true);
          if (patch.length) await sh('git', ['apply', '--whitespace=nowarn'], cwd, {}, false, patch);
          await sh('git', ['update-ref', '-d', changesRef], cwd).catch(() => {});
        }
      }
      stillOpen();
      if (r.spec.docs) fs.mkdirSync(r.spec.docs, { recursive: true });
      for (const f of files) { await placeFile(f, r); stillOpen(); }
      // Files that belong in the agent's own home here, wherever the Mac keeps
      // its: the person's own instructions to Claude (`.claude/CLAUDE.md`).
      const home = at(runAs?.home || process.env.HOME || '/root');
      for (const h of r.spec.homeFiles || []) {
        const p = path.join(home, h.rel);
        await placeFile({ path: p, url: h.url });
        if (runAs) await sh('chown', ['-R', `${runAs.uid}:${runAs.gid}`, path.join(home, h.rel.split('/')[0])], '/');
      }
      fs.rmSync(bundle, { force: true });
      if (r.spec.login) await placeLogin(r);
      if (r.spec.also) await placeCodexToo(r);
      // What the documents folder held before the agent started, so only what
      // it writes there goes home (`sendDocs`).
      if (r.spec.docs) r.docsSeen = scanDocs(r.spec.docs);
      // What the command writes to becomes its own: the task folder, its
      // documents folder, and the account folder its transcripts and tooling
      // live in.
      if (runAs) {
        const own = [cwd, ...(r.spec.docs ? [r.spec.docs] : [])];
        // The harness's own home: Claude Code's account folder, or Codex's,
        // where it keeps its state database and writes its sessions.
        for (const k of ['CLAUDE_CONFIG_DIR', 'CODEX_HOME']) {
          if (env[k]) { const d = at(env[k]); fs.mkdirSync(d, { recursive: true }); own.push(d); }
        }
        for (const p of own) await sh('chown', ['-R', `${runAs.uid}:${runAs.gid}`, p], '/');
      }
    } catch (err) {
      emit({ kind: 'error', message: closed() ? 'the sandbox closed while the run was being prepared' : `could not prepare the run: ${err.message}` }, r);
      setState('failed', {}, r);
      return;
    }
    // Closed while this was being laid out: the command does not start, and
    // the results of a run nobody is waiting for do not go up.
    if (closed()) { setState('failed', {}, r); return; }
    if (!r.cancelled && !r.spec.kind && fs.existsSync(path.join(cwd, SETUP_FILE))) await runSetup(r, cwd, env);
    if (closed()) { setState('failed', {}, r); return; }
    if (r.cancelled) {
      // Cancelled before it ever started: nothing ran, so the results are the
      // folder exactly as it was packed, uploaded so the Mac's import is the
      // same one path every time.
      r.exitCode = null;
      emit({ kind: 'exit', code: null, signal: r.cancelled, cancelled: true }, r);
      r.state = 'exited';
      if (r.spec.results) autoCollect(r, r.spec.results);
      return;
    }
    openBridge();
    let child;
    try {
      child = spawnAsAgent(argv, {
        cwd,
        env: {
          ...baseEnv,
          ...(runAs ? { HOME: runAs.home, USER: runAs.user, LOGNAME: runAs.user, TMPDIR: '/tmp' } : {}),
          ...env,
          ...(r.secretEnv || {}),
          AGENTBOX_BRIDGE_SOCK: bridgeSocket,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        // Its own process group, so a cancel reaches everything it started.
        detached: true,
      });
    } catch (err) {
      emit({ kind: 'error', message: `could not start the command: ${err.message}` }, r);
      setState('failed', {}, r);
      return;
    }
    r.child = child;
    r.meter = usageMeter(usage);
    child.stdout.on('data', (d) => { emitChunks('stdout', d, r); readTurn(r, d); });
    child.stderr.on('data', (d) => emitChunks('stderr', d, r));
    child.stdin.on('error', () => {});
    for (const p of r.pendingStdin.splice(0)) writeStdin(r, p);
    let exited = false;
    // A command that could not be started at all (not found, not allowed)
    // reports an error and may never report an exit; it is over all the same,
    // and its folder is still collected.
    child.on('error', (err) => {
      emit({ kind: 'error', message: `the command failed: ${err.message}` }, r);
      if (!child.pid) setImmediate(() => finish(127, null));
    });
    const finish = (code, signal) => {
      if (exited) return;
      exited = true;
      clearTimeout(r.killTimer);
      clearTimeout(r.deadlineTimer);
      r.exitCode = code;
      r.exitSignal = signal || null;
      r.usage = r.meter?.stop() ?? null;
      r.meter = null;
      r.child = null;
      // Anything the command left running in its group goes now: a dev
      // server holding stdout open would otherwise keep the run "running".
      killGroup(child.pid, 'SIGKILL');
      if (r.secrets?.length) {
        for (const kind of ['stdout', 'stderr']) {
          const tail = redactStream(r, kind, Buffer.alloc(0), true);
          if (tail.length) emit({ kind, data: tail.toString('base64') }, r);
        }
      }
      emit({ kind: 'exit', code, signal, ...(r.cancelled ? { cancelled: true } : {}) }, r);
      if (r.awayTimer) { clearInterval(r.awayTimer); r.awayTimer = null; }
      r.state = 'exited';
      statusChangedAt = Math.floor(Date.now() / 1000);
      // Whether the login is why: asked of the login itself, never read from
      // what the agent printed, and said before the results go.
      Promise.resolve(r.spec.login && !r.cancelled ? checkLogin(r, code) : null)
        .catch(() => {})
        .then(() => { if (r.spec.results) autoCollect(r, r.spec.results); });
    };
    // `exit` rather than `close`: a descendant that inherited stdout can hold
    // the pipe open long after the command itself is gone. The output that was
    // already written is flushed first.
    child.on('exit', (code, signal) => setImmediate(() => finish(code, signal)));
    if (r.cancelled) cancel(r, r.cancelled);
    setState('running', {}, r);
    const deadline = Number(r.spec.deadlineMs) || DEFAULT_DEADLINE_MS;
    r.deadlineTimer = setTimeout(() => {
      emit({ kind: 'error', message: 'stopped near the cloud session\'s 8-hour limit so its work could be saved' }, r);
      cancel(r, 'SIGTERM');
    }, deadline);
  }

  function cancel(r, signal = 'SIGTERM') {
    r.cancelled = r.cancelled || signal;
    const child = r.child;
    if (!child) return; // still preparing: the latch stops it from starting
    killGroup(child.pid, signal);
    clearTimeout(r.killTimer);
    r.killTimer = setTimeout(() => killGroup(child.pid, 'SIGKILL'), killGraceMs);
  }

  // What a run was given is noted, so only what it adds goes home (`stageTails`).
  async function placeFile(f, r = null) {
    fs.mkdirSync(path.dirname(f.path), { recursive: true });
    const body = await download(fetchImpl, f.url, f.path, stopping.signal);
    if (r && !f.untar) (r.placed ||= new Map()).set(f.path, { size: body.length, sha256: sha256(body) });
    if (f.untar) {
      fs.mkdirSync(f.untar, { recursive: true });
      await sh('tar', ['-xzf', f.path, '-C', f.untar], f.untar);
      fs.rmSync(f.path, { force: true });
    }
  }

  /* ----------------------------- THE SIGN-INS ----------------------------- */
  // What a command of ours runs as, and with: the agent's user and home, and
  // nothing from the image's own environment.
  const ownEnv = (extra) => ({ ...baseEnv, ...(runAs ? { HOME: runAs.home, USER: runAs.user, LOGNAME: runAs.user, TMPDIR: '/tmp' } : {}), ...extra });
  const asAgent = runAs ? { uid: runAs.uid, gid: runAs.gid } : {};
  async function scratchFor(r, name) {
    const dir = path.join(r.dir, name);
    fs.mkdirSync(dir, { recursive: true });
    if (runAs) await sh('chown', ['-R', `${runAs.uid}:${runAs.gid}`, r.dir], '/');
    return dir;
  }
  const signinEvent = (r, state, extra = {}) => emit({ kind: 'signin', state, ...extra }, r);

  // The run's login, fetched from the cloud by its own link, put where the
  // harness reads it, and added to what is never printed. A login that cannot
  // be fetched stops the run before anything starts, and says so in a way the
  // Mac reads as "this account needs signing in again".
  async function placeLogin(r) {
    const want = r.spec.login.engine;
    let login = null;
    try {
      const res = await fetchImpl(r.spec.login.url);
      if (res.ok) login = JSON.parse(Buffer.from(await res.arrayBuffer()).toString('utf8'));
    } catch { /* read as missing */ }
    const id = r.spec.login.id ?? null;
    if (!login || login.engine !== want) {
      emit({ kind: 'login', state: 'missing', engine: want, id }, r);
      throw new Error(`this account has no ${want === 'codex' ? 'Codex' : 'Claude'} sign-in in the cloud`);
    }
    if (want === 'claude') {
      if (!login.token) throw new Error('the saved Claude sign-in is empty');
      r.secrets = [login.token];
      r.secretEnv = { CLAUDE_CODE_OAUTH_TOKEN: login.token };
      return;
    }
    const tokens = login.auth?.tokens || {};
    const home = r.spec.env?.CODEX_HOME;
    if (!tokens.access_token || !home) throw new Error('the saved Codex sign-in is incomplete');
    // The login's own expiry, read now, not the Mac's note of it: a run is
    // not started on a token about to run out (the Mac renews it).
    const exp = jwtExpiryMs(tokens.access_token);
    if (!exp || exp - Date.now() < CODEX_MIN_LEFT_MS) {
      emit({ kind: 'login', state: 'expired', engine: want, id }, r);
      throw new Error('the Codex sign-in needs renewing before a run');
    }
    r.loginExpiresAt = exp;
    r.secrets = writeCodexLogin(at(home), login.auth);
  }

  // On the access token alone, and fresh, so Codex never tries to renew.
  // Answers with the tokens, which are what a run may never print.
  function writeCodexLogin(dir, auth) {
    const tokens = auth.tokens;
    const copy = { ...auth, tokens: { ...tokens, refresh_token: CODEX_REFRESH_PLACEHOLDER }, last_refresh: new Date().toISOString() };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify(copy, null, 2), { mode: 0o600 });
    return [tokens.access_token, tokens.id_token, tokens.refresh_token].filter((s) => typeof s === 'string' && s.length >= 16);
  }

  // THEIR CODEX, IN A CLAUDE RUN, so the agent can ask Codex here the way it
  // can on their Mac: placed where `codex` looks by default. Never a reason to
  // stop the run; without it Codex is simply signed out.
  async function placeCodexToo(r) {
    for (const extra of r.spec.also || []) {
      try {
        const res = await fetchImpl(extra.url, { signal: AbortSignal.timeout(30_000) });
        const login = res.ok ? JSON.parse(Buffer.from(await res.arrayBuffer()).toString('utf8')) : null;
        const tokens = login?.engine === 'codex' ? login.auth?.tokens : null;
        const exp = tokens?.access_token ? jwtExpiryMs(tokens.access_token) : null;
        if (!exp || exp - Date.now() < CODEX_MIN_LEFT_MS) { log(`run ${String(r.spec.runId || '').slice(-8)}: no Codex sign-in ready to carry`); continue; }
        const dir = at(path.join(runAs?.home || process.env.HOME || '/root', '.codex'));
        r.secrets = [...(r.secrets || []), ...writeCodexLogin(dir, login.auth)];
        if (runAs) await sh('chown', ['-R', `${runAs.uid}:${runAs.gid}`, dir], '/').catch(() => {});
      } catch { /* Codex stays signed out in this run */ }
    }
  }

  const shape = (text) => String(text || '').replace(/[A-Za-z0-9_\-+/=]{16,}/g, '<long>').replace(/\s+/g, ' ').trim().slice(-600);
  const note = (r, what) => { try { log(`signin ${r.spec.engine} ${String(r.spec.runId || '').slice(-8)}: ${what}`); } catch { /* never in the way */ } };

  // A SIGN-IN: the vendor's own command, run here, for a person at the Mac.
  async function startSignin(r) {
    const { engine } = r.spec;
    let scratch;
    try { scratch = await scratchFor(r, engine); } catch (err) { return failSignin(r, `could not prepare the sign-in: ${err.message}`); }
    r.scratch = scratch;
    const env = ownEnv(engine === 'claude' ? { CLAUDE_CONFIG_DIR: scratch, BROWSER: '/bin/false', TERM: 'xterm-256color' } : { CODEX_HOME: scratch, BROWSER: '/bin/false' });
    const argv = engine === 'claude'
      ? terminal('stty cols 4000 rows 50 2>/dev/null; exec claude setup-token')
      : r.spec.flow === 'browser' ? ['codex', 'login'] : ['codex', 'login', '--device-auth'];
    if (r.cancelled) return failSignin(r, 'The sign-in was cancelled.');
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), { cwd: scratch, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true, ...asAgent });
    } catch (err) {
      return failSignin(r, `could not start the sign-in: ${err.message}`);
    }
    r.child = child;
    child.stdin.on('error', () => {});
    setState('signing-in', {}, r);
    // What the command prints is read here and never sent anywhere: it is
    // where the token appears.
    let seen = '';
    const read = (d) => {
      if (r.signinOver) return;
      seen = (seen + plain(d.toString('utf8'))).slice(-256 * 1024);
      if (engine === 'claude') {
        if (r.codeSent && CLAUDE_CODE_REFUSED.test(seen.slice(r.codeAt ?? 0))) {
          note(r, `code refused: ${shape(seen.slice(r.codeAt ?? 0))}`);
          r.signinOver = true;
          seen = '';
          killGroup(child.pid, 'SIGTERM');
          failSignin(r, 'Claude didn’t accept that code. Copy the newest code from Claude’s page and try again.');
          return;
        }
        const token = seen.match(CLAUDE_TOKEN)?.[1];
        if (token) {
          note(r, `token seen ${r.codeSentAt ? Date.now() - r.codeSentAt : '?'} ms after the code`);
          r.signinOver = true;
          clearTimeout(r.codeTimer);
          seen = '';
          killGroup(child.pid, 'SIGTERM');
          finishClaude(r, token);
          return;
        }
        if (!r.signinUrl) {
          const url = seen.match(CLAUDE_SIGNIN_URL)?.[1];
          if (url) { r.signinUrl = url; signinEvent(r, 'needs-code', { url }); }
        }
      } else if (!r.signinUrl && r.spec.flow === 'browser') {
        const url = seen.match(CODEX_BROWSER_URL)?.[1];
        if (url) {
          r.signinUrl = url;
          r.returnPort = loopbackPort(url);
          if (!r.returnPort) {
            r.signinOver = true;
            killGroup(child.pid, 'SIGTERM');
            failSignin(r, 'Codex’s sign-in link had no way back. Try again.');
            return;
          }
          signinEvent(r, 'waiting', { url, code: null });
        }
      } else if (!r.signinUrl) {
        const url = seen.match(CODEX_DEVICE_URL)?.[1];
        const code = seen.match(CODEX_DEVICE_CODE)?.[1];
        if (url && code) { r.signinUrl = url; signinEvent(r, 'waiting', { url, code }); }
      }
    };
    // Where in what it printed the code was sent: only what came after is
    // read for Claude's answer to it.
    r.markCode = () => { r.codeAt = seen.length; r.codeSentAt = Date.now(); };
    r.afterCode = () => seen.slice(r.codeAt ?? 0);
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('error', () => {});
    child.on('exit', (code) => setImmediate(() => {
      r.child = null;
      if (r.signinOver) return;
      r.signinOver = true;
      if (engine === 'codex' && code === 0 && !r.cancelled) { finishCodex(r); return; }
      if (r.cancelled) failSignin(r, 'The sign-in was cancelled.');
      else if (r.codeSent) failSignin(r, 'Claude didn’t accept that code. Copy the newest code from Claude’s page and try again.');
      else if (r.returnRefused) failSignin(r, 'OpenAI didn’t accept that sign-in. Try again.');
      else failSignin(r, engine === 'claude' ? 'The sign-in ended before Claude finished it.' : 'Codex did not finish signing in.');
    }));
    r.signinTimer = setTimeout(() => {
      if (r.signinOver) return;
      r.signinOver = true;
      killGroup(child.pid, 'SIGKILL');
      failSignin(r, 'The sign-in timed out. Try again.');
    }, signinMs);
  }

  async function finishClaude(r, token) {
    signinEvent(r, 'checking');
    // One word from Claude on that token alone, from an empty folder, before
    // it is kept: a token that does not answer is not a sign-in.
    const check = await scratchFor(r, 'check');
    const checkAt = Date.now();
    const out = await quiet(['claude', '-p', 'Reply with the single word: ok', '--max-turns', '1'], { cwd: check, env: ownEnv({ CLAUDE_CODE_OAUTH_TOKEN: token, CLAUDE_CONFIG_DIR: check }), timeoutMs: 120_000 });
    note(r, `check ${out.code === 0 && /ok/i.test(out.stdout) ? 'answered' : `failed (exit ${out.code}): ${shape(out.output)}`} in ${Date.now() - checkAt} ms`);
    if (out.code !== 0 || !/ok/i.test(out.stdout)) return failSignin(r, 'Claude refused the new sign-in; nothing was kept.');
    const email = await Promise.resolve(whoIs(token, fetchImpl)).catch(() => null);
    const seen = await lookAt(r, token).catch(() => null);
    await saveLogin(r, { engine: 'claude', token, savedAt: Date.now() }, {
      expiresAt: null, email: typeof email === 'string' ? email : null, org: seen?.org ?? null, limits: seen?.limits ?? [],
    });
  }

  // One tiny reply on the token, its headers read. Its output also carries the
  // request and the token, so it is read here and never noted or sent.
  async function lookAt(r, token) {
    const dir = await scratchFor(r, 'look');
    const out = await quiet(['claude', '-p', 'Reply with the single word: ok', '--max-turns', '1', '--model', 'haiku'], {
      cwd: dir, env: ownEnv({ CLAUDE_CODE_OAUTH_TOKEN: token, CLAUDE_CONFIG_DIR: dir, ANTHROPIC_LOG: 'debug' }), timeoutMs: 120_000,
    });
    fs.rmSync(dir, { recursive: true, force: true });
    return readReplyHeaders(out.output);
  }

  // A SAVED CLAUDE LOGIN LOOKED AT, for the Mac to name it and draw its usage.
  // Ends 'saved' with what was read, or 'failed'; nothing is kept.
  async function look(r) {
    setState('looking', {}, r);
    let login = null;
    try {
      const res = await fetchImpl(r.spec.loginUrl);
      if (res.ok) login = JSON.parse(Buffer.from(await res.arrayBuffer()).toString('utf8'));
    } catch { /* read as missing */ }
    if (!login?.token) return failSignin(r, 'The Claude sign-in could not be reached.');
    const seen = await lookAt(r, login.token).catch(() => null);
    forget(r);
    if (!seen) return failSignin(r, 'Claude did not say whose account this is.');
    note(r, 'looked');
    signinEvent(r, 'saved', { org: seen.org, limits: seen.limits });
    setState('collected', {}, r);
  }

  // THE BROWSER'S RETURN, handed to `codex login`'s own server as if the
  // browser had reached it here. Its redirect to /success carries the id
  // token, so it is followed here and nothing of it goes back; Codex exits
  // once /success is fetched, and its exit says how the sign-in ended.
  async function handBack(r, query) {
    const at = `http://127.0.0.1:${r.returnPort}`;
    let res;
    try {
      res = await fetchImpl(`${at}/auth/callback?${query}`, { redirect: 'manual', signal: AbortSignal.timeout(90_000) });
      await res.arrayBuffer().catch(() => {});
    } catch (err) {
      note(r, `return not taken: ${shape(err.message)}`);
      return { ok: false, error: 'not-taken' };
    }
    note(r, `return answered ${res.status}`);
    // "State mismatch": another sign-in's return. Codex is still waiting.
    if (res.status === 400) return { ok: false, error: 'wrong-sign-in' };
    const to = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !to) {
      r.returnRefused = true;
      return { ok: false, error: 'refused' };
    }
    signinEvent(r, 'checking');
    try {
      const next = new URL(to, at);
      const done = await fetchImpl(`${at}${next.pathname}${next.search}`, { signal: AbortSignal.timeout(30_000) });
      await done.arrayBuffer().catch(() => {});
    } catch { /* Codex has the login already; its exit decides */ }
    return { ok: true };
  }

  async function finishCodex(r) {
    let auth = null;
    try { auth = JSON.parse(fs.readFileSync(path.join(r.scratch, 'auth.json'), 'utf8')); } catch { /* none */ }
    if (!auth?.tokens?.access_token || !auth.tokens.refresh_token) return failSignin(r, 'Codex finished without a ChatGPT sign-in.');
    await saveLogin(r, { engine: 'codex', auth, savedAt: Date.now() }, { expiresAt: jwtExpiryMs(auth.tokens.access_token), email: jwtClaim(auth.tokens.id_token, 'email') });
  }

  // Kept by its own link, a few tries; the Mac hears only that it was kept.
  async function saveLogin(r, login, meta) {
    const body = Buffer.from(JSON.stringify(login));
    let lastErr = null;
    for (let i = 0; i < 3; i += 1) {
      try { await upload(fetchImpl, r.spec.saveUrl, body); lastErr = null; break; } catch (err) { lastErr = err; await new Promise((res) => setTimeout(res, uploadRetryMs * (i + 1))); }
    }
    if (lastErr) { note(r, `could not keep it: ${shape(lastErr.message)}`); return failSignin(r, 'The sign-in worked but could not be kept. Try again.'); }
    note(r, 'kept');
    clearTimeout(r.signinTimer);
    clearTimeout(r.codeTimer);
    forget(r);
    signinEvent(r, 'saved', meta);
    setState('collected', {}, r);
  }

  function failSignin(r, message, extra = {}) {
    note(r, `failed: ${message}`);
    clearTimeout(r.signinTimer);
    clearTimeout(r.codeTimer);
    r.signinOver = true;
    if (r.child) killGroup(r.child.pid, 'SIGKILL');
    forget(r);
    signinEvent(r, 'failed', { message, ...extra });
    setState('failed', {}, r);
  }

  // Nothing of a login stays on the machine once the session is over.
  function forget(r) {
    let names = [];
    try { names = fs.readdirSync(r.dir); } catch { /* gone */ }
    for (const n of names) if (n !== 'events.jsonl') fs.rmSync(path.join(r.dir, n), { recursive: true, force: true });
  }

  // A CODEX RENEWAL: the real login, marked as long overdue so Codex renews
  // it on its first request, one tiny request, and the renewed login kept.
  // Never run beside a run of the same account: the Mac keeps them apart.
  async function renew(r) {
    setState('renewing', {}, r);
    let login = null;
    try {
      const res = await fetchImpl(r.spec.loginUrl);
      if (res.ok) login = JSON.parse(Buffer.from(await res.arrayBuffer()).toString('utf8'));
    } catch { /* not reached */ }
    // A login that could not be fetched may be a network hiccup: tried again
    // later, never taken for a sign-out (finding 5).
    if (!login) return failSignin(r, 'The Codex sign-in could not be reached; it will be tried again.');
    if (!login?.auth?.tokens?.refresh_token) return failSignin(r, 'There is no Codex sign-in to renew.', { signedOut: true });
    let home;
    try { home = await scratchFor(r, 'codex'); } catch (err) { return failSignin(r, `could not prepare the renewal: ${err.message}`); }
    fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify({ ...login.auth, last_refresh: '2000-01-01T00:00:00Z' }, null, 2), { mode: 0o600 });
    if (runAs) await sh('chown', [`${runAs.uid}:${runAs.gid}`, path.join(home, 'auth.json')], '/').catch(() => {});
    const work = await scratchFor(r, 'work');
    const ran = await quiet(['codex', 'exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-c', 'model_reasoning_effort=low', 'Reply with the single word: ok'], { cwd: work, env: ownEnv({ CODEX_HOME: home }), timeoutMs: 5 * 60_000 });
    let after = null;
    try { after = JSON.parse(fs.readFileSync(path.join(home, 'auth.json'), 'utf8')); } catch { /* gone */ }
    const access = after?.tokens?.access_token;
    if (!access || access === login.auth.tokens.access_token || !after.tokens.refresh_token) {
      // Signed out only when Codex said the login itself was refused; any
      // other failure (the network, a limit, a timeout) is tried again.
      if (CODEX_SIGNED_OUT.test(ran.output)) return failSignin(r, 'Codex could not renew this sign-in. Sign in again.', { signedOut: true });
      return failSignin(r, 'Codex could not renew this sign-in just now; it will be tried again.');
    }
    await saveLogin(r, { engine: 'codex', auth: after, savedAt: Date.now() }, { expiresAt: jwtExpiryMs(access) });
  }

  async function checkLogin(r, code) {
    const { engine, id = null } = r.spec.login;
    if (engine === 'codex') {
      if (r.loginExpiresAt && r.loginExpiresAt <= Date.now()) emit({ kind: 'login', state: 'expired', engine, id }, r);
      return;
    }
    if (code === 0 || !r.secretEnv?.CLAUDE_CODE_OAUTH_TOKEN) return;
    const check = await scratchFor(r, 'check');
    const out = await quiet(['claude', '-p', 'Reply with the single word: ok', '--max-turns', '1'], { cwd: check, env: ownEnv({ CLAUDE_CODE_OAUTH_TOKEN: r.secretEnv.CLAUDE_CODE_OAUTH_TOKEN, CLAUDE_CONFIG_DIR: check }), timeoutMs: 120_000 });
    fs.rmSync(check, { recursive: true, force: true });
    // Refused only when Claude said so; a timeout or an outage is not a
    // reason to ask her to sign in again (finding 5).
    if ((out.code !== 0 || !/ok/i.test(out.stdout)) && CLAUDE_REFUSED.test(out.output)) emit({ kind: 'login', state: 'refused', engine, id }, r);
  }

  // A command of ours whose output is read here and never sent anywhere.
  function quiet(argv, { cwd, env, timeoutMs }) {
    return new Promise((resolve) => {
      execFile(argv[0], argv.slice(1), { cwd, env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, ...asAgent }, (err, stdout, stderr) => {
        resolve({ code: err ? (Number.isInteger(err.code) ? err.code : 1) : 0, stdout: String(stdout || ''), output: `${stdout || ''}\n${stderr || ''}` });
      });
    });
  }

  function writeStdin(r, { data, end }) {
    const child = r.child;
    if (!child) { r.pendingStdin.push({ data, end }); return; }
    if (data) child.stdin.write(Buffer.from(data, 'base64'));
    if (end) child.stdin.end();
  }

  /* ------------------------------ COLLECTING ------------------------------ */
  // Three tries on its own, a little apart. A `collect` from the Mac (with
  // fresh URLs, say) takes over from these rather than racing them.
  async function autoCollect(r, urls) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (r.manualCollect || r.state === 'collected') return;
      const out = await collectAndFinish(r, urls);
      if (out.ok || r.manualCollect) return;
      if (attempt < 3) await new Promise((res) => setTimeout(res, uploadRetryMs * attempt));
      else setState('collect-failed', { message: out.message }, r);
    }
  }

  async function manualCollect(r, urls) {
    r.manualCollect = true;
    while (r.collecting) await r.collecting.catch(() => {});
    if (r.state === 'collected') return { ...r.manifest, already: true };
    const out = await collectAndFinish(r, urls);
    if (!out.ok) setState('collect-failed', { message: out.message }, r);
    return out;
  }

  // The commits, the uncommitted work, the folders asked for, then the event
  // log, then `done.json` LAST. One at a time per run.
  function collectAndFinish(r, urls) {
    if (r.collecting) return r.collecting;
    r.collecting = (async () => {
      try {
        const manifest = await collect(r, urls);
        if (urls.eventsUrl) await upload(fetchImpl, urls.eventsUrl, fs.readFileSync(r.log.file));
        const done = { ...manifest, runId: r.id, exitCode: r.exitCode, exitSignal: r.exitSignal || null, cancelled: r.cancelled || null, lastSeq: r.log.index.length, usage: r.usage || null };
        if (urls.doneUrl) await upload(fetchImpl, urls.doneUrl, Buffer.from(JSON.stringify(done)));
        r.manifest = done;
        setState('collected', {}, r);
        return done;
      } catch (err) {
        return { ok: false, error: 'collect-failed', message: err.message };
      } finally {
        r.collecting = null;
      }
    })();
    return r.collecting;
  }

  async function collect(r, { bundleUrl, changesUrl, docsUrl, bring = [] }) {
    r.attempt = (r.attempt || 0) + 1;
    const tmp = (name) => path.join(r.dir, `${r.attempt}-${name}`);
    const brought = [];
    // The documents first: they are sent whether or not the folder ever got
    // as far as a checkout, and hold everything the Mac has not said it laid.
    const docs = docsUrl ? (await sendDocs(r, docsUrl)).files : [];
    const bringAll = async () => {
      for (const b of bring) {
        if (!fs.existsSync(b.dir)) continue;
        const staged = r.spec.tails ? await stageTails(r, b.dir, tmp('bring')) : null;
        if (r.secrets?.length) redactFolder(staged || b.dir, r.secrets);
        const tarball = tmp('bring.tgz');
        try {
          await sh('tar', ['-czf', tarball, '-C', staged || b.dir, '.'], r.spec.cwd);
        } finally {
          if (staged) fs.rmSync(staged, { recursive: true, force: true });
        }
        await upload(fetchImpl, b.url, fs.readFileSync(tarball));
        fs.rmSync(tarball, { force: true });
        brought.push(b.dir);
      }
    };
    // A run cancelled before checkout has nothing in the folder to bring; a
    // run with no repository still has its conversation.
    if (!r.startSha) {
      if (r.spec.plain) await bringAll();
      return { ok: true, startSha: null, tip: null, commits: 0, uncommitted: false, changesRef: null, brought, docs };
    }
    const cwd = r.spec.cwd;
    const branch = r.spec.branch;
    const tip = (await sh('git', ['rev-parse', `refs/heads/${branch}`], cwd)).trim();
    let commits = Number((await sh('git', ['rev-list', '--count', `${r.startSha}..${tip}`], cwd)).trim()) || 0;
    // WHERE THE AGENT ENDED UP, not only where it started. An agent that
    // switched branches and committed there leaves the task branch untouched
    // and the folder clean, and collecting the task branch alone would bring
    // back nothing while the work sat on the other one.
    const head = (await sh('git', ['rev-parse', 'HEAD'], cwd)).trim();
    const headRef = (await sh('git', ['symbolic-ref', '-q', '--short', 'HEAD'], cwd).catch(() => '')).trim() || null;
    let strayHead = head !== tip && head !== r.startSha;
    if (strayHead) await sh('git', ['update-ref', 'refs/agentbox/head', head], cwd);
    // NOTHING THE RUN MADE GOES HOME CARRYING ITS LOGIN (Codex's review,
    // 2026-10-14, finding 1). Changed files have the login's text replaced;
    // commits cannot be, so commits that carry it stay here, and the run says
    // so. An agent can still encode its login some other way: this is a
    // guard, not a promise (docs/cloud/PLAN.md).
    let withheld = null;
    if (r.secrets?.length && (commits > 0 || strayHead)) {
      const ranges = [`${r.startSha}..${tip}`, ...(strayHead ? [`${r.startSha}..${head}`] : [])];
      if (await commitsCarry(cwd, ranges, r.secrets)) {
        withheld = 'the run\'s commits contain its own sign-in, so they were left in the cloud; its other work came home';
        emit({ kind: 'error', message: withheld }, r);
      }
    }
    if (withheld) { commits = 0; strayHead = false; }
    if (r.secrets?.length) await redactChanged(cwd, r.secrets);
    if (commits > 0 || strayHead) {
      const out = tmp('out.bundle');
      const refs = [];
      if (commits > 0) refs.push(`refs/heads/${branch}`);
      if (strayHead) refs.push('refs/agentbox/head');
      await sh('git', ['bundle', 'create', '-q', out, ...refs, `^${r.startSha}`], cwd);
      await upload(fetchImpl, bundleUrl, fs.readFileSync(out));
      fs.rmSync(out, { force: true });
    }
    // Uncommitted work sits on the agent's own commits; with those withheld,
    // the Mac has nothing to lay it on.
    const dirty = (await sh('git', ['status', '--porcelain', '--untracked-files=all'], cwd)).trim().length > 0 && !(withheld && head !== r.startSha);
    let changesRef = null;
    if (dirty) {
      changesRef = 'refs/agentbox/changes';
      const index = tmp('changes.index');
      const env = { GIT_INDEX_FILE: index };
      fs.rmSync(index, { force: true });
      await sh('git', ['read-tree', 'HEAD'], cwd, env);
      await sh('git', ['add', '-A'], cwd, env);
      const tree = (await sh('git', ['write-tree'], cwd, env)).trim();
      const commit = (await sh('git', ['-c', 'user.name=Agentbox', '-c', 'user.email=agentbox@localhost', 'commit-tree', tree, '-p', 'HEAD', '-m', 'Uncommitted work from a cloud run'], cwd, env)).trim();
      fs.rmSync(index, { force: true });
      await sh('git', ['update-ref', changesRef, commit], cwd);
      const out = tmp('changes.bundle');
      await sh('git', ['bundle', 'create', '-q', out, changesRef, '^HEAD'], cwd);
      await upload(fetchImpl, changesUrl, fs.readFileSync(out));
      fs.rmSync(out, { force: true });
    }
    await bringAll();
    return { ok: true, startSha: r.startSha, tip: withheld ? r.startSha : tip, head: withheld ? r.startSha : head, headRef, strayHead, commits, uncommitted: dirty, changesRef, brought, docs, ...(withheld ? { withheld } : {}) };
  }

  // WHAT THE AGENT WROTE IN THE DOCUMENTS FOLDER SINCE IT WAS LAST ASKED,
  // uploaded as one archive: files new or changed since the folder was laid
  // down or last sent, never a deletion. One at a time per run, so the Mac's
  // asking during the run and the collect at its end never send a file twice
  // or skip one.
  // `id` names this archive so the Mac can say it laid it (`ack`, on its next
  // ask): only then do its files count as home. Until then they go again in
  // every archive, so one lost on the way costs nothing.
  function sendDocs(r, url, { id = null, ack = null } = {}) {
    const go = async () => {
      const dir = r.spec.docs;
      if (!dir || !r.docsSeen || !fs.existsSync(dir)) return { ok: true, files: [] };
      r.docsSent ??= new Map();
      if (ack && r.docsSent.has(ack)) {
        for (const [rel, stamp] of r.docsSent.get(ack)) r.docsSeen.set(rel, stamp);
        r.docsSent.clear();
      }
      const now = scanDocs(dir);
      // A file whose NAME carries the login stays here, unnamed in any answer.
      const files = [...now.keys()].filter((rel) => now.get(rel) !== r.docsSeen.get(rel) && !(r.secrets || []).some((sec) => rel.includes(sec)));
      if (!files.length) return { ok: true, files: [] };
      // COPIED, THEN CLEANED, THEN PACKED: the agent is still running and may
      // rewrite a file between a clean and the tar reading it, so what goes
      // home is a copy it cannot reach, with the login taken out of the copy.
      // Each file is stamped before it is read: one still being written reads
      // as changed again next time and goes again.
      const stage = path.join(r.dir, `docs-${Date.now()}`);
      const stamps = new Map();
      try {
        for (const rel of files) {
          const src = path.join(dir, rel);
          let st;
          let body;
          try {
            st = fs.lstatSync(src);
            if (!st.isFile()) continue;
            body = fs.readFileSync(src);
          } catch { continue; }
          if (r.secrets?.length) {
            let text = body.toString('latin1');
            if (r.secrets.some((sec) => text.includes(sec))) {
              for (const sec of r.secrets) text = text.split(sec).join(REDACTED);
              body = Buffer.from(text, 'latin1');
            }
          }
          const dest = path.join(stage, rel);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, body);
          stamps.set(rel, `${st.size}:${st.mtimeMs}`);
        }
        if (!stamps.size) return { ok: true, files: [] };
        const tarball = `${stage}.tgz`;
        try {
          await sh('tar', ['-czf', tarball, '-C', stage, '--null', '-T', '-'], stage, {}, false, [...stamps.keys()].join('\0') + '\0');
          await upload(fetchImpl, url, fs.readFileSync(tarball));
        } finally {
          fs.rmSync(tarball, { force: true });
        }
      } finally {
        fs.rmSync(stage, { recursive: true, force: true });
      }
      if (id) r.docsSent.set(String(id), stamps);
      return { ok: true, files: [...stamps.keys()] };
    };
    const next = (r.docsChain || Promise.resolve()).catch(() => {}).then(go);
    r.docsChain = next;
    return next;
  }

  async function checkpoint(r, { bundleUrl }) {
    if (!r.startSha) return { ok: true, changed: false, tip: null };
    const cwd = r.spec.cwd;
    const tip = (await sh('git', ['rev-parse', `refs/heads/${r.spec.branch}`], cwd)).trim();
    if (tip === r.lastCheckpoint) return { ok: true, changed: false, tip };
    if (r.secrets?.length && await commitsCarry(cwd, [`${r.startSha}..${tip}`], r.secrets)) return { ok: false, error: 'withheld' };
    const out = path.join(r.dir, 'checkpoint.bundle');
    await sh('git', ['bundle', 'create', '-q', out, `refs/heads/${r.spec.branch}`, `^${r.startSha}`], cwd);
    await upload(fetchImpl, bundleUrl, fs.readFileSync(out));
    fs.rmSync(out, { force: true });
    r.lastCheckpoint = tip;
    return { ok: true, changed: true, tip };
  }

  /* ------------------------------- ACTIONS -------------------------------- */
  // Numbered input: `n` is the Mac's count of everything it has sent this run.
  // A repeat is acknowledged and not applied; a gap is refused, naming the
  // number expected, so the Mac resends from there.
  //
  // ONE AT A TIME. Inputs are applied in a single chain per run, so a resend
  // that arrives while the first copy is still downloading a file waits for it
  // and is then answered as the duplicate it is; it can never land second and
  // rewind the count. The count moves only when an input was applied, or was
  // consumed with nothing left to apply it to (stdin after the command exited,
  // a reply for a stub that has gone); a failed file download leaves it, so the
  // same number can be sent again.
  function sequenced(r, req, apply) {
    const step = async () => {
      if (req.n === undefined) return apply();
      const n = Number(req.n);
      if (n <= r.inSeq) return { ok: true, dup: true };
      if (n !== r.inSeq + 1) return { ok: false, error: 'gap', expect: r.inSeq + 1 };
      const out = await apply();
      if (out?.ok || out?.consumed) r.inSeq = n;
      return out;
    };
    const p = (r.inputs || Promise.resolve()).then(step, step);
    r.inputs = p.catch(() => {});
    return p;
  }

  async function handle(req = {}) {
    const action = req.action;
    if (action === 'status') {
      if (!run) return { ok: true, state: 'none' };
      return { ok: true, runId: run.id, state: run.state, seq: run.log.index.length, inSeq: run.inSeq, exitCode: run.exitCode ?? null, manifest: run.manifest || null };
    }
    if (action === 'signin' || action === 'renew' || action === 'look') {
      if (run && run.id === req.runId) return { ok: true, already: true, state: run.state, seq: run.log.index.length, caps: CAPS };
      if (run && !DONE_STATES.has(run.state)) return { ok: false, error: 'busy', runId: run.id };
      const problem = invalidSignin(action, req);
      if (problem) return { ok: false, error: 'bad-start', message: problem };
      closeLog(run);
      const r = {
        id: req.runId, spec: { kind: action, engine: req.engine, saveUrl: req.saveUrl, loginUrl: req.loginUrl, flow: req.flow ?? null },
        state: 'preparing', waiters: new Set(), pendingStdin: [], child: null,
        exitCode: null, startSha: null, inSeq: 0, cancelled: null, manifest: null,
        dir: path.join(workRoot, '.agentbox', safe(req.runId)),
      };
      openLog(r);
      run = r;
      setState('preparing', {}, r);
      if (action === 'signin') startSignin(r); else if (action === 'look') look(r); else renew(r);
      return { ok: true, seq: r.log.index.length };
    }
    if (action === 'start') {
      if (run && run.id === req.runId) return { ok: true, already: true, state: run.state, seq: run.log.index.length, caps: CAPS };
      if (run && !DONE_STATES.has(run.state)) return { ok: false, error: 'busy', runId: run.id };
      const problem = invalidStart(req);
      if (problem) return { ok: false, error: 'bad-start', message: problem };
      if (bridge) for (const c of bridge.conns.values()) c.sock.destroy();
      closeLog(run);
      const spec = !pathRoot ? req : {
        ...req,
        cwd: at(req.cwd),
        files: (req.files || []).map((f) => ({ ...f, path: at(f.path), ...(f.untar ? { untar: at(f.untar) } : {}) })),
        env: { ...(req.env || {}), AGENTBOX_PATH_ROOT: pathRoot },
        results: req.results && { ...req.results, bring: (req.results.bring || []).map((b) => ({ ...b, dir: at(b.dir) })) },
        ...(req.docs ? { docs: at(req.docs) } : {}),
      };
      const r = {
        id: req.runId, spec, state: 'preparing', waiters: new Set(), pendingStdin: [], child: null,
        exitCode: null, startSha: null, inSeq: 0, cancelled: null, manifest: null,
        dir: path.join(workRoot, '.agentbox', safe(req.runId)),
        // A run the cloud server starts has no Mac there from its first moment.
        macSeenAt: req.offline?.away === true ? 0 : Date.now(),
        offline: req.offline ? {
          afterMs: Math.max(50, Number(req.offline.afterMs) || 90_000), endTurn: req.offline.endTurn ?? null, kept: req.offline.kept ?? null,
          hold: req.offline.hold ?? null, handshakes: req.offline.handshakes ?? null,
        } : null,
        calls: new Map(), handshakes: new Map(), connServer: new Map(), inputClosed: null,
        turn: { line: '', atResult: false, waiting: 0, lastJobEndedAt: 0, unread: new Map(), anonymous: 0 },
      };
      openLog(r);
      run = r;
      if (r.offline) watchWhileAway(r);
      setState('preparing', {}, r);
      preparing = prepareAndSpawn(r).catch(() => {});
      return { ok: true, seq: r.log.index.length, caps: CAPS };
    }
    if (!run) return { ok: false, error: 'no-run' };
    if (req.runId && req.runId !== run.id) return { ok: false, error: 'no-run', runId: run.id };
    const r = run;
    // Every ask is the Mac, there; a `peek` is something else reading.
    // The cloud server's own input (`server`) is not the Mac being here either.
    if (!(action === 'events' && req.peek) && req.server !== true) r.macSeenAt = Date.now();
    // A sign-in session takes its code, its browser's return and a cancel,
    // and nothing a run takes: input to it would be typed into the vendor's
    // own sign-in.
    if (r.spec.kind && !['events', 'signal', 'signin-code', 'signin-callback'].includes(action)) return { ok: false, error: 'not-a-run' };
    switch (action) {
      case 'signin-callback': {
        if (r.spec.kind !== 'signin' || r.spec.flow !== 'browser') return { ok: false, error: 'not-a-browser-sign-in' };
        if (!r.child || r.signinOver || !r.returnPort) return { ok: false, error: 'not-waiting' };
        const query = typeof req.query === 'string' ? req.query : '';
        if (!RETURN_QUERY.test(query)) return { ok: false, error: 'bad-callback' };
        return handBack(r, query);
      }
      case 'signin-code': {
        if (r.spec.kind !== 'signin' || r.spec.engine !== 'claude') return { ok: false, error: 'not-a-claude-sign-in' };
        if (!r.child || r.signinOver) return { ok: false, error: 'not-waiting' };
        const code = String(req.code || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 4096);
        if (!code) return { ok: false, error: 'empty-code' };
        r.codeSent = true;
        r.markCode?.();
        // THE CODE, THEN ENTER ON ITS OWN. Sent together, Claude reads the
        // return as part of a paste and never submits a real-length code
        // (2.1.301, measured 2026-10-15: she sat on Adding; the code showed
        // as stars and nothing more).
        r.child.stdin.write(code);
        await new Promise((res) => setTimeout(res, enterAfterMs));
        if (!r.child || r.signinOver) return { ok: false, error: 'not-waiting' };
        r.child.stdin.write('\r');
        signinEvent(r, 'checking');
        clearTimeout(r.codeTimer);
        note(r, 'code sent');
        r.codeTimer = setTimeout(() => {
          if (r.signinOver) return;
          note(r, `no answer to the code in ${codeAnswerMs} ms; it printed: ${shape(r.afterCode?.())}`);
          r.signinOver = true;
          if (r.child) killGroup(r.child.pid, 'SIGKILL');
          failSignin(r, 'Claude didn’t answer that code. Try again.');
        }, codeAnswerMs);
        return { ok: true };
      }
      case 'events': {
        const since = Math.max(0, Number(req.since) || 0);
        const waitMs = Math.min(Math.max(0, Number(req.waitMs) || 0), 25_000);
        if (r.log.index.length <= since && waitMs > 0) {
          await new Promise((resolve) => {
            const done = () => { clearTimeout(t); r.waiters.delete(done); resolve(); };
            const t = setTimeout(done, waitMs);
            r.waiters.add(done);
          });
        }
        const page = readEvents(r, since, Math.min(Number(req.maxBytes) || PAGE_BYTES, PAGE_BYTES));
        return { ok: true, state: r.state, ...page };
      }
      case 'stdin':
        return sequenced(r, req, () => {
          if (['exited', 'collected', 'collect-failed', 'failed'].includes(r.state)) return { ok: false, error: 'exited', consumed: true };
          // Closed here while the Mac was away: a reply written now is the
          // app's to keep for the next run, and it learns that from this.
          if (r.inputClosed === 'cloud') return { ok: false, error: 'turn-closed', consumed: true };
          if (req.end) r.inputClosed = 'mac';
          noteInput(r, req.data);
          writeStdin(r, req);
          return { ok: true };
        });
      case 'files':
        // Files the Mac learns it must send once the run is going (an
        // attachment named in the prompt, which arrives over stdin).
        return sequenced(r, req, async () => {
          try {
            for (const f of req.files || []) {
              if (!f?.url || !path.isAbsolute(f?.path || '')) return { ok: false, error: 'bad-file', consumed: true };
              await placeFile({ ...f, path: at(f.path), ...(f.untar ? { untar: at(f.untar) } : {}) }, r);
              if (runAs) await sh('chown', [`${runAs.uid}:${runAs.gid}`, at(f.path)], '/').catch(() => {});
            }
          } catch (err) {
            return { ok: false, error: 'file-failed', message: err.message };
          }
          return { ok: true };
        });
      case 'mcp-claim':
        return { ok: true, calls: r.offline ? claimCalls(r, req.calls) : (req.calls || []).map((c) => ({ ...c, go: true })) };
      case 'mcp':
        return sequenced(r, req, () => {
          if (fromMac(r, req.conn, String(req.line))) return { ok: true, dropped: true };
          const c = bridge?.conns.get(req.conn);
          if (!c || c.run !== r) return { ok: false, error: 'no-conn', consumed: true };
          c.sock.write(String(req.line) + '\n');
          return { ok: true };
        });
      case 'mcp-close':
        return sequenced(r, req, () => {
          bridge?.conns.get(req.conn)?.sock.end();
          return { ok: true };
        });
      case 'signal': {
        const sig = req.signal || 'SIGTERM';
        if (['exited', 'collected', 'collect-failed', 'failed'].includes(r.state)) return { ok: true, running: false };
        cancel(r, sig);
        return { ok: true, running: !!r.child, preparing: r.state === 'preparing' };
      }
      case 'docs':
        // The documents the agent has written so far, so they reach the Mac
        // while it works rather than only at the end.
        if (!req.url) return { ok: false, error: 'bad-docs' };
        if (r.state === 'preparing') return { ok: true, files: [] };
        try { return await sendDocs(r, req.url, { id: req.id, ack: req.ack }); } catch (err) { return { ok: false, error: 'docs-failed', message: err.message }; }
      case 'checkpoint':
        if (r.state !== 'running' && r.state !== 'exited') return { ok: false, error: 'not-ready' };
        try { return await checkpoint(r, req); } catch (err) { return { ok: false, error: 'checkpoint-failed', message: err.message }; }
      case 'collect':
        if (r.state === 'collected') return { ...r.manifest, already: true };
        if (r.state !== 'exited' && r.state !== 'collect-failed') return { ok: false, error: 'not-exited', state: r.state };
        return manualCollect(r, pathRoot ? { ...req, bring: (req.bring || []).map((b) => ({ ...b, dir: at(b.dir) })) } : req);
      default:
        return { ok: false, error: 'unknown-action' };
    }
  }

  function ping() {
    const busy = !!run && !DONE_STATES.has(run.state);
    const status = busy ? 'HealthyBusy' : 'Healthy';
    // AgentCore wants the time the status CHANGED, never the time of the ping:
    // a timestamp that moves on every ping keeps a session alive forever.
    if (status !== lastPing) { lastPing = status; }
    return { status, time_of_last_update: statusChangedAt };
  }

  let httpServer = null;
  function listen(port = 8080, host = '0.0.0.0') {
    httpServer = http.createServer(async (req, res) => {
      try {
        if (req.method === 'GET' && req.url.startsWith('/ping')) return json(res, 200, ping());
        if (req.method === 'POST' && req.url.startsWith('/invocations')) {
          const body = await readBody(req, 100 * 1024 * 1024);
          let parsed;
          try { parsed = JSON.parse(body || '{}'); } catch { return json(res, 400, { ok: false, error: 'bad-json' }); }
          return json(res, 200, await handle(parsed));
        }
        json(res, 404, { ok: false, error: 'not-found' });
      } catch (err) {
        json(res, 500, { ok: false, error: 'internal', message: err.message });
      }
    });
    return new Promise((resolve) => httpServer.listen(port, host, () => resolve(httpServer.address())));
  }

  async function close() {
    // Aborted first, so what the preparation is waiting on is a download that
    // has already ended rather than one that may never answer.
    stopping.abort();
    await preparing;
    preparing = null;
    if (run?.child) killGroup(run.child.pid, 'SIGKILL');
    if (run) { clearTimeout(run.deadlineTimer); clearTimeout(run.killTimer); for (const w of [...run.waiters]) w(); }
    if (bridge) { for (const c of bridge.conns.values()) c.sock.destroy(); bridge.server.close(); bridge = null; }
    try { fs.unlinkSync(bridgeSocket); } catch { /* gone */ }
    if (rootHelper) { rootHelper.close(); try { fs.unlinkSync(rootSocket); } catch { /* gone */ } }
    if (httpServer) { httpServer.closeAllConnections?.(); await new Promise((r) => httpServer.close(r)); }
    closeLog(run);
  }

  return { handle, ping, listen, close, bridgeSocket };
}

/* -------------------------------- helpers --------------------------------- */

/**
 * WHOSE ACCOUNT A TOKEN IS, AND HOW MUCH OF IT IS LEFT, off a reply's own
 * headers as Claude Code prints them under ANTHROPIC_LOG=debug. A setup-token
 * token cannot read its own profile, but every reply names its organization
 * and carries the session (5h) and week (7d) usage. The newest reply wins.
 * Null when the text holds none of it.
 */
export function readReplyHeaders(text) {
  const s = String(text ?? '');
  const last = (name) => {
    let v = null;
    for (const m of s.matchAll(new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`, 'gi'))) v = m[1];
    return v;
  };
  const org = last('anthropic-organization-id');
  const limits = [['5h', 'session'], ['7d', 'week']].flatMap(([key, span]) => {
    const used = last(`anthropic-ratelimit-unified-${key}-utilization`);
    if (used == null || !Number.isFinite(Number(used))) return [];
    const reset = Number(last(`anthropic-ratelimit-unified-${key}-reset`));
    return [{ span, percent: Math.round(Number(used) * 100), resetsAt: Number.isFinite(reset) && reset > 0 ? reset * 1000 : null }];
  });
  return org || limits.length ? { org, limits } : null;
}

// The port of the way back an OpenAI sign-in link names, when it is this
// machine's own; null otherwise.
function loopbackPort(link) {
  try {
    const back = new URL(new URL(link).searchParams.get('redirect_uri') || '');
    const port = Number(back.port);
    return back.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(back.hostname) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

function invalidSignin(action, req) {
  if (!req.runId || typeof req.runId !== 'string') return 'runId is required';
  if (action === 'look') return req.engine === 'claude' && req.loginUrl ? null : 'a look is at a Claude login, by its link';
  if (!req.saveUrl) return 'saveUrl is required';
  if (action === 'signin' && !['claude', 'codex'].includes(req.engine)) return 'engine must be claude or codex';
  if (req.flow != null && (action !== 'signin' || req.engine !== 'codex' || req.flow !== 'browser')) return 'flow is browser, and only for a Codex sign-in';
  if (action === 'renew' && (req.engine !== 'codex' || !req.loginUrl)) return 'a renewal is for a Codex login, by its link';
  return null;
}

function invalidStart(req) {
  if (req.login && (!req.login.url || !['claude', 'codex'].includes(req.login.engine))) return 'a login needs its engine and its link';
  if (req.also != null && (!Array.isArray(req.also) || req.also.some((l) => l?.engine !== 'codex' || typeof l.url !== 'string' || !l.url))) return 'also is a list of Codex logins, each by its link';
  if (req.also?.length && req.login?.engine !== 'claude') return 'only a Claude run carries a Codex login too';
  if (!req.runId || typeof req.runId !== 'string') return 'runId is required';
  if (!req.cwd || !path.isAbsolute(req.cwd)) return 'cwd must be an absolute path';
  if (req.plain != null && req.plain !== true) return 'plain is true or absent';
  if (req.plain && (req.bundleUrl || req.base || req.refs || req.changesRef)) return 'a run with no repository takes no bundle';
  if (!req.plain && !req.branch) return 'branch is required';
  if (req.base != null && (typeof req.base !== 'object' || !req.base.url || !/^[0-9a-f]{40,64}$/.test(req.base.sha || ''))) return 'base must be { url, sha }';
  if (req.refs != null && (typeof req.refs !== 'object' || Array.isArray(req.refs)
    || !Object.entries(req.refs).every(([ref, sha]) => /^refs\/[A-Za-z0-9._/-]+$/.test(ref) && !ref.includes('..') && /^[0-9a-f]{40,64}$/.test(sha)))) return 'refs must be { ref: sha }';
  if (!req.plain && !req.bundleUrl && !req.base) return 'bundleUrl is required';
  if (!Array.isArray(req.argv) || !req.argv.length) return 'argv is required';
  if (req.offline != null && (typeof req.offline !== 'object' || (req.offline.endTurn != null && req.offline.endTurn !== 'claude-stream-json'))) return 'offline must be { afterMs, endTurn: "claude-stream-json" or null }';
  if (req.offline?.hold != null && !(Array.isArray(req.offline.hold) && req.offline.hold.every((s) => typeof s === 'string'))) return 'offline.hold must be [server, ...]';
  if (req.offline?.handshakes != null && (typeof req.offline.handshakes !== 'object' || Array.isArray(req.offline.handshakes))) return 'offline.handshakes must be { server: { method: result } }';
  if (req.offline?.away != null && typeof req.offline.away !== 'boolean') return 'offline.away must be true or false';
  if (req.offline?.kept != null && (typeof req.offline.kept !== 'object' || Array.isArray(req.offline.kept)
    || !Object.values(req.offline.kept).every((tools) => Array.isArray(tools) && tools.every((t) => typeof t === 'string')))) return 'offline.kept must be { server: [tool, ...] }';
  for (const f of req.files || []) if (!f?.url || !path.isAbsolute(f?.path || '')) return 'every file needs an absolute path and a url';
  if (req.docs !== undefined && (typeof req.docs !== 'string' || !path.isAbsolute(req.docs))) return 'docs must be an absolute path';
  for (const h of req.homeFiles || []) {
    if (!h?.url || typeof h.rel !== 'string' || !/^\.claude\/[A-Za-z0-9._-]+$/.test(h.rel) || h.rel.includes('..')) return 'a home file must be a plain name under .claude/';
  }
  return null;
}

function killGroup(pid, signal) {
  if (!pid) return;
  try { process.kill(-pid, signal); } catch { try { process.kill(pid, signal); } catch { /* gone */ } }
}

// What the command may inherit from the sandbox itself: enough to find
// programs and a home, and nothing the image's own environment happens to hold.
export function pickBaseEnv(env) {
  // The last two find the image's own browser (Dockerfile).
  const keep = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'SHELL', 'USER', 'NODE_EXTRA_CA_CERTS', 'PLAYWRIGHT_BROWSERS_PATH', 'NODE_PATH'];
  return Object.fromEntries(keep.filter((k) => env[k] !== undefined).map((k) => [k, env[k]]));
}

function safe(s) { return String(s).replace(/[^a-zA-Z0-9._-]/g, '_'); }

// How much of the end of `text` could be the start of one of `secrets`.
function heldTail(text, secrets) {
  let keep = 0;
  for (const s of secrets) {
    for (let n = Math.min(s.length - 1, text.length); n > keep; n -= 1) {
      if (text.endsWith(s.slice(0, n))) { keep = n; break; }
    }
  }
  return keep;
}

// The email of the Claude account a token signs in, asked of Anthropic the
// way Claude Code asks for its own; null when it will not say.
async function claudeAccountEmail(token, fetchImpl = globalThis.fetch) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetchImpl('https://api.anthropic.com/api/oauth/profile', { headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' }, signal: ctl.signal });
    if (!res.ok) return null;
    const j = await res.json();
    const e = j?.account?.email_address ?? j?.account?.email ?? j?.email ?? null;
    return typeof e === 'string' && e.includes('@') ? e : null;
  } catch { return null; } finally { clearTimeout(t); }
}

// Whether any commit in these ranges carries a login's text.
async function commitsCarry(cwd, ranges, secrets) {
  for (const range of ranges) {
    const text = await sh('git', ['log', '-p', '--binary', '--format=%B', range], cwd).catch(() => '');
    if (secrets.some((s) => text.includes(s))) return true;
  }
  return false;
}

// The files a run changed or made, with a login's text taken out of them.
async function redactChanged(cwd, secrets) {
  const listed = await sh('git', ['status', '--porcelain', '-z', '--untracked-files=all'], cwd).catch(() => '');
  const parts = listed.split('\0');
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (!entry) continue;
    // A rename lists its old path next; only the new one is on disk.
    if (entry[0] === 'R' || entry[0] === 'C') i += 1;
    const p = path.join(cwd, entry.slice(3));
    try {
      const st = fs.lstatSync(p);
      if (!st.isFile() || st.size > 512 * 1024 * 1024) continue;
      const text = fs.readFileSync(p, 'latin1');
      if (!secrets.some((s) => text.includes(s))) continue;
      let out = text;
      for (const s of secrets) out = out.split(s).join(REDACTED);
      fs.writeFileSync(p, out, 'latin1');
    } catch { /* gone */ }
  }
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const within = (dir, p) => { const rel = path.relative(dir, p); return !!rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };

async function sha256OfStart(file, bytes) {
  const h = crypto.createHash('sha256');
  if (bytes > 0) for await (const chunk of fs.createReadStream(file, { start: 0, end: bytes - 1 })) h.update(chunk);
  return h.digest('hex');
}

// `from` copied into `to` by hard links where it can, leaving out `skip`.
function mirror(from, to, skip) {
  fs.mkdirSync(to, { recursive: true });
  fs.chmodSync(to, fs.statSync(from).mode & 0o7777);
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (skip.has(src)) continue;
    if (e.isDirectory()) mirror(src, dst, skip);
    else if (e.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(src), dst);
    else if (e.isFile()) { try { fs.linkSync(src, dst); } catch { fs.copyFileSync(src, dst); } }
  }
}

// THE FOLDER AS IT GOES HOME WHEN IT HOLDS A FILE THE RUN WAS GIVEN AND ONLY
// ADDED TO (a conversation): that file as what the run added, listed in TAILS
// for the Mac to add to its own copy (main/cloud/run.mjs `layTails`). Null
// when there is none; a file whose start the run changed goes whole.
async function stageTails(r, dir, staging) {
  const tails = [];
  for (const [file, was] of r.placed || []) {
    if (!within(dir, file)) continue;
    const st = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!st?.isFile() || st.size < was.size || await sha256OfStart(file, was.size) !== was.sha256) continue;
    tails.push({ file, ...was });
  }
  if (!tails.length) return null;
  fs.rmSync(staging, { recursive: true, force: true });
  mirror(dir, staging, new Set(tails.map((t) => t.file)));
  const list = [];
  for (const t of tails) {
    const rel = path.relative(dir, t.file);
    const tail = `${rel}.agentbox-tail`;
    await pipeline(fs.createReadStream(t.file, { start: t.size }), fs.createWriteStream(path.join(staging, tail)));
    list.push({ file: rel, tail, from: t.size, sha256: t.sha256 });
  }
  fs.writeFileSync(path.join(staging, TAILS), JSON.stringify(list));
  return staging;
}

// The transcripts that come home, with the login's text taken out of them.
function redactFolder(dir, secrets) {
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.isFile()) continue;
      try {
        if (fs.statSync(p).size > 512 * 1024 * 1024) continue;
        const text = fs.readFileSync(p, 'utf8');
        if (!secrets.some((s) => text.includes(s))) continue;
        let out = text;
        for (const s of secrets) out = out.split(s).join(REDACTED);
        fs.writeFileSync(p, out);
      } catch { /* unreadable: left as it is */ }
    }
  };
  walk(dir);
}

function jwtClaim(token, claim) {
  try {
    const seg = String(token).split('.')[1];
    const v = JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))[claim];
    return typeof v === 'string' ? v : null;
  } catch { return null; }
}

function jwtExpiryMs(token) {
  try {
    const seg = String(token).split('.')[1];
    const exp = JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).exp;
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch { return null; }
}

// git refuses to work in a folder another user owns ("dubious ownership"),
// and once the command has run, the task folder is the `agent` user's while
// this server, collecting it, is root. Every folder here is ours.
const TRUST_EVERY_FOLDER = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: '*' };

function sh(cmd, args, cwd, extraEnv = {}, asBuffer = false, input = undefined) {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { cwd, env: { ...process.env, ...TRUST_EVERY_FOLDER, ...extraEnv }, maxBuffer: 256 * 1024 * 1024, encoding: asBuffer ? 'buffer' : 'utf8' }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${cmd} ${args[0]}: ${String(stderr || err.message).trim().slice(0, 500)}`));
      resolve(stdout);
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

// Every file in the documents folder, by path inside it, with its size and
// modified time. Hidden names and links are left out: what goes home is what
// an agent writes for a person to read.
const DOCS_MAX_FILE = 200 * 1024 * 1024;
function scanDocs(dir) {
  const out = new Map();
  const walk = (rel) => {
    let entries = [];
    try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(r); continue; }
      if (!e.isFile() || /[\n\r]/.test(r)) continue;
      try {
        const st = fs.statSync(path.join(dir, r));
        if (st.size <= DOCS_MAX_FILE) out.set(r, `${st.size}:${st.mtimeMs}`);
      } catch { /* gone */ }
    }
  };
  walk('');
  return out;
}

async function download(fetchImpl, url, file, signal) {
  const res = await fetchImpl(url, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`fetch ${res.status} for ${redact(url)}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, body);
  return body;
}

async function upload(fetchImpl, url, body) {
  // Never an upload that hangs a session: two minutes is far past any we make.
  const res = await fetchImpl(url, { method: 'PUT', body, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`upload ${res.status} for ${redact(url)}`);
}

// A presigned URL carries a signature in its query; it never goes in a message.
function redact(url) { return String(url).split('?')[0]; }

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Started directly (the image's entrypoint), it serves AgentCore's port.
if (import.meta.url === `file://${process.argv[1]}`) {
  let runAs = null;
  const user = process.env.AGENTBOX_RUN_AS;
  if (user && process.getuid?.() === 0) {
    const id = (flag) => Number(execFileSync('id', [flag, user], { encoding: 'utf8' }).trim());
    const home = execFileSync('getent', ['passwd', user], { encoding: 'utf8' }).split(':')[5];
    runAs = { uid: id('-u'), gid: id('-g'), home, user };
  }
  const sandbox = createSandbox({ workRoot: '/var/lib/agentbox', bridgeSocket: '/tmp/agentbox-bridge.sock', rootSocket: '/run/agentbox-root.sock', runAs, log: (line) => console.error(line) });
  sandbox.listen(Number(process.env.PORT) || 8080).then((a) => console.error(`agentbox sandbox listening on ${a.port}`));
}
