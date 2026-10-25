// WHAT CLAUDE'S SIGN-IN CODE LOOKS LIKE: the authorization code, a `#`, and
// the state, as Claude's sign-in page shows it to copy. Used to fill the code
// in from the clipboard (main/ipc.mjs) without taking anything else she copied.
export function looksLikeClaudeCode(text) {
  return /^[A-Za-z0-9._~+/=-]{10,}#[A-Za-z0-9._~+/=-]{6,}$/.test(String(text || '').trim());
}
