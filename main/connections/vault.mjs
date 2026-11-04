// WHERE A CONNECTION'S TOKENS LIVE: one sealed file beside the team session,
// outside the store, because every worker can read the store.
//
// There is no plain fallback. No encryption means no connection, and it says so.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Name } from '../../shared/product-name.mjs';

export const CANNOT_ENCRYPT = `This computer cannot encrypt a sign-in right now, so ${Name} will not keep one. Nothing was saved.`;

export function connectionVault({ file, cipher }) {
  // A cipher without `available` (the app's own, main/main.mjs) learns it by
  // sealing, which asks the Mac's keychain, so only keeping a sign-in asks:
  // `can` probes, `mayBe` is what the page shows before anyone presses Connect.
  const mayBe = () => { try { return cipher?.available ? !!cipher.available() : !!cipher?.encrypt; } catch { return false; } };
  const can = () => { try { return cipher?.available ? !!cipher.available() : cipher?.encrypt?.('') != null; } catch { return false; } };
  // A Mac with no connections never asks the keychain, as a worker starts or at all.
  const there = () => fs.existsSync(file);
  // One at a time: a refresh and a status update both rewrite the whole file.
  let queue = Promise.resolve();
  const load = () => {
    let raw;
    try { raw = fs.readFileSync(file); } catch { return {}; }
    try {
      const text = cipher.decrypt(raw);
      return text == null ? {} : JSON.parse(text);
    } catch (err) {
      console.warn('zero: the connections file could not be read, so its sign-ins are lost:', err?.message ?? err);
      return {};
    }
  };
  return {
    file,
    canEncrypt: can,
    mayEncrypt: mayBe,
    async read() {
      await queue;
      return there() && mayBe() ? load() : {};
    },
    // For a worker's start, which cannot wait. Writes land by rename, so this
    // sees the last whole file.
    readNow: () => (there() && mayBe() ? load() : {}),
    update(change) {
      const run = queue.then(async () => {
        if (!can()) throw new Error(CANNOT_ENCRYPT);
        const data = load();
        const out = await change(data);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.${crypto.randomUUID()}.tmp`;
        fs.writeFileSync(tmp, cipher.encrypt(JSON.stringify(data)), { mode: 0o600 });
        fs.renameSync(tmp, file);
        return out;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}
