#!/usr/bin/env node
// A STAND-IN FOR `codex app-server`, signed out until a login lands.
//
// Speaks the slice of the JSON-RPC the supervisor uses (main/codex-app-server.mjs):
// initialize, thread/start, thread/resume, turn/start, and the notifications a
// turn produces. Whether it is signed in is read ONCE, at startup, from
// `$CODEX_HOME/auth.json`, which is the cautious model of the real server: if
// the real one caches its login too, an app-server left running across a
// `codex login` keeps failing, and the app has to start a fresh one.
//
// A failed turn carries the words a real signed-out Codex was measured saying
// (tests/a-codex-run-that-is-signed-out-or-capped-says-which.test.mjs) and the
// schema's own `unauthorized` code.
//
// Every process start and every method is appended to `$CODEX_HOME/fake.log`,
// so a test can count app-servers and turns.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const home = process.env.CODEX_HOME || '.';
const log = (line) => { try { fs.appendFileSync(path.join(home, 'fake.log'), `${line}\n`); } catch {} };
// The app's one-line naming call (`codex exec`) is not an app-server, so it is
// not counted as one.
if (process.argv[2] === 'exec') { log('exec'); process.exit(1); }
let auth = '';
try { auth = fs.readFileSync(path.join(home, 'auth.json'), 'utf8'); } catch {}
const signedIn = auth.includes('"signed-in"');
log(`start ${signedIn ? 'signed-in' : 'signed-out'}`);

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
let n = 0;

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (typeof msg.method !== 'string') return;
  log(`method ${msg.method}`);
  if (msg.id === undefined) return; // a notification from the client, e.g. `initialized`
  const reply = (result) => send({ id: msg.id, result });

  switch (msg.method) {
    case 'initialize':
      return reply({ userAgent: 'fake-codex/0.0.0' });
    case 'config/read':
      return reply({ config: { mcp_servers: {} } });
    case 'thread/start': {
      const id = `th-${++n}`;
      // Opt in with `$CODEX_HOME/keeps-rollouts`: the file a reply needs to find to resume.
      if (fs.existsSync(path.join(home, 'keeps-rollouts'))) {
        const day = path.join(home, 'sessions', '2026', '10', '20');
        fs.mkdirSync(day, { recursive: true });
        fs.writeFileSync(path.join(day, `rollout-2026-10-20T00-00-00-${id}.jsonl`), '{}\n');
      }
      reply({ thread: { id } });
      return send({ method: 'thread/started', params: { threadId: id, thread: { id } } });
    }
    case 'thread/resume':
      // Another Codex window holding the conversation, in codex-cli 0.163.0's words.
      if (fs.existsSync(path.join(home, 'writer-held'))) {
        log('resume refused');
        return send({ id: msg.id, error: { code: -32600, message: `thread ${msg.params?.threadId} already has an active writer` } });
      }
      return reply({ thread: { id: msg.params?.threadId } });
    case 'turn/start': {
      const threadId = msg.params?.threadId;
      const turn = { id: `tu-${++n}`, status: 'inProgress', items: [] };
      reply({ turn });
      send({ method: 'turn/started', params: { threadId, turn } });
      if (signedIn) {
        log('turn ok');
        send({ method: 'item/completed', params: { threadId, item: { type: 'agentMessage', id: `it-${n}`, text: 'Done. The checkout button works now.', phase: 'final_answer' } } });
        return send({ method: 'turn/completed', params: { threadId, turn: { ...turn, status: 'completed' } } });
      }
      log('turn refused');
      return send({ method: 'turn/completed', params: { threadId, turn: { ...turn, status: 'failed', error: {
        message: 'unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses',
        codexErrorInfo: 'unauthorized',
      } } } });
    }
    default:
      return reply({});
  }
});
