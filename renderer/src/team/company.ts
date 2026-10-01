// THE TEAM'S PURE RULES ON THE WINDOW SIDE: the company list the Team page
// draws, due-day words, and who a row is from. No React and no styles, so
// tests read them directly (tests/team-the-company-list.test.mjs).
import type { Person, Product, TeamState, WorkItem } from '../types';
import { isShared, heldByAPerson, runnerOf } from '../../../shared/team-rules.mjs';

export const firstName = (person: Person | undefined | null) => (person?.name || person?.email || 'Someone').split(/\s+/)[0];

export type LineState = 'run' | 'wait' | 'sched';
export type CompanyLine = {
  key: string;
  item: WorkItem | null;
  // Null is a teammate's private task: nothing about it is shown but who and how.
  title: string | null;
  // Yours, in a private project: shown with a lock and "Hidden from the team".
  mine: boolean;
  project: string;
  owner: string | null;
  state: LineState;
  stateText: string;
  movedAt: number;
};

function stateOf(item: WorkItem, now: number): LineState {
  if (item.status === 'claimed' && item.claim && !item.claimExpired) return 'run';
  if (item.runAt && item.runAt > now) return 'sched';
  return 'wait';
}

/** Every open task in the company, newest movement first, never grouped, and
 *  what finished today. Shared rows are owned by whoever has to act; your own
 *  private rows are yours; teammates' private work is a title-free line. */
export function companyLines(items: WorkItem[], products: Product[], team: TeamState, now: number): { open: CompanyLine[]; doneToday: CompanyLine[] } {
  const me = team.me?.id ?? null;
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const name = (id: string | null | undefined) => (id === me ? 'you' : firstName(team.people.find((p) => p.id === id)));
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const open: CompanyLine[] = [];
  const doneToday: CompanyLine[] = [];
  for (const item of items) {
    if (item.agent) continue;
    const product = bySlug.get(item.product);
    if (!product) continue;
    const shared = isShared(product);
    const owner = shared ? (heldByAPerson(item) ? item.assignee! : runnerOf(item, product)) : me;
    const state = stateOf(item, now);
    const line: CompanyLine = {
      key: `${item.product}/${item.id}`, item, title: item.label || item.title, mine: !shared,
      project: product.name, owner, state,
      stateText: state === 'run' ? 'Running'
        : state === 'sched' ? `Starts ${new Date(item.runAt!).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`
          : `Waiting on ${name(owner)}`,
      movedAt: item.updatedAt,
    };
    if (item.status === 'done') { if (item.updatedAt >= startOfDay.getTime()) doneToday.push(line); continue; }
    open.push(line);
  }
  for (const c of team.cards ?? []) {
    if (c.personId === me || c.visible || c.state === 'done') continue;
    open.push({
      key: `private/${c.personId}/${c.threadId}`, item: null, title: null, mine: false, project: '', owner: c.personId,
      state: c.state === 'running' ? 'run' : c.state === 'scheduled' ? 'sched' : 'wait',
      stateText: c.state === 'running' ? 'Running' : c.state === 'scheduled' ? 'Scheduled' : `Waiting on ${name(c.personId)}`,
      movedAt: c.updatedAt,
    });
  }
  const newest = (a: CompanyLine, b: CompanyLine) => b.movedAt - a.movedAt;
  return { open: open.sort(newest), doneToday: doneToday.sort(newest) };
}

/** "Due today", "Due tomorrow", "Due Thu", "Due Oct 14", "Overdue Oct 2". */
export function dueWords(due: string | undefined, now = new Date()): string | null {
  if (!due || due === 'none') return null;
  const [y, m, d] = due.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1 && days < 7) return `Due ${day.toLocaleDateString(undefined, { weekday: 'short' })}`;
  if (days < 0) return `Overdue ${day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  return `Due ${day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** Who a shared row is FROM, for the row end: the teammate who sent it to me,
 *  or the teammate whose agent is asking. Null on anything of my own. */
export function sentFrom(item: WorkItem, product: Product | undefined, me: string | null): { from: string; agent: boolean } | null {
  if (!me || !isShared(product)) return null;
  const from = heldByAPerson(item) ? (item.people ?? []).find((p) => p !== me) ?? item.createdBy : runnerOf(item, product);
  if (!from || from === me) return null;
  return { from, agent: !heldByAPerson(item) };
}

/**
 * How long since a task last moved, in the Team page's last column. Under a
 * minute is "now": the real copies read "0m" on a task given a moment earlier.
 */
export function movedAgo(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 1) return 'now';
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}
