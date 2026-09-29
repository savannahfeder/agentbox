// THE INSTALLATION IDENTIFIER, and there is exactly one of it.
//
// `legal/privacy.html` 5.2: a random identifier in a file, whose only purpose is
// to let counts from one installation read as one installation rather than as
// many. It is NOT an account, it is not an email, and it is derived from nothing
// about the person or the machine, so a second copy of this rule written
// somewhere else is how it quietly becomes a fingerprint.
//
// Two callers, one file: `main/crash-report.mjs` (which needs it while the
// process is dying) and `main/analytics.mjs`. Both read the same id, which is
// what makes a crash and the counts around it one story.

// ONE EXCEPTION, AND IT IS HER OWN TESTING. A copy launched into a throwaway
// home by `npm run fresh` or by the ⌘K row is a first-run test, not a person,
// and before 2026-08-31 each one minted a fresh random id and sent under it.
// Ten of those reached the brief in a fortnight as strangers who bounced. They
// send under one fixed id instead. Nothing about a real install changes: a real
// home is never inside `HOMES`, so the branch below is unreachable on every
// machine that is not hers mid-test.
//
// AND A DEMO COPY IS THE SAME EXCEPTION FOR THE SAME REASON. A demo is opened
// in front of a room and closed again, which is exactly the shape of a stranger
// who opened Agentbox once and never came back. It sends under its own fixed id,
// so a week of demos reads as a week of demos.
import fs from 'node:fs';
import path from 'node:path';
import { FRESH_INSTALL_ID, runningAsAFreshUser } from './fresh-user-home.mjs';
import { DEMO_INSTALL_ID, runningAsADemo } from './demo-world.mjs';

export function readInstallId(dir, env = process.env) {
  if (runningAsADemo(env)) return DEMO_INSTALL_ID;
  if (runningAsAFreshUser(env)) return FRESH_INSTALL_ID;
  if (!dir) return null;
  const file = path.join(dir, 'install-id');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch {}
  const id = (globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2));
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, id); } catch {}
  return id;
}
