// THE WINDOW IS SENT ONLY THE THREADS THAT CHANGED.
//
// The window reads the inbox on every push, up to two and a half times a
// second while any agent writes, and the inbox is every thread in every
// project (tests/the-window-is-sent-only-the-threads-that-changed.test.mjs).
// So each answer carries a token. A window that asks with the token of an
// answer it holds gets the threads whose content changed since, the keys of
// the ones that are gone, and the order only when it moved. One that asks with
// nothing, or with a token this computer no longer holds, gets every thread.

const keyOf = (item) => `${item?.product ?? ''}/${item?.id}`;

/** The computer's half: `answer(whole, since)` for each ask. */
export function snapshotSender({ keep = 8 } = {}) {
  // Several screens ask (the window, a browser tab, a phone), each with its own
  // token, so more than one answer is kept. Unchanged threads share one string
  // across every answer held.
  const held = new Map();
  // A token from before a restart must not name an answer from after it.
  const prefix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  let count = 0;
  return {
    answer(whole, since) {
      const items = Array.isArray(whole?.items) ? whole.items : [];
      const base = typeof since === 'string' ? held.get(since) : undefined;
      const texts = new Map();
      const keys = [];
      const changed = [];
      for (const item of items) {
        const key = keyOf(item);
        const text = JSON.stringify(item);
        const before = base?.texts.get(key);
        texts.set(key, before === text ? before : text);
        keys.push(key);
        if (base && before !== text) changed.push(item);
      }
      if (texts.size !== keys.length) return whole;
      const order = keys.join('\n');
      const token = `${prefix}.${++count}`;
      held.set(token, { texts, order });
      while (held.size > keep) held.delete(held.keys().next().value);
      if (!base) return { ...whole, snapshotToken: token };
      const removed = [];
      for (const key of base.texts.keys()) if (!texts.has(key)) removed.push(key);
      const { items: _all, ...rest } = whole;
      return { ...rest, snapshotToken: token, delta: { since, changed, removed, order: order === base.order ? null : keys } };
    },
  };
}

/**
 * The window's half. `ask()` is what to send; `take(answer)` is the whole
 * snapshot to draw, or null when the answer builds on a list this window has
 * dropped, which is asked again with nothing.
 */
export function snapshotReader({ keep = 4 } = {}) {
  const held = new Map();
  let latest = null;
  const remember = (token, state) => {
    held.set(token, state);
    latest = token;
    while (held.size > keep) held.delete(held.keys().next().value);
  };
  return {
    ask() {
      return latest ? { since: latest } : undefined;
    },
    take(answer) {
      if (!answer || typeof answer !== 'object') return answer ?? null;
      const { snapshotToken: token, delta, ...rest } = answer;
      if (!delta) {
        if (!token) { held.clear(); latest = null; return answer; }
        const items = Array.isArray(rest.items) ? rest.items : [];
        remember(token, { byKey: new Map(items.map((i) => [keyOf(i), i])), order: items.map(keyOf) });
        return rest;
      }
      const base = held.get(delta.since);
      if (!base) { held.clear(); latest = null; return null; }
      const byKey = new Map(base.byKey);
      for (const key of delta.removed ?? []) byKey.delete(key);
      for (const item of delta.changed ?? []) byKey.set(keyOf(item), item);
      const order = delta.order ?? base.order;
      remember(token, { byKey, order });
      return { ...rest, items: order.map((key) => byKey.get(key)).filter(Boolean) };
    },
  };
}
