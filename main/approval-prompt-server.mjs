// The approvals channel: a tiny MCP server that Claude Code calls (via
// --permission-prompt-tool) whenever a headless worker wants to do something
// its standing grants do not cover. The request lands as a file in the spool,
// the app shows the founder a card, her click writes the answer file, and the
// worker unblocks in place. Before this, a gated command ended the story:
// sessions wrote everything and bounced the actual run back to the founder
// as a paste (2026-08-05).
//
// Deny is the default in every failure mode: timeout, spool error, malformed
// answer. An approval can only come from the founder's explicit file.
//
// EVERY TOUCH OF THE SPOOL GOES THROUGH main/approvals.mjs, which is where the
// rule that this directory is worker-writable is written down and enforced --
// nothing opened through a link, nothing opened that is not a regular file,
// every write landed by rename. It used to be bare `fs` here, and the audit
// line was the worst of it: `log.jsonl` is a fixed name, so a worker that
// symlinked it at `briefs/founder.md` had a repeatable append of its own
// `command` string into the standing instructions every session is briefed
// with. This process runs as the worker's own child, so it is the near half of
// that attack (2026-09-04).

import { serveApprovals } from './approval-prompt-core.mjs';

// Run as its own process by Claude Code for a run on this Mac; a cloud run's
// relay serves the same channel in-process (main/cloud/run.mjs).
serveApprovals();
