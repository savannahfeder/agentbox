// A session started outside Agentbox, brought in as one of its threads. The
// thread is the same import a chat that went quiet gets (main/store.mts), read
// off the live session instead of its transcript, so it is filed under the id
// that stops it coming in twice. The session itself is left running.

import { theirWords } from './session-layout.mts';
import { codexIdOf } from './codex-import.mts';
import type { AgentLike } from './agents.mts';

export interface SessionChat {
  id: string;
  source: 'claude' | 'codex';
  title: string;
  folder: string;
  when: number;
  startedAt: number;
  waiting: boolean;
  /** Claude Code's import reads these two. */
  firstSaid: string;
  lastSaid: string;
  /** Codex's reads these two. */
  prompt: string;
  last: string;
}

/** Null for a session with nothing to file it under, which an import could not tell apart from another. */
export function chatFromSession(agent: AgentLike | null | undefined): SessionChat | null {
  const id = String(agent?.sessionId ?? '').trim();
  if (!agent || !id) return null;
  const first = theirWords(agent.asked?.[0]?.text ?? agent.lastAsked ?? '');
  // What it is stopped on is part of where it stands, though no message says it.
  const pending = agent.approval
    ? `${agent.approval.reason}\n\n\`${agent.approval.command}\``
    : (agent.question ?? []).map((q) => [q.question, ...q.options.map((o, i) => `${i + 1}. ${o}`)].join('\n')).join('\n\n');
  const said = [String(agent.lastSaid ?? '').trim(), pending].filter(Boolean).join('\n\n');
  const title = String(agent.about ?? '').trim() || first.slice(0, 80) || String(agent.name ?? '').trim() || 'Session';
  return {
    id,
    source: agent.engine === 'codex' ? 'codex' : 'claude',
    title,
    folder: String(agent.cwd ?? ''),
    when: Number(agent.lastActiveAt) || 0,
    startedAt: Number(agent.startedAt) || 0,
    waiting: agent.status === 'waiting' || !!agent.approval || !!agent.question?.length,
    firstSaid: first,
    lastSaid: said,
    prompt: first,
    last: said,
  };
}

interface LabelledRow { id?: string; labels?: unknown[]; status?: string }

/** The thread a session already became, open or not, so a second press opens it rather than filing another. */
export function rowForSession<T extends LabelledRow>(items: readonly T[], agent: AgentLike | null | undefined): T | null {
  const id = String(agent?.sessionId ?? '').trim();
  if (!id) return null;
  const mine = (i: T) => agent?.engine === 'codex'
    ? codexIdOf(i) === id
    : (i.labels ?? []).includes(`thread:${id}`);
  return items.find((i) => mine(i) && i.status !== 'done') ?? items.find(mine) ?? null;
}
