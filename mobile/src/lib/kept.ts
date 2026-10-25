// The sign-in client (renderer/src/cloud-rest.ts) reads its storage at once;
// a phone's keychain answers later. So the keychain is read once, at launch,
// and every change is written back to it.

export interface Persist {
  read(): Promise<Record<string, string>>;
  write(key: string, value: string | null): Promise<void>;
}

export async function keptStore(persist: Persist) {
  // A keychain that cannot be read starts signed out rather than not at all.
  const held = new Map<string, string>(Object.entries(await persist.read().catch(() => ({}))));
  const save = (key: string, value: string | null) => { persist.write(key, value).catch(() => { /* kept for this launch */ }); };
  return {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => { held.set(key, value); save(key, value); },
    removeItem: (key: string) => { held.delete(key); save(key, null); },
  };
}
