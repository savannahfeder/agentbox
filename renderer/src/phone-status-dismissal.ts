const KEY = 'agentbox.dismissed-phone-status';
type NoticeStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function phoneStatusDismissed(message: string, storage: Pick<Storage, 'getItem'>): boolean {
  try { return dismissedMessages(storage).includes(message); } catch { return false; }
}

export function dismissPhoneStatus(message: string, storage: NoticeStorage): void {
  try { storage.setItem(KEY, JSON.stringify([...new Set([...dismissedMessages(storage), message])])); } catch { /* Private browsers may refuse storage. */ }
}

function dismissedMessages(storage: Pick<Storage, 'getItem'>): string[] {
  const saved: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
  return Array.isArray(saved) ? saved.filter((message): message is string => typeof message === 'string') : [];
}
