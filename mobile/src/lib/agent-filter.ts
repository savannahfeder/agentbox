// The Agent line in View and filters, by the desktop's filter (renderer/src/box-filter.ts).
import { filterMenu, harnessOf, NO_FILTER, type Harness } from '../../../renderer/src/box-filter';
import { isFiltered, keeps, type Display } from '../../../renderer/src/threads/page-rules';
import type { WorkItem } from '../../../renderer/src/types';

export type { Harness };

export const keepsAgent = (item: WorkItem, agent: Harness | null) => !agent || harnessOf(item) === agent;

/** Claude Code and Codex, only while the tab holds work from both or one is picked. */
export function agentChoices(rows: readonly { item: WorkItem }[], display: Display, now: number, agent: Harness | null) {
  const kept = rows.map((r) => r.item).filter((i) => keeps(i, display, now));
  return filterMenu(kept, { ...NO_FILTER, harness: agent }, []).harnesses;
}

export const phoneFiltered = (display: Display, agent: Harness | null) => isFiltered(display) || !!agent;
