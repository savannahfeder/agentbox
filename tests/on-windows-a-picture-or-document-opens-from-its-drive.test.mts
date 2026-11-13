// ON WINDOWS A PICTURE OR DOCUMENT OPENS FROM ITS DRIVE.
//
// No picture, film, deck or design page drew on Windows. The window asks for a
// file on the app's own schemes, and the url was made by splitting the path on
// '/', which a Windows path does not have. The whole path went out as one
// segment and came back with a slash in front of the drive, and the root check
// refused it.
//
// Measured on Windows 11 with node 22, a picture written to a temp folder and
// that folder given as the only root.
//
//   the file      C:\Users\...\Temp\pic-measure-sS0ECw\shot.png
//   its url       agentbox-img://file/C%3A%5CUsers%5C...%5Cshot.png
//   read back     \C:\Users\...\Temp\pic-measure-sS0ECw\shot.png
//   servable      false
//
// The document pane's scheme gave the same answer for a page it had just
// granted, and the phone's /f/ door read the same shape. A Mac and Linux keep
// the urls they had, byte for byte, and the window reads a drive in a path only
// when it is on Windows itself (on-a-mac-or-linux-each-picture-resolves-as-pinned-here).
//
// With that fixed, measured again on the same computer. A picture a page names
// beside itself, or a message names as file:///C:/..., reached the window as
// /C:/Users/... and went out as agentbox-img://file/C%3A/Users/..., which the
// reader refuses. A folder with a space went out encoded twice. A bare C:\
// source was looked for under each root as a name. And a root and a file that
// differ only in the case of a letter, c:\users\me\x.png under C:\Users\me,
// were refused though Windows opens them as one. A drive given as the root,
// C:\, held nothing under it, because the root check put a second separator
// after the one the drive already ends in.
//
// These schemes are the only thing between a page and the disk, so most of
// this file is what a Windows url must never reach.

import { describe, it, expect, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { imgUrl, imgPath, servable, IMG_SCHEME } from '../main/img-scheme.mts';
import { docUrl, docPath, DocGrants, DOC_SCHEME } from '../main/doc-scheme.mts';
import { createServer, fileKey, picturesTheAppOwns } from '../main/serve.mts';
import { fileBeside, pictureUrl, wholeMediaPath, wholePicturePath } from '../renderer/src/picture.ts';
import { phoneFileUrl } from '../renderer/src/phone-files.ts';

const IMG = `${IMG_SCHEME}://file`;
const DOC = `${DOC_SCHEME}://file`;
// The window on Windows. A test has no window, which the window reads as not Windows.
const WIN = true;

describe('a Windows path as a url', () => {
  it('puts the drive first and the rest in forward slashes', () => {
    expect(imgUrl('C:\\Users\\me\\p\\shot.png', 'win32')).toBe(`${IMG}/C:/Users/me/p/shot.png`);
    expect(docUrl('C:\\Users\\me\\p\\page.html', 'win32')).toBe(`${DOC}/C:/Users/me/p/page.html`);
  });

  it('reads a path written with forward slashes the same way', () => {
    expect(imgUrl('C:/Users/me/p/shot.png', 'win32')).toBe(`${IMG}/C:/Users/me/p/shot.png`);
  });

  it('keeps a name with a space, a hash, a bracket or a percent whole', () => {
    for (const name of ['a b.png', 'one#two.png', 'shot [1].png', '100%.png', 'é.png', 'PROGRA~1.png']) {
      const url = imgUrl(`D:\\work\\${name}`, 'win32');
      expect(url.startsWith(`${IMG}/D:/work/`)).toBe(true);
      expect(imgPath(url, 'win32')).toBe(`D:\\work\\${name}`);
    }
  });

  it('comes back as the path it was made from', () => {
    expect(imgPath(`${IMG}/C:/Users/me/p/shot.png`, 'win32')).toBe('C:\\Users\\me\\p\\shot.png');
    expect(docPath(`${DOC}/C:/Users/me/p/page.html`, 'win32')).toBe('C:\\Users\\me\\p\\page.html');
  });

  it('is drawn by the window at the same url the main process reads', () => {
    expect(pictureUrl('C:\\Users\\me\\p\\shot.png', WIN)).toBe(imgUrl('C:\\Users\\me\\p\\shot.png', 'win32'));
    expect(pictureUrl('C:/Users/me/p/a b#1.png', WIN)).toBe(imgUrl('C:\\Users\\me\\p\\a b#1.png', 'win32'));
  });
});

describe('a Mac or Linux url', () => {
  it.each(['darwin', 'linux'])('is the one it always was on %s', (platform) => {
    expect(imgUrl('/Users/x/.staging/a b#1?.png', platform)).toBe(`${IMG}/Users/x/.staging/a%20b%231%3F.png`);
    expect(docUrl('/home/x/p/page.html', platform)).toBe(`${DOC}/home/x/p/page.html`);
    expect(imgPath(`${IMG}/Users/x/a%20b.png`, platform)).toBe('/Users/x/a b.png');
    expect(docPath(`${DOC}/Users/x/attachments/../../../etc/hosts`, platform)).toBe('/etc/hosts');
    // A backslash is an ordinary character in a name there.
    expect(imgPath(imgUrl('/home/x/a\\b.png', platform), platform)).toBe('/home/x/a\\b.png');
  });

  it.each(['darwin', 'linux'])('is not made from a Windows path on %s', (platform) => {
    expect(imgUrl('C:\\Users\\me\\shot.png', platform)).toBe(null);
    expect(docUrl('C:\\Users\\me\\page.html', platform)).toBe(null);
  });
});

describe('what a Windows path never becomes a url from', () => {
  it.each([
    ['a share', '\\\\server\\share\\a.png'],
    ['a share in forward slashes', '//server/share/a.png'],
    ['a device path', '\\\\?\\C:\\a.png'],
    ['the other device path', '\\\\.\\C:\\a.png'],
    ['a drive with no root', 'C:a.png'],
    ['a relative path', 'p\\a.png'],
    ['a path with no drive', '\\Users\\me\\a.png'],
  ])('%s', (_, file) => {
    expect(imgUrl(file, 'win32')).toBe(null);
    expect(docUrl(file, 'win32')).toBe(null);
  });

  it('the window leaves a drive with no root alone', () => {
    expect(pictureUrl('C:a.png', WIN)).toBe('C:a.png');
  });
});

describe('what a Windows url never reads', () => {
  it.each([
    ['a share', '//server/share/a.png'],
    ['a share in encoded backslashes', '/%5C%5Cserver%5Cshare%5Ca.png'],
    ['a device path', '/%5C%5C%3F%5CC:%5Ca.png'],
    ['a drive with no root', '/C:a.png'],
    ['an encoded drive', '/C%3A/a.png'],
    ['no drive', '/Users/me/a.png'],
    ['a drive that is not a letter', '/1:/a.png'],
    ['a climb above the drive', '/C:/a/../../Windows/a.png'],
    ['an encoded climb above the drive', '/C:/%2e%2e/%2e%2e/Windows/a.png'],
    ['a climb in encoded backslashes', '/C:/p/a%5c..%5c..%5cWindows%5ca.png'],
    ['an encoded climb left as a name', '/C:/p/%2e%2e%5ca.png'],
    ['an encoded slash', '/C:/p/a%2f..%2fb.png'],
    ['a stream behind a name', '/C:/p/a.png:hidden'],
    ['a device name', '/C:/p/con.png'],
    ['a device name with a space before its dot', '/C:/p/con%20.png'],
    ['a device name with spaces before its dot', '/C:/p/NUL%20%20.png'],
    ['a port with a superscript one', '/C:/p/COM%C2%B9.png'],
    ['a port with a superscript two', '/C:/p/lpt%C2%B2.png'],
    ['a port with a superscript three and no dot', '/C:/p/com%C2%B3'],
    ['a name Windows would trim', '/C:/p/a.png.'],
    ['a nul in a name', '/C:/p/a%00.png'],
    ['an encoding that does not decode', '/C:/p/a%E0%A4.png'],
  ])('%s', (_, at) => {
    expect(imgPath(`${IMG}${at}`, 'win32')).toBe(null);
    expect(docPath(`${DOC}${at}`, 'win32')).toBe(null);
  });

  it('a climb that stays on the drive is still held to the roots', () => {
    // The url parser resolves the climb, so what is left is an ordinary path
    // the root check answers.
    expect(imgPath(`${IMG}/C:/root/../other/a.png`, 'win32')).toBe('C:\\other\\a.png');
  });

  it.each([
    ['console.png', 'C:\\p\\console.png'],
    ['con%20x.png', 'C:\\p\\con x.png'],
    ['COM%C2%B9x.png', 'C:\\p\\COM¹x.png'],
    ['com%E2%81%B4.png', 'C:\\p\\com⁴.png'],
  ])('a name that only starts like a device, %s', (name, file) => {
    expect(imgPath(`${IMG}/C:/p/${name}`, 'win32')).toBe(file);
  });

  it('a url on another scheme', () => {
    expect(imgPath(`${DOC}/C:/p/a.png`, 'win32')).toBe(null);
    expect(docPath(`${IMG}/C:/p/a.png`, 'win32')).toBe(null);
    expect(imgPath('file:///C:/p/a.png', 'win32')).toBe(null);
  });
});

describe('a picture and a page on this disk', () => {
  const made = [];
  const temp = (name) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), name)); made.push(d); return d; };
  afterAll(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

  it('a picture inside a root opens and one beside it does not', () => {
    const root = temp('picture-root-');
    const beside = temp('picture-beside-');
    const shot = path.join(root, 'shot one.png');
    const other = path.join(beside, 'other.png');
    fs.writeFileSync(shot, 'x');
    fs.writeFileSync(other, 'x');
    expect(servable(imgPath(imgUrl(shot)), [root])).toBe(true);
    expect(imgPath(imgUrl(shot))).toBe(shot);
    expect(servable(imgPath(imgUrl(other)), [root])).toBe(false);
  });

  it('a granted page opens and one in another folder does not', () => {
    const dir = temp('page-root-');
    const beside = temp('page-beside-');
    const page = path.join(dir, 'page.html');
    const grants = new DocGrants();
    grants.grant(page);
    expect(grants.allows(docPath(docUrl(page)))).toBe(true);
    expect(grants.allows(docPath(docUrl(path.join(beside, 'page.html'))))).toBe(false);
  });

  it.runIf(process.platform === 'win32')('a picture on a share is refused even when a share is a root', () => {
    expect(servable(imgPath(`${IMG}//server/share/a.png`), ['\\\\server\\share'])).toBe(false);
  });
});

describe('the phone asking for a picture on this disk', () => {
  const made = [];
  const servers = [];
  afterAll(() => {
    for (const s of servers) s.close();
    for (const d of made) fs.rmSync(d, { recursive: true, force: true });
  });
  const TOKEN = 'a-token-for-this-run';
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001', 'hex');

  async function door({ root, platform, files }) {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-dist-'));
    made.push(dist);
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>agentbox</title>');
    const server = createServer({
      channels: new Map(),
      token: TOKEN,
      dist,
      platform,
      files: files ?? picturesTheAppOwns({ config: { accountRoot: root }, store: { listProducts: () => [] } }),
    });
    servers.push(server);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${server.address().port}`;
  }

  it('gets the picture at the address the window rewrites to', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-root-'));
    made.push(root);
    const shot = path.join(root, 'a b#1.png');
    fs.writeFileSync(shot, png);
    const origin = await door({ root });
    const res = await fetch(origin + phoneFileUrl(imgUrl(shot), fileKey(TOKEN)));
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(true);
  });

  // The root check is never reached for these, so a refusal here is the path
  // reader's and not the roots'. It answers no, so a mistake touches no disk.
  const asked = [];
  const rootCheck = { allows: (_, file) => { asked.push(file); return false; } };

  it('reaches the root check with the file a good address names', async () => {
    asked.length = 0;
    const origin = await door({ platform: 'win32', files: rootCheck });
    expect((await fetch(`${origin}/f/${fileKey(TOKEN)}/img/C:/p/a%20b.png`)).status).toBe(403);
    expect(asked).toEqual(['C:\\p\\a b.png']);
  });

  it.each([
    ['a share', '//server/share/a.png'],
    ['a share written inside the root', '/C:/p/%5C%5Cserver%5Cshare%5Ca.png'],
    ['a device path inside the root', '/C:/p/%5C%5C.%5CC:%5Ca.png'],
    ['a drive with no root', '/C:p/a.png'],
    ['an encoded drive', '/C%3A/p/a.png'],
    ['a climb in encoded backslashes', '/C:/p/a%5c..%5c..%5ca.png'],
    ['an encoded climb left as a name', '/C:/p/%2e%2e%5ca.png'],
    ['a stream behind a name', '/C:/p/a.png:hidden'],
    ['a device name', '/C:/p/nul.png'],
    ['a name Windows would trim', '/C:/p/a.png.'],
  ])('is refused %s on Windows before the root check', async (_, at) => {
    asked.length = 0;
    const origin = await door({ platform: 'win32', files: rootCheck });
    const res = await fetch(`${origin}/f/${fileKey(TOKEN)}/img${at}`);
    expect(res.status).toBe(403);
    expect(asked).toEqual([]);
  });
});

describe('a picture a page or a message names, on Windows', () => {
  it('beside its page is drawn from the page folder', () => {
    expect(pictureUrl(fileBeside('pic.png', 'C:\\Users\\me\\dir', WIN), WIN)).toBe(imgUrl('C:\\Users\\me\\dir\\pic.png', 'win32'));
    expect(pictureUrl(fileBeside('../shots/pic.png', 'C:\\Users\\me\\dir', WIN), WIN)).toBe(imgUrl('C:\\Users\\me\\shots\\pic.png', 'win32'));
  });

  it('beside a page in a folder with a space reads back as that file', () => {
    const url = pictureUrl(fileBeside('a b.png', 'C:\\Users\\Some One\\dir', WIN), WIN);
    expect(imgPath(url, 'win32')).toBe('C:\\Users\\Some One\\dir\\a b.png');
  });

  it('as a file url is the whole path it names', () => {
    expect(wholePicturePath('file:///C:/Users/me/a%20b.png', WIN)).toBe('C:/Users/me/a b.png');
    expect(pictureUrl(wholePicturePath('file:///C:/Users/me/a%20b.png', WIN), WIN)).toBe(imgUrl('C:\\Users\\me\\a b.png', 'win32'));
  });

  it('as a bare drive path is the whole path, not a name to look for under each root', () => {
    expect(wholePicturePath('C:\\Users\\me\\a.png', WIN)).toBe('C:\\Users\\me\\a.png');
    expect(wholePicturePath('C:/Users/me/a.png', WIN)).toBe('C:/Users/me/a.png');
  });

  it('as a url path with its drive after a slash is still on that drive', () => {
    expect(pictureUrl('/C:/Users/me/a.png', WIN)).toBe(imgUrl('C:\\Users\\me\\a.png', 'win32'));
  });

  it('is left to the roots when it is a name, a drive with no root or another scheme', () => {
    for (const src of ['attachments/a.png', './a.png', 'C:a.png', 'https://example.com/a.png', 'data:image/png;base64,AA']) {
      expect(wholePicturePath(src, WIN)).toBe(null);
    }
  });
});

describe('a root on Windows, whatever the case of its letters', () => {
  it('holds a picture written in another case', () => {
    expect(servable('c:\\users\\me\\x.png', ['C:\\Users\\me'], 'win32')).toBe(true);
    expect(servable('C:\\Users\\Me\\X.PNG', ['c:\\users\\ME'], 'win32')).toBe(true);
  });

  it('does not hold the folder beside it', () => {
    expect(servable('C:\\Users\\meX\\x.png', ['C:\\Users\\me'], 'win32')).toBe(false);
    expect(servable('c:\\users\\mex\\x.png', ['C:\\Users\\me'], 'win32')).toBe(false);
    expect(servable('D:\\Users\\me\\x.png', ['C:\\Users\\me'], 'win32')).toBe(false);
  });

  it('does not fold a letter Windows may not count as the same', () => {
    // The kelvin sign lowers to k in JavaScript.
    expect(servable('C:\\Users\\\u212Aate\\x.png', ['C:\\Users\\kate'], 'win32')).toBe(false);
    expect(servable('C:\\Users\\KATE\\x.png', ['C:\\Users\\kate'], 'win32')).toBe(true);
  });

  it('holds what is on a drive when the root is the drive itself', () => {
    expect(servable('C:\\x.png', ['C:\\'], 'win32')).toBe(true);
    expect(servable('c:\\Users\\me\\x.png', ['C:/'], 'win32')).toBe(true);
    expect(servable('D:\\x.png', ['C:\\'], 'win32')).toBe(false);
    const grants = new DocGrants(8, 'win32');
    grants.grant('C:\\page.html');
    expect(grants.allows('C:\\shots\\a.png')).toBe(true);
    expect(grants.allows('D:\\shots\\a.png')).toBe(false);
  });

  it('opens a granted page folder in another case and not the folder beside it', () => {
    const grants = new DocGrants(8, 'win32');
    grants.grant('C:\\Users\\me\\dir\\page.html');
    expect(grants.allows('c:\\users\\me\\DIR\\a.png')).toBe(true);
    expect(grants.allows('C:\\Users\\me\\dirX\\a.png')).toBe(false);
  });

  it.each([
    ['a stream behind a name', 'C:\\root\\x:hidden.png'],
    ['a device name', 'C:\\root\\con.png'],
    ['a device name with a space before its dot', 'C:\\root\\nul .png'],
    ['a port with a superscript one', 'C:\\root\\COM\u00B9.png'],
    ['a folder Windows would trim', 'C:\\root\\dir.\\x.png'],
    ['a folder ending in a space', 'C:\\root\\dir \\x.png'],
  ])('does not hold %s, whoever asks', (_, file) => {
    expect(servable(file, ['C:\\root'], 'win32')).toBe(false);
  });

  it('does not hold a path that starts at no drive, even under a root of the same shape', () => {
    expect(servable('\\\\server\\share\\a.png', ['\\\\server\\share'], 'win32')).toBe(false);
    expect(servable('//server/share/a.png', ['//server/share'], 'win32')).toBe(false);
    expect(servable('\\root\\a.png', ['\\root'], 'win32')).toBe(false);
  });

  it('holds an ordinary name beside those', () => {
    expect(servable('C:\\root\\dir\\console.png', ['C:\\root'], 'win32')).toBe(true);
    expect(servable('C:\\root\\a\\..\\x.png', ['C:\\root'], 'win32')).toBe(true);
  });

  it.each(['darwin', 'linux'])('still minds the case on %s', (platform) => {
    expect(servable('/users/me/x.png', ['/Users/me'], platform)).toBe(false);
    expect(servable('/Users/me/x.png', ['/Users/me'], platform)).toBe(true);
    const grants = new DocGrants(8, platform);
    grants.grant('/Users/me/dir/page.html');
    expect(grants.allows('/users/me/dir/a.png')).toBe(false);
  });
});

describe('the window', () => {
  it.each([['Win32', true], ['MacIntel', false], ['Linux x86_64', false], ['iPhone', false]])('reads a navigator that says %s', async (platform, windows) => {
    vi.resetModules();
    vi.stubGlobal('document', {});
    vi.stubGlobal('navigator', { platform, userAgent: '' });
    try {
      expect((await import('../renderer/src/picture.ts')).WINDOWS).toBe(windows);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('is not on Windows when there is no window', async () => {
    expect((await import('../renderer/src/picture.ts')).WINDOWS).toBe(false);
  });
});

describe('a folder whose name looks like url syntax, on Windows', () => {
  it.each([
    ['a hash', 'C# notes'],
    ['a percent', '100% done'],
    ['a space', 'my dir'],
  ])('keeps a picture beside its page in a folder with %s', (_, name) => {
    const url = pictureUrl(fileBeside('pic.png', `C:\\Users\\me\\${name}`, WIN), WIN);
    expect(imgPath(url, 'win32')).toBe(`C:\\Users\\me\\${name}\\pic.png`);
  });

  it('still climbs out of the folder as the page asks', () => {
    expect(fileBeside('../shots/a.png', 'C:\\Users\\me\\C# notes', WIN)).toBe('C:/Users/me/shots/a.png');
  });

  it('never climbs on a name that only decodes to a climb or a separator', () => {
    for (const name of ['..%2f..%2fx.png', '..%5c..%5cx.png', 'a%2Fb.png', '%2e%2e%5cx.png']) {
      expect(fileBeside(name, 'C:\\Users\\me\\dir', WIN)).toBe(`C:/Users/me/dir/${name}`);
      expect(imgPath(pictureUrl(fileBeside(name, 'C:\\Users\\me\\dir', WIN), WIN), 'win32')).toBe(`C:\\Users\\me\\dir\\${name}`);
    }
    expect(fileBeside('a%20b.png', 'C:\\Users\\me\\dir', WIN)).toBe('C:/Users/me/dir/a b.png');
  });
});

describe('a file url that does not decode, on Windows', () => {
  it('is kept as written rather than stopping the message from drawing', () => {
    expect(wholePicturePath('file:///C:/x/a%zz.png', WIN)).toBe('C:/x/a%zz.png');
  });
});

describe('a sound, a film or a voice note a message names by its whole path', () => {
  const focus = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')), '..', 'renderer', 'src', 'components', 'Focus.tsx'), 'utf8');

  it('is asked for at that path, not under each root', () => {
    // A path starting with a slash is the only whole path the old check knew.
    expect(focus).not.toMatch(/(?:src|href)\.startsWith\('\/'\) \? \[pictureUrl/);
    expect(focus).toMatch(/const whole = wholeMediaPath\(src\);\s+const candidates = found \? \[pictureUrl\(found\)\] : whole !== null \? \[pictureUrl\(whole\)\]/);
    expect(focus).toMatch(/const whole = wholeMediaPath\(href\);\s+const urls = whole !== null \? \[pictureUrl\(whole\)\]/);
  });

  it('is read as a whole path for a film on a drive, bare or as a file url', () => {
    expect(wholeMediaPath('C:\\Users\\me\\clip.mp4', WIN)).toBe('C:\\Users\\me\\clip.mp4');
    expect(wholeMediaPath('file:///C:/Users/me/a%20b.m4a', WIN)).toBe('C:/Users/me/a b.m4a');
    expect(pictureUrl(wholeMediaPath('C:\\Users\\me\\clip.mp4', WIN), WIN)).toBe(imgUrl('C:\\Users\\me\\clip.mp4', 'win32'));
    expect(wholeMediaPath('clips/a.mp4', WIN)).toBe(null);
  });

  it('goes straight to the picture scheme only as a whole path, and anything else is looked for under the roots', () => {
    for (const src of ['file://clips/a.mp4', 'file://%5C%5Cx%5Cclip.mp4', 'file://%5Cclip.mp4', 'file://C:clip.mp4']) {
      expect(wholeMediaPath(src, WIN)).toBe(null);
    }
    expect(wholeMediaPath('file:///clips/a.mp4', WIN)).toBe('/clips/a.mp4');
  });
});
