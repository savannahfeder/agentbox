// Which notes beside a file are still held for Send, and when the rest were sent.
type MarkLine = { ts: number; patch?: { artifact?: { do?: string; on?: unknown; id?: string; wait?: boolean } } | null };

/** When each note was first sent, from the line that sent it. */
export function sentTimes(lines: readonly MarkLine[]): Map<string, number> {
  const at = new Map<string, number>();
  for (const l of lines) {
    const a = l.patch?.artifact;
    if (a?.do !== 'sent' && a?.do !== 'toagent') continue;
    for (const id of Array.isArray(a.on) ? a.on : [a.on]) if (typeof id === 'string' && !at.has(id)) at.set(id, l.ts);
  }
  return at;
}

/** Notes held for Send that nothing has sent or settled yet. */
export function notesStillHeld(lines: readonly MarkLine[]): Set<string> {
  const sent = sentTimes(lines);
  const held = new Set<string>();
  for (const l of lines) {
    const a = l.patch?.artifact;
    if (a?.do === 'note' && a.wait && a.id && !sent.has(a.id)) held.add(a.id);
    if (a?.do === 'resolve' && typeof a.on === 'string') held.delete(a.on);
  }
  return held;
}
