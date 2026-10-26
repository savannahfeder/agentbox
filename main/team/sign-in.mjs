// COMING BACK FROM THE BROWSER: A GOOGLE SIGN-IN, A NEW ACCOUNT'S
// CONFIRMATION EMAIL, AND A PASSWORD RESET.
//
// Supabase does the Google part. The app opens the sign-in page in the
// person's own browser and listens on 127.0.0.1 for the browser to come back
// with a one-time code, which it trades for a session (PKCE, so the code is
// useless to anyone who did not start this sign-in). The listener exists only
// while a sign-in is in flight and answers nothing but that one path.
//
// A new account's confirmation link and a reset email's link both come back
// the same way, so neither a password nobody knows nor an email nobody can
// confirm is the end of an account. Both land where the sign-in already lands,
// which is why neither needed anything new in that allowed list.
//
// The return address must be in the project's allowed list
// (cloud/supabase/config.toml, additional_redirect_urls).
import http from 'node:http';
import { Name } from '../../shared/product-name.mjs';
import { plainAuthError } from './auth-words.mjs';

// Whatever came back in the address is the browser's to show as text, never
// as markup: error_description is anybody's to write (review, 2026-10-01).
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const PAGE = (title, line) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#1a1817;color:#efebe7;font:16px -apple-system,system-ui,sans-serif">
<div style="text-align:center"><div style="font-size:22px;margin-bottom:8px">${escape(title)}</div><div style="color:#a09994">${escape(line)}</div></div>`;

// ONE ATTEMPT AT A TIME, AND ANY ATTEMPT CAN BE LET GO (2026-10-04). The first
// teammate to install this clicked Continue with Google and saw nothing: the
// page had opened somewhere she could not see, the button then sat disabled
// for the five minutes the listener waits, and a reload and a second click
// failed on "address already in use", because the first attempt still held
// the return address. A new attempt now replaces the one before it, and a
// cancel frees the address at once.
let inFlight = null;

const cancelled = () => Object.assign(new Error('Sign-in was cancelled.'), { cancelled: true });

/** Stop whatever is waiting on the return address, if anything is. True if one was. */
export function cancelGoogleSignIn() {
  if (!inFlight) return false;
  inFlight.cancel();
  return true;
}

/**
 * Hold the return address until the browser comes back with a code, then hand
 * it to `take`, which trades it or throws the sentence the browser and the
 * caller are both told. `begin` is what sends the person to the browser in the
 * first place, and runs only once the address is held.
 */
async function returningFromTheBrowser({ returnUrl, timeoutMs, what, failedTitle, landed, timedOut, log = () => {}, begin, take }) {
  const url = new URL(returnUrl);
  const port = Number(url.port);
  if (url.hostname !== '127.0.0.1' || !port) throw new Error(`the sign-in return address must be on 127.0.0.1 with a port, not ${returnUrl}`);

  if (inFlight) { log(`team: ${what}: a new attempt replaces the one still waiting`); await inFlight.cancel(); }

  let finish;
  const done = new Promise((resolve, reject) => { finish = { resolve, reject }; });
  done.catch(() => {}); // a cancel can land before anything awaits it
  const page = (res, status, title, line) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE(title, line));
  };
  const server = http.createServer(async (req, res) => {
    const here = new URL(req.url, returnUrl);
    if (here.pathname !== url.pathname) { res.writeHead(404); res.end(); return; }
    const code = here.searchParams.get('code');
    const problem = here.searchParams.get('error_description') || here.searchParams.get('error');
    log(`team: ${what}: the browser came back ${code ? 'with a code' : `without one (${problem || 'no reason given'})`}`);
    if (!code) {
      page(res, 400, failedTitle, problem || `Go back to ${Name} and try again.`);
      finish.reject(new Error(problem || `${what} came back without a code`));
      return;
    }
    try {
      await take(code);
      page(res, 200, landed.title, landed.line);
      finish.resolve();
    } catch (error) {
      page(res, 400, failedTitle, error.message);
      finish.reject(error);
    }
  });

  const closed = () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
  const mine = { cancel: () => { finish.reject(cancelled()); return closed(); } };
  inFlight = mine;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } catch (err) {
    if (inFlight === mine) inFlight = null;
    if (err?.code === 'EADDRINUSE') {
      throw new Error(`Another copy of ${Name} is already waiting for a ${what}. Finish it there, or quit that copy and try again.`);
    }
    throw err;
  }
  const timer = setTimeout(() => finish.reject(new Error(timedOut)), timeoutMs);
  const over = (async () => {
    try {
      await begin(done);
      await done;
      log(`team: ${what}: done`);
    } catch (err) {
      log(`team: ${what}: ${err?.cancelled ? 'cancelled' : `did not finish: ${err?.message ?? err}`}`);
      throw err;
    } finally {
      clearTimeout(timer);
      if (inFlight === mine) inFlight = null;
      await closed();
    }
  })();
  return { over };
}

export async function signInWithGoogle({ client, openExternal, returnUrl, timeoutMs = 5 * 60 * 1000, onUrl = () => {}, log = () => {} }) {
  const { over } = await returningFromTheBrowser({
    returnUrl,
    timeoutMs,
    log,
    what: 'Google sign-in',
    failedTitle: 'Sign-in did not finish',
    landed: { title: 'You are signed in', line: `You can close this tab and go back to ${Name}.` },
    timedOut: 'Google sign-in timed out. Try again.',
    begin: async (done) => {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: returnUrl, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      });
      if (error) throw error;
      log(`team: Google sign-in: opening the browser, waiting on ${returnUrl}`);
      onUrl(data.url);
      await Promise.race([openExternal(data.url), done]);
    },
    take: async (code) => {
      const { error: refused } = await client.auth.exchangeCodeForSession(code);
      // "invalid flow state" is what an old tab, or one from a cancelled try, gets.
      if (!refused) return;
      throw /flow state/i.test(refused.message ?? '')
        ? new Error(`That sign-in page was from an earlier try. Go back to ${Name} and click Continue with Google again.`)
        : refused;
    },
  });
  return over;
}

/**
 * Keep listening for a new account's confirmation link, which the sign-up has
 * already sent. Following it on this Mac finishes the sign-up here: `client`
 * is the one that signed up, and only it holds the other half of the code.
 *
 * The wait is long because it runs across reading an email, and bounded
 * because nothing in this app waits for ever, least of all on the one address
 * the whole app signs in through.
 */
export async function waitForTheConfirmationLink({ client, returnUrl, timeoutMs = 15 * 60 * 1000, log = () => {} }) {
  const { over } = await returningFromTheBrowser({
    returnUrl,
    timeoutMs,
    log,
    what: 'email confirmation',
    failedTitle: 'Confirming your email did not finish',
    landed: { title: 'Your email is confirmed', line: `You can close this tab and go back to ${Name}.` },
    timedOut: 'That confirmation link was not opened in time. Ask for a new one.',
    begin: async () => { /* the email went out with the sign-up */ },
    take: async (code) => {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw new Error(plainAuthError(error.message));
    },
  });
  return over;
}

/**
 * Ask the database to email this address a reset link, and keep listening for
 * it. Answers once the email is away, with `opened` for the moment the person
 * follows the link: by then `client` holds a session that may set a password.
 *
 * The wait is long because it runs across reading an email, and bounded
 * because nothing in this app waits for ever; the code itself expires in an
 * hour (cloud/supabase/config.toml, otp_expiry).
 */
export async function sendPasswordReset({ client, email, returnUrl, timeoutMs = 30 * 60 * 1000, log = () => {} }) {
  let sent;
  const sending = new Promise((resolve, reject) => { sent = { resolve, reject }; });
  sending.catch(() => {});
  const { over } = await returningFromTheBrowser({
    returnUrl,
    timeoutMs,
    log,
    what: 'password reset',
    failedTitle: 'Password reset did not finish',
    landed: { title: 'Choose your new password', line: `Go back to ${Name} and type it there.` },
    timedOut: 'That reset link was not opened in time. Ask for a new one.',
    begin: async () => {
      try {
        const { error } = await client.auth.resetPasswordForEmail(String(email ?? '').trim(), { redirectTo: returnUrl });
        if (error) throw new Error(plainAuthError(error.message));
        log(`team: password reset: the email is away, waiting on ${returnUrl}`);
        sent.resolve();
      } catch (err) {
        sent.reject(err);
        throw err;
      }
    },
    take: async (code) => {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw new Error(plainAuthError(error.message));
    },
  });
  over.catch(() => {}); // the caller takes it when it is ready to wait
  await sending;
  return { opened: over };
}
