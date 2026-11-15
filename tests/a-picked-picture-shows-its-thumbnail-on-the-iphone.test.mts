// On the iPhone app a picked screenshot showed no thumbnail in New thread, so
// it was picked again and the thread went out with the same picture twice. The
// thumbnail was drawn from a data: URI of the whole file (a 1206x2622 PNG is
// megabytes of base64), which iOS can fail to draw without an error. It is now
// drawn from the picked file, and the same file picked again is not added twice.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { thumbUri, withPicked } from '../mobile/src/lib/attach';

const shot = { name: 'IMG_1328.png', dataBase64: 'iVBORw0KGgo=', uri: 'file:///var/mobile/Containers/Data/Application/x/Library/Caches/ImagePicker/1.png' };

describe('a picture waiting to go', () => {
  it('draws its thumbnail from the picked file while the phone has it', () => {
    expect(thumbUri(shot)).toBe(shot.uri);
  });

  it('falls back to its bytes when read back from a saved draft, with no file', () => {
    expect(thumbUri({ name: 'IMG_1328.png', dataBase64: 'AAA' })).toBe('data:image/png;base64,AAA');
    expect(thumbUri({ name: 'photo-1.JPG', dataBase64: 'AAA' })).toBe('data:image/jpeg;base64,AAA');
  });

  it('keeps the picked file through the picker on the phone, and not on the web', () => {
    const pick = fs.readFileSync(new URL('../mobile/src/platform/pick.ts', import.meta.url), 'utf8');
    expect(pick.match(/\.\.\.onPhone\(a\.uri\)/g)).toHaveLength(2);
    expect(pick).toMatch(/Platform\.OS === 'web' \? \{\} : \{ uri \}/);
    const attach = fs.readFileSync(new URL('../mobile/src/ui/Attach.tsx', import.meta.url), 'utf8');
    expect(attach).toMatch(/source=\{\{ uri: thumbUri\(file\) \}\}/);
  });
});

describe('picking the same picture again', () => {
  it('does not add it twice', () => {
    expect(withPicked([shot], [{ ...shot, uri: 'file:///other.png' }])).toEqual([shot]);
  });

  it('still adds a different picture, and one with the same name but other bytes', () => {
    const other = { name: 'IMG_1329.png', dataBase64: 'BBB' };
    const sameName = { name: 'IMG_1328.png', dataBase64: 'CCC' };
    expect(withPicked([shot], [other, sameName])).toEqual([shot, other, sameName]);
  });

  it('is how every attach box adds what was picked', () => {
    for (const file of ['ui/NewThreadForm.tsx', 'app/thread/[product]/[id].tsx', 'ui/FeedbackPage.tsx']) {
      const src = fs.readFileSync(new URL(`../mobile/src/${file}`, import.meta.url), 'utf8');
      expect(src, file).toMatch(/withPicked\(f, more\)/);
      expect(src, file).not.toMatch(/\[\.\.\.f, \.\.\.more\]/);
    }
  });
});
