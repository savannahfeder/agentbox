// A picture a thread names but nobody can find says "missing image:" and
// then what it is. The desktop shows the file's own name since 2026-11-23,
// where it had shown two lines of path; the phone parity round of 2026-11-25
// found the phone still printing the whole path, which on a phone wraps to
// four lines of folder names.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { shownName } from '../shared/artifact-marks.mts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('a missing picture on the phone', () => {
  it('is named by its file name, as the desktop names it', () => {
    expect(read('mobile/src/ui/Markdown.tsx')).toContain('missing image: {shownName(src)}');
    expect(read('mobile/src/ui/Markdown.tsx')).not.toContain('missing image: {src}');
  });

  it('reads a long path as the file alone', () => {
    expect(shownName('/Users/you/Zero/accounts/abc/product/designs/w-1/inbox-quiet.png')).toBe('inbox-quiet.png');
  });
});
