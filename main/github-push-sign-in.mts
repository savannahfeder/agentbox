// THE GITHUB SIGN-IN A SHIP PUSHES WITH, kept on this computer by the cipher its door has.
//
// Given to git only for the ship's own run, through config in its environment
// (`pushSignIn`), so neither the person's git settings nor any worker sees it.
import { connectionVault, CANNOT_ENCRYPT, type VaultData } from './connections/vault.mts';

type PushVault = VaultData & { token?: string; savedAt?: number };

// A GIT_ name, because the push hook drops every GIT_ variable before its tests run.
export const TOKEN_VAR = 'GIT_AGENTBOX_GITHUB_TOKEN';
const CHECK_MS = 15_000;

interface Cipher { encrypt(text: string): Buffer | null; decrypt(buf: Buffer): string | null; available?: () => boolean }
type Fetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ status: number; headers: { get(name: string): string | null } }>;

// The empty helper clears every helper set before it, so a stale keychain entry cannot answer first.
const HELPER = `!f() { test "$1" = get || exit 0; echo username=x-access-token; echo "password=$${TOKEN_VAR}"; }; f`;

/** The git config that makes a push to GitHub sign in with the token in `TOKEN_VAR`. */
export const pushConfig = (site = 'https://github.com'): [string, string][] => [
  [`credential.${site}.helper`, ''],
  [`credential.${site}.helper`, HELPER],
  ['url.https://github.com/.pushInsteadOf', 'git@github.com:'],
  ['url.https://github.com/.pushInsteadOf', 'ssh://git@github.com/'],
];

/** Why GitHub would not take this token for a push, asking GitHub itself; null when it would. */
export async function tokenRefused(token: string, { fetchImpl = fetch as unknown as Fetch, timeoutMs = CHECK_MS }: { fetchImpl?: Fetch; timeoutMs?: number } = {}): Promise<string | null> {
  let res;
  try {
    res = await fetchImpl('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return 'GitHub did not answer, so nothing was saved. Try again.';
  }
  if (res.status === 401) return 'GitHub did not accept that token. Check it was copied whole.';
  if (res.status < 200 || res.status >= 300) return `GitHub answered ${res.status}, so nothing was saved. Try again.`;
  // Only a classic token lists its scopes; a fine-grained one is checked by the push itself.
  const scopes = res.headers.get('x-oauth-scopes');
  if (scopes != null && !scopes.split(',').map((s) => s.trim()).some((s) => s === 'repo' || s === 'public_repo')) {
    return 'That token cannot push. Make one with the repo box ticked.';
  }
  return null;
}

export function gitHubPushSignIn({ file, cipher, fetchImpl, timeoutMs }: { file: string; cipher: Cipher | null; fetchImpl?: Fetch; timeoutMs?: number }) {
  const vault = connectionVault({ file, cipher });
  const saved = (): string | null => {
    const t = (vault.readNow() as { token?: unknown }).token;
    return typeof t === 'string' && t ? t : null;
  };
  return {
    has: () => !!saved(),
    /** What a ship's run adds for git, or null with nothing saved. */
    forPush(): { env: Record<string, string>; config: [string, string][] } | null {
      const token = saved();
      return token ? { env: { [TOKEN_VAR]: token }, config: pushConfig() } : null;
    },
    /** Drops the saved token, so git's own sign-in answers the push. */
    async forget() {
      if (saved()) await vault.update((data: PushVault) => { delete data.token; delete data.savedAt; });
    },
    /** Checks the token with GitHub and keeps it; throws with words for the card. */
    async save(value: unknown) {
      const token = typeof value === 'string' ? value.trim() : '';
      if (!token) throw new Error('Paste the token first.');
      if (/\s/.test(token) || token.length > 400) throw new Error('That is not one token; check what was pasted.');
      if (!vault.canEncrypt()) throw new Error(CANNOT_ENCRYPT);
      const refused = await tokenRefused(token, { fetchImpl, timeoutMs });
      if (refused) throw new Error(refused);
      await vault.update((data: PushVault) => { data.token = token; data.savedAt = Date.now(); });
    },
  };
}

export type GitHubPushSignIn = ReturnType<typeof gitHubPushSignIn>;
