// Node loads a .mts file on its own from 22.18, and so does Electron's Node 24.
// Older 22.x, which `node` on a developer's Mac can still be, loads it only
// when asked, so a helper process or thread started on one of our .mts files
// carries the flag there.
export function stripTypesFlags(features: { typescript?: unknown } = process.features as { typescript?: unknown }): string[] {
  return features.typescript ? [] : ['--experimental-strip-types', '--disable-warning=ExperimentalWarning'];
}
