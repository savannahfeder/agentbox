import { useSyncExternalStore } from 'react';
import { dismissPhoneStatus, phoneStatusDismissed } from '../phone-status-dismissal';

const EVENT = 'agentbox-phone-status-dismissed';
const dismissed = new Set<string>();
function subscribe(update: () => void) {
  window.addEventListener(EVENT, update);
  window.addEventListener('storage', update);
  return () => {
    window.removeEventListener(EVENT, update);
    window.removeEventListener('storage', update);
  };
}

export function PhoneStatus({ message, className = 'phone-status' }: { message?: string | null; className?: string }) {
  const hidden = useSyncExternalStore(subscribe, () => {
    if (!message || dismissed.has(message)) return true;
    try { return phoneStatusDismissed(message, window.localStorage); } catch { return false; }
  }, () => false);
  if (!message || hidden) return null;
  return <div className={`${className} phone-status-dismissible`} role="status">
    <span>{message}</span>
    <button type="button" aria-label="Dismiss notice" title="Dismiss notice" onClick={() => {
      dismissed.add(message);
      try { dismissPhoneStatus(message, window.localStorage); } catch { /* Keep dismissal for this visit. */ }
      window.dispatchEvent(new Event(EVENT));
    }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" /></svg></button>
  </div>;
}
