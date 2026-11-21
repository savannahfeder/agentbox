// A relative core.hooksPath (husky's `.husky/_`, our own `scripts/hooks`) is
// resolved against the working tree git runs in. In a task folder that tree is
// what a worker or a cloud agent wrote, so a hook there is their code run as the
// app. Every git the app runs for its own bookkeeping in such a folder leads
// with these. A repository nested in that tree is theirs too, settings and all,
// so git does not read inside one: `dirty` still sees its commit move.
export const HOOK_FREE = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'diff.ignoreSubmodules=dirty'] as const;
