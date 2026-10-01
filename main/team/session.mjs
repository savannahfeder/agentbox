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
import { signInWithGoogle } from './sign-in.mjs';

// The hosted project's address and public key. They are meant to ship inside
// the app (row level security, not secrecy, is what protects the data), so
// they live in the repository; AGENTBOX_TEAM_CONFIG points at another file.
export function loadCloudConfig(appDir) {
  const file = process.env.AGENTBOX_TEAM_CONFIG || path.join(appDir, 'cloud', 'team.config.json');
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

export function supabaseSession({ cloudConfig, sessionFile, encrypt = null, decrypt = null, openExternal, testLogin = process.env.AGENTBOX_TEAM_TEST_LOGIN }) {
  const configured = !!cloudConfig;
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

    async signIn() {
      if (!configured) throw new Error('this build has no team cloud configured');
      const c = await getClient();
      await signInWithGoogle({ client: c, openExternal, returnUrl: cloudConfig.signInReturn || 'http://127.0.0.1:54783/auth/callback' });
      return supabaseBackend(c);
    },

    async signOut() {
      if (client) await client.auth.signOut().catch(() => {});
    },
  };
}

// The same session shape over the in-memory cloud, for tests.
export function memorySession(backendFor) {
  let signedIn = null;
  return {
    configured: true,
    async restore() { return signedIn; },
    async signIn() { signedIn = backendFor(); return signedIn; },
    async signOut() { signedIn = null; },
  };
}
