// The one setting for agents you start yourself in Claude Code or Codex, in the
// words each place that offers it reads: Settings, the ⋯ menu on one of those
// sessions, the inbox's View and filters, and ⌘K.

import type { AgentMode } from './types';

export const OUTSIDE_TITLE = 'Agents you started yourself';

export const OUTSIDE_MODES: { value: AgentMode; label: string }[] = [
  { value: 'all', label: 'All of them' },
  { value: 'waiting', label: 'Only the stuck ones' },
  { value: 'off', label: 'None' },
];

export const outsideLabel = (mode: AgentMode): string => (OUTSIDE_MODES.find((o) => o.value === mode) ?? OUTSIDE_MODES[0]).label;

export function outsideCommands(mode: AgentMode): { id: string; label: string; hint?: string; keywords: string; to: AgentMode }[] {
  return OUTSIDE_MODES.map((o) => ({
    id: `outside-${o.value}`,
    label: `${OUTSIDE_TITLE}: ${o.label.toLowerCase()}`,
    ...(o.value === mode ? { hint: 'On now' } : {}),
    keywords: 'agents sessions started yourself outside own terminal codex claude code inbox show hide turn off on stuck waiting',
    to: o.value,
  }));
}

/** What a toast says once it is changed from somewhere the inbox is not in view. */
export const OUTSIDE_SAID: Record<AgentMode, string> = {
  all: 'Every agent you start yourself is in your inbox now.',
  waiting: 'Agents you start yourself come to your inbox only when they are stuck.',
  off: 'Agents you start yourself are out of your inbox. Each is still in its project’s sidebar.',
};
