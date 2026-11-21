// A request, left in the store by `npm run accounts -- --reset`, that the app
// forget what it holds against this computer's logins. A file rather than an
// edit to the app's own state, which the running app rewrites all the time.
import fs from 'node:fs';
import path from 'node:path';

export function accountRecheckFile(storeRoot: string): string {
  return path.join(storeRoot, '.accounts-recheck');
}

export function askForAccountRecheck(storeRoot: string, now = Date.now()): string {
  const file = accountRecheckFile(storeRoot);
  fs.mkdirSync(storeRoot, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ at: now })}\n`);
  return file;
}

/** True once per request: the file is gone when this returns. */
export function takeAccountRecheck(storeRoot: string | null | undefined): boolean {
  if (!storeRoot) return false;
  try {
    fs.rmSync(accountRecheckFile(storeRoot));
    return true;
  } catch {
    return false;
  }
}
