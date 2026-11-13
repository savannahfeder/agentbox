import React from 'react';
import ReactDOM from 'react-dom/client';
import { cloudClient, type CloudClient, type CloudConfig } from '../cloud-rest';
import { SharedFilePage } from './SharedFilePage';
import { NO_SUCH_LINK } from './route';

/**
 * Back from Google with a code, or from a new account's email with its sign-in
 * after `#`: finished here, and taken out of the address, so the person lands
 * on the same file signed in. Answers what went wrong, or null.
 */
export async function finishComingBack(client: Pick<CloudClient, 'finishGoogle' | 'finishEmailLink'>, loc: Pick<Location, 'href' | 'hash' | 'pathname' | 'search'>, replace: (url: string) => void): Promise<string | null> {
  const url = new URL(loc.href);
  const code = url.searchParams.get('code');
  const emailLink = /(^|[#&])(access_token|error)=/.test(loc.hash) ? loc.hash : '';
  try {
    if (code) {
      url.searchParams.delete('code');
      replace(url.pathname + url.search);
      await client.finishGoogle(code);
    } else if (emailLink) {
      replace(loc.pathname + loc.search);
      await client.finishEmailLink(emailLink);
    }
    return null;
  } catch (err) {
    return String((err as Error)?.message ?? err);
  }
}

export function bootSharedFile(token: string, cfg: CloudConfig) {
  if (token !== NO_SUCH_LINK && location.pathname !== `/f/${token}`) history.replaceState(history.state, '', `/f/${token}${location.search}${location.hash}`);
  const client = cloudClient(cfg, { storage: localStorage, fetchImpl: (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(15_000) }) });
  const finishing = finishComingBack(client, location, (to) => history.replaceState(history.state, '', to));
  document.documentElement.dataset.page = 'shared-file';
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><SharedFilePage token={token} client={client} finishing={finishing} /></React.StrictMode>,
  );
}
