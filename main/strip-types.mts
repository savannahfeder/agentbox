// Node loads a .mts file on its own from 22.18, and so does Electron's Node 24.
// Older 22.x, which `node` on a developer's Mac can still be, loads it only
// when asked, so a helper process or thread started on one of our .mts files
// carries the flag there. A process that strips types only because it was
// started with the flag reports typescript on, but its children still need it.
// No Node strips a file under node_modules, so a copy npm installed hands its
// helpers the hook that does (bin/typescript-in-node-modules.mjs).
export function stripTypesFlags(features: { typescript?: unknown } = process.features as { typescript?: unknown }, execArgv: string[] = process.execArgv, here: string = import.meta.url): string[] {
  const onItsOwn = features.typescript && !execArgv.includes('--experimental-strip-types');
  const flags = onItsOwn ? [] : ['--experimental-strip-types', '--disable-warning=ExperimentalWarning'];
  return new URL(here).pathname.includes('/node_modules/')
    ? [...flags, '--import', new URL('../bin/typescript-in-node-modules.mjs', here).href]
    : flags;
}
