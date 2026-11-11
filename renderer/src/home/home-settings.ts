import { useEffect, useState } from 'react';
import { shownSkyId } from './sky';

// The sky chosen for each look is kept on this machine only.
/** The sky theme picked, or PLAIN once plain Light or Dark is picked; Match system clears it. */
export const SKY_THEME_KEY = 'zero.sky.theme';
const CHANGED = 'agentbox:home-settings';

/** `skyTheme` is the sky worn, with the default filled in (./sky: shownSkyId); `picked` is whether a sky was chosen. */
export type HomeSettings = { skyTheme: string | null; picked: boolean };

const darkNow = () => document.documentElement.dataset.theme !== 'light';

function read(): HomeSettings {
  let saved: string | null = null;
  try { saved = localStorage.getItem(SKY_THEME_KEY) || null; } catch { /* private window */ }
  const skyTheme = shownSkyId(saved, darkNow());
  return { skyTheme, picked: !!skyTheme && skyTheme === saved };
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
    const mo = new MutationObserver(again);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { window.removeEventListener(CHANGED, again); window.removeEventListener('storage', again); mo.disconnect(); };
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
