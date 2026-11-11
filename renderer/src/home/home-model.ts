// What Home shows, worked out from data the app already has.

export function greeting(hour: number, name?: string | null): string {
  const part = hour < 4 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

const DAY = 86_400_000;

/** Things finished on each of the last seven days, oldest first and today
 *  last. Days to come are never drawn. */
export function weekCounts(finishedAt: readonly number[], now: number): number[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const start = today.getTime() - 6 * DAY;
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const at of finishedAt) {
    if (at < start || at > now) continue;
    const d = new Date(at); d.setHours(0, 0, 0, 0);
    const i = Math.round((d.getTime() - start) / DAY);
    if (i >= 0 && i < 7) out[i] += 1;
  }
  return out;
}

export type DoorKey = 'inbox' | 'progress' | 'team';
export type Door = { key: DoorKey; label: string; count: number | null };

/** The places Home opens onto. Team is only there for someone on a team. */
export function doors({ needs, progress, team }: { needs: number; progress: number; team: boolean }): Door[] {
  const out: Door[] = [
    { key: 'inbox', label: 'Inbox', count: needs },
    { key: 'progress', label: 'In progress', count: progress },
  ];
  if (team) out.push({ key: 'team', label: 'Team', count: null });
  return out;
}

export function agoShort(at: number, now: number): string {
  const m = Math.max(0, Math.floor((now - at) / 60_000));
  if (m < 1) return 'now';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr`;
  return `${Math.floor(h / 24)} d`;
}

export function engineName(engine: string | undefined): string {
  return engine === 'codex' ? 'Codex' : 'Claude Code';
}

/** The letter on a row's tile: C for Claude Code, X for Codex, so the two read apart. */
export function engineLetter(engine: string | undefined): string {
  return engine === 'codex' ? 'X' : 'C';
}

/** Home is drawn over the Inbox, so the Inbox's selected row is out of sight and no key may act on it. */
export function homeCoversTheList(p: { homeOn: boolean; homeOpen: boolean; threadOpen: boolean; searching: boolean; settingsOpen: boolean; teamShown: boolean }): boolean {
  return p.homeOn && p.homeOpen && !p.threadOpen && !p.searching && !p.settingsOpen && !p.teamShown;
}

export type TeamRowState = 'working' | 'waiting' | 'quiet';

export function teamRowState({ agents, waitingOnYou }: { agents: number | null; waitingOnYou: boolean }): TeamRowState {
  if (waitingOnYou) return 'waiting';
  return agents ? 'working' : 'quiet';
}
