// What broke: pictures in the web app drew as "missing image:
// attachments/%5Bhidden%5D.png" (w-c187f19b37, 2026-10-28, a screenshot from
// her phone). The copy of a thread sent to the phone hides anything that looks
// like a key, and a key is 32 or more letters and digits in both cases. A saved
// picture's name is a random prefix joined to the file's own name, so
// `d271780fa97efb10-4A7B3C2D-1E5F-…` (an iPhone picture) and
// `mt0reku0-ab12cd-Screenshot-2026-10-28-at-3` (a Mac screenshot) both read as
// one, and the link pointed at a file called `[hidden].png`.
import { describe, it, expect } from 'vitest';
import { hideSecrets } from '../shared/phone-snapshot.mjs';

describe('a picture name reaches the phone whole', () => {
  it('leaves the names of saved and drawn files alone', () => {
    for (const said of [
      '![4A7B3C2D-1E5F-4A6B-8C9D-0E1F2A3B4C5D.png](attachments/d271780fa97efb10-4A7B3C2D-1E5F-4A6B-8C9D-0E1F2A3B4C5D.png)',
      '![Screenshot-2026-10-28-at-3.14.00-PM.png](attachments/mt0reku0-ab12cd-Screenshot-2026-10-28-at-3.14.00-PM.png)',
      'designs/w-c187f19b37/Phone-Reply-Box-Dictation-Before-And-After2.png',
      '[Notes](attachments/mt0reku0-ab12cd-Quarterly-Plan-For-The-Team-2026.pdf)',
      'The film is designs/w-1/Launch-Film-Final-Cut-With-Music-V2.mp4 now.',
      '![IMG_1164.png](attachments/d271780fa97efb10-IMG_1164.png)',
    ]) expect(hideSecrets(said), said).toBe(said);
  });

  it('still hides a bare key, at the end of a sentence too', () => {
    expect(hideSecrets('a bare XyZ12abcDEF34ghiJKL56mnoPQR78stuVW key')).toBe('a bare [hidden] key');
    expect(hideSecrets('It used XyZ12abcDEF34ghiJKL56mnoPQR78stuVW.')).toBe('It used [hidden].');
    expect(hideSecrets('XyZ12abcDEF34ghiJKL56mnoPQR78stuVW.example.com')).toBe('[hidden].example.com');
  });

  it('still hides a key with a known shape or a secret name, even in a file path', () => {
    expect(hideSecrets('cat sk-ant-abcdefghijklmnopqrstuvwxyz0123.txt')).toBe('cat [hidden].txt');
    expect(hideSecrets('API_KEY=XyZ12abcDEF34ghiJKL56mnoPQR78stuVW.png')).toBe('API_KEY=[hidden]');
  });
});
