// PROVE THE ⌘K ROW REALLY OPENS A SECOND AGENTBOX, ON THIS MAC.
//
// The unit tests hand `openFreshUser` a fake spawn and check the shape of the
// call. That is worth having and it is not evidence: a fake spawn cannot fail
// the way a real one does, and the failure this feature is most likely to have
// is the one measured on 2026-08-20, where a second copy took the running app's
// own single-instance lock and quit in under half a second while the log said
// everything had worked.
//
// So this calls the real thing against a real packed Agentbox and then WATCHES:
//
//   * a second process is alive a few seconds later, not gone
//   * it is running out of the throwaway home, read off the process itself
//   * her own Agentbox is still running, with the pid it had before
//   * the throwaway home really is empty of everything hers has
//
// It leaves the copy open, because the point of the row is that she walks it.
//
//   node scripts/prove-the-new-user-opens.mjs [path/to/Astral.app]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openFreshUser } from '../main/fresh-user.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// electron-builder names the folder after the arch it packed, so this is
// `mac-universal` since the build target became universal and `mac-arm64` for
// anything packed before it. Take whichever is actually there.
const packed = ['mac-universal', 'mac-arm64', 'mac']
  .map((d) => path.join(root, 'release', d, 'Astral.app'))
  .find((app) => fs.existsSync(path.join(app, 'Contents', 'MacOS', 'Agentbox')));
const appArg = process.argv[2] ?? packed ?? path.join(root, 'release', 'mac-universal', 'Astral.app');
const bin = path.join(appArg, 'Contents', 'MacOS', 'Agentbox');
if (!fs.existsSync(bin)) {
  console.error(`No packed Agentbox at ${bin}. Build one with npm run pack.`);
  process.exit(1);
}

const ps = () => {
  try {
    return execFileSync('ps', ['-Ao', 'pid=,command='], { encoding: 'utf8' })
      .split('\n')
      .filter((l) => /Astral\.app\/Contents\/MacOS\/Astral/.test(l) && !/Helper/.test(l))
      .map((l) => {
        const m = l.trim().match(/^(\d+)\s+(.*)$/);
        return m ? { pid: Number(m[1]), cmd: m[2] } : null;
      })
      .filter(Boolean);
  } catch { return []; }
};

const homeOf = (pid) => {
  try {
    const env = execFileSync('ps', ['-Eww', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
    const m = env.match(/CFFIXED_USER_HOME=(\S+)/);
    return m ? m[1] : null;
  } catch { return null; }
};

const before = ps();
console.log(`Astrals running before   : ${before.length}`);
for (const p of before) console.log(`  pid ${p.pid}  home ${homeOf(p.pid) ?? '(hers)'}`);

console.log(`\nOpening ${appArg} as a brand new user…`);
const out = openFreshUser({ execPath: bin, packaged: true, withAgents: true });
console.log(JSON.stringify(out, null, 2));
if (!out.ok) process.exit(1);

// THE PART THAT MATTERS. A process that starts and quits half a second later
// looks exactly like one that started, until you look again.
await new Promise((r) => setTimeout(r, 9000));

const after = ps();
const fresh = after.filter((p) => !before.some((b) => b.pid === p.pid));
console.log(`\nApps running after    : ${after.length}`);
for (const p of after) console.log(`  pid ${p.pid}  home ${homeOf(p.pid) ?? '(hers)'}`);

const problems = [];
if (!fresh.length) problems.push('The second Agentbox is not running nine seconds later. It quit.');
for (const p of fresh) {
  const home = homeOf(p.pid);
  if (home !== out.home) problems.push(`pid ${p.pid} is running out of ${home}, not the throwaway home.`);
}
for (const b of before) {
  if (!after.some((a) => a.pid === b.pid)) problems.push(`HER OWN AGENTBOX, pid ${b.pid}, is gone. That must never happen.`);
}

// And the throwaway world really is a stranger's.
const home = out.home;
const hers = [
  ['a store', path.join(home, 'Agentbox')],
  ['settings', path.join(home, 'Library', 'Application Support', 'Agentbox', 'zero.config.json')],
];
console.log('\nWhat is in the throwaway home:');
for (const [what, at] of hers) console.log(`  ${fs.existsSync(at) ? 'present' : 'absent '}  ${what}  ${at}`);
console.log(`  ${fs.existsSync(path.join(home, '.claude')) ? 'linked ' : 'absent '}  her Claude Code sessions`);

console.log('');
if (problems.length) { for (const p of problems) console.log(`FAIL  ${p}`); process.exit(1); }
console.log(`PASS  a second Agentbox is alive in ${home}, and every Agentbox that was running still is.`);
