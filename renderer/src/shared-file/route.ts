import { readCloudConfig } from '../cloud-bridge';
import { sharedFileToken } from './shared-file';

// Stands for a /f/ address that is no link at all: the page asks for it and says the link does not work.
export const NO_SUCH_LINK = '-';

/** The shared file's token when this page is one; only the web app carries the cloud's address. */
export function onASharedFilePage(): string | null {
  if (typeof location === 'undefined' || typeof document === 'undefined') return null;
  const onTheWebApp = !!readCloudConfig(document);
  const token = sharedFileToken(location.pathname, onTheWebApp);
  if (token) return token;
  return onTheWebApp && /^\/f\//i.test(location.pathname) ? NO_SUCH_LINK : null;
}
