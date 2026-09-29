// main/store/queues.mjs
//
// SCOPE, since this is now half of the answer rather than all of it: this queue
// orders work WITHIN one process. Cross-PROCESS safety (the MCP server in mcp/
// runs many concurrent children against the same project directory) is handled
// where the shared mutable state actually is, not here:
//
//   index.json      updateIndex takes a cross-process file lock directly
// (main/store/project-lock.mjs)
//   work items      append-only jsonl, folded newest-wins, so there is no
// read-modify-write to lose (main/store/work-items.mjs)
//
// Deliberately NOT wrapped around this queue: several bodies below are git
// pushes and other network calls, and a cross-process lock held across a slow
// push would be broken as stale mid-flight, which is worse than not holding one.
//
// One shared per-project write queue for the whole main process. Catalog
// mutations (index.json read-modify-write) and git-spine ops (commit/restore/
// push) on the same project must never interleave across concurrent tool
// calls or IPC handlers, so every caller that touches a project's catalog or
// a creation's git repo routes through runForProject(project.id, fn) instead
// of building its own queue. Keyed by project id (makeWriteQueue keys by
// string, already serializes correctly across unrelated projects).

import { makeWriteQueue } from './write-queue.mjs';

export const projectQueue = makeWriteQueue();

export function runForProject(projectId, fn) {
  return projectQueue.run(projectId, fn);
}
