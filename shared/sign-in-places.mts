// WHERE A SIGN-IN LIVES ON THIS COMPUTER, which never goes to the cloud,
// whoever asks and whatever the person presses: a file sent to a cloud thread
// (./cloud-sent-files.mts) and a key a cloud run asks for (./cloud-key-sources.mts).
// No fs here: the renderer reads it to decide which press a card offers.
// Case-blind, because a Mac's disk is: `~/.SSH` opens `~/.ssh`.

const FOLDERS = /(^|\/)(\.ssh|\.aws|\.gnupg|\.netrc|\.npmrc|\.pypirc|\.docker|\.kube|\.claude[^/]*|\.codex|\.agentbox|Keychains|\.config\/gh|\.config\/gcloud|\.password-store)(\/|$)/i;

// Claude Code's login ("Claude Code-credentials", one per sign-in folder),
// Codex's, and the keys that unlock a browser's or this app's saved sign-ins.
const KEYCHAIN_ITEMS = /^(claude code\b|codex\b)|\bsafe storage$/i;

export const SIGN_IN_REFUSED = 'That holds sign-ins, so it never goes to the cloud.';

export const pathHoldsSignIns = (p: string): boolean => FOLDERS.test(p);

export const keychainItemHoldsSignIns = (item: string): boolean => KEYCHAIN_ITEMS.test(item.trim());
