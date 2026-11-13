// LOOKING AT A PAGE A WORKER JUST BUILT, AND ONLY AT A LOCAL ONE.
//
// Where this comes from (w-5ebf7bf7bb, MP-09). The terminal clients this app is
// keeping parity with mostly ship a browser now. A worker driving a browser of
// OURS is good and should happen; a worker driving the browser the user is
// signed into is not, and that ability must never exist, because that browser
// holds the user's logins, cookies and everything else. That half is a rule in
// CLAUDE.md with a test behind it.
//
// The app has no browser pane of its own to drive. This is the smallest honest thing that
// still delivers what a worker actually needs: start your app, look at it, show
// the user the picture. No window, no logins, nothing of the user's.
//
// LOCAL ONLY, AND THE RULE IS THE POINT RATHER THAN A SETTING. A worker that can
// fetch any address is a worker that can post anything it has read to any
// address. Loopback cannot leave the machine, so the capability is bounded by
// what it can reach rather than by whoever remembers to review a prompt. If
// this is ever widened it is a permission design that needs the owner's
// explicit approval.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveAccount, resolveProduct } from './account.mts';
import { MAC_CHROME, KEEPS_OFF_THE_KEYCHAIN, hiddenBrowser } from '../../shared/hidden-browser.mts';

/** Where a captured picture lands, beside everything else she is shown. */
const SHOTS = 'attachments';

export interface PageShot { png?: Buffer; title?: string; text?: string; error?: string }

export type Capture = (page: { url: string; width: number; height: number }) => Promise<PageShot>;

export interface LookedAt { product: string; url: string; picture: string; title: string; text: string }

interface CdpMessage { id?: number; method?: string; sessionId?: string; result?: unknown; error?: { message?: string } }

/** Only loopback. Anything else is refused with the reason. */
export function localTarget(url: unknown): string {
  let parsed: URL;
  try { parsed = new URL(String(url ?? '')); } catch { throw Error(`Not a URL: ${url}`); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw Error(`Only http and https can be opened, not ${parsed.protocol.replace(':', '')}.`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0';
  if (!local) {
    throw Error(`Only a local address can be opened, and ${parsed.hostname} is not one. This exists so a worker can look at the app it just started; anything wider is a permission decision and not this tool's to make.`);
  }
  return parsed.href;
}

/**
 * The hidden test browser first, so the person's Chrome stays theirs
 * (shared/hidden-browser.mts). Google Chrome comes last, for a Mac with
 * nothing else: there it is held for one capture, a few seconds.
 */
export const browsersToTry = ({ hidden = hiddenBrowser }: { hidden?: () => string | null } = {}): string[] => [
  hidden(),
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  MAC_CHROME,
].filter((bin): bin is string => Boolean(bin));

/** A browser this Mac has, or null when it has none. */
export function findChrome(candidates: readonly string[] = browsersToTry()): string | null {
  for (const bin of candidates) { try { if (fs.statSync(bin).isFile()) return bin; } catch { /* next */ } }
  return null;
}

/**
 * Open the page headlessly, photograph it, and read its words back.
 *
 * `capture` is injected so this is testable without a browser on the machine:
 * the real one below drives Chrome over the devtools protocol, which is the
 * same mechanism the design rounds in this repo already use.
 */
export async function lookAtPage({ product, url, width = 1280, height = 900, capture = captureWithChrome, now = Date.now }: {
  product?: string | null;
  url?: unknown;
  width?: number;
  height?: number;
  capture?: Capture;
  now?: () => number;
} = {}): Promise<LookedAt> {
  const target = localTarget(url);
  // The account scope has to be set before a product can be found, and this
  // module is reachable without going through the tool surface that does it.
  resolveAccount();
  const found = resolveProduct(product);
  const dir = found.dir;
  const slug = found.id ?? path.basename(found.dir);
  const shot = await capture({ url: target, width, height });
  if (!shot?.png) throw Error(shot?.error ?? 'The page could not be opened.');

  const name = `page-${new Date(now()).toISOString().replace(/[:.]/g, '-')}.png`;
  const rel = path.join(SHOTS, name);
  fs.mkdirSync(path.join(dir, SHOTS), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), shot.png);
  return {
    product: slug,
    url: target,
    picture: rel,
    title: shot.title ?? '',
    text: (shot.text ?? '').slice(0, 20_000),
  };
}

/**
 * The real capture. Headless Chrome over the devtools protocol: navigate, wait
 * for the load event, read the rendered text, take the picture. Nothing is
 * stored in the browser, and it is thrown away with the profile directory.
 */
export async function captureWithChrome({ url, width, height, chrome = findChrome(), timeoutMs = 20_000 }: {
  url: string;
  width: number;
  height: number;
  chrome?: string | null;
  timeoutMs?: number;
}): Promise<PageShot> {
  if (!chrome) return { error: 'No Chrome, Chromium or Edge on this computer, so there is nothing to open the page with.' };
  const profile = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'look-at-page-'));
  const child = spawn(chrome, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', ...KEEPS_OFF_THE_KEYCHAIN,
    `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const done = () => { try { child.kill('SIGKILL'); } catch { /* already gone */ } try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ } };

  try {
    const wsUrl = await new Promise<string>((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => reject(Error('the browser never started')), timeoutMs);
      child.stderr.on('data', (d) => {
        buf += d.toString();
        const m = buf.match(/ws:\/\/[^\s]+/);
        if (m) { clearTimeout(timer); resolve(m[0]); }
      });
      child.once('exit', () => { clearTimeout(timer); reject(Error('the browser exited before it was ready')); });
    });
    const ws = new WebSocket(wsUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(Error('could not talk to the browser')); });
    let id = 1;
    const waiting = new Map<number, (m: CdpMessage) => void>();
    ws.onmessage = (e: MessageEvent) => { const m = JSON.parse(e.data) as CdpMessage; if (m.id && waiting.has(m.id)) { waiting.get(m.id)!(m); waiting.delete(m.id); } };
    const send = <T,>(method: string, params: object = {}, sessionId?: string) => new Promise<T>((resolve, reject) => {
      const mine = id++;
      waiting.set(mine, (m) => (m.error ? reject(Error(`${method}: ${m.error.message}`)) : resolve(m.result as T)));
      ws.send(JSON.stringify({ id: mine, method, params, sessionId }));
    });
    const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
    const call = <T = unknown,>(m: string, p?: object) => send<T>(m, p, sessionId);
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
    await call('Page.navigate', { url });
    // The load event, or the timeout, whichever comes first: a page that never
    // finishes loading is still worth photographing.
    await new Promise<void>((resolve) => {
      const stop = setTimeout(resolve, Math.min(timeoutMs, 10_000));
      const onMsg = (e: MessageEvent) => {
        const m = JSON.parse(e.data) as CdpMessage;
        if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId) { clearTimeout(stop); ws.removeEventListener('message', onMsg); resolve(); }
      };
      ws.addEventListener('message', onMsg);
    });
    await new Promise((r) => setTimeout(r, 400));
    const read = await call<{ result?: { value?: { title?: string; text?: string } } } | null>('Runtime.evaluate', {
      expression: '({ title: document.title, text: document.body ? document.body.innerText : "" })',
      returnByValue: true,
    });
    const { data } = await call<{ data: string }>('Page.captureScreenshot', { format: 'png' });
    ws.close();
    return { png: Buffer.from(data, 'base64'), ...(read?.result?.value ?? {}) };
  } catch (error) {
    return { error: `The page could not be opened: ${(error as Error).message}` };
  } finally {
    done();
  }
}
