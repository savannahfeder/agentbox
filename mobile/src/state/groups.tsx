// Groups on the phone: whether the computer has them on (its settings copy),
// and the groups themselves, read straight from the account
// (renderer/src/phone-groups.ts). Read every five seconds while Groups is on
// screen, every minute otherwise so the tab can say something is new.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { readSettingsRows } from '../../../renderer/src/phone-rows';
import { groupsOn, NO_GROUPS, phoneGroups } from '../../../renderer/src/phone-groups';
import type { RoomsState } from '../../../renderer/src/types';
import { isImageName } from '../../../renderer/src/attachments';
import { BLOCKED_KEY, blockedFrom, REPORTED_KEY, roomsShown, withBlocked, withoutBlocked } from '../lib/chat-safety';
import { LAST_GROUP_KEY, roomFileName } from '../lib/groups';
import { appStore } from '../platform/persist';
import { useCloud } from './cloud';

const WATCHING_MS = 5000;
const AWAY_MS = 60_000;
const SETTINGS_MS = 60_000;
const message = (err: unknown) => String((err as Error)?.message ?? err);

function useGroupsState() {
  const c = useCloud();
  const cloud = c.signedIn ? c.cloud : null;
  const [on, setOn] = useState(false);
  const [state, setState] = useState<RoomsState>(NO_GROUPS);
  const [watching, setWatching] = useState(false);
  const [last, setLastRaw] = useState<string | null>(() => appStore.getItem(LAST_GROUP_KEY));
  const groups = useMemo(() => (cloud ? phoneGroups(cloud) : null), [cloud]);

  useEffect(() => {
    if (!cloud) { setOn(false); return; }
    const read = () => readSettingsRows((t, q) => cloud.select(t, q)).then((rows) => setOn(groupsOn(rows)), () => { /* kept as it was until the next read */ });
    void read();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void read(); }, SETTINGS_MS);
    return () => clearInterval(timer);
  }, [cloud]);

  const refresh = useCallback(async () => { if (groups) setState(await groups.refresh()); }, [groups]);
  useEffect(() => {
    if (!groups || !on) { setState(NO_GROUPS); return; }
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, watching ? WATCHING_MS : AWAY_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [groups, on, watching, refresh]);

  // A send that fails keeps the words in the box and says why.
  const busy = useRef(false);
  const send = useCallback(async (roomId: string, body: string, inReplyTo: string | null, mentions: string[]): Promise<string | null> => {
    if (!groups || busy.current) return 'Not sent';
    busy.current = true;
    try { await groups.send(roomId, body, { inReplyTo, mentions }); setState(groups.state()); return null; } catch (err) { return message(err); } finally { busy.current = false; }
  }, [groups]);
  const markRead = useCallback((roomId: string) => {
    if (!groups) return;
    void groups.markRead(roomId).catch(() => { /* read again at the next look */ });
    setState(groups.state());
  }, [groups]);
  // A file a message links, as base64, or null when the cloud does not have it.
  const fileOf = useCallback(async (roomId: string, name: string): Promise<string | null> => {
    if (!groups) return null;
    const got = await groups.door({ op: 'file', args: [roomId, name] });
    return got.ok ? (got.value as string | null) : null;
  }, [groups]);
  const setLast = useCallback((id: string) => { setLastRaw(id); appStore.setItem(LAST_GROUP_KEY, id); }, []);

  // React, edit, delete, a file, a new chat: null when done, else why not.
  const act = useCallback(async (op: string, ...args: unknown[]): Promise<{ error: string | null; value?: unknown }> => {
    if (!groups) return { error: 'Not signed in' };
    const out = await groups.door({ op, args });
    setState(groups.state());
    return out.ok ? { error: null, value: out.value } : { error: out.error };
  }, [groups]);
  const sendFiles = useCallback(async (roomId: string, files: { name: string; dataBase64: string }[]): Promise<{ links: string[]; error: string | null }> => {
    const links: string[] = [];
    for (const f of files) {
      const name = roomFileName(f.name);
      const out = await act('putFile', roomId, { name, dataBase64: f.dataBase64 });
      if (out.error) return { links, error: out.error };
      links.push(`${isImageName(name) ? '!' : ''}[${f.name.replace(/[[\]]/g, '')}](attachments/${name})`);
    }
    return { links, error: null };
  }, [act]);

  const [blockedRaw, setBlockedRaw] = useState(() => appStore.getItem(BLOCKED_KEY));
  const [reportedRaw, setReportedRaw] = useState(() => appStore.getItem(REPORTED_KEY));
  const blocked = useMemo(() => blockedFrom(blockedRaw), [blockedRaw]);
  const reported = useMemo(() => blockedFrom(reportedRaw), [reportedRaw]);
  const block = useCallback((id: string, on: boolean) => {
    const next = on ? withBlocked(appStore.getItem(BLOCKED_KEY), id) : withoutBlocked(appStore.getItem(BLOCKED_KEY), id);
    appStore.setItem(BLOCKED_KEY, next);
    setBlockedRaw(next);
  }, []);
  const hideReported = useCallback((messageId: string) => {
    const next = withBlocked(appStore.getItem(REPORTED_KEY), messageId);
    appStore.setItem(REPORTED_KEY, next);
    setReportedRaw(next);
  }, []);

  const meId = cloud?.session()?.user.id ?? null;
  const rooms = useMemo(() => roomsShown(state.rooms, blocked, meId), [state.rooms, blocked, meId]);
  const shownState = useMemo(() => (rooms.length === state.rooms.length ? state : { ...state, rooms }), [state, rooms]);
  // Everyone on your team the groups name, for a new chat.
  const mates = useMemo(() => {
    const ids = groups?.teammates() ?? [];
    const named = new Map<string, string>();
    for (const r of state.rooms) {
      for (const p of r.people ?? []) if (p.name) named.set(p.id, p.name);
      for (const w of r.wall) if (w.name) named.set(w.id, w.name);
    }
    return ids.filter((id) => !blocked.has(id)).map((id) => ({ id, name: named.get(id) || 'Someone' })).sort((a, b) => a.name.localeCompare(b.name));
  }, [groups, state.rooms, blocked]);

  return {
    on, state: shownState, last, setLast, send, markRead, refresh, setWatching, fileOf, act, sendFiles,
    blocked, block, reported, hideReported, mates,
    unread: rooms.filter((r) => r.unread > 0).length,
    meId,
  };
}

type GroupsState = ReturnType<typeof useGroupsState>;
const Ctx = createContext<GroupsState | null>(null);

export function GroupsProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useGroupsState()}>{children}</Ctx.Provider>;
}

export function useGroups() {
  const g = useContext(Ctx);
  if (!g) throw new Error('useGroups outside GroupsProvider');
  return g;
}
