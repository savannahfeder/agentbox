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
  {
    // GROK BUILD, AND NOT OFFERED YET -- the same `admitted: false` as OpenCode,
    // for the same reason: offering a provider is a product decision.
    //
    // ITS HEADLESS STREAM IS CLAUDE CODE'S. Measured on grok 1.0.46,
    // `grok -p --output-format streaming-messages-json` prints the same
    // system/assistant/user/result lines Claude Code's stream-json does, so the
    // adapter reads it with Claude Code's readers and only the command line
    // differs (main/grok.mjs says which flags it takes, refuses and renames).
    //
    // IT SIGNS IN WITH ITS OWN grok.com LOGIN, kept in its own ~/.grok. An
    // inherited xAI key would move a run onto metered billing, so the scrub
    // takes those out along with Anthropic's.
    id: 'grok', label: 'Grok Build', word: 'Grok Build', binKey: 'grokBin',
    homeEnv: null, accountPrefix: 'grok:', package: null, casks: [],
    commandMenu: 'local', commandRoute: 'local',
    installer: null, loginArgs: [], statusArgs: [], credentialFiles: [],
    scrubPatterns: ['^ANTHROPIC_', '^CLAUDE_CODE_', '^CLAUDECODE$', '^CLAUDE_PID$', '^CLAUDE_EFFORT$', '^CLAUDE_CONFIG_DIR$', '^XAI_', '^GROK_API_KEY$'],
    // No stream-json input (a reply waits for the run to end and resumes it),
    // no fork, no plan-limit endpoint. Its slash words (`/skill-name`) are read
    // from the message text and never advertised, so they are passed through.
    capabilities: { nativeCommands: false, fork: false, nativeReview: false, remoteControl: false, inlineImages: false, claudeEffort: false, planLimits: false, forwardsUnknownCommands: true },
    imageInstruction: 'Open each one with the read tool, at the absolute path below.',
    admitted: false,
  },
  {
    // PI, AND NOT OFFERED YET either. pi prints its own JSON events
    // (`pi -p --mode json`); the adapter rewrites each into the Claude Code line
    // that means the same as it arrives (main/pi.mjs), so the readers are
    // Claude Code's again.
    //
    // pi CAN READ A PROVIDER KEY OUT OF ITS ENVIRONMENT, like OpenCode, so the
    // scrub is as wide as OpenCode's: no key Agentbox inherited reaches it, and
    // pi bills through whatever the person logged it in to (~/.pi/agent).
    id: 'pi', label: 'pi', word: 'pi', binKey: 'piBin',
    homeEnv: null, accountPrefix: 'pi:', package: '@earendil-works/pi-coding-agent', casks: [],
    commandMenu: 'local', commandRoute: 'local',
    installer: null, loginArgs: [], statusArgs: [], credentialFiles: [],
    scrubPatterns: [
      '^ANTHROPIC_', '^CLAUDE_CODE_', '^CLAUDECODE$', '^CLAUDE_PID$', '^CLAUDE_EFFORT$', '^CLAUDE_CONFIG_DIR$',
      '^OPENAI_', '^CODEX_', '^OPENROUTER_', '^GEMINI_', '^GOOGLE_',
      '^AWS_', '^AZURE_', '^GROQ_', '^MISTRAL_', '^DEEPSEEK_', '^XAI_', '^CEREBRAS_',
      '^TOGETHER_', '^FIREWORKS_', '^DEEPINFRA_', '^NVIDIA_',
      '_API_KEY$', '_ACCESS_TOKEN$',
    ],
    // pi reads `/skill:name` from the message text, so unknown slash words go
    // to it as typed.
    capabilities: { nativeCommands: false, fork: false, nativeReview: false, remoteControl: false, inlineImages: false, claudeEffort: false, planLimits: false, forwardsUnknownCommands: true },
    imageInstruction: 'Open each one with the read tool, at the absolute path below.',
    admitted: false,
  },
]);
export function harnessDefinition(id = 'claude') {
  return HARNESS_DEFINITIONS.find(h => h.id === id) ?? null;
}
