#!/usr/bin/env node
// A stand-in for an agent that speaks ACP over stdio, for tests. Its messages
// are the shapes read off a running OpenCode 2.3.2 on 2026-11-22: a tool call
// arrives empty and is filled in by a later update, a permission request offers
// `once`, `always` and `reject`, and a refusal ends the turn `cancelled`.
//
// What a turn does is read off the words of its prompt:
//   FAKE:SAY <word>        answers with the word, in two pieces
//   FAKE:RUN <command>     asks before a shell command, then runs it
//   FAKE:EDIT <path>       asks before changing a file, with the change
//   FAKE:WRITE <path>      asks before making a new file, with its content
//   FAKE:HANG              starts a command and never finishes it
//   FAKE:ODD               finishes a tool call with fields of the wrong shape
//   FAKE:DIE               exits in the middle of the turn
//   FAKE:TOKENS            ends because the model ran out of room
//   FAKE:RECALL            answers with the first word this conversation was told to say
//
// FAKE_ACP_LOG names a file each request is appended to. FAKE_ACP_VERSION,
// FAKE_ACP_NO_LOAD and FAKE_ACP_SIGNED_OUT change what it answers when a
// session opens. FAKE_ACP_STATE names a file conversations are kept in, so a
// second process can carry one on. FAKE_ACP_DEAF makes it ignore a stop.
import fs from 'node:fs';

const log = (line) => { if (process.env.FAKE_ACP_LOG) fs.appendFileSync(process.env.FAKE_ACP_LOG, `${JSON.stringify(line)}\n`); };
const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
const update = (sessionId, body) => send({ method: 'session/update', params: { sessionId, update: body } });

// What it was started with, for a test of what a worker is handed.
log({ started: { args: process.argv.slice(2), env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(ZERO_|OPENCODE_)|_API_KEY$/.test(key))) } });

const stateFile = process.env.FAKE_ACP_STATE;
const state = stateFile && fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { sessions: {} };
const save = () => { if (stateFile) fs.writeFileSync(stateFile, JSON.stringify(state)); };

const MODELS = { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: 'fake/small', options: [{ value: 'fake/small', name: 'Small' }, { value: 'fake/large', name: 'Large' }] };
const OPTIONS = [{ optionId: 'once', kind: 'allow_once', name: 'Allow once' }, { optionId: 'always', kind: 'allow_always', name: 'Always allow' }, { optionId: 'reject', kind: 'reject_once', name: 'Reject' }];

let turn = null;          // { id, sessionId } of the prompt in flight
let asked = null;         // the permission request in flight: { id, then }
let nextRequest = 100;
let calls = 0;

const finish = (stopReason) => {
  if (!turn) return;
  const { id } = turn;
  turn = null;
  send({ id, result: { stopReason } });
};

const say = (sessionId, text) => {
  const messageId = `msg_${calls += 1}`;
  const half = Math.ceil(text.length / 2);
  update(sessionId, { sessionUpdate: 'agent_message_chunk', messageId, content: { type: 'text', text: text.slice(0, half) } });
  update(sessionId, { sessionUpdate: 'agent_message_chunk', messageId, content: { type: 'text', text: text.slice(half) } });
};

/** A tool call as OpenCode sends one: empty, then filled in, then asked about. */
function askThenDo(sessionId, { name, kind, title, rawInput, content, locations, after }) {
  const toolCallId = `call_${calls += 1}`;
  update(sessionId, { sessionUpdate: 'tool_call', toolCallId, name, title: name, kind, status: 'pending', locations: [], rawInput: {} });
  update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId, status: 'in_progress', kind, title, locations, rawInput });
  const id = nextRequest += 1;
  asked = {
    id,
    then(outcome) {
      asked = null;
      if (outcome?.outcome === 'selected' && outcome.optionId !== 'reject') {
        after?.();
        update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId, status: 'completed', locations, content: content ?? [{ type: 'content', content: { type: 'text', text: '(no output)' } }] });
        say(sessionId, 'done');
        finish('end_turn');
      } else {
        update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId, status: 'failed', locations });
        finish('cancelled');
      }
    },
  };
  send({ id, method: 'session/request_permission', params: { sessionId, toolCall: { toolCallId, name, title, kind, status: 'pending', locations, rawInput, ...(content ? { content } : {}) }, options: OPTIONS } });
}

function prompt(id, { sessionId, prompt: blocks }) {
  const words = (blocks ?? []).map((b) => b?.text ?? '').join('\n');
  turn = { id, sessionId };
  const session = state.sessions[sessionId] ??= {};
  const arg = (verb) => words.match(new RegExp(`FAKE:${verb} (\\S+)`))?.[1] ?? null;

  if (/FAKE:DIE\b/.test(words)) { say(sessionId, 'starting'); return setTimeout(() => process.exit(3), 20); }
  if (/FAKE:TOKENS\b/.test(words)) { say(sessionId, 'part of an answer'); return finish('max_tokens'); }
  if (/FAKE:ODD\b/.test(words)) {
    const toolCallId = `call_${calls += 1}`;
    update(sessionId, { sessionUpdate: 'tool_call', toolCallId, name: 'edit', title: 'edit', kind: 'edit', status: 'pending', locations: [], rawInput: {} });
    // Off the spec on purpose: both fields are lists everywhere else.
    update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId, status: 'completed', kind: 'edit', title: 'notes.md', locations: {}, content: 'not a list' });
    say(sessionId, 'done');
    return finish('end_turn');
  }
  if (/FAKE:HANG\b/.test(words)) {
    const toolCallId = `call_${calls += 1}`;
    update(sessionId, { sessionUpdate: 'tool_call', toolCallId, name: 'shell', title: 'shell', kind: 'execute', status: 'pending', locations: [], rawInput: {} });
    update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId, status: 'in_progress', kind: 'execute', title: 'sleep 100', rawInput: { command: 'sleep 100' } });
    return;
  }
  const command = words.match(/FAKE:RUN (.+)$/m)?.[1];
  if (command) {
    return askThenDo(sessionId, {
      name: 'shell', kind: 'execute', title: command, rawInput: { command, cwd: session.cwd }, locations: [{ path: session.cwd }],
      after: () => { const file = command.match(/> (\S+)$/)?.[1]; if (file) fs.writeFileSync(file, 'ok\n'); },
    });
  }
  const edit = arg('EDIT');
  if (edit) {
    const diff = [{ type: 'diff', path: edit, oldText: 'one\ntwo\nthree\n', newText: 'one\n2\nthree\n' }];
    return askThenDo(sessionId, { name: 'edit', kind: 'edit', title: edit, rawInput: { path: edit, oldString: 'two', newString: '2' }, locations: [{ path: edit }], content: diff });
  }
  const write = arg('WRITE');
  if (write) return askThenDo(sessionId, { name: 'write', kind: 'edit', title: write, rawInput: { path: write, content: 'new file\n' }, locations: [{ path: write }] });
  const word = arg('SAY');
  if (word) { session.word ??= word; save(); say(sessionId, word); return finish('end_turn'); }
  if (/FAKE:RECALL\b/.test(words)) { say(sessionId, session.word ?? 'I do not know'); return finish('end_turn'); }
  say(sessionId, 'ok');
  finish('end_turn');
}

function handle(message) {
  const { id, method, params } = message;
  if (id != null && method == null) {
    log({ answered: message.result?.outcome ?? null });
    if (asked?.id === id) asked.then(message.result?.outcome);
    return;
  }
  log({ method, params });
  if (method === 'initialize') {
    return send({ id, result: {
      protocolVersion: Number(process.env.FAKE_ACP_VERSION ?? 1),
      agentCapabilities: { loadSession: !process.env.FAKE_ACP_NO_LOAD, promptCapabilities: { image: true } },
      authMethods: [{ id: 'fake-login', name: 'Login with fake' }],
      agentInfo: { name: 'Fake', version: '1.0.0' },
    } });
  }
  if (method === 'session/new') {
    if (process.env.FAKE_ACP_SIGNED_OUT) return send({ id, error: { code: -32000, message: 'Authentication required' } });
    const sessionId = `ses_fake_${Object.keys(state.sessions).length + 1}`;
    state.sessions[sessionId] = { cwd: params?.cwd };
    save();
    return send({ id, result: { sessionId, configOptions: [MODELS] } });
  }
  if (method === 'session/load') {
    if (!state.sessions[params?.sessionId]) return send({ id, error: { code: -32002, message: 'Session not found' } });
    // The history comes back first, as it does from a real agent.
    say(params.sessionId, 'an answer from an earlier turn');
    return send({ id, result: { configOptions: [MODELS] } });
  }
  if (method === 'session/set_config_option') return send({ id, result: { configOptions: [{ ...MODELS, currentValue: params?.value }] } });
  if (method === 'session/prompt') return prompt(id, params);
  if (method === 'session/cancel') {
    if (process.env.FAKE_ACP_DEAF) return;
    if (asked) asked = null;
    return finish('cancelled');
  }
  if (id != null) send({ id, error: { code: -32601, message: `${method} is not supported` } });
}

let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let at;
  while ((at = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, at).trim();
    buffer = buffer.slice(at + 1);
    if (line) handle(JSON.parse(line));
  }
});
process.stdin.on('end', () => process.exit(0));
