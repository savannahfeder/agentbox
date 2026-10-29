// The look the app wears (lib/look.ts), kept in the app's own store and worn
// before anything under it draws. Changing it redraws every screen in place,
// so Settings stays open on Appearance while the colours change under you.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { LOOK_KEY, lookOf, wornOf, type PhoneLook, type Worn } from '../lib/look';
import { appStore } from '../platform/persist';
import { wear } from '../ui/theme';

type LookState = { look: PhoneLook; worn: Worn; pick: (look: PhoneLook) => void };
const Ctx = createContext<LookState>({ look: 'dark', worn: 'dark', pick: () => {} });

export function LookProvider({ children }: { children: ReactNode }) {
  const [look, setLook] = useState<PhoneLook>(() => lookOf(appStore.getItem(LOOK_KEY)));
  const worn = wornOf(look, useColorScheme());
  // Worn here, while drawing, so no screen under this ever draws in the old colours.
  wear(worn);
  const pick = useCallback((next: PhoneLook) => { appStore.setItem(LOOK_KEY, next); setLook(next); }, []);
  const value = useMemo(() => ({ look, worn, pick }), [look, worn, pick]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLook = () => useContext(Ctx);
