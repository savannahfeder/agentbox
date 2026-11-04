import { readCloudConfig } from '../cloud-bridge';
import { sharedFileToken } from './shared-file';

/** The shared file's token when this page is one; only the web app carries the cloud's address. */
export function onASharedFilePage(): string | null {
  if (typeof location === 'undefined' || typeof document === 'undefined') return null;
  return sharedFileToken(location.pathname, !!readCloudConfig(document));
}
