import { useEffect, useState } from 'react';

// The sky chosen for each look is kept on this machine only.
/** The sky theme picked, if any; Light, Dark and Match system clear it. */
export const SKY_THEME_KEY = 'zero.sky.theme';
const CHANGED = 'agentbox:home-settings';

export type HomeSettings = { skyTheme: string | null };

function read(): HomeSettings {
  try {
    return { skyTheme: localStorage.getItem(SKY_THEME_KEY) || null };
  } catch { return { skyTheme: null }; }
}

export function setHomeSetting(key: typeof SKY_THEME_KEY, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private window */ }
  window.dispatchEvent(new Event(CHANGED));
}

export function useHomeSettings(): HomeSettings {
  const [s, set] = useState(read);
  useEffect(() => {
    const again = () => set(read());
    window.addEventListener(CHANGED, again);
    window.addEventListener('storage', again);
    return () => { window.removeEventListener(CHANGED, again); window.removeEventListener('storage', again); };
  }, []);
  return s;
}

/** Whether the window is wearing a dark look, following `data-theme` on <html>. */
export function useDarkWindow(): boolean {
  const read = () => document.documentElement.dataset.theme !== 'light';
  const [dark, set] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => set(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}
