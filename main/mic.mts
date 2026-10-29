// Getting the microphone with one press, for a voice note.
//
// macOS asks on behalf of the app that opened Agentbox (Terminal, when it is
// run from a checkout), and once that app has been refused it never shows its
// Allow box again: asking just answers no. So the press clears that one
// refusal, for that one app and the microphone only, and asks again, which
// brings the Allow box back. Only ever on the press, never on its own.
import { execFile } from 'node:child_process';

export const SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone';

const NAMES = {
  'com.apple.Terminal': 'Terminal',
  'com.googlecode.iterm2': 'iTerm',
  'com.microsoft.VSCode': 'VS Code',
  'dev.warp.Warp-Stable': 'Warp',
  'com.mitchellh.ghostty': 'Ghostty',
};

/** The app macOS asks about, from the bundle id macOS gave this process. */
export function micOwner(env = process.env) {
  const id = env.__CFBundleIdentifier;
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(id)) return { id: null, name: null };
  return { id, name: NAMES[id] ?? id.split('.').at(-1) };
}

/** 'granted', or 'settings' once the Settings page has been opened instead. */
export async function getMic({ systemPreferences, openExternal, owner = micOwner(), run = execFile }) {
  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return 'granted';
  if (status === 'denied' && owner.id) {
    await new Promise((resolve) => run('tccutil', ['reset', 'Microphone', owner.id], { timeout: 10_000 }, () => resolve()));
  }
  const granted = await systemPreferences.askForMediaAccess('microphone').catch(() => false);
  if (granted) return 'granted';
  openExternal(SETTINGS_URL);
  return 'settings';
}
