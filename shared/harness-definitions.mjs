// Names, flags, paths, and capabilities are data. This file is safe for the
// renderer: it imports no processes, credentials, filesystem, or transports.
const freeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
export const HARNESS_DEFINITIONS = freeze([
  {
    id: 'claude', label: 'Claude Code', word: 'Claude Code', binKey: 'claudeBin',
    homeEnv: 'CLAUDE_CONFIG_DIR', accountPrefix: '', package: '@anthropic-ai/claude-code',
    commandMenu: 'claude', commandRoute: 'claude',
    casks: ['claude-code', 'claude-code@latest'],
    installer: { shell: '/bin/bash', url: 'https://claude.ai/install.sh', pipe: 'bash' },
    loginArgs: ['auth', 'login', '--claudeai'], statusArgs: ['auth', 'status', '--json'],
    credentialFiles: ['.claude.json', '.credentials.json'],
    // THE OLDEST CLAUDE CODE THE WORKER LINE BELOW RUNS ON. Measured 2026-10-15
    // by running the app's own line against npm releases on a stand-in model:
    // 2.1.71 (2026-03-06) is the first that takes `--permission-mode auto`,
    // which every worker is started with; 2.1.70 and older die in under a
    // second on it. Every other flag is older still (`--effort` arrived after
    // 2.1.8, `--include-partial-messages` after 1.0.90). shared/spawn-trouble.mjs
    // names it when an older one refuses the line.
    minVersion: '2.1.71',
    // HOW A WORKER IS STARTED, AS DATA. This was six hardcoded flag names in
    // main/supervisor.mjs, which made the cheapest possible new engine — one
    // that speaks this same stream-json and differs by a binary and the
    // `outputFormat` value, as Grok Build does in
    // github.com/savannahfeder/agentbox/issues/21 — a supervisor edit. A key
    // left out here means this engine does not take that flag, and the builder
    // leaves it off the line rather than the call site asking who it is.
    run: {
      print: '-p',
      outputFormat: { flag: '--output-format', value: 'stream-json' },
      stream: ['--verbose', '--include-partial-messages'],
      effort: '--effort',
      system: '--append-system-prompt',
      resume: '--resume',
      fork: '--fork-session',
      // Replies arrive on stdin, so the prompt leaves the line when they do.
      input: ['--input-format', 'stream-json', '--replay-user-messages'],
    },
    scrubPatterns: ['^ANTHROPIC_', '^CLAUDE_CODE_', '^CLAUDECODE$', '^CLAUDE_PID$', '^CLAUDE_EFFORT$', '^CLAUDE_CONFIG_DIR$'],
    capabilities: { nativeCommands: true, fork: true, nativeReview: false, remoteControl: true, inlineImages: false, claudeEffort: true },
    imageInstruction: 'Open each one with the Read tool, at the absolute path below.',
  },
  {
    id: 'codex', label: 'Codex', word: 'Codex', binKey: 'codexBin',
    homeEnv: 'CODEX_HOME', accountPrefix: 'codex:', package: '@openai/codex', casks: ['codex'],
    commandMenu: 'codex', commandRoute: 'codex',
    installer: { shell: '/bin/sh', url: 'https://chatgpt.com/codex/install.sh', pipe: 'sh' },
    loginArgs: ['login'], statusArgs: ['login', 'status'], credentialFiles: ['auth.json'],
    // NO `run`, AND THAT IS THE POINT OF THE SHAPE. Codex is driven over its
    // app-server RPC: the prompt is a turn's `input`, the system block a
    // thread's `developerInstructions`, the resume a thread id. An engine with
    // no command line is handed none rather than handed Claude Code's.
    scrubPatterns: ['^ANTHROPIC_', '^CLAUDE_CODE_', '^CLAUDECODE$', '^CLAUDE_PID$', '^CLAUDE_EFFORT$', '^CLAUDE_CONFIG_DIR$', '^OPENAI_', '^CODEX_'],
    capabilities: { nativeCommands: false, fork: false, nativeReview: true, remoteControl: false, inlineImages: true, claudeEffort: false },
    imageInstruction: 'Each one is attached to this message as an image, and is also on disk at the absolute path below.',
  },
  {
    // OPENCODE, AND IT IS NOT OFFERED TO ANYBODY YET -- see `admitted` below.
    //
    // THE ONE THING THAT MAKES IT DIFFERENT FROM THE OTHER TWO: it needs no
    // sign-in at all. Measured on a real OpenCode 1.18.35 on 2026-10-07 with
    // `auth.json` holding zero credentials, `opencode models` still listed ten
    // models and a run on one of them finished and reported `"cost":0`. They
    // are the OpenCode Zen free tier. So this is the first harness where the
    // first run costs nothing and asks for nothing, which is also why
    // `signIn` below is a real command rather than a requirement.
    //
    // ITS CREDENTIAL STORE IS ITS OWN AND AGENTBOX NEVER TOUCHES IT. Keys go
    // into ~/.local/share/opencode/auth.json by `opencode auth login`, which
    // is the same shape as `claude auth login` and `codex login` above. The
    // scrub list is therefore WIDER than the other two: it takes out every
    // provider key OpenCode could otherwise read out of our environment,
    // because CLAUDE.md says no API key goes into a worker, and OpenCode is
    // the one tool here that would happily use one if it found it.
    id: 'opencode', label: 'OpenCode', word: 'OpenCode', binKey: 'opencodeBin',
    homeEnv: 'OPENCODE_CONFIG', accountPrefix: 'opencode:', package: 'opencode-ai',
    commandMenu: 'opencode', commandRoute: 'opencode',
    casks: ['opencode', 'sst/tap/opencode'],
    installer: { shell: '/bin/bash', url: 'https://opencode.ai/install', pipe: 'bash' },
    loginArgs: ['auth', 'login'], statusArgs: ['auth', 'list'],
    credentialFiles: ['auth.json'],
    scrubPatterns: [
      '^ANTHROPIC_', '^CLAUDE_CODE_', '^CLAUDECODE$', '^CLAUDE_PID$', '^CLAUDE_EFFORT$', '^CLAUDE_CONFIG_DIR$',
      '^OPENAI_', '^CODEX_', '^OPENCODE_', '^OPENROUTER_', '^GEMINI_', '^GOOGLE_',
      '^AWS_', '^AZURE_', '^GROQ_', '^MISTRAL_', '^DEEPSEEK_', '^XAI_', '^CEREBRAS_',
      '^TOGETHER_', '^FIREWORKS_', '^DEEPINFRA_', '^BASETEN_', '^NVIDIA_', '^GITLAB_TOKEN$',
      '_API_KEY$', '_ACCESS_TOKEN$',
    ],
    // NO USAGE AND NO PLAN. There is no endpoint on the server and no command
    // on the CLI that reports what is left of anything, because OpenCode bills
    // through whichever provider the user connected and does not know. Per-run
    // tokens and cost DO arrive (`step-finish`), and the adapter reports those;
    // a plan limit is declared missing rather than faked as zero.
    capabilities: { nativeCommands: true, fork: true, nativeReview: false, remoteControl: false, inlineImages: false, claudeEffort: false, planLimits: false },
    imageInstruction: 'Open each one with the read tool, at the absolute path below.',
    // ADMISSION IS A SEPARATE DECISION FROM INTEGRATION, and it is not ours.
    // docs/harnesses.md: "A provider is not offered until that path works", and
    // "a new provider's networking or permission scope requires the
    // corresponding product policy review before admission." The transport is
    // verified (see main/opencode-server.mjs for what was measured and how);
    // whether OpenCode appears in the picker is a product call, so this stays
    // false until somebody turns it on deliberately.
    admitted: false,
  },
]);
export function harnessDefinition(id = 'claude') {
  return HARNESS_DEFINITIONS.find(h => h.id === id) ?? null;
}
