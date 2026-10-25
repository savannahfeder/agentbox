// Settings' own reading: the copy of its settings the computer sent, read every
// five seconds while a Settings page is open, with the phone's changes laid
// over it (lib/settings-view.ts) the moment they are sent.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { readSettingsRows, settingCommand, type PhoneRows } from '../../../renderer/src/phone-rows';
import { changesOn, computerOf, readingOf, type Change, type SettingsRow } from '../lib/settings-view';
import { useCloud } from './cloud';

const EVERY_MS = 5000;
const message = (err: unknown) => String((err as Error)?.message ?? err);

function useSettingsState() {
  const c = useCloud();
  const [rows, setRows] = useState<SettingsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<PhoneRows['commands']>([]);

  const read = useCallback(async () => {
    const cloud = c.cloud;
    if (!cloud?.signedIn()) return;
    try { setRows(await readSettingsRows((t, q) => cloud.select(t, q))); setError(null); } catch (err) { setError(message(err)); }
  }, [c.cloud]);
  useEffect(() => {
    void read();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void read(); }, EVERY_MS);
    return () => clearInterval(timer);
  }, [read]);

  const computer = useMemo(() => computerOf(rows ?? []), [rows]);
  const commands = useMemo(() => {
    const known = new Set(c.rows.commands.map((x) => x.id));
    return [...c.rows.commands, ...sent.filter((s) => !known.has(s.id))];
  }, [c.rows.commands, sent]);
  const changes = useMemo(() => changesOn(computer, commands, c.now), [computer, commands, c.now]);

  const change = useCallback(async (ch: Change & { value: unknown }) => {
    if (!computer || !c.cloud) return;
    const row = { id: crypto.randomUUID(), ...settingCommand(computer.device, ch) };
    setSent((was) => [...was, { ...row, created_at: new Date().toISOString(), claimed_at: null, taken_at: null, outcome: null }]);
    try {
      await c.cloud.insertCommand(row);
      c.refresh();
    } catch (err) {
      setSent((was) => was.filter((s) => s.id !== row.id));
      c.say(message(err));
    }
  }, [computer, c.cloud, c.refresh, c.say]);

  return {
    loaded: rows !== null,
    error,
    computer,
    settings: computer?.settings ?? null,
    change,
    reading: (scope: Change['scope'], key: string, copy: unknown, product?: string) => readingOf(changes, scope, key, copy, product),
  };
}

export type SettingsState = ReturnType<typeof useSettingsState>;
const Ctx = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useSettingsState()}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSettings outside SettingsProvider');
  return s;
}
