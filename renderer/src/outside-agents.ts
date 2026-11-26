// The one setting for sessions started in Claude Code or Codex outside
// Agentbox, in the words each place that offers it reads: Settings, the ⋯ menu
// on one of those sessions, the inbox's View and filters, and ⌘K.

import type { AgentMode } from './types';
import { Name } from '../../shared/product-name.mjs';

export const OUTSIDE_TITLE = 'Terminal sessions';
/** On one session's ⋯, where the plain name read as a setting for that session alone. */
export const OUTSIDE_ALL = 'All terminal sessions';
/** Over the three choices, which answer it. */
export const OUTSIDE_ASK = 'Show in your inbox';

export const OUTSIDE_MODES: { value: AgentMode; label: string }[] = [
  { value: 'all', label: 'Always' },
  { value: 'waiting', label: 'When they need you' },
  { value: 'off', label: 'Never' },
];

export const outsideLabel = (mode: AgentMode): string => (OUTSIDE_MODES.find((o) => o.value === mode) ?? OUTSIDE_MODES[0]).label;

export function outsideCommands(mode: AgentMode): { id: string; label: string; hint?: string; keywords: string; to: AgentMode }[] {
  return OUTSIDE_MODES.map((o) => ({
    id: `outside-${o.value}`,
    label: `Show terminal sessions: ${o.label.toLowerCase()}`,
    ...(o.value === mode ? { hint: 'On now' } : {}),
    keywords: 'terminal sessions agents started yourself outside own codex claude code inbox show hide turn off on stuck waiting need you always never',
    to: o.value,
  }));
}

/** The press that makes one of those sessions a thread here, and what it says once it has. */
export const BRING_IN = `Continue in ${Name}`;
export const BROUGHT_IN = `Moved to ${Name}. The session in its terminal is left as it was.`;

/** A Claude Code session in a terminal that can become a thread here: Codex sessions are answered in Codex. */
export function canMoveIn(agent: { engine?: string | null; product?: string | null; sessionId?: string | null } | null | undefined): boolean {
  return !!agent?.product && !!agent.sessionId && agent.engine !== 'codex';
}

/**
 * A message to one of those sessions arrives in its terminal as words, so a
 * slash command typed to it would never run. Sent from here, it moves the
 * session in first and runs on the new thread.
 */
export function movesInWithCommand(agent: Parameters<typeof canMoveIn>[0], text: string): boolean {
  return canMoveIn(agent) && /^\/[a-z][a-z0-9:_-]*(\s|$)/i.test(text.trim());
}

/** What a toast says once it is changed from somewhere the inbox is not in view. */
export const OUTSIDE_SAID: Record<AgentMode, string> = {
  all: 'Terminal sessions show in your inbox now.',
  waiting: 'Terminal sessions show in your inbox only when they need you.',
  off: 'Terminal sessions are out of your inbox. Each is still in its project’s sidebar.',
};
