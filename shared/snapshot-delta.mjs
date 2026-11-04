// THE WINDOW IS SENT ONLY WHAT CHANGED.
//
// The window reads the inbox on every push, up to two and a half times a second
// while any agent writes, and the inbox is every thread in every project
// (tests/the-window-is-sent-only-the-threads-that-changed.test.mjs). So each
// answer carries a token. A window that asks with the token of an answer it
// holds gets the threads and other parts that changed since, what is gone, and
// the order only when it moved. One that asks with nothing, or with a token this
// computer no longer holds, gets everything.

const keyOf = (item) => `${item?.product ?? ''}/${item?.id}`;

/** The same plain data, found without turning anything into text. */
function deepSame(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) if (!deepSame(a[key], b[key])) return false;
  return true;
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The computer's half: `answer(whole, since)` for each ask. */
export function snapshotSender({ keep = 16 } = {}) {
  // The window, a browser tab and a phone each ask with their own token. An
  // unchanged thread is one object across every answer held.
  const held = new Map();
  // A token from before a restart must not name an answer from after it.
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  let count = 0;
  return {
    answer(whole, since) {
      const items = Array.isArray(whole?.items) ? whole.items : [];
      const { items: _all, ...parts } = whole ?? {};
      const base = typeof since === 'string' ? held.get(since) : undefined;
      const rows = new Map();
      const changed = [];
      for (const item of items) {
        const key = keyOf(item);
        const before = base?.rows.get(key);
        const same = before !== undefined && deepSame(before, item);
        rows.set(key, same ? before : item);
        if (base && !same) changed.push(item);
      }
      if (rows.size !== items.length) return whole;
      const keys = items.map(keyOf);
      const token = `${run}.${++count}`;
      const nextParts = {};
      const changedParts = {};
      for (const [name, value] of Object.entries(parts)) {
        const same = base && name in base.parts && deepSame(base.parts[name], value);
        nextParts[name] = same ? base.parts[name] : value;
        if (!same) changedParts[name] = value;
      }
      held.set(token, { rows, keys: base && sameList(base.keys, keys) ? base.keys : keys, parts: nextParts });
      while (held.size > keep) held.delete(held.keys().next().value);
      if (!base) return { ...whole, snapshotToken: token };
      const removed = [];
      for (const key of base.rows.keys()) if (!rows.has(key)) removed.push(key);
      const gone = Object.keys(base.parts).filter((name) => !(name in parts));
      return { ...changedParts, snapshotToken: token, delta: { since, changed, removed, gone, order: sameList(base.keys, keys) ? null : keys } };
    },
  };
}

/**
 * The window's half. `ask()` is what to send; `take(answer)` is the whole
 * snapshot to draw, or null when the answer builds on a list this window has
 * dropped, which is asked again with nothing. An answer older than one already
 * taken hands back the newer list.
 */
export function snapshotReader({ keep = 6 } = {}) {
  const held = new Map();
  let newest = null;
  const remember = (token, state, snapshot) => {
    held.set(token, state);
    newest = { token, snapshot, ...partsOf(token) };
    while (held.size > keep) held.delete(held.keys().next().value);
    return snapshot;
  };
  return {
    ask() {
      return newest ? { since: newest.token } : undefined;
    },
    take(answer) {
      if (!answer || typeof answer !== 'object') return answer ?? null;
      const { snapshotToken: token, delta, ...rest } = answer;
      if (token && newest) {
        const { run, count } = partsOf(token);
        if (run === newest.run && count < newest.count) return newest.snapshot;
      }
      if (!delta) {
        if (!token) { held.clear(); newest = null; return answer; }
        const { items: all, ...parts } = rest;
        const items = Array.isArray(all) ? all : [];
        return remember(token, { byKey: new Map(items.map((i) => [keyOf(i), i])), order: items.map(keyOf), parts }, rest);
      }
      const base = held.get(delta.since);
      if (!base) { held.clear(); newest = null; return null; }
      const byKey = new Map(base.byKey);
      for (const key of delta.removed ?? []) byKey.delete(key);
      for (const item of delta.changed ?? []) byKey.set(keyOf(item), item);
      const order = delta.order ?? base.order;
      const parts = { ...base.parts, ...rest };
      for (const name of delta.gone ?? []) delete parts[name];
      return remember(token, { byKey, order, parts }, { ...parts, items: order.map((key) => byKey.get(key)).filter(Boolean) });
    },
  };
}

function partsOf(token) {
  const at = String(token).lastIndexOf('.');
  return { run: String(token).slice(0, at), count: Number(String(token).slice(at + 1)) };
}

/**
 * Only the thread on screen shows an agent's log and the sentence it is typing.
 * The rest carry their newest step, so what a read costs does not grow with
 * everything every agent is doing.
 */
export function lightRunning(running, open) {
  return (running ?? []).map((r) => (r.itemId === open?.id && r.product === open?.product
    ? r
    : { ...r, tail: [], activity: (r.activity ?? []).slice(-1), saying: '', sayingAt: 0 }));
}
