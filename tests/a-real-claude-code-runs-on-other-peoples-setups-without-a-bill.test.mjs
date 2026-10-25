// A REAL CLAUDE CODE RUNS ON OTHER PEOPLE'S SETUPS, WITHOUT A LOGIN AND WITHOUT A BILL.
//
// Why this exists (2026-10-15): a person who was sent Agentbox could not set it
// up at all, and that was the pattern, not the exception. Sorting the past
// bugs, about 40 came from how someone's Claude Code or Codex was set up
// (logins, their own settings, hooks and connected tools, versions, folders
// shared with other tools), and the fake Macs would have caught 9 of them,
// because they only ever asked "is it found, does `--version` run?". A real
// task needed a real login, and a real login is somebody's subscription.
//
// What changed: the real Claude Code, signed out, in a home of its own, runs
// whole tasks against a stand-in model on a loopback port
// (scripts/lib/claude-stub-model.mjs). Measured on this Mac with Claude Code
// 2.1.301: the browser copy, on that home, answered a task, its worker wrote
// to the thread through the app's store tools, and a reply resumed the session
// and remembered the first turn, in about 40 s, with nothing billed. setups.mjs
// lays out homes shaped like other people's, and check-setups.mjs runs each.
//
// Those runs need a Claude Code and a browser, so they are not in this suite.
// What is here is what they stand on: the model answering the way the drives
// read it, a key in someone's settings being told apart from ours, and each
// home being laid out the way it says.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultAnswer, authOf, createClaudeStubModel, STUB_TOKEN, stubClaudeSettings } from '../scripts/lib/claude-stub-model.mjs';
import { SETUPS, layHome, layRepo, setupNamed, layCodexHome, chatgptLogin, apiKeyLogin } from '../.claude/skills/verify-agentbox/scripts/setups.mjs';
import { codexAuthOf, layeredCodexConfig, wordAnswer, offeredTools, searchedTools, createStubModel, STUB_CODEX_KEY } from '../scripts/lib/codex-stub-model.mjs';
import { layersFor } from '../.claude/skills/verify-agentbox/scripts/verify.mjs';

const user = (text) => ({ role: 'user', content: [{ type: 'text', text }] });
const said = (text) => ({ role: 'assistant', content: [{ type: 'text', text }] });

describe('the stand-in model answers the way the drives read an answer', () => {
  it('a task asking for one word gets that word, with the thread\'s token when it has one', () => {
    expect(defaultAnswer({ messages: [user('reply with exactly the word PINEAPPLE and nothing else.')] })).toBe('PINEAPPLE');
    expect(defaultAnswer({ messages: [user('Setup x: reply with exactly the word PINEAPPLE. [[tok:ab12]]')] })).toBe('PINEAPPLE [ab12]');
    expect(defaultAnswer({ messages: [user('say hello [[tok:zz]]')] })).toBe('The Claude stand-in model answered. [zz]');
  });

  it('a reply remembers the first turn only when the conversation it was sent carries it', () => {
    const resumed = { messages: [user('reply with exactly the word PINEAPPLE'), said('PINEAPPLE'), user('Which word did you just reply with? (k1)')] };
    expect(defaultAnswer(resumed)).toBe('PINEAPPLE');
    // A fresh session with only the question has nothing to remember, and must not guess.
    expect(defaultAnswer({ messages: [user('Which word did you just reply with? (k1)')] })).toBe('I do not know.');
  });

  it('what Claude Code adds to a user message is not what the person asked', () => {
    const body = { messages: [user('reply with exactly the word MANGO'), said('MANGO'), user('Which word did you just reply with?'), user('<system-reminder>reply with exactly the word WRONG</system-reminder>')] };
    expect(defaultAnswer(body)).toBe('MANGO');
  });
});

describe('a key somebody left in their settings is told apart from the stand-in token', () => {
  it('an x-api-key header is a key that would be billed', () => {
    expect(authOf({ 'x-api-key': 'sk-ant-whatever' })).toBe('api-key');
    expect(authOf({ 'x-api-key': 'sk-ant-whatever', authorization: `Bearer ${STUB_TOKEN}` })).toBe('api-key');
  });
  it('our token is ours, any other bearer is not, and nothing is nothing', () => {
    expect(authOf({ authorization: `Bearer ${STUB_TOKEN}` })).toBe('stub');
    expect(authOf({ authorization: 'Bearer some-oauth-token' })).toBe('bearer');
    expect(authOf({})).toBe('none');
  });
});

describe('the stand-in model speaks the Messages API', () => {
  let model;
  afterEach(async () => { await model?.close(); model = null; });
  const events = (text) => text.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.split('\n').find((l) => l.startsWith('data: ')).slice(6)));

  it('streams a text answer as Claude Code reads one', async () => {
    model = createClaudeStubModel({ respond: () => 'PINEAPPLE' });
    const url = await model.listen();
    const res = await fetch(`${url}/v1/messages?beta=true`, { method: 'POST', headers: { authorization: `Bearer ${STUB_TOKEN}` }, body: JSON.stringify({ stream: true, messages: [] }) });
    const ev = events(await res.text());
    expect(ev.map((e) => e.type)).toEqual(['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop']);
    expect(ev[2].delta).toEqual({ type: 'text_delta', text: 'PINEAPPLE' });
    expect(ev[4].delta.stop_reason).toBe('end_turn');
    expect(model.requests[0].auth).toBe('stub');
  });

  it('asks Claude Code to run a tool, and stops for its result', async () => {
    model = createClaudeStubModel({ respond: () => ({ toolUse: { name: 'mcp__agentbox__update_work_item', input: { id: 'w-1', note: 'hi' } } }) });
    const url = await model.listen();
    const ev = events(await (await fetch(`${url}/v1/messages`, { method: 'POST', body: JSON.stringify({ stream: true, messages: [] }) })).text());
    expect(ev[1].content_block).toMatchObject({ type: 'tool_use', name: 'mcp__agentbox__update_work_item' });
    expect(JSON.parse(ev[2].delta.partial_json)).toEqual({ id: 'w-1', note: 'hi' });
    expect(ev[4].delta.stop_reason).toBe('tool_use');
  });

  it('refuses when told to, and answers side requests without a turn', async () => {
    model = createClaudeStubModel({ respond: () => ({ status: 429, message: 'out of usage' }) });
    const url = await model.listen();
    expect((await fetch(`${url}/v1/messages`, { method: 'POST', body: '{}' })).status).toBe(429);
    expect(await (await fetch(`${url}/v1/messages/count_tokens`, { method: 'POST', body: '{}' })).json()).toEqual({ input_tokens: 1 });
  });
});

describe('each setup is laid out the way it says', () => {
  const homes = [];
  afterEach(() => { for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true }); });
  const lay = (name) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-test-'));
    homes.push(home);
    const claude = path.join(home, 'real-claude');
    fs.writeFileSync(claude, '#!/bin/sh\necho 9.9.9\n', { mode: 0o755 });
    const logins = layHome(setupNamed(name), { home, url: 'http://127.0.0.1:1', claude, version: '9.9.9' });
    return { home, claude, logins, settings: (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')) };
  };

  it('Claude Code sits where its installer puts it, and resolves to the real binary', () => {
    const { home, claude } = lay('plain');
    const link = path.join(home, '.local', 'bin', 'claude');
    expect(fs.readlinkSync(link)).toBe(path.join(home, '.local', 'share', 'claude', 'versions', '9.9.9'));
    expect(fs.realpathSync(link)).toBe(fs.realpathSync(claude));
  });

  it('every login points at the stand-in model, signed with the stand-in token, and keeps the person\'s own settings', () => {
    const { logins, settings } = lay('plan-mode-by-default');
    const s = settings(logins[0]);
    expect(s.env).toMatchObject({ ANTHROPIC_BASE_URL: 'http://127.0.0.1:1', ANTHROPIC_AUTH_TOKEN: STUB_TOKEN });
    expect(s.permissions.defaultMode).toBe('plan');
  });

  it('a key the person left in their settings stays there, because that is the setup under test', () => {
    const { logins, settings } = lay('api-key-in-settings');
    expect(settings(logins[0]).env.ANTHROPIC_API_KEY).toMatch(/^sk-ant-api03-verify/);
  });

  it('two logins are two subscriptions, not one counted twice', () => {
    const { logins } = lay('two-logins');
    expect(logins.map((d) => path.basename(d))).toEqual(['.claude', '.claude-second']);
    const ids = logins.map((d) => JSON.parse(fs.readFileSync(path.join(d, '.claude.json'), 'utf8')).oauthAccount.accountUuid);
    expect(new Set(ids).size).toBe(2);
  });

  it('a login moved by CLAUDE_CONFIG_DIR leaves no ~/.claude behind, and the shell says where it went', () => {
    const { home, logins } = lay('config-dir-from-zshrc');
    expect(logins).toEqual([path.join(home, '.config', 'claude')]);
    expect(fs.existsSync(path.join(home, '.claude'))).toBe(false);
    expect(fs.readFileSync(path.join(home, '.zshrc'), 'utf8')).toContain('CLAUDE_CONFIG_DIR');
  });

  it('connected tools of their own land in ~/.claude.json, beside the default folder, as Claude Code reads them', () => {
    const { home } = lay('own-mcp-servers');
    const json = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8'));
    expect(Object.keys(json.mcpServers)).toEqual(['gone-server', 'agentbox']);
  });

  it('a project\'s committed files are written into the project', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-repo-'));
    homes.push(repo);
    layRepo(setupNamed('api-key-in-project'), repo);
    expect(JSON.parse(fs.readFileSync(path.join(repo, '.claude', 'settings.json'), 'utf8')).env.ANTHROPIC_API_KEY).toBeTruthy();
    layRepo(setupNamed('plain'), repo);
    expect(fs.readdirSync(repo)).toEqual(['.claude']);
  });

  it('every setup says why it exists and what a person on it needs, and a known gap names one of those needs', () => {
    expect(new Set(SETUPS.map((s) => s.name)).size).toBe(SETUPS.length);
    for (const s of SETUPS) {
      expect(s.why.split(/\s+/).length, s.name).toBeGreaterThan(6);
      // A setup that must not run says what the person reads instead.
      const keys = s.expect.answers === false ? ['answers', 'billing', 'memory', 'says', 'store'] : ['answers', 'billing', 'memory', 'store'];
      expect(Object.keys(s.expect).sort(), s.name).toEqual(keys);
      if (s.expect.says) expect(s.expect.says, s.name).toBeInstanceOf(RegExp);
      expect([undefined, 'codex'], s.name).toContain(s.engine);
      for (const k of Object.keys(s.known ?? {})) expect(['answers', 'store', 'memory', 'billing', 'check', 'all'], `${s.name}.known.${k}`).toContain(k);
    }
  });

  it('the stand-in settings never carry a real key', () => {
    expect(Object.keys(stubClaudeSettings('http://x').env).filter((k) => /API_KEY/.test(k))).toEqual([]);
  });
});

// AND THE REAL CODEX (2026-10-15). Codex ran on a scripted model too, but in a
// bare CODEX_HOME the copy was handed in its config, which is not how anybody's
// copy finds theirs: that is how CODEX_HOME in .zshrc went unseen. Now a Codex
// setup is a person's own home, the stand-in is layered into their own
// config.toml and signed with their own login, and the copy finds both itself.
// Measured on codex-cli 0.160.0: a ChatGPT login signs with its JWT access
// token and an API-key login with the key, which is how the key login was
// caught billing.
describe('the Codex stand-in, and Codex homes laid out like a person\'s', () => {
  const homes = [];
  afterEach(() => { for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true }); });
  const lay = (name) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-setup-test-'));
    homes.push(home);
    const dir = layCodexHome(setupNamed(name), { home, url: 'http://127.0.0.1:1/v1' });
    const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
    return { home, dir, read };
  };

  it('tells a ChatGPT login from a key from ours, from nothing', () => {
    const jwt = chatgptLogin().tokens.access_token;
    expect(codexAuthOf({ authorization: `Bearer ${jwt}` })).toBe('chatgpt');
    expect(codexAuthOf({ authorization: `Bearer ${apiKeyLogin().OPENAI_API_KEY}` })).toBe('api-key');
    expect(codexAuthOf({ authorization: `Bearer ${STUB_CODEX_KEY}` })).toBe('stub');
    expect(codexAuthOf({ authorization: 'Bearer something-else' })).toBe('bearer');
    expect(codexAuthOf({})).toBe('none');
  });

  it('the stand-in goes over the person\'s config, keeping theirs, with its table last', () => {
    const own = 'model = "gpt-5.5"\n\n[mcp_servers.gone]\ncommand = "/nonexistent"\n';
    const out = layeredCodexConfig(own, { url: 'http://127.0.0.1:9/v1' });
    expect(out).toContain(own.trim());
    expect(out.indexOf('model_provider = "verify"')).toBeLessThan(out.indexOf('[mcp_servers.gone]'));
    expect(out.trimEnd().split('\n').slice(-5)).toEqual(['[model_providers.verify]', 'name = "verify stand-in"', 'base_url = "http://127.0.0.1:9/v1"', 'wire_api = "responses"', 'requires_openai_auth = true']);
    expect(out).toContain('chatgpt_base_url = "http://127.0.0.1:9/backend-api/"');
  });

  it('a provider the person chose is left theirs, and one named in a table is not mistaken for it', () => {
    const theirs = layeredCodexConfig('model_provider = "azure"\n', { url: 'http://x/v1' });
    expect(theirs.match(/^model_provider\s*=/gm)).toHaveLength(1);
    expect(theirs).toContain('model_provider = "azure"');
    const inTable = layeredCodexConfig('[profiles.p]\nmodel_provider = "azure"\n', { url: 'http://x/v1' });
    expect(inTable).toContain('model_provider = "verify"');
  });

  it('a ChatGPT login is a JWT with an email and a fresh refresh time, and opens nothing', () => {
    const { read } = lay('codex-plain');
    const auth = JSON.parse(read('auth.json'));
    expect(auth.auth_mode).toBe('chatgpt');
    const claims = JSON.parse(Buffer.from(auth.tokens.id_token.split('.')[1], 'base64url').toString());
    expect(claims.email).toMatch(/@verify\.invalid$/);
    expect(Date.now() - Date.parse(auth.last_refresh)).toBeLessThan(60_000);
    expect(JSON.parse(read('models_cache.json')).models.length).toBeGreaterThan(0);
  });

  it('a CODEX_HOME in .zshrc leaves no ~/.codex, and the shell says where it went', () => {
    const { home, dir } = lay('codex-home-from-zshrc');
    expect(dir).toBe(path.join(home, '.config', 'codex'));
    expect(fs.existsSync(path.join(home, '.codex'))).toBe(false);
    // .zshrc is laid with the rest of the home (layHome).
    expect(setupNamed('codex-home-from-zshrc').home['.zshrc']).toBe('export CODEX_HOME="$HOME/.config/codex"\n');
  });

  it('an API-key login holds a key that is not one', () => {
    const auth = JSON.parse(lay('codex-api-key-login').read('auth.json'));
    expect(auth).toEqual({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-verify-not-a-real-key' });
  });

  it('their own config, instructions and broken servers are all there', () => {
    const { read } = lay('codex-own-config');
    expect(read('config.toml')).toMatch(/sandbox_mode = "danger-full-access"/);
    expect(read('config.toml')).toMatch(/\[mcp_servers\.agentbox\]/);
    expect(read('AGENTS.md')).toContain('[[mark:agents-md]]');
  });

  it('the stand-in answers one word, remembers it only from what it was sent, and stays out of the way otherwise', () => {
    const msg = (role, text) => ({ type: 'message', role, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] });
    expect(wordAnswer({ input: [msg('user', 'Setup x: reply with exactly the word PINEAPPLE. [[tok:ab]]')] })).toBe('PINEAPPLE [ab]');
    expect(wordAnswer({ input: [msg('user', 'reply with exactly the word PINEAPPLE'), msg('assistant', 'PINEAPPLE'), msg('user', 'Which word did you just reply with?')] })).toBe('PINEAPPLE');
    expect(wordAnswer({ input: [msg('user', 'Which word did you just reply with?')] })).toBe('I do not know.');
    expect(wordAnswer({ input: [msg('user', 'Verify Codex [[tok:cx1]]')] })).toBe(null);
  });

  it('finds the store tool where codex 0.160 keeps it, behind tool_search', () => {
    const request = {
      tools: [{ type: 'function', name: 'exec_command' }, { type: 'tool_search', execution: 'client' }],
      input: [{ type: 'tool_search_output', tools: [{ type: 'namespace', name: 'mcp__agentbox', tools: [{ type: 'function', name: 'update_work_item' }] }] }],
    };
    expect(offeredTools(request).map((t) => t.full)).toEqual(['exec_command', 'tool_search']);
    expect(searchedTools(request)).toEqual([{ name: 'update_work_item', namespace: 'mcp__agentbox', full: 'mcp__agentbox__update_work_item' }]);
  });

  it('only a turn is a turn: codex\'s side requests get a 404 and are not counted', async () => {
    const model = createStubModel({ respond: () => [] });
    const url = await model.listen();
    try {
      expect((await fetch(`${url}/models?client_version=0.160.0`)).status).toBe(404);
      const res = await fetch(`${url}/responses`, { method: 'POST', headers: { authorization: `Bearer ${STUB_CODEX_KEY}` }, body: '{"input":[]}' });
      expect(res.status).toBe(200);
      await res.text();
      expect(model.requests.map((r) => r.auth)).toEqual(['stub']);
    } finally { await model.close(); }
  });
});

describe('the setups run before a deploy', () => {
  const run = (files, opts) => layersFor(files, opts).setups;
  it('any change a person runs gets the setups', () => {
    expect(run(['main/supervisor.mjs']).run).toBe(true);
    expect(run(['scripts/lib/claude-stub-model.mjs']).run).toBe(true);
  });
  it('a docs change does not, and --quick or --no-setups drops them and says so', () => {
    expect(run(['docs/team/PLAN.md']).run).toBe(false);
    expect(run(['main/supervisor.mjs'], { quick: true })).toEqual({ run: false, why: '--quick' });
    expect(run(['main/supervisor.mjs'], { setups: false })).toEqual({ run: false, why: '--no-setups' });
  });
});
