// The General page's Public links, as the computer's copy lists them (shared/phone-settings.mjs `publicLinks`).
import type { Reading } from '../../../renderer/src/phone-settings-view';

export interface PhoneLink { token: string; name: string; url: string; createdAt: number; updatedAt: number; comments: number }

/** The desktop drops a stopped link from its list at once; a refused stop brings it back. */
export const linksShown = (links: readonly PhoneLink[], stopping: Reading): PhoneLink[] =>
  stopping.refused || !stopping.value ? [...links] : links.filter((l) => l.token !== stopping.value);
