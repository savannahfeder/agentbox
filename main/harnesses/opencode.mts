// OpenCode, driven over ACP (`opencode acp`). The protocol carries the
// conversation, so this file holds only what it does not: how OpenCode is made
// to ask before it acts, and where it reads standing instructions.
// docs/harnesses.md has what was measured.
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
 * The permission policy a thread runs under, as OpenCode's own config. With
 * none, OpenCode runs commands and writes files without asking, and it has no
 * sandbox, so a command always asks unless the mode asks for nothing. Edits
 * inside the thread's folder go ahead; `external_directory` asks for a file
 * outside it. Reading is left alone: a card per file read is a flood.
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
 * its `instructions` list names. Rewritten on every start, because a stale one
 * is how a run stops asking.
 */
export const prepareOpenCode: AcpPrepare = ({ dir, instructions, mode }) => {
  const brief = path.join(dir, 'instructions.md');
  fs.writeFileSync(brief, `${instructions}\n`, 'utf8');
  const config = path.join(dir, 'opencode.json');
  fs.writeFileSync(config, `${JSON.stringify({ ...openCodePermissionConfig(mode), ...(instructions ? { instructions: [brief] } : {}) }, null, 2)}\n`, 'utf8');
  return { OPENCODE_CONFIG: config };
};

export const openCodeHarness = {
  // Its own free models are named `opencode/Big Pickle`; a connected provider's keep their provider.
  ...acpHarness(definition, { prepare: prepareOpenCode, modelLabel: (id, name) => (name || id).replace(/^opencode\//, '') }),
  // Its own credential store, which `opencode auth login` writes and the app never reads.
  signInFiles: ({ folder, home }: SignInFilesWhere) => (folder
    ? definition.credentialFiles.map((file: string) => path.join(folder, file))
    : [path.join(home, '.local/share/opencode/auth.json')]),
  // Never `--auto`, which approves everything that is not explicitly denied.
  // `--standalone`, because without it a command starts OpenCode's background
  // service and leaves it running after the command has ended.
  smallModelArgs: (prompt: string, model?: string | null) => ['run', '--standalone', '--format', 'json', ...(model ? ['--model', model] : []), prompt],
  // `run --format json` prints one event a line, and the answer is its `text` parts.
  smallModelReply: (out: string) => out.split('\n').flatMap((line) => {
    try {
      const event = JSON.parse(line) as { type?: string; part?: { text?: unknown } };
      return event?.type === 'text' && typeof event.part?.text === 'string' ? [event.part.text] : [];
    } catch { return []; }
  }).join('').trim(),
};
