// September 21: both supplied backgrounds must be selectable in order, with
// independent panel opacity that survives reloads, clamps extremes and resets.
import { describe, it, expect } from 'vitest';
import { LOOKS, lookMeans, resolveTune, storeTune, applyTune, TUNE_DEFAULT } from '../renderer/src/skins.ts';
describe('the peach themes remember panel whiteness', () => {
  it('saves the winning theme without wiping other theme controls', () => {
    const stored=storeTune(storeTune(null,'lake',{blur:4,dim:.5}),'peach-haze-2',{blur:0,dim:.35,panelOpacity:.24});
    expect(resolveTune(stored,'peach-haze-2').panelOpacity).toBe(.24);
    expect(resolveTune(stored,'lake').blur).toBe(4);
  });
  it.each([[-1,0],[0,0],[1,1],[2,1],['bad',.2],[null,.2]])('resolves %s safely to %s', (value,expected) => {
    expect(resolveTune(JSON.stringify({'peach-haze-2':{panelOpacity:value}}),'peach-haze-2').panelOpacity).toBe(expected);
  });
  it('uses provisional defaults for old saved tunes and does not add opacity to other themes', () => {
    expect(resolveTune('{"peach-haze-2":{"blur":3,"dim":0}}','peach-haze-2').panelOpacity).toBe(.2);
    expect(resolveTune('{"lake":{"panelOpacity":0.2}}','lake').panelOpacity).toBeUndefined();
    expect(TUNE_DEFAULT['peach-haze-2'].panelOpacity).toBe(.2);
  });
  it('updates the live CSS variable and clears a previous theme’s override', () => {
    const props={};const root={style:{setProperty:(k,v)=>props[k]=v}};
    applyTune({blur:12,dim:0,panelOpacity:.24},root);
    expect(props['--skin-panel-opacity']).toBe('0.24');
    applyTune({blur:2,dim:0},root);
    expect(props['--skin-panel-opacity']).toBe('');
  });
});
