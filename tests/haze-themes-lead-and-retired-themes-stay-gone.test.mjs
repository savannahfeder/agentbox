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
it('leads with Ember Grid, then the Haze pair, and ends with plain Light and Dark', () => {
  // Ember first, hers on w-2ff620f13b, 2026-09-28.
  expect(LOOKS.slice(0,3).map(x=>x.id)).toEqual(['ember-grid','valley-haze','frost-haze']);
  expect(LOOKS.slice(-2).map(x=>x.id)).toEqual(['light','dark']);
  expect(LOOKS.some(x=>x.id === 'match')).toBe(false);
  expect(DEFAULT_SKIN).toBe('ember-grid');
});
it('removes precisely the seven requested pictures and keeps Watercolor Mist', () => {
  for (const id of ['ice-river','lake-harbour','moon-pines','cel-dusk','pixel-harbour','vector-dunes','lino-coast']) {
    expect(SKINS.some(x=>x.id === id)).toBe(false);
    expect(normalize('dark',id)).toEqual(['dark','valley-haze']);
  }
  expect(normalize('dark','watercolour-mist')).toEqual(['dark','watercolour-mist']);
});
it('gives a brand new Mac the default, light or dark, and migrates system matching', () => {
  // w-3fc39983be: the Ember (orange) theme is the default.
  expect(normalize(null,null,'dark')).toEqual(['dark','ember-grid']);
  expect(normalize(null,null,'light')).toEqual(['dark','ember-grid']);
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
