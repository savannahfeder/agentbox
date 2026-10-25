// HOW PEOPLE ACTUALLY SET UP CLAUDE CODE, AS HOMES THE REAL CLAUDE CODE RUNS IN.
//
// machines.mjs asks whether the app FINDS Claude Code and Codex on a Mac unlike
// this one. This file asks the next question, the one most bug reports were
// really about: once found, does a whole task run, answer, write to the store
// and remember the thread, when the person's own Claude Code is configured the
// way theirs is? Their hooks, their connected tools, their permission mode,
// their API key in a settings file, a second login, transcripts turned off.
//
// Each setup is a home folder laid out for real: Claude Code's own installer
// layout pointing at the real binary on this Mac, the person's settings, and
// the project's committed .claude files. The app is the browser copy
// (live.mjs up --setup <name>), so every part of Agentbox is real; the only
// stand-in is the model (stub-claude-server.mjs), which is why it is free.
//
// To add one: an entry in SETUPS with
//   why     the bug class, in a sentence, and where it came from if it did
//   login   the folders that hold a login (default ['.claude'])
//   settings(ctx)  the person's ~/.claude/settings.json (the model's address is added on top)
//   userJson       extra keys for ~/.claude.json (user-scope MCP servers live there)
//   home           { 'relative/path': contents } anything else in their home
//   repo           { 'relative/path': contents } committed in the project
//   expect  what a person on that setup needs, NOT what the code does today:
//           answers, store (the worker's note reaches the thread), memory (a
//           reply remembers the first turn), billing ('subscription' unless the
//           person really meant otherwise)
//           says    (optional) for a setup that must NOT run: the plain sentence,
//                   as a pattern, the person reads on the thread instead
//   known   { <expectation>: 'why it fails today, and the thread it is filed on' },
//           or { all: ... } when the setup cannot run a task at all
//   check(home, { codexLog }) extra claims about this setup: [{ ok, sentence, evidence }]
//
// A CODEX SETUP has `engine: 'codex'`, and the task is sent to Codex from the
// composer. Its `codex` field is the person's Codex home:
//   dir     where it is, relative to their home (default '.codex')
//   login   'chatgpt' (a ChatGPT plan), 'apikey' (an API key), or null (signed out)
//   config(ctx)  the person's own config.toml, as text (the stand-in is layered over it)
//   files   { 'name': contents } anything else in that folder (AGENTS.md)
// The real `codex` on this Mac runs it; the stand-in model is
// stub-codex-server.mjs, signed with the person's own login, so a check reads
// off each request whether a plan or a key would have paid.
//
// A bug report that turns out to be about someone's Claude Code or Codex setup
// should become a setup here before it is fixed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { stubClaudeSettings } = await import(path.join(REPO, 'scripts/lib/claude-stub-model.mjs'));
const { layeredCodexConfig } = await import(path.join(REPO, 'scripts/lib/codex-stub-model.mjs'));

const HOOK_LOG = '.hook-ran.log';
/** A hook command that leaves a mark in the home, so a check knows the person's hook really ran. */
const mark = (home, event) => `echo ${event} >> '${path.join(home, HOOK_LOG)}'`;
const hooksRan = (home) => { try { return fs.readFileSync(path.join(home, HOOK_LOG), 'utf8').split('\n').filter(Boolean); } catch { return []; } };

const NORMAL = { answers: true, store: true, memory: true, billing: 'subscription' };

export const SETUPS = [
  {
    name: 'plain',
    why: 'the installer\'s layout and nothing else: the baseline every other setup is read against',
    expect: NORMAL,
  },
  {
    name: 'two-logins',
    why: 'two subscriptions in ~/.claude and ~/.claude-second: a reply has to go back to the login whose folder holds the session (12 past bugs were accounts and logins)',
    login: ['.claude', '.claude-second'],
    expect: NORMAL,
  },
  {
    name: 'own-hooks',
    why: 'people run hooks on every event (formatters, loggers, notifiers, context injectors); a worker inherits all of them',
    settings: ({ home }) => ({
      hooks: Object.fromEntries(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'Notification', 'SessionEnd']
        .map((ev) => [ev, [{ matcher: '*', hooks: [{ type: 'command', command: ev === 'UserPromptSubmit' || ev === 'SessionStart'
          // A hook that prints is added to the conversation: a lot of it, as a context injector does.
          ? `${mark(home, ev)}; printf 'Project rules from my hook: %.0s' $(seq 1 200)`
          : mark(home, ev) }] }]])),
    }),
    expect: NORMAL,
    check: (home) => {
      const ran = new Set(hooksRan(home));
      const want = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'Stop'];
      return [{ ok: want.every((e) => ran.has(e)), sentence: 'the person\'s own hooks really ran in the worker', evidence: [...ran].join(' ') || 'none ran' }];
    },
  },
  {
    name: 'broken-hooks',
    why: 'a hook whose script was moved, one that exits 1, and one that times out: Claude Code keeps going, and so must the task',
    settings: () => ({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: '/nonexistent/hook.sh' }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo "lint failed" >&2; exit 1' }] }],
        PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'sleep 30', timeout: 2 }] }],
      },
    }),
    expect: NORMAL,
  },
  {
    name: 'own-mcp-servers',
    why: 'connected tools of their own: one whose command is gone, one already called "agentbox" (the name the app gives its store), and a project .mcp.json with every project server switched on',
    userJson: () => ({
      mcpServers: {
        'gone-server': { type: 'stdio', command: '/nonexistent/mcp-server', args: [] },
        agentbox: { type: 'stdio', command: '/nonexistent/old-agentbox-mcp', args: [] },
      },
    }),
    settings: () => ({ enableAllProjectMcpServers: true }),
    repo: { '.mcp.json': `${JSON.stringify({ mcpServers: { 'project-tool': { command: 'node', args: ['-e', 'setTimeout(()=>{},60000)'] } } }, null, 1)}\n` },
    expect: NORMAL,
  },
  {
    name: 'plan-mode-by-default',
    why: 'defaultMode "plan" in their settings, which some people set so Claude Code never edits without asking',
    settings: () => ({ permissions: { defaultMode: 'plan' } }),
    expect: NORMAL,
  },
  {
    name: 'strict-permissions',
    why: 'a tight allow-and-deny list of their own, with every MCP tool and the web denied',
    settings: () => ({ permissions: { allow: ['Read', 'Grep', 'Glob'], deny: ['WebFetch', 'WebSearch', 'Bash(curl:*)', 'mcp__gone-server'] } }),
    expect: NORMAL,
  },
  {
    name: 'api-key-in-settings',
    why: 'an API key left in ~/.claude/settings.json from an old project: Claude Code uses it, so a worker would bill that key instead of the person\'s plan',
    settings: () => ({ env: { ANTHROPIC_API_KEY: 'sk-ant-api03-verify-not-a-real-key' } }), // public-check: allow
    expect: NORMAL,
    // Claude Code reads this one out of the settings file itself, past the
    // environment scrub. Found by this setup on its first run and fixed by the
    // blank in every worker's --settings (NO_METERED_KEY, main/harnesses/claude.mjs).
  },
  {
    name: 'api-key-in-project',
    why: 'the same key committed in the project\'s .claude/settings.json, which a teammate never chose (an open problem found in past tasks)',
    repo: { '.claude/settings.json': `${JSON.stringify({ env: { ANTHROPIC_API_KEY: 'sk-ant-api03-verify-not-a-real-key' } }, null, 1)}\n` }, // public-check: allow
    expect: NORMAL,
  },
  // NOT A SETUP: a settings file Claude Code rejects. Measured 2026-10-15 on
  // 2.1.301, `cleanupPeriodDays: 0` fails validation and Claude Code drops the
  // whole file, which here takes the stand-in model's address with it, so the
  // run reads as "could not sign in". On a real Mac the login is in the
  // keychain and the task would run with the person's settings silently off.
  // The stand-in cannot tell those apart, so it is left out rather than faked.
  {
    name: 'heavy-instructions',
    why: 'a long personal CLAUDE.md, an output style, a status line and a model of their own',
    settings: () => ({ outputStyle: 'Explanatory', model: 'opus', statusLine: { type: 'command', command: 'echo my-status' }, includeCoAuthoredBy: false }),
    home: { '.claude/CLAUDE.md': `# My rules\n\n${'- Always explain your reasoning in detail before acting.\n'.repeat(2000)}` },
    repo: { 'CLAUDE.md': '# Project rules\n\nRun the tests before you answer.\n' },
    expect: NORMAL,
  },
  {
    name: 'config-dir-from-zshrc',
    why: 'CLAUDE_CONFIG_DIR exported in .zshrc, so the only login is in ~/.config/claude and there is no ~/.claude at all',
    login: ['.config/claude'],
    home: { '.zshrc': 'export CLAUDE_CONFIG_DIR="$HOME/.config/claude"\n' },
    expect: NORMAL,
    // Found by this setup on its first run: workers ran on an empty ~/.claude.
    // Fixed in main/account-discovery.mjs (effectiveProfiles reads the shell's folder).
  },

  // ----------------------------------------------------------------- Codex --
  {
    name: 'codex-plain',
    engine: 'codex',
    why: 'Codex signed in with ChatGPT in ~/.codex and nothing else: the baseline every other Codex setup is read against',
    codex: { login: 'chatgpt' },
    expect: NORMAL,
  },
  {
    name: 'codex-home-from-zshrc',
    engine: 'codex',
    why: 'CODEX_HOME exported in .zshrc, so the only Codex login is in ~/.config/codex and there is no ~/.codex at all (workers ran signed out on ~/.codex until w-6d8c543a43)',
    codex: { dir: '.config/codex', login: 'chatgpt' },
    home: { '.zshrc': 'export CODEX_HOME="$HOME/.config/codex"\n' },
    expect: NORMAL,
    check: (home) => [{
      ok: rollouts(path.join(home, '.config', 'codex')).length > 0 && !fs.existsSync(path.join(home, '.codex', 'sessions')),
      sentence: 'the worker\'s session was written in the folder .zshrc names, not in ~/.codex',
      evidence: `${rollouts(path.join(home, '.config', 'codex')).length} in ~/.config/codex, ${rollouts(path.join(home, '.codex')).length} in ~/.codex`,
    }],
  },
  {
    name: 'codex-api-key-login',
    engine: 'codex',
    why: 'Codex signed in with an API key (`codex login --with-api-key`, auth.json auth_mode "apikey"): every call is metered to whoever owns the key, not a ChatGPT plan',
    codex: { login: 'apikey' },
    // The app's rule is that workers run on a subscription and never a key, and
    // there is no plan in this home to fall back on, so the person needs to be
    // told, on the thread, to sign Codex in with ChatGPT.
    expect: { answers: false, store: false, memory: false, billing: 'subscription', says: /API key[\s\S]*codex login/i },
  },
  {
    name: 'codex-own-config',
    engine: 'codex',
    why: 'a config.toml of their own: their own model and a profile, approval_policy "never" and danger-full-access, a notify script, an MCP server whose command is gone, one already called "agentbox", and a long ~/.codex/AGENTS.md',
    codex: {
      login: 'chatgpt',
      // No `profile = "work"` line: codex 0.160 refuses to start on one (the
      // codex-legacy-profile setup below).
      config: ({ home }) => [
        'model = "gpt-5.5"',
        'approval_policy = "never"',
        'sandbox_mode = "danger-full-access"',
        `notify = ["/bin/sh", "-c", "echo notify >> '${path.join(home, NOTIFY_LOG)}'"]`,
        '',
        '[profiles.work]',
        'model = "gpt-5.5"',
        'model_reasoning_effort = "high"',
        '',
        '[mcp_servers.gone]',
        'command = "/nonexistent/mcp-server"',
        '',
        '[mcp_servers.agentbox]',
        'command = "/nonexistent/old-agentbox-mcp"',
        '',
      ].join('\n'),
      files: { 'AGENTS.md': `# My rules [[mark:agents-md]]\n\n${'- Always explain your reasoning in detail before acting.\n'.repeat(400)}` },
    },
    expect: NORMAL,
    check: (home, { codexLog = [] } = {}) => {
      const asked = codexLog.filter((e) => e.item);
      const policies = rollouts(path.join(home, '.codex')).flatMap(turnContexts);
      // The approval reviewer runs read-only with no approvals of its own,
      // which is safe; danger-full-access, or never asking outside read-only, is theirs leaking in.
      const wide = policies.filter((p) => /danger/i.test(p.sandbox) || (p.approval === 'never' && !/read-only/.test(p.sandbox)));
      return [
        { ok: asked.some((e) => e.marks?.includes('agents-md')), sentence: 'their ~/.codex/AGENTS.md reached the worker, as it reaches their terminal\'s Codex', evidence: `${asked.length} task request(s)` },
        { ok: policies.length > 0 && !wide.length, sentence: 'the worker ran in the app\'s sandbox, not their danger-full-access with no approvals',
          evidence: policies.map((p) => `${p.sandbox}/${p.approval}`).join(', ') || 'no turn recorded' },
      ];
    },
  },
  {
    name: 'codex-invalid-config',
    engine: 'codex',
    why: 'a config.toml with a TOML mistake in it (a quote left open), which their terminal\'s codex refuses to start on',
    codex: { login: 'chatgpt', config: () => 'model = "gpt-5.5\napproval_policy = "on-request"\n' },
    // Nothing can run, and the person has to be told which file and what is
    // wrong in it, on the thread, not left with a task that never starts.
    expect: { answers: false, store: false, memory: false, billing: 'subscription', says: /config\.toml/ },
  },
  {
    name: 'codex-legacy-profile',
    engine: 'codex',
    why: 'a `profile = "work"` line older Codex read as the default profile, which codex 0.160 refuses to start on at all (found by codex-own-config on its first run, 2026-10-15)',
    codex: { login: 'chatgpt', config: () => 'profile = "work"\n\n[profiles.work]\nmodel = "gpt-5.5"\n' },
    expect: { answers: false, store: false, memory: false, billing: 'subscription', says: /config\.toml/ },
  },
  // NOT A SETUP YET: an older or newer codex. Setups run the one codex this Mac
  // has (0.160.0 on 2026-10-15); the machines layer covers finding the others.
];

const NOTIFY_LOG = '.notify-ran.log';

/** Every Codex rollout under one home, newest last. */
function rollouts(dir) {
  const out = [];
  const walk = (d) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/^rollout-.*\.jsonl$/.test(e.name)) out.push(p); } };
  walk(path.join(dir, 'sessions'));
  return out.sort();
}
/** The sandbox and approval policy each turn of one rollout really ran with. */
function turnContexts(file) {
  let lines = [];
  try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch { return []; }
  return lines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e) => e?.type === 'turn_context')
    .map((e) => ({ sandbox: e.payload?.sandbox_policy?.type ?? e.payload?.sandbox_policy?.mode ?? JSON.stringify(e.payload?.sandbox_policy ?? null), approval: e.payload?.approval_policy ?? null }));
}

/**
 * A ChatGPT login the way `codex login` writes one, with tokens that open
 * nothing. Codex reads the id_token for the email and plan without checking
 * its signature, and refreshes only a login older than a few days, so a fresh
 * `last_refresh` keeps it from asking OpenAI for a new one.
 */
export function chatgptLogin(i = 1, now = Date.now()) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (claims) => `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}.dmVyaWZ5LW5vdC1zaWduZWQ`;
  const exp = Math.floor(now / 1000) + 30 * 86400;
  const account = `verify-codex-account-${i}`;
  const auth = { chatgpt_plan_type: 'plus', chatgpt_account_id: account };
  return {
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens: {
      id_token: jwt({ email: `codex-${i}@verify.invalid`, exp, 'https://api.openai.com/auth': auth }),
      access_token: jwt({ exp, 'https://api.openai.com/auth': auth }),
      refresh_token: 'verify-not-a-refresh-token',
      account_id: account,
    },
    last_refresh: new Date(now).toISOString(),
  };
}
/** A models_cache.json of the shape codex keeps, with two made-up models the stand-in answers as. */
function modelsCache(now = Date.now()) {
  const levels = ['low', 'medium', 'high'].map((effort) => ({ effort, description: `${effort} effort` }));
  const model = (slug, priority) => ({ slug, display_name: slug, description: 'the verify stand-in', visibility: 'list', priority, default_reasoning_level: 'medium', supported_reasoning_levels: levels });
  return { fetched_at: new Date(now).toISOString(), client_version: 'verify', models: [model('gpt-5.5', 1), model('gpt-5.5-mini', 2)] };
}

/** An API-key login, as `codex login --with-api-key` writes it. The key is not one. */
export const apiKeyLogin = () => ({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-verify-not-a-real-key' });

/**
 * LAY A PERSON'S CODEX HOME OUT, with the stand-in at `url` layered into their
 * own config.toml. Returns the folder.
 */
export function layCodexHome(setup, { home, url }) {
  const spec = setup.codex ?? {};
  const dir = path.join(home, spec.dir ?? '.codex');
  fs.mkdirSync(dir, { recursive: true });
  const login = spec.login === 'chatgpt' ? chatgptLogin() : spec.login === 'apikey' ? apiKeyLogin() : null;
  if (login) fs.writeFileSync(path.join(dir, 'auth.json'), `${JSON.stringify(login, null, 2)}\n`, { mode: 0o600 });
  // The model list a signed-in codex keeps beside its login, which is where
  // the app's picker reads Codex's models from (main/codex-models.mjs). The
  // stand-in has no catalog to serve, so without this file the composer had
  // no Codex column at all, on a home where Settings said Codex was signed in.
  if (login) fs.writeFileSync(path.join(dir, 'models_cache.json'), `${JSON.stringify(modelsCache(), null, 1)}\n`);
  fs.writeFileSync(path.join(dir, 'config.toml'), layeredCodexConfig(spec.config?.({ home }) ?? '', { url }));
  for (const [rel, text] of Object.entries(spec.files ?? {})) fs.writeFileSync(path.join(dir, rel), text);
  return dir;
}

/** The fake accounts each login holds, so main/account-discovery.mjs sees two subscriptions, not one. */
const account = (i) => ({ oauthAccount: { emailAddress: `setup-${i}@verify.invalid`, accountUuid: `verify-setup-account-${i}` } });

/**
 * LAY A PERSON'S HOME OUT. `claude` is the real binary on this Mac; it is
 * linked in where Claude Code's own installer puts it, so the app finds it
 * the way it would on their Mac. `url` is the stand-in model. Returns the
 * login folders, absolute.
 */
export function layHome(setup, { home, url, claude, version = 'verify' }) {
  const write = (rel, text) => { const f = path.join(home, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  const ctx = { home };
  // The installer: ~/.local/bin/claude -> ~/.local/share/claude/versions/<v>.
  const store = path.join(home, '.local', 'share', 'claude', 'versions');
  fs.mkdirSync(store, { recursive: true });
  fs.mkdirSync(path.join(home, '.local', 'bin'), { recursive: true });
  fs.symlinkSync(claude, path.join(store, version));
  fs.symlinkSync(path.join(store, version), path.join(home, '.local', 'bin', 'claude'));

  const logins = (setup.login ?? ['.claude']).map((d) => path.join(home, d));
  const own = setup.settings?.(ctx) ?? {};
  const userJson = setup.userJson?.(ctx) ?? {};
  logins.forEach((dir, i) => {
    fs.mkdirSync(dir, { recursive: true });
    const settings = { ...own, env: { ...(own.env ?? {}), ANTHROPIC_BASE_URL: url, ...stubClaudeSettings(url).env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } };
    fs.writeFileSync(path.join(dir, 'settings.json'), `${JSON.stringify(settings, null, 1)}\n`);
    const json = { ...account(i + 1), hasCompletedOnboarding: true, ...userJson };
    fs.writeFileSync(path.join(dir, '.claude.json'), `${JSON.stringify(json, null, 1)}\n`);
    // With no CLAUDE_CONFIG_DIR, Claude Code reads ~/.claude.json beside the folder.
    if (dir === path.join(home, '.claude')) fs.writeFileSync(path.join(home, '.claude.json'), `${JSON.stringify(json, null, 1)}\n`);
  });
  for (const [rel, text] of Object.entries(setup.home ?? {})) write(rel, text);
  return logins;
}

/** The project's committed files for this setup, written before the seed commit. */
export function layRepo(setup, repo) {
  for (const [rel, text] of Object.entries(setup.repo ?? {})) {
    const f = path.join(repo, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
}

export const setupNamed = (name) => SETUPS.find((s) => s.name === name) ?? null;
