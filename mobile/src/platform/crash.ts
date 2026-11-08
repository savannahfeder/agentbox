// Imported first by the root layout, so an error during startup is caught too.
// The write is synchronous: the app ends straight after the handler returns.
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { catchCrashes, crashNoteFrom, type CrashNote } from '../lib/crash-note';

const file = () => new File(Paths.document, 'last-crash.json');

const version = () => [Constants.expoConfig?.version, Constants.nativeBuildVersion && `(${Constants.nativeBuildVersion})`].filter(Boolean).join(' ')
  + `, ${Platform.OS} ${Platform.Version}`;

if (Platform.OS !== 'web') {
  catchCrashes((globalThis as { ErrorUtils?: Parameters<typeof catchCrashes>[0] }).ErrorUtils, (text) => {
    const f = file();
    if (!f.exists) f.create();
    f.writeSync(text);
  }, version, Date.now);
}

export function keptCrash(): CrashNote | null {
  if (Platform.OS === 'web') return null;
  try { const f = file(); return f.exists ? crashNoteFrom(f.textSync()) : null; } catch { return null; }
}

export function forgetCrash() {
  try { const f = file(); if (f.exists) f.delete(); } catch { /* sent twice at worst */ }
}
