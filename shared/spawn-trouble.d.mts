// Types for shared/spawn-trouble.mjs, which is plain ESM so that the
// supervisor (Node) and the renderer (Vite) share one copy of every sentence
// this app is allowed to say about a task that could not run.
//
// Only what the renderer imports is declared. The rest of the module is read by
// main and by the tests, which are both plain JS and need nothing here.

export function strandedTitle(count: number): string;
