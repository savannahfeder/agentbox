// WHAT THE IMPORT CARD IS HANDED, in one function, so the read setup's last
// card depends on can be tested whole rather than through a copy of it
// (w-e46f2e9cea, 2026-10-11: "confirm this works during onboarding, that's the
// critical location"). `zero:agent-threads` in main/ipc.mjs is this and the
// `imported` marks; the walk's finish card and the ⌘K card both read it.
//
// Every folder either tool keeps sessions in (main/agent-homes.mjs), both
// readers, newest first. A reader that throws costs its own half, never the
// other one.
//
// AND WHEN THE LAST TEN DAYS HOLD NOTHING, THE NEWEST OLDER ONES. Setup skips
// its last card when it has nothing to offer, so somebody whose newest session
// was eleven days old was never told importing exists. The ten days stay the
// list whenever they hold anything; only an empty one reaches back, ninety days
// at most and the twenty newest, and the card says so (`listLine` in
// renderer/src/agent-import-card.ts).

import os from 'node:os';
import { appSessionFolders } from './agent-homes.mjs';
import { RECENT_DAYS, readSessionThreads } from './agent-sessions.mjs';
import { readCodexThreads } from './codex-threads.mjs';

export const OLDER_DAYS = 90;
export const OLDER_MOST = 20;

export function readImportableThreads({ config = null, supervisor = null, env = process.env, shellEnv, home = os.homedir(), now = Date.now(), query = '' } = {}) {
  const { dirs, codexDirs } = appSessionFolders({ config, supervisor, env, home, ...(shellEnv ? { shellEnv } : {}) });
  const read = (days, max) => {
    let claude = [];
    let codex = [];
    try { ({ threads: claude } = readSessionThreads({ home, dirs, now, days, ...(max ? { max } : {}) })); } catch { claude = []; }
    try { ({ threads: codex } = readCodexThreads({ home, codexDirs, now, days, query })); } catch { codex = []; }
    return [...claude, ...codex].filter(t=>!query||String(t.title).toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => (b.when ?? 0) - (a.when ?? 0));
  };
  if(query)return read(36500);
  const recent = read(RECENT_DAYS);
  if (recent.length) return recent;
  return read(OLDER_DAYS, OLDER_MOST).slice(0, OLDER_MOST);
}
