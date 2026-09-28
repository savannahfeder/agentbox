import type { ClaudeCommand } from './claude-commands.mjs';
export const CODEX_COMMANDS: ClaudeCommand[];
export const LOCAL_COMMANDS: ClaudeCommand[];
export function providerCommands(engine: string): ClaudeCommand[];
export function providerCommand(text: unknown, engine: string): {name: string; args: string; route: string} | null;
export function reviewTarget(args?: string): Record<string,string>;

export function nativeCommandNames(frame: unknown): string[] | null;
