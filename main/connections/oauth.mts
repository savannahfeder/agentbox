// SIGNING IN TO A TOOL: its own screen in the person's own browser, a loopback
// page to come back to, PKCE, and a client registered for that page.
import http from 'node:http';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import {
  discoverAuthorizationServerMetadata, discoverOAuthProtectedResourceMetadata,
  exchangeAuthorization, refreshAuthorization, registerClient, startAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CatalogTool } from '../../shared/connections-catalog.mts';
import { Name } from '../../shared/product-name.mjs';
import type { SignedIn, SignInGot } from './vault.mts';

export const SIGN_IN_MS = 5 * 60_000;
export const STEP_MS = 15_000;

export const deadlineFetch = (ms: number): FetchLike => (url, init = {}) =>
  fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms) });

async function discover(entry: CatalogTool, fetchFn: FetchLike) {
  const fallback = new URL('/', entry.address).toString();
  let authServer = fallback;
  try {
    const found = await discoverOAuthProtectedResourceMetadata(entry.address, {}, fetchFn);
    authServer = found.authorization_servers?.[0] ?? fallback;
  } catch { /* an older server names no resource metadata: its own origin signs in */ }
  const metadata = await discoverAuthorizationServerMetadata(authServer, { fetchFn });
  if (!metadata) throw new Error(`${entry.name} does not say where to sign in`);
  return { authServer, metadata };
}

export function loopbackPage({ state, ms, port = 0, name }: { state: string; ms: number; port?: number; name: string }) {
  let settle!: { resolve: (code: string) => void; reject: (err: Error) => void };
  const code = new Promise<string>((resolve, reject) => { settle = { resolve, reject }; });
  // Nobody is awaiting this yet while the client registers.
  code.catch(() => {});
  const server = http.createServer((req, res) => {
    const u = new URL(req.url!, 'http://127.0.0.1');
    const say = (status: number, words: string) => {
      res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>${Name}</title><body style="font:15px -apple-system,system-ui,sans-serif;margin:64px;color:#222">${words}</body>`);
    };
    // A stray or forged knock must not end a sign-in the person is in the middle of.
    if (u.pathname !== '/callback' || u.searchParams.get('state') !== state) { say(400, `This is not the sign-in ${Name} is waiting for.`); return; }
    if (u.searchParams.get('error')) { say(200, 'Nothing was connected. You can close this tab.'); settle.reject(new Error('You said no on the sign-in screen, so nothing was connected.')); return; }
    const got = u.searchParams.get('code');
    if (!got) { say(400, `Nothing was connected. Go back to ${Name} and press Connect to try again.`); settle.reject(new Error(`${name} came back without a code, so nothing was connected.`)); return; }
    say(200, `Connected. You can close this tab and go back to ${Name}.`);
    settle.resolve(got);
  });
  const timer = setTimeout(() => settle.reject(new Error('The sign-in did not finish in time, so nothing was connected. Press Connect to try again.')), ms);
  return {
    code,
    listen: () => new Promise<string>((resolve, reject) => {
      server.once('error', (err: NodeJS.ErrnoException) => reject(err?.code === 'EADDRINUSE' ? new Error(`Another sign-in is using the address ${name} comes back to. Finish that one, then try again.`) : err));
      // A client made in a vendor's console is told one exact address, so that one has a fixed port.
      server.listen(port, '127.0.0.1', () => resolve(port ? `http://localhost:${port}/callback` : `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`));
    }),
    close: () => { clearTimeout(timer); server.closeAllConnections?.(); server.close(); },
    cancel: () => settle.reject(new Error('The sign-in was cancelled.')),
  };
}

/** The whole dance. Returns what the vault keeps; never a partial sign-in. */
export async function signIn({ entry, openExternal, client: ownClient = null, ownPort = 0, ms = SIGN_IN_MS, onCancelable = () => {} }: {
  entry: CatalogTool;
  openExternal: (url: string) => unknown;
  client?: OAuthClientInformationMixed | null;
  ownPort?: number;
  ms?: number;
  onCancelable?: (cancel: () => void) => void;
}): Promise<SignInGot> {
  const fetchFn = deadlineFetch(STEP_MS);
  let found;
  try { found = await discover(entry, fetchFn); } catch (err) {
    throw entry.custom ? Object.assign(err as Error, { noRegistration: true }) : err;
  }
  const { authServer, metadata } = found;
  if (!ownClient && !metadata.registration_endpoint) {
    throw Object.assign(new Error(`${entry.name} does not let apps register themselves.`), { noRegistration: true });
  }
  const state = crypto.randomBytes(24).toString('base64url');
  const page = loopbackPage({ state, ms, port: ownClient ? ownPort : 0, name: entry.name });
  onCancelable(page.cancel);
  try {
    const redirectUrl = await page.listen();
    const client = ownClient ?? await registerClient(authServer, {
      metadata,
      clientMetadata: { client_name: Name, redirect_uris: [redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' },
      fetchFn,
    });
    const resource = new URL(entry.address);
    const { authorizationUrl, codeVerifier } = await startAuthorization(authServer, {
      metadata, clientInformation: client, redirectUrl, state, resource, ...(entry.scope ? { scope: entry.scope } : {}),
    });
    await openExternal(authorizationUrl.toString());
    const code = await page.code;
    let tokens;
    try {
      tokens = await exchangeAuthorization(authServer, {
        metadata, clientInformation: client, authorizationCode: code, codeVerifier, redirectUri: redirectUrl, resource, fetchFn,
      });
    } catch (err) {
      if (ownClient) throw new Error(`${entry.name} did not accept that client ID and secret, so nothing was connected.`);
      throw err;
    }
    return { tokens, client, authServer, metadata };
  } finally { page.close(); }
}

/** One refresh. A server that rotates gets its new token kept; one that does not keeps the old. */
export async function refreshTokens({ entry, signedIn }: { entry: CatalogTool; signedIn: SignedIn }): Promise<OAuthTokens> {
  // Only a sign-in holding a refresh token is refreshed, and only the OAuth dance leaves one, with its server and client.
  const tokens = await refreshAuthorization(signedIn.authServer!, {
    metadata: signedIn.metadata, clientInformation: signedIn.client!, refreshToken: signedIn.tokens.refresh_token!,
    resource: new URL(entry.address), fetchFn: deadlineFetch(STEP_MS),
  });
  return { ...tokens, refresh_token: tokens.refresh_token ?? signedIn.tokens.refresh_token };
}
