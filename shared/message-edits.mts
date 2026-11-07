// EDITING OR DELETING A MESSAGE YOU SENT. An edit is a delta on a later ledger
// line, `{ on, text }` or `{ on, gone: true }`, naming the message by its line
// uid. The store's fold and the chat both read edits through this, so the row's
// one line and the conversation can never disagree about what a message says.

/**
 * The newest edit of each message, by uid, counting only edits written by the
 * message's own author: a teammate can write any field on their own line, so
 * the author check is what keeps your words yours. A deletion is final.
 *
 * @param {{ uid?: string | null, by?: string | null }[]} messages
 * @param {{ on: string, by?: string | null, ts: number, text?: string, gone?: boolean }[]} edits
 * @returns {Map<string, { text?: string, gone?: true, at: number }>}
 */
export function resolveEdits(messages, edits) {
  const author = new Map();
  for (const m of messages) if (m?.uid && m.by && !author.has(m.uid)) author.set(m.uid, m.by);
  const out = new Map();
  for (const e of edits) {
    if (!e?.on || !e.by || author.get(e.on) !== e.by) continue;
    const was = out.get(e.on);
    if (was?.gone) continue;
    if (e.gone) { out.set(e.on, { gone: true, at: e.ts }); continue; }
    if (was && was.at > e.ts) continue;
    if (typeof e.text === 'string' && e.text.trim()) out.set(e.on, { text: e.text, at: e.ts });
  }
  return out;
}

/** The `edit` delta on one ledger line, as `resolveEdits` takes it, or null. */
export function editOfLine(line) {
  const e = line?.patch?.edit;
  if (!e || typeof e !== 'object' || typeof e.on !== 'string') return null;
  return { on: e.on, by: typeof line.by === 'string' ? line.by : null, ts: line.ts, ...(e.gone === true ? { gone: true } : { text: e.text }) };
}
