import type { ClaudeCommand } from './claude-commands.mjs';
export const CODEX_COMPACT: ClaudeCommand;
export function codexCommand(text: unknown): {name: 'compact'; valid: boolean} | null;
export const COMPACTION_COPY: Readonly<Record<string, string>>;
