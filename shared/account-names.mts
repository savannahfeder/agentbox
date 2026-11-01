// WHAT ONE LOGIN IS CALLED, in the one rule both sides read: the Settings
// page, which has named accounts by their email since it had rows, and the
// sentence a thread gets when a login runs out, which had no name for one at
// all until w-e1a42f6b21.

/**
 * @param {{ email?: string | null, engine?: string, index?: number, total?: number }} account
 *  `index` is its place among that engine's accounts, `total` how many there
 *  are: one account is not counted, because the number would mean nothing.
 */
export function accountName({ email = null, engine = 'claude', index = 0, total = 1 } = {}) {
  if (email) return email;
  const word = engine === 'codex' ? 'Codex' : 'Claude';
  return `${word} account${total > 1 ? ` ${index + 1}` : ''}`;
}
