// NO WAY WAS FOUND TO CHANGE A FILED THREAD'S PRIORITY (QA batch 011, F-169).
//
// Two testers looked in the thread's More actions menu, which held only View
// code changes, Open terminal and Pin thread, and found priority only on the
// New thread card. The level could be set from ⌘K and the hidden summary panel,
// neither of which they opened. The menu now has a Priority row that opens the
// four levels, the current one marked, and a pick goes through the same `retag`
// as ⌘K. Measured by the menu's rows and the levels it opens.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { threadMenuRows, priorityLevels } from '../renderer/src/threads/ThreadMenu.tsx';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const rows = (opts) => threadMenuRows({ change: false, terminal: 'closed', finish: true, ...opts });

describe('the More actions menu', () => {
  it('has a Priority row saying the level it is at now', () => {
    const row = rows({ priority: 'medium' }).find((r) => r.id === 'priority');
    expect(row).toMatchObject({ label: 'Priority', detail: 'Medium' });
  });

  it('sits under Later and above Pin', () => {
    expect(rows({ later: 'key', priority: 'high', pin: 'unpinned' }).map((r) => r.id)).toEqual(['terminal', 'later', 'priority', 'pin', 'done']);
  });

  it('has none where there is no level to change', () => {
    expect(rows({ priority: null }).map((r) => r.id)).not.toContain('priority');
  });

  it('is offered on an open thread of yours, not a finished one, an outside agent or a conversation', () => {
    expect(read('renderer/src/components/Focus.tsx')).toContain('onPriority={canFinish && !agent && !direct && onPriority ?');
  });

  it('sets the level the same way ⌘K does', () => {
    expect(read('renderer/src/App.tsx')).toContain('onPriority={(value) => { void retag([focused], value); }}');
  });
});

describe('the four levels it opens', () => {
  it('lists them in the order every other priority menu does, the current one marked', () => {
    const levels = priorityLevels('medium');
    expect(levels.map((l) => l.label)).toEqual(['Urgent', 'High', 'Medium', 'Low']);
    expect(levels.filter((l) => l.on).map((l) => l.id)).toEqual(['medium']);
  });

  it('marks nothing when the level is unknown', () => {
    expect(priorityLevels(null).some((l) => l.on)).toBe(false);
  });

  it('picking the level it is already at writes nothing', () => {
    expect(read('renderer/src/threads/ThreadMenu.tsx')).toContain('onClick={() => { close(false); if (!p.on) onPriority?.(p.id); }}');
  });
});
