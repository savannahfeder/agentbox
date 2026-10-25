// Who agreed to the cloud's terms on this Mac's Create account tab, by email.
// An email sign-up waits on its confirmation link and so makes no cloud key;
// the sign-in after it carries that agreement instead of asking again.
const KEY = 'agentbox.cloud.agreed';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

const local = (): Store | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};
const norm = (email: string) => email.trim().toLowerCase();
const read = (store: Store): string[] => {
  try {
    const list = JSON.parse(store.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((e): e is string => typeof e === 'string') : [];
  } catch { return []; }
};

export function rememberAgreed(email: string, store: Store | null = local()): void {
  if (!store || !norm(email)) return;
  const list = read(store);
  if (!list.includes(norm(email))) store.setItem(KEY, JSON.stringify([...list, norm(email)].slice(-20)));
}

export function agreedHere(email: string, store: Store | null = local()): boolean {
  return !!store && !!norm(email) && read(store).includes(norm(email));
}
