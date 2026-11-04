export const LAST_RECIPIENT_KEY = 'zero.lastThreadRecipient';

type Recipient = { to: string; mate: string | null; auto: boolean };

export function readLastRecipient(
  _people: readonly { id: string }[],
  _mates: readonly { id: string }[] | undefined,
  _canReachMates: boolean,
  store: Storage | undefined = globalThis.localStorage,
): Recipient {
  const fallback = { to: 'agent', mate: null, auto: true };
  try {
    const saved = JSON.parse(store?.getItem(LAST_RECIPIENT_KEY) ?? 'null');
    if (!saved || typeof saved.auto !== 'boolean') return fallback;
    // Only Auto or a coding agent carries over: a person or teammate left in To
    // is the next task sent to them by accident.
    if (saved.to === 'agent' && saved.mate === null) return { to: 'agent', mate: null, auto: saved.auto };
  } catch { /* Open with the default if storage is unavailable. */ }
  return fallback;
}

export function writeLastRecipient(recipient: Recipient, store: Storage | undefined = globalThis.localStorage): void {
  if (recipient.mate !== null || recipient.to !== 'agent') return;
  try { store?.setItem(LAST_RECIPIENT_KEY, JSON.stringify(recipient)); } catch { /* The current choice still stands. */ }
}
