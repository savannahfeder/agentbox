// Which founder's store are we operating on, and which product.
//
// The app answers this from a live auth session. The MCP server has no session:
// it is a child process spawned by whatever agent wanted it, so the account is
// configuration, resolved once at startup.

import fs from 'node:fs';
import path from 'node:path';
import { legacyRoot, setAccountScope, dataRoot, listProjects, sanitizeName } from '../../main/store/project.mjs';
import { envName } from '../../shared/product-name.mjs';

/**
 * Resolve the account whose store this server serves.
 *
 * STORE_ACCOUNT_ID wins. Failing that, if exactly one account exists on disk
 * we use it, because that is unambiguous and asking would be pedantic. If
 * several exist we REFUSE rather than pick: silently operating on the wrong
 * founder's store would be discovered late and by writing to it.
 */
export function resolveAccount({ accountId = process.env.STORE_ACCOUNT_ID } = {}) {
  const accountsDir = path.join(legacyRoot(), 'accounts');

  if (accountId) {
    const dir = path.join(accountsDir, accountId);
    if (!fs.existsSync(dir)) throw new Error(`no such account on disk: ${accountId} (looked in ${accountsDir})`);
    setAccountScope(accountId);
    return { accountId, root: dataRoot() };
  }

  let found = [];
  try {
    found = fs.readdirSync(accountsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    throw new Error(`no accounts found at ${accountsDir}; is ${envName('HOME')} set correctly?`);
  }

  if (found.length === 1) {
    setAccountScope(found[0]);
    return { accountId: found[0], root: dataRoot() };
  }
  if (!found.length) throw new Error(`no accounts found at ${accountsDir}`);
  throw new Error(
    `several accounts on disk (${found.join(', ')}); set STORE_ACCOUNT_ID so this server cannot write to the wrong one`,
  );
}

/**
 * Find a product by id, slug, or name. Agents refer to products the way a
 * person would ("kestrel"), not by generated id, so accept all three and say
 * clearly when a name is ambiguous rather than guessing which one was meant.
 */
export function resolveProduct(ref) {
  const wanted = String(ref ?? '').trim();
  if (!wanted) throw new Error('which product? pass its name or id (list_products shows them)');
  const projects = listProjects();

  const exact = projects.find((p) => p.id === wanted) ?? projects.find((p) => path.basename(p.dir) === wanted);
  if (exact) return exact;

  const lower = wanted.toLowerCase();
  const byName = projects.filter((p) => (p.name ?? '').toLowerCase() === lower);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new Error(`several products are called "${wanted}"; use its id instead (${byName.map((p) => p.id).join(', ')})`);

  // THE NAME IT WAS MADE WITH. A rename changes the label and never the folder,
  // and the folder is that first name slugged, so an agent that still says the
  // old name is pointing at this folder. After the current names, so a name she
  // has since given another project wins.
  const madeAs = projects.find((p) => path.basename(p.dir) === sanitizeName(wanted));
  if (madeAs) return madeAs;

  const partial = projects.filter((p) => (p.name ?? '').toLowerCase().includes(lower) || path.basename(p.dir).includes(lower));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new Error(`"${wanted}" matches several products: ${partial.map((p) => p.name ?? p.id).join(', ')}`);

  throw new Error(`no product called "${wanted}"; list_products shows what exists`);
}
