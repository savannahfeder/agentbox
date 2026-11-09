// The app's one connection to the online inbox, and the rows it last read.
// It reads the way the phone site does (renderer/src/cloud-bridge.ts): every
// five seconds while the app is in front, one read at a time, only the
// threads that changed, and at once on coming back to the front. It sends
// through the site's own doors (renderer/src/phone-send.ts) and signs her
// files' links the site's way (renderer/src/phone-links.ts).
import Constants from 'expo-constants';
import { router } from '../lib/router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { cloudClient, type CloudClient } from '../../../renderer/src/cloud-rest';
import { PROJECTS_SELECT, cloudCarriesOn, macAway, macSeenOf, phoneConnectState, phoneSlug, phoneStatusLine, phoneView, readCommands, readSettingsRows, readThreads, settingCommand, splitSlug, type PhoneRows } from '../../../renderer/src/phone-rows';
import { phoneRepeats } from '../../../renderer/src/phone-repeats';
import type { SettingsRow } from '../../../renderer/src/phone-settings-view';
import { sendPhoneFeedback, type FeedbackFiles } from '../../../renderer/src/phone-feedback';
import { phoneSender } from '../../../renderer/src/phone-send';
import { fileOnPhone, objectsToSign, renewLinks, type Links } from '../../../renderer/src/phone-links';
import { BUCKET, cloudPlaces } from '../../../renderer/src/cloud-files';
import { SEND_MAX_BYTES, sendFiles } from '../../../renderer/src/phone-sends-files';
import { drawFromBytes } from '../lib/files';
import { STORE_BUILD } from '../lib/store-build';
import { toastParts } from '../../../renderer/src/toast-parts';
import { clipToSentence } from '../../../renderer/src/list-rules';
import { PHONE_UNDO_MS } from '../../../shared/phone-undo.mts';
import { heldAnswers } from '../lib/held-answers';
import { awayNext } from '../lib/computer-line';
import type { Saved } from '../lib/attach';
import type { Picked } from '../platform/pick';
import { planFor, runSteps, type PressedItem, type Press, type Step } from '../lib/actions';
import { needsNotice, NOTICE_KEY, noticeFor, readNotice, type Notice } from '../lib/ai-notice';
import { fresh, withDeadline } from '../lib/deadline';
import { keptStore } from '../lib/kept';
import { previewCloud } from '../lib/preview';
import { ALERTS_KEY, leaveAddress, readAlerts, takeAddressBack, type KeptAlerts } from '../lib/push-device';
import type { PlaceId } from '../lib/groups';
import { phoneTabs } from '../lib/tabs';
import { batchWords, pickedPlan, type PickedPress } from '../lib/picked';
import { onTheirWay, teamFrom, withPendingPauses, withPhoneAnswers } from '../lib/teammates';
import { isUnread, markSeen as markSeenIn, markUnseen as markUnseenIn, readSeen } from '../lib/unread';
import { alertToken, alertTokenIfAllowed, setIconCount } from '../platform/alerts';
import { appStore, persist } from '../platform/persist';
import { forgetCrash, keptCrash } from '../platform/crash';
import { crashReport, reportsOn } from '../lib/crash-note';

export type Cloud = Pick<CloudClient, 'session' | 'signedIn' | 'generation' | 'select' | 'insertCommand' | 'update' | 'putFile' | 'signFiles' | 'signInWithPassword' | 'signInWithIdToken' | 'signUp' | 'googleUrl' | 'finishGoogle' | 'askPasswordReset' | 'resetAsked' | 'finishReset' | 'setPassword' | 'signOut' | 'insert' | 'remove' | 'rpc' | 'listFiles' | 'removeFiles' | 'upsert'>;

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
  return cloudClient(cfg, { storage: await keptStore(persist), fetchImpl: fresh(withDeadline(fetch)) });
}

const message = (err: unknown) => String((err as Error)?.message ?? err);
const UNDO_WORDS = ' · press Z to undo';

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
  const [settingsRows, setSettingsRows] = useState<SettingsRow[]>([]);
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
          select('phone_projects', PROJECTS_SELECT) as Promise<PhoneRows['projects']>,
          readThreads(select, cache.current),
          readCommands(select),
        ]);
        if (cloud.generation() !== asked) { cache.current.clear(); return; }
        setRows({ projects, threads, commands });
        // The computer's settings copy carries its repeating tasks (main/phone-inbox.mts); it changes far less often.
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

  const shown = useMemo(() => phoneView(rows, now), [rows, now]);
  // A permission answered on the phone and still inside its Undo leaves every list at once.
  const [heldIds, setHeldIds] = useState<ReadonlySet<string>>(() => new Set());
  const view = useMemo(() => ({ ...shown, approvals: shown.approvals.filter((a) => !heldIds.has(a.id)) }), [shown, heldIds]);
  const tabs = useMemo(() => phoneTabs(view, now), [view, now]);
  const repeats = useMemo(() => phoneRepeats(settingsRows, rows.commands, rows.projects, now), [settingsRows, rows.commands, rows.projects, now]);
  const team = useMemo(() => (STORE_BUILD ? null : withPendingPauses(withPhoneAnswers(teamFrom(settingsRows), rows.commands), rows.commands)), [settingsRows, rows.commands]);
  const teamPending = useMemo(() => onTheirWay(rows.commands, team, now), [rows.commands, team, now]);
  /** A chat with a teammate is on screen until the returned function runs. */
  const watchTeam = useCallback(() => {
    teamWatched.current += 1;
    settingsAt.current = -Infinity;
    void refresh();
    return () => { teamWatched.current -= 1; };
  }, [refresh]);
  const status = signedIn ? phoneStatusLine({ error: read.error, fetchedAt: read.fetchedAt, macSeen: macSeenOf(rows.projects), cloud: cloudCarriesOn(rows.projects) }, now) : null;
  const statusNext = signedIn ? awayNext({ error: read.error, macSeen: macSeenOf(rows.projects), cloud: cloudCarriesOn(rows.projects) }, now) : null;
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
  const me = signedIn ? cloud?.session()?.user.id ?? null : null;
  const mine = noticeFor(notice, me);
  const agreed = !!mine && 'agreed' in mine;
  // Sends waiting on the notice's answer: a yes lets them go on, a no drops them.
  const noticeWaiters = useRef<Array<(yes: boolean) => void>>([]);
  const answerNotice = useCallback((yes: boolean) => {
    const v = yes ? { agreed: Date.now(), by: me ?? undefined } : { declined: Date.now(), by: me ?? undefined };
    setNotice(v);
    void persist.write(NOTICE_KEY, JSON.stringify(v));
    for (const go of noticeWaiters.current.splice(0)) go(yes);
  }, [me]);
  // The notice left unanswered: what waited goes no further, and the next send asks again.
  const leaveNotice = useCallback(() => { for (const go of noticeWaiters.current.splice(0)) go(false); }, []);
  const askNotice = useCallback(async () => {
    router.push('/ai-notice');
    const yes = await new Promise<boolean>((resolve) => { noticeWaiters.current.push(resolve); });
    if (!yes) throw new Error('Nothing went to an agent. Settings, under General, asks you again.');
  }, []);

  const keepAlerts = useCallback((kept: KeptAlerts) => {
    alertsNow.current = kept;
    setAlerts(kept);
    void (kept ? persist.write(ALERTS_KEY, JSON.stringify(kept)) : persist.write(ALERTS_KEY, null)).catch(() => {});
  }, []);
  const turnOnAlerts = useCallback(async () => {
    if (!cloud?.signedIn()) throw new Error('Sign in first.');
    // The browser preview has no phone to alert; it keeps a stand-in so the first run can be walked.
    if (PREVIEW) { keepAlerts({ token: 'preview', at: Date.now() }); return; }
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
    if (needsNotice(press.kind) && !agreed) await askNotice();
    const at = Date.now();
    const inCloud = !!item && phoneView(rowsNow.current, at).running.some((r: { itemId: string; product: string; where?: string }) => r.itemId === item.id && r.product === item.product && r.where === 'cloud');
    const plan = planFor(press, item, at, { away: macAway(macSeenOf(rowsNow.current.projects), at), cloud: cloudCarriesOn(rowsNow.current.projects), inCloud });
    if (!plan) return null;
    const made = await runSteps(sender, plan.steps);
    if (made && typeof made === 'object' && 'ok' in made && made.ok === false) throw new Error(String((made as { error?: string }).error ?? 'Not sent.'));
    if (plan.toast) {
      const goes = plan.goes !== undefined ? plan.goes ?? undefined : item ? { product: item.product, id: item.id } : made?.id ? { product: made.product, id: made.id } : undefined;
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
  }, [sender, say, agreed, askNotice]);

  const sendNow = useRef(send);
  sendNow.current = send;
  const [answers] = useState(() => heldAnswers((id, allow) => {
    void sendNow.current({ kind: 'approve', approval: id, allow }, null)
      .catch((err) => say(`Not answered: ${message(err) || 'it did not go through'}`))
      .finally(() => void refresh());
  }, PHONE_UNDO_MS, () => setHeldIds(answers.held())));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') answers.flush(); });
    return () => sub.remove();
  }, [answers]);
  /** Allow or Deny on a card, held while its toast offers Undo; `what` is the card's lede. */
  const answerApproval = useCallback((a: { id: string }, allow: boolean, what: string) => {
    answers.hold(a.id, allow);
    say(`${allow ? 'Allowed' : 'Denied'}: ${clipToSentence(what, 48)}${UNDO_WORDS}`, async () => {
      say(answers.undo(a.id) ? 'Not answered yet. The card is back.' : 'Already sent. Your computer has the answer.');
    });
  }, [answers, say]);

  // Threads picked together and closed or put off in one go, each by the plan one thread's press sends, with one Undo for all of them.
  const pressAll = useCallback(async (items: PressedItem[], press: Extract<Press, { kind: 'close' | 'later' }>) => {
    if (!sender) return;
    const words = batchWords(press, items);
    const undo: Step[] = [];
    let done = 0;
    try {
      for (const item of items) {
        const at = Date.now();
        const plan = planFor(press, item, at, { away: macAway(macSeenOf(rowsNow.current.projects), at), cloud: cloudCarriesOn(rowsNow.current.projects) });
        if (!plan?.steps.length) continue;
        const made = await runSteps(sender, plan.steps);
        if (made && typeof made === 'object' && 'ok' in made && made.ok === false) throw new Error(String((made as { error?: string }).error ?? 'Not sent.'));
        done += 1;
        if (plan.undo) undo.push(...plan.undo(made));
      }
      const back = async () => { try { await runSteps(sender, undo); say(words.undid(done)); } catch (err) { say(message(err)); } };
      say(`${words.did(done)}${undo.length ? ' · press Z to undo' : ''}`, undo.length ? back : undefined);
    } catch (err) {
      say(`${words.partial(done, items.length)} ${message(err)}`);
    }
    setNow(Date.now());
  }, [sender, say]);
  const closeAll = useCallback((items: PressedItem[]) => pressAll(items, { kind: 'close' }), [pressAll]);
  const laterAll = useCallback((items: PressedItem[], until: number, label?: string) => pressAll(items, { kind: 'later', until, label }), [pressAll]);
  // Resume and Priority on ticked threads, one plan for all of them.
  const running = view.running;
  const pressPicked = useCallback(async (items: PressedItem[], press: PickedPress) => {
    if (!sender) return;
    const at = Date.now();
    const working = (i: PressedItem) => running.some((r: { itemId: string; product: string }) => r.itemId === i.id && r.product === i.product);
    const plan = pickedPlan(press, items, { working, waits: macAway(macSeenOf(rowsNow.current.projects), at) && !cloudCarriesOn(rowsNow.current.projects) });
    if (!plan) return;
    try {
      await runSteps(sender, plan.steps);
      if (plan.toast) say(plan.toast);
    } catch (err) { say(message(err)); }
    setNow(Date.now());
  }, [sender, say, running]);

  // Where a command in Search sends the inbox page, and a permission card put aside (App.tsx `minimizedApproval`).
  const [wanted, setWanted] = useState<{ place: PlaceId; menu?: boolean; group?: boolean } | null>(null);
  const [minimizedApproval, setMinimizedApproval] = useState<string | null>(null);
  // How tall the permission card over the foot is, so lists leave room to scroll their last rows above it.
  const [approvalRoom, setApprovalRoom] = useState(0);

  // A message to a teammate, someone new, or a go-ahead, left for the computer
  // that sent the teammates (shared/phone-settings.mts `teammate`).
  const askTeammate = useCallback(async (key: 'post' | 'describe' | 'goAhead' | 'pause', value: Record<string, unknown>) => {
    if (!cloud || !team) throw new Error('Your computer has not sent your teammates yet.');
    // Only words for an agent need the yes; a go-ahead or a pause carries none.
    if ((key === 'post' || key === 'describe') && !agreed) await askNotice();
    const asked = cloud.generation();
    const row = await cloud.insertCommand(settingCommand(team.device, { scope: 'teammate', key, value }));
    if (cloud.generation() === asked) setRows({ ...rowsNow.current, commands: [...rowsNow.current.commands, row] });
    setNow(Date.now());
    return row;
  }, [cloud, team, agreed, setRows, askNotice]);

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

  // Last launch's crash goes once a computer's settings are read; with crash reports off it is dropped unsent.
  const crashSending = useRef(false);
  useEffect(() => {
    const allowed = reportsOn(settingsRows);
    if (PREVIEW || allowed === null || crashSending.current) return;
    const note = keptCrash();
    if (!note) return;
    if (!allowed) { forgetCrash(); return; }
    crashSending.current = true;
    void sendFeedback(crashReport(note), [])
      .then((out) => { if (out.ok) forgetCrash(); }, () => {})
      .finally(() => { crashSending.current = false; });
  }, [settingsRows, sendFeedback]);

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
    if (notice && !('by' in notice && notice.by)) { setNotice(null); void persist.write(NOTICE_KEY, null).catch(() => {}); }
  }, [cloud, setRows, keepAlerts, notice]);

  return {
    cloud, opened, signedIn, rows, view, tabs, repeats, status, statusNext, loading: read.first, onlineAt: read.error ? 0 : read.fetchedAt, now, refresh, send, answerApproval, closeAll, laterAll, pressPicked, attach, fileOf, toast, say,
    team, teamPending, watchTeam, askTeammate, wanted, goTo: setWanted, takeWanted: () => setWanted(null), minimizedApproval, setMinimizedApproval, approvalRoom, setApprovalRoom,
    dismissToast: () => setToast(null), signedInWith, signOut, preview: PREVIEW,
    notice: mine, noticeRead, agreed, answerNotice, leaveNotice, withdrawNotice: () => answerNotice(false),
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
