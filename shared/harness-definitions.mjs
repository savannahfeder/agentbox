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
]);
export function harnessDefinition(id = 'claude') {
  return HARNESS_DEFINITIONS.find(h => h.id === id) ?? null;
}
