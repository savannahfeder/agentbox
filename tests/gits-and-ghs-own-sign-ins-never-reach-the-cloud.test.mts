// Weekly security audit, 2026-11-16. The list of places that hold a sign-in
// refused ~/.netrc and ~/.config/gh but not git's own credential store
// (~/.git-credentials, ~/.config/git/credentials) or the Keychain item gh keeps
// its token in on a Mac (gh:github.com, gh:<enterprise host>). A cloud run's key
// ask for any of them passed the check, and one press read it: measured with a
// stand-in home and a stubbed `security`, all three dummy tokens were read.
import { describe, it, expect } from 'vitest';
import { keySource } from '../shared/cloud-key-sources.mts';
import { keychainItemHoldsSignIns, pathHoldsSignIns } from '../shared/sign-in-places.mts';

describe("git's and gh's own sign-ins never reach the cloud", () => {
  it.each(['.git-credentials', '.Git-Credentials', '.config/git/credentials', '.Config/Git/Credentials'])('the file %s is refused', (rel) => {
    expect(pathHoldsSignIns(rel)).toBe(true);
    expect(keySource({ place: 'file', from: `~/${rel}` })).toBeNull();
  });

  it.each(['gh:github.com', 'GH:github.com', 'gh:ghe.example.com'])('the Keychain item %s is refused', (item) => {
    expect(keychainItemHoldsSignIns(item)).toBe(true);
    expect(keySource({ place: 'keychain', from: item })).toBeNull();
  });

  it('while files and items that only look like them still give their key', () => {
    for (const rel of ['.config/git/config', 'notes/git-credentials-howto.md', 'ghost/token.txt']) expect(pathHoldsSignIns(rel), rel).toBe(false);
    for (const item of ['ghost-api', 'github deploy key', 'POSTHOG_KEY']) expect(keychainItemHoldsSignIns(item), item).toBe(false);
  });
});
