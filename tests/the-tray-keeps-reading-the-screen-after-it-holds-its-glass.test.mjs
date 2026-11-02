// THE TRAY WAS A GREY SLAB OVER A BLACK WINDOW. It takes light or dark from the
// brightness its glass measures behind it, then holds the glass to that tone.
// On macOS 27.0.1 holding the glass's appearance turns the backdrop layer's
// luma tracking off, and the native part only turned it on once per layer, so
// the first hold froze the reading for good. A probe stepped one clear glass
// through black, white, held light, black: the reading went 0, 1, then stayed
// 1 over black with tracksLuma reading 0 and no further callbacks. Turning
// tracking back on whenever it is found off, it read 0 over black while held
// light and 1 over white while held dark.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'main/native/liquid-glass/liquid-glass.mm'), 'utf8');

function body(name) {
  const start = source.indexOf(`*${name}(`);
  expect(start, `${name} is in liquid-glass.mm`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(source.indexOf('{', start), i + 1);
  }
  throw new Error(`${name} never closes`);
}

describe('the brightness reading survives the tray holding its glass', () => {
  const watched = body('WatchedBackdrop');
  // The block that runs once per layer: hooking the delegate and the rate.
  const once = watched.match(/if \(!objc_getAssociatedObject\(layer, &kWatchedKey\)\) \{[^}]*\}/)?.[0] ?? '';

  it('asks the layer whether it is still tracking', () => {
    expect(source).toMatch(/NSSelectorFromString\(@"tracksLuma"\)/);
    expect(watched).toMatch(/TracksLumaGetter\(\)\)\)/);
  });

  it('turns tracking back on outside the once-per-layer setup', () => {
    expect(once).not.toBe('');
    const after = watched.replace(once, '');
    expect(after).toMatch(/TracksLuma\(\),\s*YES/);
  });

  it('asks before calling the getter it was not promised', () => {
    expect(source).toMatch(/respondsToSelector:\s*TracksLumaGetter\(\)/);
  });
});
