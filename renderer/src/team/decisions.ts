// What a group or project has marked: its decisions, newest first, and the
// week's priorities, which is the newest pin alone.
import type { RoomDecision } from '../types';

export function decisionRows(rows: readonly RoomDecision[], { project }: { project: string | null }): { priority: RoomDecision | null; decisions: RoomDecision[] } {
  const here = rows.filter((r) => r.on && (r.project ?? null) === project).sort((a, b) => b.at - a.at);
  return { priority: here.find((r) => r.kind === 'priority') ?? null, decisions: here.filter((r) => r.kind === 'decision') };
}

export interface MessageMarks { decision?: boolean; priority?: boolean }

export function decisionsOf(rows: readonly RoomDecision[]): Map<string, MessageMarks> {
  const out = new Map<string, MessageMarks>();
  for (const r of rows) if (r.on) out.set(r.messageId, { ...out.get(r.messageId), [r.kind]: true });
  return out;
}
