import { dismissPhoneStatus, phoneStatusDismissed } from '../../../renderer/src/phone-status-dismissal';

export function noticeDismissal(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const hidden = new Set<string>();
  const listeners = new Set<() => void>();
  return {
    hidden(message: string) {
      return hidden.has(message) || phoneStatusDismissed(message, storage);
    },
    dismiss(message: string) {
      hidden.add(message);
      dismissPhoneStatus(message, storage);
      listeners.forEach(listener => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
