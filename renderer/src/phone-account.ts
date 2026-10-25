// DELETING YOUR ACCOUNT FROM THE PHONE (App Review guideline 5.1.1(v)).
// Your files in storage first, through the storage API, since the database
// cannot delete them; then the account and all it wrote (delete_my_account).
import { BUCKET } from './cloud-files';
import type { cloudClient } from './cloud-rest';

type Rest = Pick<ReturnType<typeof cloudClient>, 'session' | 'listFiles' | 'removeFiles' | 'rpc' | 'signOut'>;
const PAGE = 1000;
export const FILES_KEPT = 'Your files online could not be deleted, so your account was kept. Try again.';

export async function deleteAccount(c: Rest) {
  const me = c.session()?.user.id;
  if (!me) throw new Error('not signed in');
  const files: string[] = [];
  try {
    const list = async (prefix: string) => {
      const out: { name: string; id: string | null }[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = await c.listFiles(BUCKET, prefix, PAGE, offset);
        out.push(...page);
        if (page.length < PAGE) return out;
      }
    };
    // One folder per computer under your own; nothing above it is listed.
    for (const entry of await list(`${me}/`)) {
      if (entry.id !== null) { files.push(`${me}/${entry.name}`); continue; }
      for (const f of await list(`${me}/${entry.name}/`)) if (f.id !== null) files.push(`${me}/${entry.name}/${f.name}`);
    }
    for (let i = 0; i < files.length; i += PAGE) await c.removeFiles(BUCKET, files.slice(i, i + PAGE));
  } catch {
    throw new Error(FILES_KEPT);
  }
  await c.rpc('delete_my_account');
  c.signOut();
}
