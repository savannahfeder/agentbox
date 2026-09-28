import { SCHEMA_VERSION } from '../../shared/contracts.mjs';

// One-time index.json v1 -> v2: artifacts[] becomes creations[]. Pure and
// idempotent; readIndex decides whether to write the result back (it writes
// only when the returned object differs from what was read).
export function migrateIndex(idx) {
  const src = idx ?? {};
  const shaped = (src.schemaVersion === SCHEMA_VERSION && Array.isArray(src.creations))
    ? src
    : (() => {
        const { artifacts, ...rest } = src;
        return {
          ...rest,
          schemaVersion: SCHEMA_VERSION,
          creations: Array.isArray(src.creations) ? src.creations : (artifacts ?? []),
          runs: src.runs ?? [], reports: src.reports ?? [],
          updatedAt: src.updatedAt ?? null,
        };
      })();
  // Lazy cleanups ride the read path:
  // - Database/deploy summary docs written before 2026-07-11 carried a phantom
  //   kind 'doc' that was never in CREATION_KINDS; they are markdown.
  // - One creation represents the whole application (her call, 2026-07-11):
  //   legacy standalone database viewers (kind 'database') and the sibling
  //   database/deployment receipt docs tombstone away. Their files stay on
  //   disk untouched; the live views are the app creation's Data/People
  //   panes, and receipts now land INSIDE the app creation as DATABASE.md /
  //   DEPLOYMENT.md the next time provisioning or deploy runs.
  const phantom = (c) => c?.kind === 'doc';
  const standalone = (c) => !c?.deleted && (c?.kind === 'database' || c?.meta?.databaseFor != null || c?.meta?.deploymentFor != null);
  if (!shaped.creations.some((c) => phantom(c) || standalone(c))) return shaped;
  return {
    ...shaped,
    creations: shaped.creations.map((c) => {
      let next = phantom(c) ? { ...c, kind: 'markdown' } : c;
      if (standalone(next)) next = { ...next, deleted: true };
      return next;
    }),
  };
}
