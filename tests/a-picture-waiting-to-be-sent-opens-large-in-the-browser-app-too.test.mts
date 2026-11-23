// A PICTURE WAITING TO BE SENT OPENS LARGE IN THE BROWSER APP TOO (w-f689c07680, 2026-11-21).
//
// Two synthetic testers on the browser copy attached a picture to a chat,
// pressed its thumbnail and got "This picture could not be opened." The
// thumbnail drew, because the page points every <img> on the desktop's own
// picture address at the copy's /f/ door (phone-files.ts), but the large view
// loads its picture in an Image() of its own, which nothing rewrote. Measured
// in the copy: the view asked for agentbox-img://file/.../mockup-blue.png and
// the browser refused it (net::ERR_FAILED), while the same file's /f/ address
// answered 200 image/png.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneFileUrl } from '../renderer/src/phone-files.ts';

const view = fs.readFileSync(new URL('../renderer/src/components/PictureView.tsx', import.meta.url), 'utf8');

describe('the large picture view', () => {
  it('loads its picture through the address the page can fetch', () => {
    expect(view).toMatch(/img\.src = fetchableFileUrl\(url\);/);
    expect(view).toMatch(/import \{ fetchableFileUrl \} from '\.\.\/phone-files';/);
  });

  it('is pointed at the copy’s door for a picture on the desktop’s own address, and left alone otherwise', () => {
    expect(phoneFileUrl('agentbox-img://file/tmp/a/.staging/x-mockup.png', 'k1')).toBe('/f/k1/img/tmp/a/.staging/x-mockup.png');
    expect(phoneFileUrl('data:image/png;base64,AAAA', 'k1')).toBe('data:image/png;base64,AAAA');
    expect(phoneFileUrl('https://example.com/a.png', 'k1')).toBe('https://example.com/a.png');
  });
});
