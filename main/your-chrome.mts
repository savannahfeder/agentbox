// Whether a Claude Code agent on this computer may use the person's own Chrome,
// the one signed into everything they hold. Off until they turn it on in
// Settings; this is the only file that may put `--chrome` on a worker's line
// (tests/no-worker-drives-her-own-browser.test.mts).

export interface YourChromeConfig { agentsUseYourChrome?: unknown }

// Claude Code reads the last mode it is given, and a run that skips permissions
// also skips Chrome's own per-site asks.
function skipsPermissions(args: readonly string[]) {
  let mode: string | null = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dangerously-skip-permissions') return true;
    if (arg === '--permission-mode') mode = args[i + 1] ?? null;
    else if (arg.startsWith('--permission-mode=')) mode = arg.slice('--permission-mode='.length);
  }
  return mode === 'bypassPermissions';
}

export function yourChromeArgs(config: YourChromeConfig | null | undefined, args: readonly string[]): string[] {
  if (config?.agentsUseYourChrome !== true) return [];
  if (skipsPermissions(args)) return [];
  return ['--chrome'];
}
