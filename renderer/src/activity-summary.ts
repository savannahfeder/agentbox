import type { AgentWork } from './types';
const names: Record<string, string> = { ran: 'ran commands', read: 'read files', wrote: 'wrote files', edited: 'edited files', 'searched for': 'searched files', 'looked for': 'looked for files', fetched: 'read web pages' };
export function activitySummary(items: Pick<AgentWork, 'verb' | 'subject'>[]): string {
  if (!items.length) return '';
  const text = items.length === 1
    ? `${items[0].verb} ${items[0].subject || ''}`.trim()
    : [...new Set(items.map(item => names[item.verb] || item.verb))].join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Let native buttons handle Enter/Space before the task's global shortcuts.
export function keepActivityKeyLocal(event: { key: string; stopPropagation: () => void }): void {
  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
}

// THE LIVE LIST IS THE STEPS SINCE THE AGENT LAST SPOKE, NOT THE RUN'S HISTORY.
// It used to pour in every step of up to twenty past runs, so a run 38 minutes
// in opened onto a wall of commands (w-dc98b53395, 2026-09-26). Codex's working
// state is the tool calls between two things the agent said: a sentence ends
// the group and the next call starts a fresh one. Everything older is already
// in the conversation above, folded between those sentences.
export const LIVE_STEPS_SHOWN = 5;
export function stepsSinceLastSaid<T extends { kind?: string }>(nodes: T[]): T[] {
  let start = 0;
  nodes.forEach((node, index) => { if (node.kind !== 'work') start = index + 1; });
  return nodes.slice(start).filter(node => node.kind === 'work');
}

export function previousActivity<T extends { subject?: string; full?: string; at?: number }>(history: T[], pending: { detail: string; startedAt?: number }[]): T[] {
  const previous = [...history];
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
  for (const action of pending) {
    for (let index = previous.length - 1; index >= 0; index--) {
      const row = previous[index];
      if (row.at != null && action.startedAt != null && row.at < action.startedAt - 1000) continue;
      if (normalize(row.full || row.subject || '') === normalize(action.detail)) {
        previous.splice(index, 1);
        break;
      }
    }
  }
  return previous;
}
