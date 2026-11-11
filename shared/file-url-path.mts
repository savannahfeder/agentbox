// A FILE ON THIS COMPUTER AS THE PATH OF AN APP SCHEME URL, AND BACK.
//
// The window builds these urls and the main process reads them, so both sides
// take them from here. A Windows file goes out with its drive as the first
// segment, `/C:/Users/me/shot.png`, and comes back only in that shape.

const DRIVE = /^[A-Za-z]:$/;
// Every one of these is either a separator Windows also reads, a stream after a
// name, a character no Windows name can hold, or a name Windows trims to
// something else before it opens it.
const NOT_A_NAME = /[\\/:*?"<>|\x00-\x1f]|[. ]$/;
// Windows also opens a device for COM¹ to COM³ and LPT¹ to LPT³, and for a
// device name with spaces before its dot.
const DEVICE = /^(con|prn|aux|nul|com[\d¹²³]|lpt[\d¹²³]|conin\$|conout\$) *(\.|$)/i;

/** `/a/b%20c.png` for a file, or null when it is not an absolute path on that platform. */
export function urlPathOf(file: unknown, platform: string): string | null {
  if (typeof file !== 'string') return null;
  if (platform === 'win32') {
    // A share or a device path never gets a url, only a drive and its root.
    const at = /^([A-Za-z]:)[\\/]/.exec(file);
    if (!at) return null;
    const parts = file.slice(3).split(/[\\/]/).filter(Boolean).map(encodeURIComponent);
    return `/${at[1]}/${parts.join('/')}`;
  }
  if (!file.startsWith('/')) return null;
  // Segment by segment: encodeURIComponent would eat the separators, and
  // encodeURI would leave '#' and '?' in a filename to be read as url syntax.
  return `/${file.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
}

/**
 * Whether every name in a Windows path is one Windows opens as written, with
 * no stream, no device and nothing it would trim.
 */
export function plainWindowsPath(file: string): boolean {
  return file.replace(/^[A-Za-z]:/, '').split(/[\\/]/).every((name) => name === '' || name === '.' || name === '..'
    || (!NOT_A_NAME.test(name) && !DEVICE.test(name)));
}

/**
 * The Windows file a url path names, or null. Read one segment at a time,
 * because a segment that decodes to a separator, a climb or a stream must be
 * refused rather than joined.
 */
export function windowsFileOf(urlPath: unknown): string | null {
  const [lead, drive, ...rest] = String(urlPath ?? '').split('/');
  if (lead !== '' || !DRIVE.test(drive ?? '')) return null;
  const names: string[] = [];
  for (const segment of rest) {
    let name: string;
    try { name = decodeURIComponent(segment); } catch { return null; }
    if (name === '') continue;
    if (name === '.' || name === '..' || NOT_A_NAME.test(name) || DEVICE.test(name)) return null;
    names.push(name);
  }
  return `${drive}\\${names.join('\\')}`;
}
