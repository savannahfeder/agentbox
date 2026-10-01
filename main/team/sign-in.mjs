// SIGNING IN WITH GOOGLE FROM A DESKTOP APP.
//
// Supabase does the Google part. The app opens the sign-in page in the
// person's own browser and listens on 127.0.0.1 for the browser to come back
// with a one-time code, which it trades for a session (PKCE, so the code is
// useless to anyone who did not start this sign-in). The listener exists only
// while a sign-in is in flight and answers nothing but that one path.
//
// The return address must be in the project's allowed list
// (cloud/supabase/config.toml, additional_redirect_urls).
import http from 'node:http';
import { Name } from '../../shared/product-name.mjs';

// Whatever came back in the address is the browser's to show as text, never
// as markup: error_description is anybody's to write (review, 2026-10-01).
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const PAGE = (title, line) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#1a1817;color:#efebe7;font:16px -apple-system,system-ui,sans-serif">
<div style="text-align:center"><div style="font-size:22px;margin-bottom:8px">${escape(title)}</div><div style="color:#a09994">${escape(line)}</div></div>`;

export async function signInWithGoogle({ client, openExternal, returnUrl, timeoutMs = 5 * 60 * 1000 }) {
  const url = new URL(returnUrl);
  const port = Number(url.port);
  if (url.hostname !== '127.0.0.1' || !port) throw new Error(`the sign-in return address must be on 127.0.0.1 with a port, not ${returnUrl}`);

  let finish;
  const done = new Promise((resolve, reject) => { finish = { resolve, reject }; });
  const server = http.createServer(async (req, res) => {
    const here = new URL(req.url, returnUrl);
    if (here.pathname !== url.pathname) { res.writeHead(404); res.end(); return; }
    const code = here.searchParams.get('code');
    const problem = here.searchParams.get('error_description') || here.searchParams.get('error');
    if (!code) {
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE('Sign-in did not finish', problem || `Go back to ${Name} and try again.`));
      finish.reject(new Error(problem || 'sign-in came back without a code'));
      return;
    }
    const { error } = await client.auth.exchangeCodeForSession(code);
    res.writeHead(error ? 400 : 200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(error ? PAGE('Sign-in did not finish', error.message) : PAGE('You are signed in', `You can close this tab and go back to ${Name}.`));
    if (error) finish.reject(error); else finish.resolve();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const timer = setTimeout(() => finish.reject(new Error('sign-in timed out')), timeoutMs);
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: returnUrl, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
    await openExternal(data.url);
    await done;
  } finally {
    clearTimeout(timer);
    server.close();
  }
}
