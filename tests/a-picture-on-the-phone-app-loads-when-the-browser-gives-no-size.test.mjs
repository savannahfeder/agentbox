// The phone app's browser build threw "Cannot destructure property 'width'
// from null or undefined value" on opening a thread with a folder of pictures:
// React Native for the web calls an Image's onLoad without `nativeEvent.source`,
// and the folder's pictures and the attachment thumbnails read its width and
// height straight off it. Found by photographing the preview build in WebKit.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const files = ['mobile/src/ui/Markdown.tsx', 'mobile/src/ui/Attach.tsx'];

describe('a picture on the phone app loads when the browser gives no size', () => {
  for (const file of files) {
    it(`${file} reads a loaded picture's size only when there is one`, () => {
      const src = fs.readFileSync(file, 'utf8');
      const handlers = src.split('\n').filter((line) => line.includes('onLoad='));
      expect(handlers.length).toBeGreaterThan(0);
      for (const h of handlers) expect(h).not.toMatch(/=\s*e\.nativeEvent\.source;/);
    });
  }

  it('still reads the size where the phone gives one', () => {
    for (const file of files) expect(fs.readFileSync(file, 'utf8')).toMatch(/e\.nativeEvent\?\.source \?\? \{\}/);
  });
});
