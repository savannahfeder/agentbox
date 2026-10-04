// THE SIGNED-IN SESSION, KEPT ON THIS MAC.
//
// A supabase-js client whose session lives in one file beside the store,
// encrypted with the Mac's keychain-backed safeStorage when the app has it, so
// a person stays signed in across restarts and nothing readable sits on disk.
// Each store root has its own file, which is what lets two copies of the app
// on one Mac be two different teammates.
import fs from 'node:fs';
import path from 'node:path';
import { supabaseBackend } from './supabase-backend.mjs';
import { signInWithGoogle, cancelGoogleSignIn } from './sign-in.mjs';

// A BUILD SOMEONE INSTALLED IGNORES THE TWO TEST SWITCHES BELOW. Found by
// review 2026-10-01: AGENTBOX_TEAM_CONFIG and AGENTBOX_TEAM_TEST_LOGIN were
// honoured in the packaged app, so anything that could set an environment
// variable for it could point it at another server or sign it in as somebody
// else. Electron sets defaultApp only when run from a checkout.
export const isPackagedElectron = () => !!process.versions?.electron && !process.defaultApp;

// The hosted project's address and public key, from cloud/team.config.json.
// Row level security, not secrecy, is what protects the data, but the file is
// still kept out of the repository (it is ignored), so a public checkout runs
// as the single-person app; cloud/team.config.example.json shows its shape.
// AGENTBOX_TEAM_CONFIG points at another file from a checkout only.
export function loadCloudConfig(appDir, { packaged = isPackagedElectron() } = {}) {
  const file = (!packaged && process.env.AGENTBOX_TEAM_CONFIG) || path.join(appDir, 'cloud', 'team.config.json');
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof c.url === 'string' && typeof c.anonKey === 'string') return c;
  } catch { /* no team config: the app runs as the single-person app */ }
  return null;
}

function fileStorage(file, { encrypt, decrypt }) {
  const read = () => {
    try {
      const raw = fs.readFileSync(file);
      const text = decrypt ? decrypt(raw) : raw.toString('utf8');
      return JSON.parse(text);
    } catch { return {}; }
  };
  const write = (data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const text = JSON.stringify(data);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, encrypt ? encrypt(text) : text, { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  return {
    getItem: (key) => read()[key] ?? null,
    setItem: (key, value) => { const d = read(); d[key] = value; write(d); },
    removeItem: (key) => { const d = read(); delete d[key]; write(d); },
  };
}

export function supabaseSession({ cloudConfig, sessionFile, encrypt = null, decrypt = null, openExternal, packaged = isPackagedElectron(), testLogin = process.env.AGENTBOX_TEAM_TEST_LOGIN }) {
  const configured = !!cloudConfig;
  if (packaged) testLogin = null;
  let client = null;

  async function getClient() {
    if (client) return client;
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(cloudConfig.url, cloudConfig.anonKey, {
      auth: {
        flowType: 'pkce',
        storage: fileStorage(sessionFile, { encrypt, decrypt }),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    return client;
  }

  return {
    configured,

    async restore() {
      if (!configured) return null;
      const c = await getClient();
      const { data } = await c.auth.getSession();
      if (data?.session) return supabaseBackend(c);
      // A test harness signs a throwaway person in with a password, since a
      // test cannot click through Google. Never set in the app itself.
      if (testLogin) {
        const at = testLogin.indexOf(':');
        const { error } = await c.auth.signInWithPassword({ email: testLogin.slice(0, at), password: testLogin.slice(at + 1) });
        if (error) throw new Error(`test sign-in: ${error.message}`);
        return supabaseBackend(c);
      }
      return null;
    },

    async signIn({ onUrl, log } = {}) {
      if (!configured) throw new Error('this build has no team cloud configured');
      const c = await getClient();
      await signInWithGoogle({ client: c, openExternal, onUrl, log, returnUrl: cloudConfig.signInReturn || 'http://127.0.0.1:54783/auth/callback' });
      return supabaseBackend(c);
    },

    // EMAIL AND PASSWORD, beside Google (2026-10-01: the team version needs
    // a real sign-in page). Google stays the first way in; this is the one that works
    // before a team has set Google up, and for anyone who would rather not.
    async signInWithPassword(email, password) {
      if (!configured) throw new Error('this build has no team cloud configured');
      const c = await getClient();
      const { error } = await c.auth.signInWithPassword({ email: String(email ?? '').trim(), password: String(password ?? '') });
      if (error) throw new Error(plainAuthError(error.message));
      return supabaseBackend(c);
    },

    // A new account. With email confirmation on (the hosted project's setting)
    // there is no session until the link in the email is followed, so this
    // answers { confirm: true } and the page says to check the inbox.
    async signUp({ email, password, name }) {
      if (!configured) throw new Error('this build has no team cloud configured');
      const c = await getClient();
      const { data, error } = await c.auth.signUp({
        email: String(email ?? '').trim(),
        password: String(password ?? ''),
        options: { data: { full_name: String(name ?? '').trim() || undefined } },
      });
      if (error) throw new Error(plainAuthError(error.message));
      return data?.session ? { backend: supabaseBackend(c) } : { confirm: true };
    },

    cancelSignIn: () => cancelGoogleSignIn(),
    // Only ever the link this sign-in made; the window never names one.
    reopen: (url) => openExternal(url),

    async signOut() {
      if (client) await client.auth.signOut().catch(() => {});
    },
  };
}

// The cloud's words, said the way the page says everything else.
export function plainAuthError(message) {
  const m = String(message ?? '');
  if (/invalid login credentials/i.test(m)) return 'That email and password do not match an account.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first: follow the link we sent, then sign in.';
  if (/already registered|already been registered/i.test(m)) return 'There is already an account with that email. Sign in instead.';
  if (/password should be at least/i.test(m)) return 'Use a password of at least 6 characters.';
  if (/rate limit/i.test(m)) return 'Too many tries just now. Wait a minute and try again.';
  return m || 'That did not work. Try again.';
}

// WHERE THE HEADLESS APP KEEPS ITS SIGN-IN: in its own data folder, readable by
// this user only, never in the store root. The store is the folder people
// copy, sync and hand to agents, and this file holds a refresh token in plain
// JSON (review, 2026-10-01). One left in the store by an older copy is moved.
export function headlessSessionFile({ userDir, storeRoot }) {
  const file = path.join(userDir, 'team-session.json');
  const old = path.join(storeRoot, '.team-session');
  try {
    if (!fs.existsSync(file) && fs.existsSync(old)) {
      fs.mkdirSync(userDir, { recursive: true });
      fs.renameSync(old, file);
    }
    if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
  } catch { /* a session that cannot be moved is a sign-in to do again */ }
  return file;
}

// The same session shape over the in-memory cloud, for tests.
export function memorySession(backendFor) {
  let signedIn = null;
  return {
    configured: true,
    async restore() { return signedIn; },
    async signIn() { signedIn = backendFor(); return signedIn; },
    async signInWithPassword() { signedIn = backendFor(); return signedIn; },
    async signUp() { return { confirm: true }; },
    async signOut() { signedIn = null; },
  };
}
