// A REDRAWN PICTURE IS NOT SERVED FROM MEMORY.
//
// w-3fc39983be: a font change in redrawn pictures never showed up. An agent
// redrew six pictures under the same file names. The design page's html came
// back new, and every picture in it came back from the window's memory, so the
// reader saw round two's captions over round one's pictures, twice.
//
// Measured with scripts/probe-a-redrawn-picture.cjs, a hidden window built like
// the app's (file:// window, sandboxed frame, a standard secure scheme served
// with net.fetch): picture replaced on disk 2250 -> 3118 wide, page reopened,
// the frame drew 2250. With `cache-control: no-store` it drew 3118.
//
// The window is the only thing that can show it, so what is pinned here is the
// header on both schemes that hand out a product's files.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = fs.readFileSync(path.join(here, '..', 'main', 'main.mjs'), 'utf8');

describe('a file the window is handed', () => {
  it('is marked no-store', () => {
    const helper = main.slice(main.indexOf('function noStore('), main.indexOf('function noStore(') + 300);
    expect(helper).toContain("headers.set('cache-control', 'no-store')");
  });

  it('on the page scheme and on the picture scheme both', () => {
    const doc = main.slice(main.indexOf('for (const scheme of DOC_SCHEMES) protocol.handle'), main.indexOf('for (const scheme of IMG_SCHEMES) protocol.handle'));
    const img = main.slice(main.indexOf('for (const scheme of IMG_SCHEMES) protocol.handle'), main.indexOf('createWindow();', main.indexOf('for (const scheme of IMG_SCHEMES)')));
    expect(doc).toMatch(/return noStore\(await net\.fetch\(/);
    expect(img).toContain('noStore(res)');
    // The copy handler still needs to read a picture back out.
    expect(img).toContain("'access-control-allow-origin', '*'");
  });
});
