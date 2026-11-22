// PURE. Search finds a repeating task by its name, and its runs, which all
// carry that name, fold into it rather than standing in for it.
import { matchesQuery } from './palette-rows';
import { ruleIdOf, type RepeatRule } from '../../shared/repeats.mts';

type Ruled = Pick<RepeatRule, 'id' | 'title'> & { product: string };

export function repeatsFound<R extends Ruled>(rules: readonly R[], query: string): R[] {
  if (!query.trim()) return [];
  return rules.filter((r) => matchesQuery(query, { label: r.title }));
}

export function withoutRunsOf<T extends { product: string; labels?: readonly string[] }>(threads: readonly T[], found: readonly Ruled[]): T[] {
  return threads.filter((t) => {
    const id = ruleIdOf(t);
    return !id || !found.some((r) => r.id === id && r.product === t.product);
  });
}
