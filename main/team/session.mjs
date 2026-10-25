// THE SIGNED-IN SESSION, KEPT ON THIS MAC.
//
// A supabase-js client whose session lives in one file beside the store,
// encrypted with the Mac's keychain-backed safeStorage when the app has it, so
// a person stays signed in across restarts and nothing readable sits on disk.
// Each store root has its own file, which is what lets two copies of the app
// on one Mac be two different teammates.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { nameSlug } from '../../shared/product-name.mjs';
import { runningAsAFreshUser } from '../../shared/fresh-user-home.mjs';
import { supabaseBackend } from './supabase-backend.mjs';
import { signInWithGoogle, cancelGoogleSignIn } from './sign-in.mjs';

// A BUILD SOMEONE INSTALLED IGNORES THE TWO TEST SWITCHES BELOW. Found by
// review 2026-10-01: AGENTBOX_TEAM_CONFIG and AGENTBOX_TEAM_TEST_LOGIN were
// honoured in the packaged app, so anything that could set an environment
// variable for it could point it at another server or sign it in as somebody
// else. Electron sets defaultApp only when run from a checkout.
export const isPackagedElectron = () => !!process.versions?.electron && !process.defaultApp;

// THE TEAM KEY BELONGS TO THE MAC, NOT TO THE FOLDER THE APP RUNS FROM.
//
// Asked for 2026-10-04 (w-2fce569057): "we want to run the team version and i
// need to see my team!" A key per folder is the wrong unit, and the cost of it
// was a whole hour. Measured that day: the only Agentbox running was a copy out
// of a task folder with no key, the app in the Dock had none either, and the one
// folder on the machine that had a key was not running. So no window open could
// show a teammate, and a message to one looked lost when it had arrived fine.
//
// A person has one team. Their Mac holds its key once, at
// ~/.<app>/team.config.json, and whichever copy they open is the team version:
// the checkout, a worktree, or the app in the Dock.
//
// IT IS READ OFF THE REAL HOME DIRECTORY AND NEVER OFF AGENTBOX_HOME. A review
// on 2026-10-01 found an installed build honouring AGENTBOX_TEAM_CONFIG, so
// anything that could set an environment variable could point the app at
// another server. appHome() reads AGENTBOX_HOME, so using it here would reopen
// that door; os.homedir() cannot be talked into lying.
export function teamConfigOnThisMac(home = os.homedir()) {
  return path.join(home, `.${nameSlug}`, 'team.config.json');
}

// The hosted project's address and public key. Row level security, not secrecy,
// is what protects the data, but the file is kept out of the repository (it is
// ignored), so a checkout with no key on its Mac runs as the single-person app;
// cloud/team.config.example.json shows its shape.
//
// THE FOLDER'S OWN KEY WINS when it has one, so a worktree set up against
// another team is never quietly moved onto this Mac's. AGENTBOX_TEAM_CONFIG
// points at another file from a checkout only, and is first because that is
// what the tests run on.
//
// AN INSTALLED BUILD SIGNS IN ONLY TO THE CLOUD BAKED INTO IT at release
// (`bakedTeam` in its package.json), never to a key on the Mac: the first
// download opened on a team's sign-in page because its Mac kept one
// (tests/the-installed-app-is-the-single-person-app). The sign-in is for the
// phone; the team version shows only with Alpha features › Multiplayer on
// (tests/multiplayer-is-an-alpha-feature-in-the-installed-app).
// AND SO IS ⌘K's NEW-USER WINDOW (w-9f6975906c, 2026-10-05). It runs from her
// checkout, which holds a team key, so it opened on the same sign-in page:
// "when i run this command i got the login screen again ... this was the
// critical thing to fix". A new user is a new user of the single-person app.
// A FRESH COPY HANDED A TEAM FILE IS A SECOND PERSON ON THAT TEAM (2026-10-21):
// a power tester in her room. It loads that file and no other, so the ⌘K
// window, which is handed none, stays the single-person app.
export function loadCloudConfig(appDir, { packaged = isPackagedElectron(), home = os.homedir(), env = process.env } = {}) {
  if (packaged) return bakedTeam(appDir);
  if (runningAsAFreshUser(env) && !env.AGENTBOX_TEAM_CONFIG) return null;
  const tries = runningAsAFreshUser(env) ? [env.AGENTBOX_TEAM_CONFIG] : [
    env.AGENTBOX_TEAM_CONFIG,
    path.join(appDir, 'cloud', 'team.config.json'),
    teamConfigOnThisMac(home),
  ];
  let found = null;
  for (const file of tries) {
    if (!file) continue;
    try {
      const c = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof c.url !== 'string' || typeof c.anonKey !== 'string') continue;
      // A field the winning file lacks (phoneSite, added later) comes from a
      // file further down for the same cloud, never from another cloud's.
      if (!found) found = c;
      else if (c.url === found.url) found = { ...c, ...found };
    } catch { /* try the next place; none of them is the single-person app */ }
  }
  return found;
}

function bakedTeam(appDir) {
  try {
    const b = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).bakedTeam;
    if (typeof b?.url !== 'string' || typeof b.anonKey !== 'string') return null;
    const site = typeof b.phoneSite === 'string' && /^https:\/\/[^\s/]+(\/\S*)?$/.test(b.phoneSite) ? { phoneSite: b.phoneSite } : {};
    return { url: b.url, anonKey: b.anonKey, ...site };
  } catch { return null; }
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
    // Nothing to remove writes nothing, so a Mac never signed in never asks the keychain.
    removeItem: (key) => { const d = read(); if (!(key in d)) return; delete d[key]; write(d); },
  };
}

// A request to the account database that never answers is ended: its
// library waits for ever, and the phone's and the team's sync wait on it.
// Long enough for a file going up on a slow network.
const DATABASE_DEADLINE_MS = 5 * 60_000;
export const withDeadline = (ms = DATABASE_DEADLINE_MS) => (url, init = {}) =>
  fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms) });

export function supabaseSession({ cloudConfig, sessionFile, encrypt = null, decrypt = null, openExternal, packaged = isPackagedElectron(), testLogin = process.env.AGENTBOX_TEAM_TEST_LOGIN }) {
  const configured = !!cloudConfig;
  if (packaged) testLogin = null;
  let client = null;

  async function getClient() {
    if (client) return client;
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(cloudConfig.url, cloudConfig.anonKey, {
      global: { fetch: withDeadline() },
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
      // The plain kind of email link, which the phone website can finish; this
      // Mac's own client would ask for a code only this Mac could spend.
      const { createClient } = await import('@supabase/supabase-js');
      const plain = createClient(cloudConfig.url, cloudConfig.anonKey, {
        global: { fetch: withDeadline() },
        auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await plain.auth.signUp({
        email: String(email ?? '').trim(),
        password: String(password ?? ''),
        options: {
          data: { full_name: String(name ?? '').trim() || undefined },
          // Else the email's link goes to the database's default, this Mac's sign-in listener, dead outside a sign-in.
          emailRedirectTo: typeof cloudConfig.phoneSite === 'string' ? cloudConfig.phoneSite : undefined,
        },
      });
      if (error) throw new Error(plainAuthError(error.message));
      if (!data?.session) return { confirm: true };
      const c = await getClient();
      const { error: kept } = await c.auth.setSession(data.session);
      if (kept) throw new Error(plainAuthError(kept.message));
      return { backend: supabaseBackend(c) };
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

// THE SIGN-IN NEVER LANDS IN THE STORE ROOT. The store is in every worker's
// granted directories, and this file holds a refresh token in plain JSON, so it
// resolves to a path OUTSIDE the store. A dir inside the store moves to a
// per-store folder under the config home; if even that is inside the store
// there is nowhere safe and it throws, because writing the token where a worker
// reads it is worse than a sign-in to do again. A copy an older version left in
// the store, under either name, is carried across.
const isInside = (file, root) => {
  const f = path.resolve(file);
  const r = path.resolve(root);
  return f === r || f.startsWith(r + path.sep);
};

function configHome({ home, env }) {
  const given = typeof env?.XDG_CONFIG_HOME === 'string' ? env.XDG_CONFIG_HOME.trim() : '';
  return given && path.isAbsolute(given) ? given : path.join(home, '.config');
}

function sessionFileOutsideStore({ dir, name, storeRoot, home = os.homedir(), env = process.env }) {
  let file = path.join(dir, name);
  if (isInside(file, storeRoot)) {
    const tag = crypto.createHash('sha256').update(path.resolve(storeRoot)).digest('hex').slice(0, 16);
    file = path.join(configHome({ home, env }), nameSlug, 'sessions', tag, name);
    if (isInside(file, storeRoot)) throw new Error(`no place outside the store root for the team session: ${storeRoot}`);
  }
  const olds = [path.join(storeRoot, '.team-session'), path.join(storeRoot, 'team-session.json')];
  try {
    if (!fs.existsSync(file)) {
      for (const old of olds) {
        if (path.resolve(old) === path.resolve(file) || !fs.existsSync(old)) continue;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.renameSync(old, file);
        break;
      }
    }
    if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
  } catch { /* a session that cannot be moved is a sign-in to do again */ }
  return file;
}

// The headless app keeps its sign-in as plain JSON readable by this user only.
export function headlessSessionFile({ userDir, storeRoot, home, env }) {
  return sessionFileOutsideStore({ dir: userDir, name: 'team-session.json', storeRoot, home, env });
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
