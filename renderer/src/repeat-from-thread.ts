// A repeat made from a thread is named what the thread is called, so its runs
// are told the whole message here (standingInstruction reads the body).
/** The one thread a rhythm typed in Later can make repeat: one open, or one ticked. Never an outside agent. */
export function oneToRepeat<T extends { agent?: unknown }>(picked: T | T[] | null | undefined): T | null {
  const one = Array.isArray(picked) ? (picked.length === 1 ? picked[0] : null) : picked ?? null;
  return one && !one.agent ? one : null;
}

/** Opens a repeating task's row from the keyboard, the way a click does. */
export function opensOnKey(open: () => void) {
  return (e: { key: string; preventDefault(): void; stopPropagation(): void }) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    open();
  };
}

export function repeatBody(item: { title?: string; body?: string }): string {
  const title = (item.title ?? '').trim();
  const body = (item.body ?? '').trim();
  return body ? `${title}\n\n${body}` : title;
}
