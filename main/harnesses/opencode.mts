// OPENCODE, OVER ACP.
//
// The connection written against OpenCode 1.18.35's HTTP server on 2026-10-07
// answered 405 on its first call to 2.3.2 six weeks later, with its tests still
// green: the server's addresses had moved. `opencode acp` is the same protocol
// every ACP agent speaks, so this file is only the two things the protocol does
// not carry, both read off a running 2.3.2 on 2026-11-22.
import fs from 'node:fs';
import path from 'node:path';
import { harnessDefinition } from '../../shared/harness-definitions.mts';
import { acpHarness } from './acp.mts';
import type { AcpPrepare } from './acp.mts';
import type { SignInFilesWhere } from './common.mts';

const definition = harnessDefinition('opencode')!;

// The modes of the other two harnesses that mean "ask before changing anything".
const ASKS_FOR_EDITS = new Set(['default', 'plan', 'read-only']);
// And the ones that mean "anything, without asking".
const ASKS_FOR_NOTHING = new Set(['bypassPermissions', 'full-access']);

/**
 * THE PERMISSION POLICY A THREAD RUNS UNDER, as OpenCode's own config.
 *
 * With none, OpenCode runs shell commands and writes files without a word, so
 * a card exists only because of this. OpenCode has no sandbox and no reviewer
 * of its own, so a shell command always asks unless the person chose a mode
 * that asks for nothing. Edits inside the thread's folder go ahead, as they do
 * on the other two harnesses' default modes; `external_directory` still asks
 * for a file outside it (measured: the inside file was written unasked, the
 * outside one raised a request). Reading is left alone: a card per file read
 * is a flood.
 */
export function openCodePermissionConfig(mode: string | null = null) {
  const free = ASKS_FOR_NOTHING.has(mode ?? '');
  const ask = free ? 'allow' : 'ask';
  return {
    $schema: 'https://opencode.ai/config.json',
    permission: {
      bash: ask,
      edit: free || !ASKS_FOR_EDITS.has(mode ?? '') ? 'allow' : 'ask',
      webfetch: ask,
      websearch: ask,
      external_directory: ask,
      task: 'allow',
      todowrite: 'allow',
    },
  };
}

/**
 * One config file per thread, in the app's own folder, which `OPENCODE_CONFIG`
 * points at: the policy above, and the person's standing instructions as a file
 * its `instructions` list names (measured: a rule in that file was followed).
 * Rewritten on every start, because a stale one is how a run stops asking.
 */
export const prepareOpenCode: AcpPrepare = ({ dir, instructions, mode }) => {
  const brief = path.join(dir, 'instructions.md');
  fs.writeFileSync(brief, `${instructions}\n`, 'utf8');
  const config = path.join(dir, 'opencode.json');
  fs.writeFileSync(config, `${JSON.stringify({ ...openCodePermissionConfig(mode), ...(instructions ? { instructions: [brief] } : {}) }, null, 2)}\n`, 'utf8');
  return { OPENCODE_CONFIG: config };
};

export const openCodeHarness = {
  ...acpHarness(definition, { prepare: prepareOpenCode }),
  // Its own credential store, which `opencode auth login` writes and the app never reads.
  signInFiles: ({ folder, home }: SignInFilesWhere) => (folder
    ? definition.credentialFiles.map((file: string) => path.join(folder, file))
    : [path.join(home, '.local/share/opencode/auth.json')]),
  // Never `--auto`, which approves everything that is not explicitly denied.
  smallModelArgs: (prompt: string, model?: string | null) => ['run', '--format', 'json', ...(model ? ['--model', model] : []), prompt],
  // `run --format json` prints one event a line, and the answer is its `text` parts (read off 2.3.2).
  smallModelReply: (out: string) => out.split('\n').flatMap((line) => {
    try {
      const event = JSON.parse(line) as { type?: string; part?: { text?: unknown } };
      return event?.type === 'text' && typeof event.part?.text === 'string' ? [event.part.text] : [];
    } catch { return []; }
  }).join('').trim(),
};
