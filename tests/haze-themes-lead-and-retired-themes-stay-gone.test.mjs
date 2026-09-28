// two Haze defaults, seven retired pictures, no system tile. Check both
// color modes and preserve explicitly chosen plain themes.
import { expect, it } from 'vitest';
import { LOOKS, SKINS, DEFAULT_SKIN, normalizeSavedLook, SKIN_KEY } from '../renderer/src/skins.ts';
const normalize = (theme, skin, mode = 'dark') => {
  const values = new Map([['zero.theme', theme], [SKIN_KEY, skin]].filter(([,v]) => v != null));
  const store = {getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v)};
  normalizeSavedLook(store, mode);
  return [store.getItem('zero.theme'), store.getItem(SKIN_KEY)];
};
it('leads with the Haze pair and ends with plain Light and Dark', () => {
  expect(LOOKS.slice(0,2).map(x=>x.id)).toEqual(['valley-haze','frost-haze']);
  expect(LOOKS.slice(-2).map(x=>x.id)).toEqual(['light','dark']);
  expect(LOOKS.some(x=>x.id === 'match')).toBe(false);
  expect(DEFAULT_SKIN).toBe('valley-haze');
});
it('removes precisely the seven requested pictures and keeps Watercolor Mist', () => {
  for (const id of ['ice-river','lake-harbour','moon-pines','cel-dusk','pixel-harbour','vector-dunes','lino-coast']) {
    expect(SKINS.some(x=>x.id === id)).toBe(false);
    expect(normalize('dark',id)).toEqual(['dark','valley-haze']);
  }
  expect(normalize('dark','watercolour-mist')).toEqual(['dark','watercolour-mist']);
});
it('uses Haze defaults for missing preferences and migrates system matching', () => {
  expect(normalize(null,null)).toEqual(['dark','valley-haze']);
  expect(normalize('light',null)).toEqual(['light','frost-haze']);
  expect(normalize('match','none','light')).toEqual(['light','frost-haze']);
  expect(normalize('match','none','dark')).toEqual(['dark','valley-haze']);
  for (const mode of ['light','dark']) expect(normalize(mode,'none')).toEqual([mode,'none']);
  expect(normalize('light','frost-haze')).toEqual(['light','frost-haze']);
});

import { lookRows } from '../renderer/src/palette-rows.ts';
it('switches modes into the Haze defaults, including from a light skin', () => {
  for (const look of ['dark','valley-haze','lake']) {
    expect(lookRows(look).find(r=>r.id === 'theme').to).toBe('frost-haze');
  }
  for (const look of ['light','frost-haze','slate-haze']) {
    expect(lookRows(look).find(r=>r.id === 'theme').to).toBe('valley-haze');
  }
  expect(lookRows('lake').find(r=>r.id === 'theme-off').to).toBe('dark');
});
