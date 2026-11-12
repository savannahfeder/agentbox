// THE GLASS SWITCH IS GONE (w-b4dbfc0f31, 2026-11-12).
//
// Glass made the space around the page see-through on a Mac, behind an Alpha
// switch. On the owner's Mac it read as a dirty grey frame around a warm card,
// so they asked for it to be taken out entirely. Measured off their screenshot:
// the frame came out (50,50,54) around a (34,31,29) card. Every Mac window had
// also been made transparent underneath, even with the switch off.
//
// This checks the window is opaque again on every platform, the switch is not
// in Settings or the saved config, and nothing in the page goes glass.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { alphaFeatures } from '../main/settings.mts';

const root = path.join(import.meta.dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

describe('the glass switch is gone', () => {
  it('makes the main window opaque, with no blur and no see-through window', () => {
    const main = read('main/main.mts');
    const made = main.slice(main.indexOf('window = new BrowserWindow({'));
    const options = made.slice(0, made.indexOf('\n  });'));
    expect(options).toContain("backgroundColor: '#1a1a1c',");
    expect(options).not.toMatch(/transparent|vibrancy|\.\.\.glass/);
    expect(main).not.toMatch(/window-glass|applyGlass|glass-tone/);
    expect(fs.existsSync(path.join(root, 'main/window-glass.mts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'main/native/window-glass'))).toBe(false);
  });

  it('has no Glass switch in Settings or in the Alpha features', () => {
    expect(read('renderer/src/components/Settings.tsx')).not.toMatch(/alphaGlass|label="Glass"/);
    expect(read('main/settings.mts')).not.toMatch(/alphaGlass/);
    expect(alphaFeatures({ alphaGlass: true } as never, { packaged: true })).not.toHaveProperty('glass');
  });

  it('leaves nothing in the page that goes glass', () => {
    expect(read('preload.cjs')).not.toMatch(/agentbox-glass|glassAble|glassTone/);
    expect(read('shared/bridge-map.mts')).not.toMatch(/glassTone/);
    expect(read('renderer/src/App.tsx')).not.toMatch(/GlassBand|dataset\.glass\b|glassTone/);
    expect(read('renderer/src/workspace-navigation.css')).not.toMatch(/\[data-glass\]|\.glass-band/);
    expect(fs.existsSync(path.join(root, 'renderer/src/components/GlassBand.tsx'))).toBe(false);
  });
});
