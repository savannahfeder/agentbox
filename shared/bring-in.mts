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

// The write-up reads the first 1,500 characters (main/catch-up.mts), and it is
// the newest messages it most needs: the first says what it was for.
const BUDGET = 1400;
function keepNewest(theirs: string[]): string {
  if (theirs.join('\n\n').length <= BUDGET) return theirs.join('\n\n');
  const tail: string[] = [];
  let left = BUDGET - theirs[0].length;
  for (let i = theirs.length - 1; i > 0 && left - theirs[i].length > 0; i -= 1) { tail.unshift(theirs[i]); left -= theirs[i].length + 2; }
  return [theirs[0].slice(0, BUDGET), ...(tail.length < theirs.length - 1 ? ['…'] : []), ...tail].join('\n\n');
}

/** Null for a session with nothing to file it under, which an import could not tell apart from another. */
export function chatFromSession(agent: AgentLike | null | undefined): SessionChat | null {
  const id = String(agent?.sessionId ?? '').trim();
  if (!agent || !id) return null;
  // Every message the person typed, so the write-up knows what they already answered.
  const theirs = (agent.asked ?? []).map((t) => theirWords(t?.text)).filter(Boolean);
  const first = keepNewest(theirs) || theirWords(agent.lastAsked ?? '');
  // What it is stopped on is part of where it stands, though no message says it.
  const pending = agent.approval
    ? `${agent.approval.reason}\n\n\`${agent.approval.command}\``
    : (agent.question ?? []).map((q) => [q.question, ...q.options.map((o, i) => `${i + 1}. ${o}`)].join('\n')).join('\n\n');
  const said = [String(agent.lastSaid ?? '').trim(), pending].filter(Boolean).join('\n\n')
    || (agent.status === 'busy' ? 'It was still working in its terminal when it moved here.' : '');
  const title = String(agent.about ?? '').trim() || (theirs[0] ?? first).slice(0, 80) || String(agent.name ?? '').trim() || 'Session';
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

/** The label a session's thread here carries: Claude Code's import files it as `thread:<id>`, Codex's as `codex:<id>`. */
export const movedLabel = (agent: AgentLike | null | undefined): string => `${agent?.engine === 'codex' ? 'codex' : 'thread'}:${String(agent?.sessionId ?? '').trim()}`;

/** The sessions that have a thread here still open. Once that thread is done, the session can be a row of its own again. */
export function movedSessions(items: readonly LabelledRow[]): Set<string> {
  const out = new Set<string>();
  for (const item of items) {
    if (item.status === 'done') continue;
    for (const l of item.labels ?? []) if (typeof l === 'string' && /^(thread|codex):./.test(l)) out.add(l);
  }
  return out;
}

/** The thread a session already became, open or not, so a second press opens it rather than filing another. */
export function rowForSession<T extends LabelledRow>(items: readonly T[], agent: AgentLike | null | undefined): T | null {
  const id = String(agent?.sessionId ?? '').trim();
  if (!id) return null;
  const mine = (i: T) => agent?.engine === 'codex'
    ? codexIdOf(i) === id
    : (i.labels ?? []).includes(`thread:${id}`);
  return items.find((i) => mine(i) && i.status !== 'done') ?? items.find(mine) ?? null;
}
