// Where things are kept. The sign-in: the keychain on a phone, the page's own
// storage in the browser preview, only the two keys the sign-in client writes.
// Everything else (drafts, the last project, model and level): one file in the
// app's documents folder, or the page's storage.
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { NOTICE_KEY } from '../lib/ai-notice';
import { ALERTS_KEY } from '../lib/push-device';
import { syncStore } from '../lib/drafts';
import type { Persist } from '../lib/kept';

const KEYS = ['agentbox-cloud-session', 'agentbox-cloud-verifier', ALERTS_KEY, NOTICE_KEY];

export const persist: Persist = Platform.OS === 'web'
  ? {
    read: async () => Object.fromEntries(KEYS.map((k) => [k, localStorage.getItem(k)]).filter(([, v]) => v !== null) as [string, string][]),
    write: async (key, value) => { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); },
  }
  : {
    read: async () => {
      const out: Record<string, string> = {};
      for (const k of KEYS) { const v = await SecureStore.getItemAsync(k); if (v !== null) out[k] = v; }
      return out;
    },
    write: async (key, value) => {
      if (value === null) await SecureStore.deleteItemAsync(key);
      else await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
    },
  };

function fileStore() {
  const file = new File(Paths.document, 'kept.json');
  const store = syncStore({
    read: () => (file.exists ? file.textSync() : null),
    write: async (text) => { if (!file.exists) file.create(); await file.write(text); },
  });
  // A phone may end the app any time after it leaves the screen.
  AppState.addEventListener('change', (state) => { if (state !== 'active') void store.flush(); });
  return store;
}

// Unwrapped on the web: the draft rules catch a full store themselves, and drop pictures to fit.
export const appStore: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } = Platform.OS === 'web'
  ? globalThis.localStorage
  : fileStore();
