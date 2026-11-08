import { useEffect, useState } from 'react';

// Home is an alpha feature, switched on in Settings, Alpha features. It and
// the sky chosen for each look are kept on this machine only.
export const HOME_KEY = 'zero.alpha.home';
export const DARK_SKY_KEY = 'zero.sky.dark';
export const LIGHT_SKY_KEY = 'zero.sky.light';
const CHANGED = 'agentbox:home-settings';

export type HomeSettings = { on: boolean; darkSky: string; lightSky: string };

function read(): HomeSettings {
  try {
    return {
      on: localStorage.getItem(HOME_KEY) === '1',
      darkSky: localStorage.getItem(DARK_SKY_KEY) ?? 'dusk',
      lightSky: localStorage.getItem(LIGHT_SKY_KEY) ?? 'sage',
    };
  } catch { return { on: false, darkSky: 'dusk', lightSky: 'sage' }; }
}

export function setHomeSetting(key: typeof HOME_KEY | typeof DARK_SKY_KEY | typeof LIGHT_SKY_KEY, value: string | boolean) {
  try { localStorage.setItem(key, value === true ? '1' : value === false ? '0' : value); } catch { /* private window */ }
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
