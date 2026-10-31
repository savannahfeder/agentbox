// The app's one connection to the online inbox, and the rows it last read.
// It reads the way the phone site does (renderer/src/cloud-bridge.ts): every
// five seconds while the app is in front, one read at a time, only the
// threads that changed, and at once on coming back to the front. It sends
// through the site's own doors (renderer/src/phone-send.ts) and signs her
// files' links the site's way (renderer/src/phone-links.ts).
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { cloudClient, type CloudClient } from '../../../renderer/src/cloud-rest';
import { PROJECTS_SELECT, cloudCarriesOn, macSeenOf, phoneConnectState, phoneSlug, phoneStatusLine, phoneView, readCommands, readSettingsRows, readThreads, settingCommand, splitSlug, type PhoneRows } from '../../../renderer/src/phone-rows';
import { phoneRepeats, type RepeatSettingsRow } from '../../../renderer/src/phone-repeats';
import { sendPhoneFeedback, type FeedbackFiles } from '../../../renderer/src/phone-feedback';
import { phoneSender } from '../../../renderer/src/phone-send';
import { fileOnPhone, objectsToSign, renewLinks, type Links } from '../../../renderer/src/phone-links';
import { BUCKET, cloudPlaces } from '../../../renderer/src/cloud-files';
import { SEND_MAX_BYTES, sendFiles } from '../../../renderer/src/phone-sends-files';
import { drawFromBytes } from '../lib/files';
import { toastParts } from '../../../renderer/src/toast-parts';
import type { Saved } from '../lib/attach';
import type { Picked } from '../platform/pick';
import { planFor, runSteps, type PressedItem, type Press } from '../lib/actions';
import { needsNotice, NOTICE_KEY, readNotice, type Notice } from '../lib/ai-notice';
import { withDeadline } from '../lib/deadline';
import { keptStore } from '../lib/kept';
import { previewCloud } from '../lib/preview';
import { ALERTS_KEY, leaveAddress, readAlerts, takeAddressBack, type KeptAlerts } from '../lib/push-device';
import type { PlaceId } from '../lib/groups';
import { phoneTabs } from '../lib/tabs';
import { onTheirWay, teamFrom } from '../lib/teammates';
import { isUnread, markSeen as markSeenIn, markUnseen as markUnseenIn, readSeen } from '../lib/unread';
import { alertToken, alertTokenIfAllowed, setIconCount } from '../platform/alerts';
import { appStore, persist } from '../platform/persist';

export type Cloud = Pick<CloudClient, 'session' | 'signedIn' | 'generation' | 'select' | 'insertCommand' | 'update' | 'putFile' | 'signFiles' | 'signInWithPassword' | 'signInWithIdToken' | 'signUp' | 'googleUrl' | 'finishGoogle' | 'signOut' | 'insert' | 'remove' | 'rpc' | 'listFiles' | 'removeFiles' | 'upsert'>;

const EMPTY: PhoneRows = { projects: [], threads: [], commands: [] };
const EVERY_MS = 5000;
const SETTINGS_EVERY_MS = 30_000;
// Your teammates ride with the settings, so while a chat with one is open they are read with the threads.
const TEAM_WATCHED_MS = EVERY_MS;
const PREVIEW = process.env.EXPO_PUBLIC_PREVIEW === '1';
const APP_VERSION = Constants.expoConfig?.version ?? null;
const BUILD = Constants.nativeBuildVersion ?? null;

export interface Toast { key: number; line: string; undo: (() => Promise<void>) | null; goes?: { product: string; id: string } }

async function openCloud(): Promise<Cloud | null> {
  if (PREVIEW) return previewCloud();
  const cfg = Constants.expoConfig?.extra?.cloud;
  if (!cfg?.url || !cfg?.anonKey) return null;
  return cloudClient(cfg, { storage: await keptStore(persist), fetchImpl: withDeadline(fetch) });
}

const message = (err: unknown) => String((err as Error)?.message ?? err);

function useCloudState() {
  const [cloud, setCloud] = useState<Cloud | null>(null);
  const [opened, setOpened] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [rows, setRowsNow] = useState<PhoneRows>(EMPTY);
  const [read, setRead] = useState({ error: null as string | null, fetchedAt: 0, first: true });
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<Toast | null>(null);
  const cache = useRef(new Map<string, PhoneRows['threads'][number]>());
  const reading = useRef<Promise<void> | null>(null);
  // The sender reads and writes the newest rows, not the ones a render drew.
  const rowsNow = useRef<PhoneRows>(EMPTY);
  const setRows = useCallback((next: PhoneRows) => { rowsNow.current = next; setRowsNow(next); }, []);
  const links = useRef<Links>(new Map());
  const [settingsRows, setSettingsRows] = useState<RepeatSettingsRow[]>([]);
  const settingsAt = useRef(-Infinity);
  const teamWatched = useRef(0);
  const [signedAt, setSignedAt] = useState(0);

  useEffect(() => {
    openCloud().then((c) => { setCloud(c); setSignedIn(!!c?.signedIn()); setOpened(true); }, () => setOpened(true));
  }, []);

  const refresh = useCallback(() => {
    if (!cloud || reading.current) return reading.current ?? Promise.resolve();
    reading.current = (async () => {
      if (!cloud.signedIn()) { setSignedIn(false); setRows(EMPTY); return; }
      const asked = cloud.generation();
      const select = (table: string, query: string) => cloud.select(table, query);
      try {
        const [projects, threads, commands] = await Promise.all([
          select('phone_projects', PROJECTS_SELECT),
          readThreads(select, cache.current),
          readCommands(select),
        ]);
        if (cloud.generation() !== asked) { cache.current.clear(); return; }
        setRows({ projects, threads, commands });
        // The computer's settings copy carries its repeating tasks (main/phone-inbox.mjs); it changes far less often.
        if (Date.now() - settingsAt.current > (teamWatched.current > 0 ? TEAM_WATCHED_MS : SETTINGS_EVERY_MS)) {
          settingsAt.current = Date.now();
          void readSettingsRows(select).then((got) => { if (cloud.generation() === asked) setSettingsRows(got); }, () => { settingsAt.current = -Infinity; });
        }
        setRead({ error: null, fetchedAt: Date.now(), first: false });
        // Links before the screens draw, so a picture is pointed at its file the moment it is drawn.
        const owner = cloud.session()?.user.id;
        const want = owner ? objectsToSign(cloudPlaces(threads, phoneSlug), commands, links.current, owner) : [];
        if (want.length) {
          await renewLinks((paths, seconds) => cloud.signFiles(BUCKET, paths, seconds), want, links.current, () => cloud.generation() === asked)
            .catch(() => { /* the pictures say missing, the words still read */ });
          setSignedAt(Date.now());
        }
      } catch (err) {
        if (cloud.generation() !== asked) return;
        if (!cloud.signedIn()) { setSignedIn(false); setRows(EMPTY); }
        setRead((r) => ({ ...r, error: message(err), first: false }));
      } finally {
        setNow(Date.now());
      }
    })().finally(() => { reading.current = null; });
    return reading.current;
  }, [cloud, setRows]);

  useEffect(() => {
    if (!cloud || !signedIn) return;
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, EVERY_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [cloud, signedIn, refresh]);

  const view = useMemo(() => phoneView(rows, now), [rows, now]);
  const tabs = useMemo(() => phoneTabs(view, now), [view, now]);
  const repeats = useMemo(() => phoneRepeats(settingsRows, rows.commands, rows.projects, now), [settingsRows, rows.commands, rows.projects, now]);
  const team = useMemo(() => teamFrom(settingsRows), [settingsRows]);
  const teamPending = useMemo(() => onTheirWay(rows.commands, team, now), [rows.commands, team, now]);
  /** A chat with a teammate is on screen until the returned function runs. */
  const watchTeam = useCallback(() => {
    teamWatched.current += 1;
    settingsAt.current = -Infinity;
    void refresh();
    return () => { teamWatched.current -= 1; };
  }, [refresh]);
  const status = signedIn ? phoneStatusLine({ error: read.error, fetchedAt: read.fetchedAt, macSeen: macSeenOf(rows.projects), cloud: cloudCarriesOn(rows.projects) }, now) : null;
  // No computer has sent this account a project yet: the inbox says how to connect one.
  const connect = phoneConnectState({ signedIn, started: !read.first, error: read.error, projects: rows.projects, email: cloud?.session()?.user.email });
  const [seen, setSeen] = useState(() => readSeen(appStore));
  const markSeen = useCallback((item: { product: string; id: string }) => setSeen((s) => markSeenIn(s, item, appStore)), []);
  const markUnseen = useCallback((item: { product: string; id: string }) => setSeen((s) => markUnseenIn(s, item, appStore)), []);
  const unread = useCallback((item: { product: string; id: string }) => isUnread(item, seen), [seen]);
  const aliases = useRef(view.aliases);
  aliases.current = view.aliases;

  const sender = useMemo(() => (cloud
    ? phoneSender({ client: cloud, rows: () => rowsNow.current, setRows, aliases: () => aliases.current, changed: () => setNow(Date.now()) })
    : null), [cloud, setRows]);

  /** Says `text` on the toast; its Undo, when the text offers one, runs `undo`. */
  const say = useCallback((text: string, undo?: () => Promise<void>, goes?: Toast['goes']) => {
    const { line, undo: offers } = toastParts(text);
    setToast({ key: Date.now(), line, undo: offers && undo ? undo : null, goes });
  }, []);

  /**
   * One press, sent as the site sends it. Resolves to what the first door
   * answered (the made row, for a new thread); throws what went wrong.
   * `undone` runs after its Undo has worked, to put the words back.
   */
  // The yes before your words go to Claude Code or Codex (lib/ai-notice.ts).
  const [notice, setNotice] = useState<Notice>(null);
  const [noticeRead, setNoticeRead] = useState(false);
  // This phone's alert address while alerts are on (lib/push-device.ts).
  const [alerts, setAlerts] = useState<KeptAlerts>(null);
  const alertsNow = useRef<KeptAlerts>(null);
  useEffect(() => {
    persist.read().then((kept) => {
      setNotice(readNotice(kept[NOTICE_KEY]));
      alertsNow.current = readAlerts(kept[ALERTS_KEY]);
      setAlerts(alertsNow.current);
    }).catch(() => {}).finally(() => setNoticeRead(true));
  }, []);
  const agreed = !!notice && 'agreed' in notice;
  const answerNotice = useCallback((yes: boolean) => {
    const v = yes ? { agreed: Date.now() } : { declined: Date.now() };
    setNotice(v);
    void persist.write(NOTICE_KEY, JSON.stringify(v));
  }, []);

  const keepAlerts = useCallback((kept: KeptAlerts) => {
    alertsNow.current = kept;
    setAlerts(kept);
    void (kept ? persist.write(ALERTS_KEY, JSON.stringify(kept)) : persist.write(ALERTS_KEY, null)).catch(() => {});
  }, []);
  const turnOnAlerts = useCallback(async () => {
    if (!cloud?.signedIn()) throw new Error('Sign in first.');
    const token = await alertToken();
    await leaveAddress(cloud, { token, platform: Platform.OS, appVersion: APP_VERSION, now: Date.now() });
    keepAlerts({ token, at: Date.now() });
  }, [cloud, keepAlerts]);
  const turnOffAlerts = useCallback(async () => {
    const token = alertsNow.current?.token;
    keepAlerts(null);
    if (token && cloud?.signedIn()) await takeAddressBack(cloud, token);
  }, [cloud, keepAlerts]);
  // Renewed whenever the app opens, so the row says this phone is still here.
  const alertsOn = !!alerts;
  useEffect(() => {
    if (!cloud || !signedIn || !alertsOn) return;
    const forget = async () => {
      const token = alertsNow.current?.token;
      keepAlerts(null);
      if (token) await takeAddressBack(cloud, token).catch(() => {});
    };
    const renew = async () => {
      const was = alertsNow.current;
      if (!was || !cloud.signedIn() || Date.now() - was.at < 60_000) return;
      try {
        const token = await alertTokenIfAllowed();
        if (!token) return forget();
        await leaveAddress(cloud, { token, platform: Platform.OS, appVersion: APP_VERSION, now: Date.now() });
        if (token !== was.token) await takeAddressBack(cloud, was.token).catch(() => {});
        keepAlerts({ token, at: Date.now() });
      } catch { /* tried again the next time the app opens */ }
    };
    void renew();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void renew(); });
    return () => sub.remove();
  }, [cloud, signedIn, alertsOn, keepAlerts]);
  // The icon counts what needs you; an alert sets it while the app is shut.
  useEffect(() => { if (signedIn && !read.first) setIconCount(tabs.inbox.length); }, [signedIn, read.first, tabs.inbox.length]);

  const send = useCallback(async (press: Press, item: PressedItem | null, opts: { undone?: () => void } = {}) => {
    if (!sender) return null;
    if (needsNotice(press.kind) && !agreed) {
      router.push('/ai-notice');
      throw new Error('Not sent yet. Your agent needs your yes first.');
    }
    const plan = planFor(press, item, Date.now());
    if (!plan) return null;
    const made = await runSteps(sender, plan.steps);
    if (made && typeof made === 'object' && 'ok' in made && made.ok === false) throw new Error(String((made as { error?: string }).error ?? 'Not sent.'));
    if (plan.toast) {
      const goes = item ? { product: item.product, id: item.id } : made?.id ? { product: made.product, id: made.id } : undefined;
      say(plan.toast, plan.undo ? async () => {
        try {
          await runSteps(sender, plan.undo!(made));
          opts.undone?.();
          say(plan.undone?.(made) ?? 'Undone');
        } catch (err) { say(message(err)); }
      } : undefined, goes);
    }
    setNow(Date.now());
    return made;
  }, [sender, say, agreed]);

  // Where a command in Search sends the inbox page, and a permission card put aside (App.tsx `minimizedApproval`).
  const [wanted, setWanted] = useState<{ place: PlaceId; menu?: boolean; group?: boolean } | null>(null);
  const [minimizedApproval, setMinimizedApproval] = useState<string | null>(null);

  // A message to a teammate, someone new, or a go-ahead, left for the computer
  // that sent the teammates (shared/phone-settings.mjs `teammate`).
  const askTeammate = useCallback(async (key: 'post' | 'describe' | 'goAhead', value: Record<string, unknown>) => {
    if (!cloud || !team) throw new Error('Your computer has not sent your teammates yet.');
    if (key !== 'goAhead' && !agreed) {
      router.push('/ai-notice');
      throw new Error('Not sent yet. Your agent needs your yes first.');
    }
    const asked = cloud.generation();
    const row = await cloud.insertCommand(settingCommand(team.device, { scope: 'teammate', key, value }));
    if (cloud.generation() === asked) setRows({ ...rowsNow.current, commands: [...rowsNow.current.commands, row] });
    setNow(Date.now());
    return row;
  }, [cloud, team, agreed, setRows]);

  // Files go to your own storage, in the folder of the computer the project is
  // on, as the phone site sends them; the message then links them.
  const attach = useCallback(async (product: string, files: Picked[]): Promise<Saved[]> => {
    const where = splitSlug(product);
    const owner = cloud?.session()?.user.id;
    if (!cloud || !where || !owner || !files.length) return [];
    const sent = await sendFiles({ put: (object, bytes, type) => cloud.putFile(BUCKET, object, bytes, type), owner, device: where.device, files, maxBytes: SEND_MAX_BYTES });
    if (drawFromBytes(links.current, sent, files)) setSignedAt(Date.now());
    return sent;
  }, [cloud]);

  /** A file a thread names: its link, or why the phone cannot open it. */
  const fileOf = useCallback((product: string, src: string) => fileOnPhone(view.places, links.current, product, src),
    // `signedAt` is when new links came in, so a picture still arriving is looked up again.
    [view.places, signedAt]);

  const sendFeedback = useCallback(async (text: string, files: FeedbackFiles) => {
    const cfg = Constants.expoConfig?.extra?.cloud;
    if (PREVIEW) return { ok: true };
    if (!cfg?.url) return { ok: false, error: 'This build was made without the cloud’s address.' };
    return sendPhoneFeedback(cfg, { text, files, os: `${Platform.OS} app`, version: [APP_VERSION, BUILD && `(${BUILD})`].filter(Boolean).join(' ') }, withDeadline(fetch));
  }, []);

  const signedInWith = useCallback(async (how: () => Promise<unknown>) => {
    const out = await how();
    if (out !== null) { setSignedIn(!!cloud?.signedIn()); setRead({ error: null, fetchedAt: 0, first: true }); }
  }, [cloud]);

  const signOut = useCallback(() => {
    const c = cloud;
    const token = alertsNow.current?.token;
    keepAlerts(null);
    setIconCount(0);
    // Taken back while still signed in as you; a sign-in made meanwhile is never signed out.
    if (c && token && c.signedIn()) {
      const asked = c.generation();
      void takeAddressBack(c, token).catch(() => {}).finally(() => { if (c.generation() === asked) c.signOut(); });
    } else c?.signOut();
    cache.current.clear();
    links.current.clear();
    setRows(EMPTY);
    setSettingsRows([]);
    settingsAt.current = -Infinity;
    setToast(null);
    setSignedIn(false);
  }, [cloud, setRows, keepAlerts]);

  return {
    cloud, opened, signedIn, rows, view, tabs, repeats, status, loading: read.first, now, refresh, send, attach, fileOf, toast, say,
    team, teamPending, watchTeam, askTeammate, wanted, goTo: setWanted, takeWanted: () => setWanted(null), minimizedApproval, setMinimizedApproval,
    dismissToast: () => setToast(null), signedInWith, signOut, preview: PREVIEW,
    notice, noticeRead, agreed, answerNotice, withdrawNotice: () => answerNotice(false),
    alerts, turnOnAlerts, turnOffAlerts,
    connect, markSeen, markUnseen, unread, sendFeedback, version: APP_VERSION, build: BUILD,
    // The one map of her files' links, filled in place; `signedAt` moves when it does.
    links: links.current, signedAt,
  };
}

type CloudState = ReturnType<typeof useCloudState>;
const Ctx = createContext<CloudState | null>(null);

export function CloudProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useCloudState()}>{children}</Ctx.Provider>;
}

export function useCloud() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCloud outside CloudProvider');
  return c;
}
