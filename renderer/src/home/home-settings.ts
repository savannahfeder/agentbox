import { useEffect, useState } from 'react';

// Home is an alpha feature, switched on in Settings, Alpha features. It and
// the sky chosen for each look are kept on this machine only.
export const HOME_KEY = 'zero.alpha.home';
/** The sky theme picked, if any; Light, Dark and Match system clear it. */
export const SKY_THEME_KEY = 'zero.sky.theme';
const CHANGED = 'agentbox:home-settings';

export type HomeSettings = { on: boolean; skyTheme: string | null };

function read(): HomeSettings {
  try {
    return {
      on: localStorage.getItem(HOME_KEY) === '1',
      skyTheme: localStorage.getItem(SKY_THEME_KEY) || null,
    };
  } catch { return { on: false, skyTheme: null }; }
}

export function setHomeSetting(key: typeof HOME_KEY | typeof SKY_THEME_KEY, value: string | boolean | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value === true ? '1' : value === false ? '0' : value);
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
