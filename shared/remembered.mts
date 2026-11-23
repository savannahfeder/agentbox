/**
 * `work` for an object, worked out once and kept for as long as the object
 * lives. Only for work whose answer depends on that object alone, and only for
 * objects nobody changes in place: a thread that changes is a new object.
 */
export function rememberedFor<O extends object, R>(work: (o: O) => R): (o: O) => R {
  const kept = new WeakMap<O, R>();
  return (o) => {
    // Nothing to keep it by: worked out as it always was.
    if (typeof o !== 'object' || o === null) return work(o);
    if (kept.has(o)) return kept.get(o)!;
    const answer = work(o);
    kept.set(o, answer);
    return answer;
  };
}

/**
 * `work` for a text, worked out once and kept, for the `keep` texts worked
 * out most recently. Only for work whose answer depends on the text alone.
 */
export function remembered<R>(work: (text: string) => R, keep: number): (text: string) => R {
  const kept = new Map<string, R>();
  return (text) => {
    if (kept.has(text)) return kept.get(text)!;
    const answer = work(text);
    kept.set(text, answer);
    if (kept.size > keep) kept.delete(kept.keys().next().value!);
    return answer;
  };
}
