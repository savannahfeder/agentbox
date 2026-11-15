// Node loads a .mts file on its own from 22.18, and so does Electron's Node 24.
// Older 22.x, which `node` on a developer's Mac can still be, loads it only
// when asked, so a helper process or thread started on one of our .mts files
// carries the flag there. A process that strips types only because it was
// started with the flag reports typescript on, but its children still need it.
export function stripTypesFlags(features: { typescript?: unknown } = process.features as { typescript?: unknown }, execArgv: string[] = process.execArgv): string[] {
  const onItsOwn = features.typescript && !execArgv.includes('--experimental-strip-types');
  return onItsOwn ? [] : ['--experimental-strip-types', '--disable-warning=ExperimentalWarning'];
}
