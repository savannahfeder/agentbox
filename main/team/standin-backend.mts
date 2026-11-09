// THE SESSION AND BACKEND OVER cloud/standin/server.mjs: the same calls as
// memory-cloud.mts, made over loopback, so copies of the app on one machine are
// one team. A checkout only; session.mts refuses it in an installed build.
import type { TeamBackend, TeamSession } from './index.mts';
import type { RoomEvent } from './rooms.mts';
import type { CloudConfig } from './session.mts';

const CALL_MS = 120_000;
const WAIT_MS = 35_000;

export interface StandinSignIn { token: string; personId: string; kind: string; methods: string[] }

interface StandinWait { boot: string; events: ({ kind: 'change' } | { kind: 'rooms'; event: RoomEvent })[] }

async function post<T>(url: string, door: string, body: unknown, ms = CALL_MS): Promise<T> {
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(`${url}/${door}`, { ...init, signal: AbortSignal.timeout(ms) });
  const out = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new Error(out.error || `the stand-in cloud said ${res.status}`);
  return out;
}

export function standinBackend(url: string, { token, personId, kind, methods }: StandinSignIn): TeamBackend {
  // Its calls are whatever the stand-in names at sign-in, each sent over as it is.
  const backend: Record<string, unknown> & Partial<TeamBackend> = { kind, personId };
  for (const method of methods) {
    backend[method] = async (...args: unknown[]) => {
      const { value } = await post<{ value: unknown }>(url, 'call', { token, method, args });
      return value === null ? undefined : value;
    };
  }

  // One long poll, whoever is listening. A restarted cloud has lost nobody's
  // data but every copy's place in it, so a new boot counts as a change.
  const onChange = new Set<() => void>();
  const onRooms = new Set<(event: RoomEvent) => void>();
  let polling = false;
  let boot: string | null = null;
  async function poll() {
    if (polling) return;
    polling = true;
    while (onChange.size || onRooms.size) {
      try {
        const out = await post<StandinWait>(url, 'wait', { token }, WAIT_MS);
        if (boot && out.boot !== boot) {
          for (const f of onChange) f();
          for (const f of onRooms) f({ kind: 'subscribed' });
        }
        boot = out.boot;
        for (const e of out.events) {
          if (e.kind === 'change') for (const f of onChange) f();
          else if (e.kind === 'rooms') for (const f of onRooms) f(e.event);
        }
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    polling = false;
  }
  backend.subscribe = (fn: () => void) => { onChange.add(fn); poll(); return () => onChange.delete(fn); };
  backend.subscribeRooms = (fn: (event: RoomEvent) => void) => {
    onRooms.add(fn);
    queueMicrotask(() => fn({ kind: 'subscribed' }));
    poll();
    return () => onRooms.delete(fn);
  };
  return backend as TeamBackend;
}

export function standinSession({ cloudConfig, testLogin }: { cloudConfig: CloudConfig; testLogin?: string | null }): TeamSession {
  const url = String(cloudConfig.url).replace(/\/+$/, '');
  let signedIn: TeamBackend | null = null;
  const signIn = async (email: string, password: string, name?: string) => {
    signedIn = standinBackend(url, await post<StandinSignIn>(url, 'signin', { email, password, name }));
    return signedIn;
  };
  return {
    configured: true,
    async restore() {
      if (signedIn) return signedIn;
      if (!testLogin) return null;
      const at = testLogin.indexOf(':');
      return signIn(testLogin.slice(0, at), testLogin.slice(at + 1));
    },
    async signIn() { throw new Error('the stand-in cloud has no Google sign-in'); },
    signInWithPassword: (email, password) => signIn(String(email ?? '').trim(), password),
    async signUp({ email, password, name }) { return { backend: await signIn(String(email ?? '').trim(), password, name) }; },
    cancelSignIn: () => {},
    reopen: () => {},
    async signOut() { signedIn = null; },
  };
}
