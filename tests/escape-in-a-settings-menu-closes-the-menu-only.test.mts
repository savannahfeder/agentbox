// ESCAPE IN A SETTINGS MENU CLOSES THE MENU, NOT SETTINGS.
//
// What broke (QA batch 005, F-124): opening a dropdown in Settings › Phone and
// pressing Escape closed the dropdown AND left Settings entirely. The two
// listeners could never share the key: Settings listens on the window's
// CAPTURE phase and the picker on the document's bubble, so Settings always
// went first and always won. Escape now asks what is open before it decides
// the press was about Settings at all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { whatTakesEscape } from '../renderer/src/settings-escape';

const open = (...classes) => ({
  querySelector: (sel) => (classes.some((c) => sel.split(',').some((s) => s.trim() === c)) ? {} : null),
});

describe('who gets the press', () => {
  it('the picker, while one is open', () => {
    expect(whatTakesEscape(open('.set-picker.open'))).toBe('menu');
  });

  // The boundary either side: with nothing open the press is Settings' own,
  // and a screen over Settings still outranks both.
  it('Settings, with nothing open over it', () => {
    expect(whatTakesEscape(open())).toBe('settings');
  });
  it('a screen over Settings, which takes its own keys', () => {
    expect(whatTakesEscape(open('.ps-over', '.set-picker.open'))).toBe('over');
  });
});

describe('the class it looks for', () => {
  // The selector is the whole of the rule, and a renamed class would turn it
  // off with no symptom but the original bug coming back.
  it('is the one an open picker really wears', () => {
    const src = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
    expect(src).toContain("`set-picker${open ? ' open' : ''}");
    expect(src).toContain("`set-picker set-picker-bare${open ? ' open' : ''}");
  });

  it('is what Settings asks before it closes', () => {
    const src = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
    expect(src).toContain('whatTakesEscape(document)');
  });
});
