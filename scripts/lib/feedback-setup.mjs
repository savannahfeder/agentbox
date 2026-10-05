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

// Mail has to come from a domain verified with Resend. That is often NOT the
// recipient's own domain but a subdomain of it (the first real run was refused
// for exactly that), so the domain is asked for and the recipient's is only the
// starting guess.
export const senderAt = (domain, name = 'Agentbox Feedback') => `${name} <feedback@${domain}>`;

export function domainOf(email) {
  const at = String(email ?? '').lastIndexOf('@');
  return at < 1 ? null : String(email).slice(at + 1);
}

export function senderFor(recipient, name = 'Agentbox Feedback') {
  const domain = domainOf(recipient);
  return domain ? senderAt(domain, name) : null;
}

export const looksLikeDomain = (s) => /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(String(s ?? '').trim());

// Resend's reason, as the server function passes it back, when the reason is
// that the sending domain is not one it has verified.
export const refusedForDomain = (detail) => /domain/i.test(String(detail ?? '')) && /verif/i.test(String(detail ?? ''));

export const looksLikeResendKey = (key) => /^re_[A-Za-z0-9_]{8,}$/.test(String(key ?? '').trim());
export const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s ?? '').trim());

// Which of our secrets are already saved on the project, read off whatever
// `supabase secrets list` printed (a table or JSON). Names only: Supabase never
// shows a value back, so nothing secret passes through here.
const OURS = ['RESEND_API_KEY', 'FEEDBACK_TO', 'FEEDBACK_FROM'];
export function savedSecrets(output) {
  const text = String(output ?? '');
  return new Set(OURS.filter((name) => new RegExp(`(^|[^A-Z0-9_])${name}([^A-Z0-9_]|$)`, 'm').test(text)));
}

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
