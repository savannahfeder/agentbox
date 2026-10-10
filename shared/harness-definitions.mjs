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
