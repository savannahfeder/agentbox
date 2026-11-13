// Where the person said the key is: "in my Keychain as posthog-read-key", "~/.config/resend.key",
// "POSTHOG_KEY in ~/app/.env", "$OPENROUTER_API_KEY in my shell".
const NOT_AN_ITEM = /^(key|it|one|token|computer|mac|laptop|machine|as|called|named|under|item|entry|and|so|too|is|has|holds|where)$/i;

export function keyPlaceIn(text) {
  // Every mention, not the first: a thread's title is cut off mid-sentence ("in my Keychain as…").
  // "Keychain as X" first: in "PostHog from my Keychain as posthog-read-key" the word before is the service.
  for (const m of text.matchAll(/keychain(?:\s+(?:item|entry))?[\s,]*(?:(?:as|called|named|under|has|holds)[\s:"“'`]+|[:"“'`]\s*)([A-Za-z0-9][\w.@-]*)/gi)) {
    if (!NOT_AN_ITEM.test(m[1])) return { place: 'keychain', from: m[1].replace(/\.$/, '') };
  }
  for (const m of text.matchAll(/([A-Za-z0-9][\w.@-]{2,})\s+(?:in|from)\s+(?:my\s+|your\s+|the\s+)?keychain/gi)) {
    if (!NOT_AN_ITEM.test(m[1])) return { place: 'keychain', from: m[1] };
  }
  for (const m of text.matchAll(/keychain(?:\s+(?:item|entry))?[\s,:"“'`]*(?:(?:as|called|named|under|has|holds)[\s:"“'`]+)?([A-Za-z0-9][\w.@-]*)/gi)) {
    if (!NOT_AN_ITEM.test(m[1])) return { place: 'keychain', from: m[1].replace(/\.$/, '') };
  }
  const sh = text.match(/\$([A-Z][A-Z0-9_]+)/);
  if (sh && /shell|zshrc|bashrc|profile|environment|export/i.test(text)) return { place: 'shell', from: sh[1] };
  const f = text.match(/(~\/[^\s"'`”),]+)/);
  if (!f) return null;
  const from = f[1].replace(/[.:;]$/, '');
  const entry = /\.env\b/.test(from) ? text.match(/\b([A-Z][A-Z0-9_]{2,})\s+(?:in|from)\s+~\//)?.[1] : undefined;
  return { place: 'file', from, ...(entry ? { entry } : {}) };
}
