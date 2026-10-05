// The pure half of `npm run setup:feedback` (scripts/set-up-feedback.mjs):
// everything it works out for you so the only things you type are the Resend
// key and the address feedback should reach. Tested in
// tests/setting-up-feedback-asks-for-the-key-and-finds-the-rest.test.mjs.

// "https://<ref>.supabase.co" is how the team cloud's config names the
// project, so the ref is the first label of that host.
export function projectRefFrom(url) {
  try {
    const host = new URL(String(url)).hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export const functionUrl = (ref) => `https://${ref}.supabase.co/functions/v1/feedback`;

// Mail comes from an address at the recipient's own domain, which is the one
// already verified with Resend.
export function senderFor(recipient, name = 'Agentbox Feedback') {
  const at = String(recipient ?? '').lastIndexOf('@');
  if (at < 1) return null;
  return `${name} <feedback${String(recipient).slice(at)}>`;
}

export const looksLikeResendKey = (key) => /^re_[A-Za-z0-9_]{8,}$/.test(String(key ?? '').trim());
export const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s ?? '').trim());

// What `supabase secrets set --env-file` reads. Quoted, because the sender has
// spaces and angle brackets in it.
export function secretsFile({ to, from, key }) {
  const q = (v) => `"${String(v).replace(/(["\\])/g, '\\$1')}"`;
  return `FEEDBACK_TO=${q(to)}\nFEEDBACK_FROM=${q(from)}\nRESEND_API_KEY=${q(key)}\n`;
}

// The app's own config with `feedbackUrl` set and every other line kept.
export function withFeedbackUrl(configText, url) {
  let config = {};
  if (configText && configText.trim()) config = JSON.parse(configText);
  return `${JSON.stringify({ ...config, feedbackUrl: url }, null, 2)}\n`;
}
