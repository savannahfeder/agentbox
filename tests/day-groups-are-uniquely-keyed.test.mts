// Every day group carries a key no sibling shares.
//
// Clicking Scheduled or In progress moved the tab and the rail but left the
// rows from the previous tab on screen, with the new list's groups appended
// underneath: the Scheduled view showed "Returns Today" BELOW leftover
// Today/Yesterday groups, and the row count went 14 -> 10 -> 18 -> 551 while
// the top three rows never changed.
//
// The cause was one line: the groups were keyed `key={group.label}`. The inbox
// is sorted by what matters most, not by when (productRankScore then priority,
// recency last), so its day labels are NOT monotonic: "Today", "Yesterday",
// "Today" again. Repeated labels are repeated keys among siblings, and React
// reconciles duplicate-keyed children by position, so it matched the new list's
// groups onto the old ones and kept the stale DOM.
//
// It hid in the fixtures, whose items happen to fall in date order and so
// produce one "Today" and one "Yesterday". Only real data repeats a label,
// which is why the app was broken and every test was green.
import { describe, it, expect } from 'vitest';
import { dayGroups } from '../renderer/src/components/List';

const at = (id, label) => ({ id, label });
// The label function is the component's, reduced to the thing that matters
// here: what it returns, and that a list can return the same answer twice.
const group = (items) => dayGroups(items, (i) => i.label);

describe('day groups', () => {
  it('key every group differently when a day label repeats', () => {
    // Exactly the shape of her inbox: priority order, so the days interleave.
    const groups = group([
      at('a', 'Today'), at('b', 'Today'),
      at('c', 'Yesterday'),
      at('d', 'Today'),
      at('e', 'Last 7 days'),
      at('f', 'Yesterday'),
    ]);

    expect(groups.map((g) => g.label)).toEqual([
      'Today', 'Yesterday', 'Today', 'Last 7 days', 'Yesterday',
    ]);

    const keys = groups.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('still splits on the label, and keeps each row\'s index into the list', () => {
    const groups = group([at('a', 'Today'), at('b', 'Today'), at('c', 'Yesterday')]);

    expect(groups).toHaveLength(2);
    expect(groups[0].items.map((x) => x.index)).toEqual([0, 1]);
    expect(groups[1].items.map((x) => x.index)).toEqual([2]);
    // The index is the row's place in the list she is looking at, because
    // selection and shift-range are arithmetic on it.
    expect(groups[1].items[0].item.id).toBe('c');
  });

  it('holds a key steady when the same rows come back', () => {
    // A key that moved every render would remount the group and lose the
    // scroll position, which is the other half of why this is keyed at all.
    const items = [at('a', 'Today'), at('b', 'Yesterday'), at('c', 'Today')];
    expect(group(items).map((g) => g.key)).toEqual(group(items).map((g) => g.key));
  });

  it('has nothing to say about an empty list', () => {
    expect(group([])).toEqual([]);
  });
});
