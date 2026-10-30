// Settings: the workspace, and every project's own.
//
// REDONE FROM SCRATCH ON 2026-10-05 (w-ccadd13c46), with Linear's settings as
// the reference. The page it replaced was "pretty confusing to process and a
// bit visually unappealing": a tab strip across the top of the panel, and a
// General page holding nine unrelated answers (usage, accounts, permissions,
// agents at once, memory, your own agents, the hints switch, diagnostics and
// the store path) in one long column.
//
// What it is now, in the shape Linear uses:
//
// - OPENING IT SWAPS THE SIDEBAR. The app's own sidebar steps aside and this
//   screen's menu takes its place, with "Back to app" at the top and a search
//   box under it. The panel beside it is the same raised panel the inbox sits
//   on, so nothing else on the window moves.
// - THE MENU IS THREE SHORT GROUPS, Personal, Agents and Workspace, and every
//   page is one subject. The list lives in ../settings-search.ts, beside the
//   search that reads it.
// - EVERY PAGE IS ONE CENTRED COLUMN: a title, then groups, each a heading
//   over one card of rows, and each row a label, a sentence and a control on
//   its right edge.
//
// Nothing is cached. Every write answers with the settings the main process now
// believes and the page redraws from that, never from what the click assumed: a
// switch that draws itself on and turns out not to have landed is the one
// failure a settings screen can have.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AgentMode, CodexModeId, PermissionMode, ProjectSettings, Settings as SettingsModel, UpdateState } from '../types';
import { onCloudPhone, onPhone, phoneSized } from '../phone-screen';
import { computerSays, type PhoneRows } from '../phone-rows';
import { changesOn, readingOf, type Reading, type SettingsRow } from '../phone-settings-view';
import { lastAccountAsk, webProjectRow, webSettingsGroups, webSettingsPages } from '../web-settings';
import { whatTakesEscape } from '../settings-escape';
import { WebAlertsGroup } from './WebAlerts';
import { api, RESTART_NOTE } from '../api';
import { updateLook } from '../update-row';
import { InstructionSettings, sizeLabel } from './InstructionSettings';
import { EVERY } from '../instruction-scope';
import type {AccountUsageReading, Usage, UsageLimit, WorkspaceSettings} from '../types';
import { accountLabel, cloudAccountInUse, cloudToggleTarget, countedAccounts, type CloudStatus } from '../cloud-menu';
import { cloudBilling, planSummary, type PaidPlan } from '../cloud-upgrade';
import { CloudPlanCards } from './CloudPlanCards';
import type { CloudPlan } from '../types';
import { cloudAccountState, meterPair } from '../account-words';
import { accountReadingFor, accountsOnce, codexAccountsOnce, type HereLogin, type OneAccount } from '../accounts-once';
import { LOOKS, lookMeans, SKINS, TUNE_DEFAULT, TUNE_LIMITS, type Look, type SkinId, type SkinTune } from '../skins';
import { readySkin } from '../look-switch';
import { MatchMark } from './MatchMark';
import { MODE_ORDER, MODE_SENTENCE, MODE_WORDS, RULES_ALWAYS_APPLY } from '../modes';
import { CODEX_MODES, CODEX_MODE_ORDER } from '../codex-modes';
import { ProductMark } from './ProductMark';
import { SHORTCUTS } from '../shortcuts';
import { chord, chords, sayKeys } from '../this-keyboard';
import { capWord } from '../hint-plate';
import { NAME, Name } from '../../../shared/product-name.mjs';
import { SETTINGS_TERMINAL } from '../../../shared/settings-terminal.mjs';
import { TaskTerminal } from './TaskTerminal';
import { ProjectsPage } from './ProjectsPage';
import { searchSettings, SETTINGS_PAGES, type SettingsHit, type SettingsPageId } from '../settings-search';
import type { Product } from '../types';
import { CloudMark, MacMark } from '../threads/ThreadMenu';
import './settings.css';

/* * TEAM IS A PANE HERE (w-8415594d19, 2026-10-01). The pane's CONTENT is
 handed in as `teamPane` rather than imported, so this screen, which is shared
 with the single-person build, keeps no team code. No pane handed in, no row.
*/
type Pane = SettingsPageId | { project: string };
// The web app's pages: every other one is the computer's to read and change.
const WEB_PAGES = new Set<SettingsPageId>(['appearance', 'shortcuts', 'phone']);

// A path a person can read in a narrow column: the home directory as ~, and the
// account uuid cut to the part that distinguishes it. The whole path is still
// on the General pane and in the title attribute, so nothing is hidden.
//
// The home is only shortened where the caller knows it (`w.homePath`): the
// fallback knows the macOS shape alone, and guessing a Linux one would turn
// `/home/shared/repos`, which is nobody's home, into `~/repos`.
export function shortPath(full: string, home?: string | null): string {
  const at = home && full.startsWith(`${home.replace(/\/+$/, '')}/`) ? home.replace(/\/+$/, '') : full.match(/^\/Users\/[^/]+/)?.[0];
  const short = at ? `~${full.slice(at.length)}` : full;
  return short.replace(/([0-9a-f]{8})-[0-9a-f-]{20,}/i, '$1…');
}

/* --------------------------------- controls ------------------------------- */

function Switch({ on, onChange, label, busy }: { on: boolean; onChange: (v: boolean) => void; label: string; busy?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`set-sw ${on ? 'on' : ''} ${busy ? 'busy' : ''}`}
      onClick={() => onChange(!on)}
    />
  );
}

function Stepper({ value, min, max, onChange, label }: {
  value: number; min: number; max: number; onChange: (v: number) => void; label: string;
}) {
  return (
    // TWO CHIPS AND THE NUMBER BETWEEN THEM (2026-10-05), the composer's chip
    // and not a boxed three-cell bar; the signs are drawn at the text's weight
    // rather than typed, so − and + are the same size and sit on one line.
    <div className="set-step" aria-label={label}>
      <button type="button" aria-label={`${label}, fewer`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
      </button>
      <span className="val">{value}</span>
      <button type="button" aria-label={`${label}, more`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7M6 2.5v7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

/**
 * A ONE-LINE PICKER: the value you are on, and the list behind it.
 *
 *  Claude Code has six permission modes and Codex has three, and six chips side
 *  by side do not fit at the end of a row. A menu is the same choice in a fixed
 *  width.
 *
 *  THE CHEVRON IS DRAWN, NOT TYPED: a 9px stroked path at the same optical
 *  weight as the text beside it, never the U+25BC character.
 *
 *  ITS FACE IS `--film-strong` AND NOT `--control-face`. Under Frost Haze
 *  `--control-face` resolves to a white film, and over a pale photograph that
 *  reads as a white slab. `--film-strong` is a tint of the theme in both
 *  directions and can never be white.
 *
 *  `bare` drops the label above it, for a picker that sits at the end of a row
 *  whose own label already says what it is. The label is still its name to a
 *  screen reader.
 */
function Picker<T extends string>({ label, value, options, onChange, title, bare = false }: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  title?: string;
  bare?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement | null>(null);
  // Clicking anywhere else shuts it, which is what every other menu on this
  // page does and what a person expects without being told.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const now = options.find((o) => o.value === value);
  return (
    <div className={`set-picker${open ? ' open' : ''}${bare ? ' set-picker-bare' : ''}`}>
      {!bare && <div className="set-picker-label">{label}</div>}
      <span className="set-picker-wrap" ref={wrap}>
        <button
          type="button"
          className="set-picker-now"
          title={title}
          aria-label={bare ? label : undefined}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {now?.label ?? value}
          <svg className="set-picker-chev" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2.2 4 L5 6.8 L7.8 4" fill="none" stroke="currentColor" strokeWidth="1.3"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <span className="set-picker-menu" role="listbox" aria-label={label}>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`set-picker-row${o.value === value ? ' on' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                {o.label}
              </button>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

// A SLIDER, in this app's own clothes. The one control on this screen that has
// no true/false answer: blur and darkness are matters of degree. The track and
// the thumb are drawn off the same tokens as the switch rather than left to the
// platform, which draws a blue capsule that belongs to macOS and nothing else.
function Dial({ label, desc, value, min, max, step, format, onChange }: {
  label: string; desc: string; value: number;
  min: number; max: number; step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  // The filled part of the track is a gradient stop rather than a second
  // element, so the fill cannot drift out of step with the thumb.
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="set-row set-dial-row">
      <div className="set-row-text">
        <div className="set-row-label">{label}</div>
        <div className="set-row-desc">{desc}</div>
      </div>
      <div className="set-dial">
        <input
          type="range"
          className="set-range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          style={{ '--fill': `${pct}%` } as React.CSSProperties}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
        />
        <span className="set-dial-val">{format(value)}</span>
      </div>
    </div>
  );
}

// `look` is a theme or a picture and only a picture has dials, so this is the
// one question the pane asks about it. Off SKINS, so a second picture needs no
// edit here.
const isSkin = (l: Look): l is SkinId => SKINS.some((sk) => sk.id === l);
const skinLabel = (l: SkinId) => SKINS.find((sk) => sk.id === l)?.name ?? 'Picture';

function Row({ label, desc, children }: {
  // `desc` takes a node, not just a string, so a row can put a line of its own
  // above the sentence.
  label: string; desc?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <div className="set-row-label">{label}</div>
        {desc && <div className="set-row-desc">{desc}</div>}
      </div>
      {children && <div className="set-row-ctl">{children}</div>}
    </div>
  );
}

/* * WORDS THE USER CAN TAKE OFF THIS PAGE. The command to sign an account back in is
 printed on the account rows, and selecting a phrase out of the middle of a sentence
 is still work, so the one string that is a command rather than prose gets a button.
 Same 1200ms flash Focus and DocText already use, so a copy confirms the same way
 everywhere in the app.
*/
function CopyCmd({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="set-copy"
      title={cmd}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(cmd);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch { /* clipboard blocked; the text is selectable either way */ }
      }}
    >{copied ? 'Copied' : 'Copy the command'}</button>
  );
}

/* * ==========================================================================
   ONE PAGE PER CODING AGENT (w-ccadd13c46, 2026-10-05).

   Each coding agent's whole story is on its own page, in the order a person
   asks it: how much is left, which account, then what it may do. It used to be
   one two-column card per agent on General, and before that (w-c2904cc8d9)
   Claude Code was described in three places that never touched.

   THE RULE FROM 2026-09-23 STILL HOLDS: each engine's settings live with that
   engine. A permission row on the Claude Code page cannot be about Codex.
   ==========================================================================
*/

type CardAccount = HereLogin;
export { accountReadingFor };

/**
 * One agent's whole story, gathered from the pieces the model still keeps
 *  apart. Nothing is derived here that main already answers. */
function agentStory(w: WorkspaceSettings, readings: Usage[], engine: 'claude' | 'codex') {
  const reading = readings.find((r) => r.engine === engine) ?? null;
  if (engine === 'codex') {
    return {
      engine, name: 'Codex', reading,
      found: !!w.codex?.found, certain: !!w.codex?.certain,
      trouble: w.codex?.trouble ?? null,
      bin: w.codex?.bin ?? '',
      chosen: !!w.codex?.chosen,
      url: w.codex?.url ?? '',
      accounts: (w.codex?.accounts ?? []).map((a): CardAccount => ({
        profile: a.profile, email: a.email, plan: a.plan, chosen: a.chosen,
        signedIn: a.signedIn, trouble: null, dir: null,
      })),
    };
  }
  return {
    engine, name: 'Claude Code', reading,
    found: !!w.claudeFound, certain: w.claudeCertain !== false,
    trouble: null,
    bin: w.claudeBin ?? '',
    chosen: !!w.claudeChosen,
    url: w.claudeInstallUrl ?? '',
    accounts: (w.accounts ?? []).map((a): CardAccount => ({
      profile: a.profile,
      email: a.email ?? null,
      plan: a.plan?.label ?? null,
      chosen: !!a.chosen,
      signedIn: !!a.email,
      trouble: a.trouble?.note ?? null,
      atLimit: a.trouble?.cause === 'at-limit',
      dir: a.dir ?? null,
    })),
  };
}

type Agent = ReturnType<typeof agentStory>;

/** Whichever of two readings was taken later, either possibly absent. */
export function newerReading(a: Usage | null, b: Usage | null): Usage | null {
  if (!a) return b;
  if (!b) return a;
  return (b.at ?? 0) > (a.at ?? 0) ? b : a;
}

export function usageCheckedAt(at: number | null | undefined, now: number): string {
  if (at == null || !Number.isFinite(at)) return '';
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (!minutes) return 'Checked just now';
  if (minutes < 60) return `Checked ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  return `Checked ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
}

/** One account as a place card draws it, whether it lives here or in the cloud. */
export type PlaceAccount = {
  key: string;
  name: string;
  /** The plan, first on the line under the name. */
  plan?: string | null;
  /** Anything else that line says, after the plan, joined with a dot. */
  about: string[];
  inUse?: boolean;
  limits?: UsageLimit[] | null;
  checkedAt?: number | null;
  usageError?: string | null;
  /** Offered when picking it would change something, with the words for it. */
  use?: { word: string; onUse: () => void } | null;
  /** Where it is signed in and working, a tag each after the plan. */
  places?: Where[];
  /** The cloud sign-in it is missing, a link after those. */
  cloudAct?: { word: string; onUse: () => void } | null;
  /** Why it cannot run, in main's words; replaces the meters. */
  trouble?: string | null;
  cmd?: string | null;
  /** False where no usage can be read at all, so no "no reading yet" is promised. */
  meters?: boolean;
  /** What the meters say before there is a reading. */
  none?: string;
};

/** SESSION, WEEK AND FABLE, the same meters for every account, each ending with when it resets. */
export function MiniMeters({ limits, now = Date.now(), none = 'No usage reading yet' }: { limits?: UsageLimit[] | null; now?: number; none?: string }) {
  const meters = meterPair(limits, now);
  if (!meters.length) return <div className="acct-meters-none">{none}</div>;
  return (
    <span className="acct-meters">
      {meters.map((m) => (
        <span className={`acct-meter${m.percent >= 100 ? ' full' : ''}`} key={m.key}>
          <span className="acct-meter-word">{m.word}</span>
          <span className="usage-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, m.percent)}%` }} /></span>
          <span className="acct-meter-pct">{m.percent}%</span>
          <span className="acct-meter-when" title={m.resets ? `Resets ${m.resets}` : undefined}>{m.resets ?? ''}</span>
        </span>
      ))}
    </span>
  );
}

// The header says the newest reading's time; a tile older than this says its own.
const OWN_TIME_AFTER_MS = 15 * 60_000;

type Where = 'here' | 'cloud';
const PLACE_TAG: Record<Where, { word: string; Mark: typeof CloudMark }> = {
  here: { word: 'Local', Mark: MacMark },
  cloud: { word: 'Cloud', Mark: CloudMark },
};
/**
 * One tile per account, two to a line, its meters stacked inside. IN USE sits
 *  beside the address (on the right margin it was missed), and the button
 *  that switches to an account sits in its top right corner. */
export function PlaceTiles({ accounts, onAdd, now = Date.now() }: { accounts: PlaceAccount[]; onAdd?: () => void; now?: number }) {
  return (
    <div className="acct-tiles">
      {accounts.map((a) => (
        <div className={`acct-tile${a.inUse ? ' on' : ''}${a.trouble ? ' trouble' : ''}`} key={a.key}>
          <div className="acct-tile-head">
            <span className="acct-tile-name">{a.name}</span>
            {a.inUse ? <span className="set-badge">In use</span>
              : a.use && <button type="button" className="acct-switch" onClick={a.use.onUse}>{a.use.word}</button>}
          </div>
          {(a.plan || a.about.length > 0 || a.places?.length || a.cloudAct) && (
            <div className="acct-tile-about">
              {(a.plan || a.about.length > 0) && <span>{[a.plan, ...a.about].filter(Boolean).join(' · ')}</span>}
              {a.places?.map((p) => {
                const { word, Mark } = PLACE_TAG[p];
                return <span className="acct-place" key={p}><Mark size={12} />{word}</span>;
              })}
              {a.cloudAct && <button type="button" className="ps-link acct-cloud-act" onClick={a.cloudAct.onUse}>{a.cloudAct.word}</button>}
            </div>
          )}
          {a.trouble ? (
            <>
              <div className="acct-tile-trouble">{a.trouble}</div>
              {a.cmd && <div className="acct-tile-cmd"><CopyCmd cmd={a.cmd} /></div>}
            </>
          ) : a.meters !== false && <>
            {(!a.usageError || a.limits?.length) && <MiniMeters limits={a.limits} now={now} none={a.none} />}
            {a.usageError && <div className="acct-tile-trouble" role="status">{a.usageError}</div>}
          </>}
          {!!a.checkedAt && (a.usageError || now - a.checkedAt >= OWN_TIME_AFTER_MS) && <div className="acct-reading-time">{usageCheckedAt(a.checkedAt, now)}</div>}
        </div>
      ))}
      {onAdd && <button type="button" className="acct-tile acct-tile-add" onClick={onAdd}>Add account</button>}
    </div>
  );
}

/**
 * ONE PLACE AGENTS RUN: its name, whether it is on, one line on when threads
 *  go there, and a tile per account. */
export function Place({ id, name, state = null, line = null, action, warn, accounts, onAdd, now }: {
  id: string; name: string; state?: 'On' | 'Off' | null; line?: string | null; action?: ReactNode; warn?: string | null;
  accounts: PlaceAccount[]; onAdd?: () => void; now?: number;
}) {
  const label = <>{name}{state && <span className={`set-badge${state === 'On' ? '' : ' set-badge-off'}`}>{state}</span>}</>;
  return (
    <Group id={id} label={label} action={action} bare>
      {(warn || line) && <div className="acct-place-line" role="status">{warn ?? line}</div>}
      <PlaceTiles accounts={accounts} onAdd={onAdd} now={now} />
    </Group>
  );
}

/**
 * The cloud's own logins, as a place card reads them. IT NAMES THE ONE IT RUNS
 * ON AND CALLS THE REST SIGNED IN (w-dac993a554): every tile said "Ready",
 * which was true while runs rotated over all of them and is a promise of work
 * that will never start there now that one account runs.
 */
export function cloudPlaceAccounts(cloud: CloudStatus, engine: 'claude' | 'codex', now: number): PlaceAccount[] {
  const all = cloud.accounts ?? [];
  const inUse = cloudAccountInUse(all, engine);
  // A login of an account already added is the same account, and the cloud never runs on it.
  return countedAccounts(all).filter((a) => a.engine === engine).map((a) => {
    const live = a.key === inUse?.key;
    const state = cloudAccountState(a, now);
    const read = !!a.limits?.length;
    // A full meter already says when it is back, so beside one the state is said short.
    const about = read && state.startsWith('At its limit') ? 'At its limit'
      : !live && state === 'Ready' ? 'Signed in'
      : state;
    return { key: a.key, name: accountLabel(a, all), plan: a.plan ?? null, about: [about], inUse: live, limits: a.limits ?? null, meters: read, checkedAt: read ? a.readAt : null };
  });
}

/**
 * A Claude account's one tile, wherever it is signed in (`accountsOnce`). The
 *  line under the name is the plan and, once a cloud is set up, a tag for each
 *  place the account works. The cloud cannot borrow this computer's login, so
 *  an account missing there, or whose sign-in there stopped, offers the sign-in.
 */
export function accountTile(a: OneAccount, { many, now, onUse, cloud = false, onCloudSignIn }: {
  many: boolean; now: number; onUse: (profile: string) => void;
  cloud?: boolean;
  onCloudSignIn?: (key: string | null, email: string | null) => void;
}): PlaceAccount {
  const h = a.here;
  const c = a.cloud;
  const broken = c?.state === 'broken';
  const signingIn = !!h && !h.signedIn;
  const places: Where[] = !cloud || signingIn ? [] : [...(h ? ['here' as const] : []), ...(c && !broken ? ['cloud' as const] : [])];
  const signIn = (word: string, key: string | null) => (onCloudSignIn ? { word, onUse: () => onCloudSignIn(key, h?.email ?? c?.name ?? null) } : null);
  // At its limit, the meters say which limit it is and when it resets.
  const limited = !!h?.trouble && !!h.atLimit && !!a.limits?.length;
  const trouble = limited ? null : h?.trouble ?? null;
  return {
    key: a.key, name: a.name, plan: a.plan,
    about: signingIn ? ['Finish signing in to use it']
      : limited && !meterPair(a.limits, now).some((m) => m.percent >= 100) ? ['At its limit'] : [],
    places,
    cloudAct: !cloud || signingIn ? null : broken ? signIn('Sign in to cloud again', c!.key) : h && !c ? signIn('Add to cloud', null) : null,
    // ONE ACCOUNT IS IN USE AND IT SAYS SO (w-dac993a554). This asked `picked`
    // as well, because until somebody picked, every account took a share of
    // the work and none of them was the one; the supervisor answers `chosen`
    // now, so the tile with it is the account and the others offer the switch.
    inUse: !!h?.chosen,
    limits: a.limits, checkedAt: a.checkedAt, usageError: a.usageError,
    use: h?.signedIn && !h.chosen && many ? { word: 'Switch', onUse: () => onUse(h.profile) } : null,
    trouble,
    cmd: trouble && h?.dir ? `CLAUDE_CONFIG_DIR=${h.dir} claude` : null,
    meters: !!(h || a.limits?.length),
  };
}

/**
 * The cloud row's sentence: when threads go there, and on which account.
 *
 * ONE ACCOUNT, HOWEVER MANY ARE SIGNED IN THERE (w-dac993a554). This listed
 * them and ended "in turn", which is what `pickCloudLogin` used to do; it takes
 * one account now and waits for it, so the sentence names that one.
 */
export function cloudRunsLine(mode: CloudStatus['mode'], inUse: string | null): string {
  if (mode === 'mac') return 'Every thread runs on this computer.';
  const when = mode === 'all' ? 'Threads start there first' : 'Threads start there when this computer is full';
  return `${when}, on ${inUse ?? 'your cloud account'}.`;
}

/*
 * THE SETTINGS SHELL, which is the app's own terminal opened against the one
   reserved key that belongs to no task (shared/settings-terminal.mjs). It is
   `TaskTerminal` and not a second terminal: one xterm in this app, one set of
   keys, one scrollback rule.

   IT TYPES THE COMMAND ONCE. The line came back from main, which made the
   folder it points at, so there is nothing for her to remember, retype or get
   wrong. `sent` guards the write because React may run this twice and signing
   in twice is worse than not at all.

   `onFinished` is told when the sign in hands back to the prompt, so the new
   account appears above the moment it is signed in, which is what the panel
   promises. It used to stay "Not signed in" until something else reloaded the
   page (2026-10-05). */
function SettingsTerminal({ command, onFinished }: { command?: string; onFinished?: () => void }) {
  const sent = useRef(false);
  useEffect(() => {
    if (!command || sent.current) return;
    sent.current = true;
    void (async () => {
      try {
        await api.terminal({ ...SETTINGS_TERMINAL, action: 'open' });
        await api.terminal({ ...SETTINGS_TERMINAL, action: 'write', data: `${command}\r` });
      } catch { /* the shell says its own failure on screen */ }
    })();
  }, [command]);
  return (
    <div className="ac-shell">
      <TaskTerminal product={SETTINGS_TERMINAL.product} id={SETTINGS_TERMINAL.id} startOpen onCommandFinished={onFinished} />
    </div>
  );
}

/**
 * A HEADING OVER ONE CARD OF ROWS, AND NOTHING UNDER IT. `id` is what the
 *  search scrolls to: a hit on "memory" opens Running and lands on this group,
 *  lit for a moment.
 *
 *  NO TEXT OUTSIDE THE CARD (2026-10-05): grey notes under the cards were
 *  "a lot of text under components, gets a bit ugly", so a group no longer
 *  takes one. Anything a row needs to say is in the row. A warning about the
 *  whole group is the card's first line, inside it. */
const Group = ({ id, label, warn, action, bare = false, children }: { id?: string; label?: ReactNode; warn?: string | null; action?: ReactNode; bare?: boolean; children: React.ReactNode }) => (
  <div className="set-group" data-find={id}>
    {label && <div className={`set-group-label${action ? ' set-group-head' : ''}`}><span>{label}</span>{action}</div>}
    {bare ? children : (
      <div className="set-plate">
        {warn && <div className="set-row set-row-warn" role="status">{warn}</div>}
        {children}
      </div>
    )}
  </div>
);

/**
 * THE MENU BEHIND "How many run at once": Automatic, then every number it could
 * have been, all of them counted for the MACHINE.
 *
 * Automatic is first and carries the number it actually settled on, so the row
 * answers the question without being opened. The numbers are the cap this page
 * has always stored, which is per account, multiplied by the logins — so the
 * menu offers only totals this Mac can really be set to, and picking one is
 * exactly the write the stepper used to make.
 */
export function agentCountOptions(w: {
  accounts?: unknown[]; agentsTotal?: number; capacity?: number; slotsMax?: number; sessionsAtOnce?: number;
}) {
  const auto = w.agentsTotal ?? w.capacity ?? 1;
  const say = (n: number) => `${n} ${n === 1 ? 'agent' : 'agents'}`;
  // NO DASH BETWEEN THE TWO HALVES. This read "Automatic — 6 agents" until she
  // saw it on the screen: "looks quite bad". The app has refused em dashes in
  // the words a person reads since `machineNote` was written, and a menu label
  // is read exactly as a sentence is, so the rule covers it too. A bracket is
  // what the rest of this file reaches for when a label carries a second fact.
  const options = [{ value: 'auto', label: `Automatic (${say(auto)})` }];
  // EVERY NUMBER IS FOR THE WHOLE COMPUTER AND IS STORED AS ITSELF
  // (w-ec27ff1a51). The label used to multiply a per-login number by the
  // logins, so a 7 read "14 agents" and nobody had picked 14.
  for (let n = 1; n <= (w.slotsMax ?? 12); n++) options.push({ value: String(n), label: say(n) });
  return options;
}

/**
 * WHAT THE APP MEASURED, AS THE FIRST THING ON THE PAGE (w-e5225b62ba).
 *
 * Every figure here is read, never worked out for display: the agents are the
 * sessions this app is running, and the rest comes from the memory check's own
 * coordinator (main/memory-gate-server.mjs) through `memoryReading`. ANYTHING IT
 * DOES NOT KNOW IS LEFT OUT. A card whose whole job is to be the measured corner
 * of the screen cannot afford one invented number, so a kernel reading that did
 * not arrive takes its cell with it rather than showing a nought.
 *
 * It is not drawn at all with the memory check off, because then the only thing
 * it could say is how many agents are running, which the sentence under the
 * title already says.
 */
function Reading({ running, capacity, gate }: {
  running?: number; capacity?: number;
  gate?: { on: boolean; reading?: { heavy: number | null; waiting: number | null; pressure: string | null; usedPct: number | null; asked: number | null; waited: number | null; refused: number | null; holding?: boolean } };
}) {
  const r = gate?.on ? gate.reading : null;
  if (!r) return null;
  const word = r.pressure === 'critical' ? 'Very short' : r.pressure === 'tight' ? 'Tight' : r.pressure ? 'Fine' : null;
  const cells: Array<{ n: string; of: string }> = [];
  if (Number.isFinite(running)) cells.push({ n: String(running), of: capacity ? `of ${capacity} running` : 'running' });
  if (r.heavy !== null) cells.push({ n: String(r.heavy), of: 'heavy at once' });
  if (r.waiting !== null) cells.push({ n: String(r.waiting), of: 'waiting on memory' });
  if (word) cells.push({ n: word, of: 'memory now' });
  // The day's tally is one sentence and only where there is one to tell. "None
  // turned away" is the part that answers "is this Mac coping", so it is said
  // in full rather than left to a nought the eye skips.
  const tally = r.asked
    ? `Today: ${r.asked} commands asked, ${r.waited ?? 0} waited, ${r.refused ? `${r.refused} turned away` : 'none turned away'}.`
    : null;
  // NEW AGENTS HELD FOR MEMORY (w-ec27ff1a51) is said while it is happening,
  // because a queue that is not moving and says nothing reads as broken.
  const holding = r.holding ? 'New agents wait until memory frees up. Urgent tasks still start.' : null;
  if (!cells.length && !tally && !holding) return null;
  return (
    <div className="set-group">
      <div className="set-plate">
        {!!cells.length && (
          <div className="set-row set-read">
            {cells.map((c) => <div key={c.of}><b>{c.n}</b><span>{c.of}</span></div>)}
          </div>
        )}
        {r.usedPct !== null && (
          <div className="set-row set-bar-row">
            <i className="set-bar"><i className={r.pressure === 'normal' ? '' : 'hot'} style={{ width: `${r.usedPct}%` }} /></i>
          </div>
        )}
        {holding && <div className="set-row set-row-warn">{holding}</div>}
        {tally && <div className="set-row set-row-warn">{tally}</div>}
      </div>
    </div>
  );
}

/** A page: its title, the sentence under it when there is one worth saying,
 *  and its groups. */
/* --------------------------------- phone --------------------------------- */
// FEEDBACK FROM A PHONE. Its corner has no Feedback button, by choice ("not
// important to be big for mobile"), which left no way to send any ("not sure
// how to give feedback on mobile", 2026-10-12).
function PhoneFeedbackGroup({ onFeedback }: { onFeedback: () => void }) {
  return (
    <Group id="phone-feedback" label="Feedback">
      <Row label="Send feedback" desc={`Tell us what works and what does not. It goes straight to the people who make ${Name}.`}>
        <button type="button" className="set-ghost" onClick={onFeedback}>Send feedback</button>
      </Row>
    </Group>
  );
}

// WITH THE MAC SHUT (docs/cloud/PHONE-PLAN.md, step 1). The projects she
// puts on her phone go to her account online on every sync; the phone site
// reads them and leaves what she sends for this Mac to do when it wakes.
// THE ONLY WAY IN IS A WEBSITE WE HOST (2026-10-14), not a link to this
// computer: the code is only its address, so it carries no key. The relay and
// the same-Wi-Fi door are gone (2026-10-16: "Should only ever be one way to
// access mobile: through the Cloud").
// ALL OF HER PROJECTS, BY DEFAULT (2026-10-15: "95% of people just want all
// of their projects connected"). One row and one dropdown, the way every
// other choice on this page is made ("it's more of a dropdown kind of
// thing"): Every project, None, or a tick beside each project.
type MacShut = {
  site: string | null; siteQr: string | null; all: boolean; projects: ProjectSettings[]; onChoose: (all: boolean, except: string[]) => void;
  // Who this computer sends as, and whether its threads are reaching the web app (main/team/index.mjs phoneOnce).
  email?: string | null; sentAt?: number | null; error?: string | null;
};
function PhoneConnection({ macShut }: { macShut: MacShut }) {
  const as = macShut.email ?? 'your account';
  if (macShut.error) {
    const why = macShut.error.replace(/\.?$/, '.');
    return <Row label="Not reaching the web app" desc={`${why[0].toUpperCase()}${why.slice(1)} Signed in as ${as}. It tries again every few seconds.`} />;
  }
  // Nothing until the first pass answers, and nothing from a main process older than this page.
  if (!macShut.sentAt) return null;
  return <Row label={`Connected as ${as}`} desc="Your phone and the web app have this computer's threads." />;
}
function PhoneProjectsPicker({ macShut }: { macShut: MacShut }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const slugs = macShut.projects.map((p) => p.slug);
  const kept = macShut.all ? macShut.projects.filter((p) => !p.onPhone).map((p) => p.slug) : slugs;
  const on = (slug: string) => !kept.includes(slug);
  const every = macShut.all && kept.length === 0;
  const none = !macShut.all || kept.length === slugs.length;
  const word = every ? 'Every project' : none ? 'None' : `${slugs.length - kept.length} of ${slugs.length}`;
  const tick = (slug: string) => {
    const next = on(slug) ? [...kept, slug] : kept.filter((s) => s !== slug);
    macShut.onChoose(next.length < slugs.length, next.length < slugs.length ? next : []);
  };
  const Tick = ({ checked }: { checked: boolean }) => (
    <span className={`ps-tick set-phone-tick${checked ? ' on' : ''}`} aria-hidden="true">
      {checked && <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.8 8.4 6.6 11.2 12.2 5" /></svg>}
    </span>
  );
  return (
    <div className={`set-picker set-picker-bare${open ? ' open' : ''}`}>
      <span className="set-picker-wrap" ref={wrap}>
        <button type="button" className="set-picker-now" aria-label="Projects on your phone" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {word}
          <svg className="set-picker-chev" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2.2 4 L5 6.8 L7.8 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <span className="set-picker-menu set-phone-menu" role="menu" aria-label="Projects on your phone">
            <button type="button" role="menuitemradio" aria-checked={every} className={`set-picker-row set-phone-row${every ? ' on' : ''}`} onClick={() => macShut.onChoose(true, [])}>
              <span className="set-phone-row-text">Every project<small>New ones too</small></span>
            </button>
            <button type="button" role="menuitemradio" aria-checked={none} className={`set-picker-row set-phone-row${none ? ' on' : ''}`} onClick={() => macShut.onChoose(false, [])}>
              <span className="set-phone-row-text">None<small>Everything stays on this computer</small></span>
            </button>
            <span className="set-phone-rule" role="separator" />
            {macShut.projects.map((p) => (
              <button key={p.slug} type="button" role="menuitemcheckbox" aria-checked={on(p.slug)} className="set-picker-row set-phone-row" onClick={() => tick(p.slug)}>
                <Tick checked={on(p.slug)} />
                <span className="set-phone-row-text">{p.name}</span>
              </button>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}
function MacShutGroup({ macShut }: { macShut: MacShut }) {
  const site = macShut.site?.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? null;
  return (
    <>
      <Group id="phone-mac-shut" label="On your phone">
        <PhoneConnection macShut={macShut} />
        <Row label="Projects on your phone" desc="A copy of their threads is kept in your account, so your phone can read and reply with this computer closed.">
          <PhoneProjectsPicker macShut={macShut} />
        </Row>
      </Group>
      <Group id="phone-site" label="Open on your phone">
        {site && macShut.siteQr ? (
          <div className="set-row set-phone-qr">
            <img alt={`QR code that opens ${site} on a phone`} src={`data:image/svg+xml;utf8,${encodeURIComponent(macShut.siteQr)}`} />
            <div className="set-row-desc">
              Scan with your phone's camera, or go to <code>{site}</code>. Sign in with this account, then add the page to your home screen and it opens like an app.
            </div>
          </div>
        ) : (
          <Row label="Not set up yet" desc="The phone site has no address yet." />
        )}
      </Group>
    </>
  );
}

type PhoneWeb = { email: string | null; seenAt: number; cloud: boolean; build?: { sha: string; at: number } | null; onSignOut: () => void };
function WebAccountPage({ web, feedback, onPhoneProjects }: { web: PhoneWeb; feedback: ReactNode; onPhoneProjects?: ReactNode }) {
  const computer = computerSays(web);
  return (
    <Page title="Account">
      <Group id="account">
        <Row label={web.email ? `Signed in as ${web.email}` : 'Signed in'}>
          <button type="button" className="set-ghost" onClick={web.onSignOut}>Sign out</button>
        </Row>
      </Group>
      <Group id="computer" label="Your computer">
        <Row label={computer.label} desc={computer.desc} />
      </Group>
      <WebAlertsGroup />
      {onPhoneProjects && <Group id="phone-mac-shut" label="On your phone">{onPhoneProjects}</Group>}
      {feedback}
      {web.build && (
        <Group id="updates" label="Updates">
          <Row label="Web app version" desc={`${web.build.sha}, built ${new Date(web.build.at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`} />
        </Group>
      )}
    </Page>
  );
}

function PhonePage({ onFeedback, macShut, onSignIn, web, onPhoneProjects }: { onFeedback?: () => void; macShut?: MacShut; onSignIn?: () => void; web?: PhoneWeb; onPhoneProjects?: ReactNode }) {
  const feedback = onFeedback && onPhone() ? <PhoneFeedbackGroup onFeedback={onFeedback} /> : null;
  if (web) return <WebAccountPage web={web} feedback={feedback} onPhoneProjects={onPhoneProjects} />;
  if (!macShut) {
    return (
      <Page title="Phone">
        <Group>
          <Row label="Sign in to use your phone" desc="Then your phone can read and reply with this computer closed.">
            {onSignIn && <button type="button" className="set-ghost" onClick={onSignIn}>Sign in</button>}
          </Row>
        </Group>
        {feedback}
      </Page>
    );
  }
  return (
    <Page title="Phone" lede="Read and reply from your phone, even with this computer closed.">
      <MacShutGroup macShut={macShut} />
      {feedback}
    </Page>
  );
}

/* ---------------------------- Plan and Billing ---------------------------- */
// With no plan, the plans as cards (w-1dc7ee2408, cloud-slots/20) and how the
// cloud counts. With one, the plan and Stripe's billing page, this month as
// two meters, then the cards to change to (w-893c5fe268). Choosing opens
// Stripe in the browser; the page reads the plan again until it changes
// (../cloud-upgrade.ts).
function CloudPlansPage({ signedIn, onSignIn }: { signedIn: boolean; onSignIn: () => void }) {
  const [plan, setPlan] = useState<CloudPlan | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const read = async () => { const p = await api.cloudAccountPlan(); setPlan(p); return p; };
  useEffect(() => { void read(); }, [signedIn]);
  // Back from Stripe's page in the browser, the plan is read again.
  useEffect(() => {
    if (!signedIn) return undefined;
    const back = () => { void read(); };
    window.addEventListener('focus', back);
    return () => window.removeEventListener('focus', back);
  }, [signedIn]);
  // The plan changes once Stripe's webhook lands.
  useEffect(() => {
    if (!waitingFor) return;
    const was = waitingFor;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      const p = await read();
      if (p.plan !== was || n > 60) { setWaitingFor(null); setChosen(null); clearInterval(t); }
    }, 5000);
    return () => clearInterval(t);
  }, [waitingFor]);
  const [opening, setOpening] = useState<PaidPlan | null>(null);
  const [chosen, setChosen] = useState<PaidPlan | null>(null);
  const choose = async (id: PaidPlan) => {
    if (!signedIn) { onSignIn(); return; }
    setSaid(null); setOpening(id);
    const out = await api.cloudAccountPay(id);
    setOpening(null);
    if (!out.ok) { setSaid(out.message || 'Stripe could not be opened. Try again.'); return; }
    setChosen(id);
    setSwitching(out.where === 'billing');
    setWaitingFor(plan?.plan ?? 'none');
  };
  const [switching, setSwitching] = useState(false);
  const [billSaid, setBillSaid] = useState<string | null>(null);
  const billing = async () => {
    setBillSaid(null);
    const out = await api.cloudAccountBilling();
    if (!out.ok) { setBillSaid(out.message || 'Stripe could not be opened. Try again.'); return; }
    void read();
  };
  const bill = cloudBilling(plan);
  const cards = <CloudPlanCards plan={plan} opening={opening} waiting={waitingFor ? chosen : null} onChoose={(id) => void choose(id)} />;
  const lines = (
    <>
      {said && <p className="cloud-plans-say">{said}</p>}
      {waitingFor && <p className="cloud-plans-say">{switching ? 'Confirm the change on Stripe’s page in your browser. Your plan shows here once it’s done.' : 'Finish paying in your browser. Your plan shows here once you’ve paid.'}</p>}
      {bill.says && !waitingFor && <p className="cloud-plans-say">{bill.says}</p>}
    </>
  );
  // THE PLAN YOU PAY FOR, FOUND UNDER BILLING (the founder's pick of five, 2026-10-25).
  const sum = planSummary(plan);
  if (sum) {
    const meter = (label: string, m: { line: string; percent: number }) => (
      <div className="bill-meter">
        <div className="bill-meter-label">{label}</div>
        <div className="bill-meter-value">{m.line}</div>
        <span className="bill-meter-bar"><i style={{ width: `${m.percent}%` }} /></span>
      </div>
    );
    return (
      <Page title="Plan and Billing">
        <Group id="cloud-billing" label="Your plan" bare>
          <div className="bill-summary">
            <div>
              <div className="bill-plan">{sum.name}</div>
              <div className="bill-price">{sum.price} · {billSaid ?? sum.who}</div>
            </div>
            {sum.manage && <button type="button" className="set-ghost" onClick={() => void billing()}>Manage billing</button>}
          </div>
        </Group>
        <Group id="cloud-use" label="This month" bare>
          <div className="bill-meters">{meter('Agents in the cloud', sum.agents)}{meter('Hours used', sum.hours)}</div>
        </Group>
        <Group id="cloud-plans" label="Change plan" bare><div className="bill-cards">{cards}</div></Group>
        {lines}
      </Page>
    );
  }
  return (
    <Page title="Plan and Billing" lede="Every thread needs a slot to run in. Your computer has a few. The cloud adds more.">
      {cards}
      {lines}
      <Group id="cloud-counts" label="How the cloud counts" bare>
        <ul className="cloud-counts">
          <li>Each slot runs one agent in the cloud, on top of the ones your computer runs.</li>
          <li>Time counts only while an agent is working. Waiting for your reply is free.</li>
          <li>Past a plan's hours, threads wait for your computer until the month turns.</li>
        </ul>
      </Group>
    </Page>
  );
}

const Page = ({ title, lede, children }: { title: string; lede?: string; children: ReactNode }) => (
  <div className="set-inner">
    <h1 className="set-title">{title}</h1>
    {lede && <p className="set-lede">{lede}</p>}
    {children}
  </div>
);

/* ------------------------------- a shortcut ------------------------------- */
// ONE KEY, DRAWN THE WAY THE APP ALREADY DRAWS KEYS. The cap is the row hint's
// cap and the walk's cap (`.row-keys kbd`, `.fr-tether kbd`) rather than a
// third picture of a key: a page whose whole job is to teach the app's keys
// must not be the one place they look different.
//
// THE CAPS ARE ON THE LEFT AND THE SENTENCE IS BESIDE THEM. It is a REFERENCE,
// read by scanning down a column for the key you half-remember, and a key
// hiding at the right-hand end of a sentence cannot be scanned for.
//
// The list is written in the Mac's glyphs, so on Linux each is drawn as the key
// really there and a row naming both ("⌘K or Ctrl+K") collapses to the one key.
function KeyRow({ keys, join, what }: { keys: string[]; join?: 'or' | 'to'; what: string }) {
  return (
    <div className="set-key-row">
      <div className="set-key-caps">
        {chords(keys).map((k, i) => (
          <Fragment key={k}>
            {i > 0 && join && <span className="set-key-join">{join}</span>}
            <kbd>{k}{capWord(k) && <span className="fr-cap-word">{capWord(k)}</span>}</kbd>
          </Fragment>
        ))}
      </div>
      <div className="set-key-say">{what}</div>
    </div>
  );
}

/* ------------------------------ permissions ------------------------------- */
// CLAUDE CODE'S SIX MODES, NOT SHAPES OF OURS. The words live in ../modes.ts so
// this screen, the walk and the reply box cannot drift apart. MODE_ORDER is
// Anthropic's own row order, and deliberately not a risk ranking of ours.
const PERMISSION_SENTENCE = MODE_SENTENCE;

const PERMISSION_OPTIONS: Array<{ value: PermissionMode; label: string }> = MODE_ORDER.map(
  (value) => ({ value, label: MODE_WORDS[value] }),
);

// CODEX'S THREE, in the order shared/codex-modes.mjs keeps them, which is
// least to most an agent may do. That file is the only place the list lives.
const CODEX_MODE_OPTIONS: Array<{ value: CodexModeId; label: string }> = CODEX_MODE_ORDER.map(
  (value) => ({ value, label: CODEX_MODES[value].label }),
);

const SAME_AS_HERE = 'The same as on this computer.';

// Full access's own sentence says "on this computer", which a cloud run is not.
const CODEX_CLOUD_WHAT: Record<CodexModeId, string> = {
  ...Object.fromEntries(CODEX_MODE_ORDER.map((id) => [id, CODEX_MODES[id].what])) as Record<CodexModeId, string>,
  'full-access': 'Anything on its own throwaway cloud machine, without asking.',
};

/* -------------------- the model is not asked here ------------------------- */
// The new task card asks which model a run goes out on, keeps the answer
// between cards, and is the only place it is asked (w-12081d32cc). The
// `--model` flag in zero.config.json is still read as a fallback.

/* ------------------- her own agents, and how loud they are ---------------- */
// Three positions, not a switch, because the middle one is the interesting one
// and a switch cannot hold it: a machine that has been swept once wants only
// the sessions that are actually stopped on a question.
const AGENT_OPTIONS: Array<{ value: AgentMode; label: string }> = [
  { value: 'all', label: 'All of them' },
  { value: 'waiting', label: 'Only the stuck ones' },
  { value: 'off', label: 'None' },
];

// One short sentence each (2026-10-05): the row is read at a glance, and the
// picker beside it already names the choice.
const AGENT_SENTENCE: Record<AgentMode, string> = {
  all: 'Each one is a row in your inbox. Closing it only takes it out of the inbox.',
  waiting: 'Only the ones waiting for you to type. The rest run without interrupting you.',
  off: 'Each is still in its project’s sidebar.',
};

/* --------------------- IS CLAUDE CODE CONNECTED OR NOT -------------------- */
// A TESTER WENT LOOKING FOR THIS AND FOUND NOWHERE TO LOOK (2026-08-28).
//
// THREE STATES, NEVER TWO. A login shell that timed out, or a Mac carrying
// every sign of Claude Code somewhere the search cannot reach, comes back
// `found: false, certain: false`. That is NOT a no. It is also not a yes,
// which is the other half of the rule and the reason the unsure state gets the
// faint dot rather than the live one: an unsure answer drawn confidently is
// how somebody ends up trusting a green light over a broken machine.
//
// THE VOICE IS THE WALK'S. They are written out here rather than imported so
// that a page of settings does not depend on a walk that a session can be
// editing at the same time — if the two ever drift, the walk's is canon.
//
// NO JARGON, ON PURPOSE. The person reading this does not know what a binary,
// a PATH or a shell is, and none of those words appear. Where it actually
// lives on disk is the quiet grey line under the plate, which is exactly as
// much attention as that fact deserves on this screen.
//
// WHERE IT IS DRAWN NOW (w-ccadd13c46): at the top of the agent's own page,
// and only when there is something wrong to say. A healthy Mac has nothing to
// read here; "connected" is a word she has read a thousand times.
const CLAUDE = {
  // The heading over the plate: the engine's own name, in the copy table with
  // the rest of its words, so binding a card to a table binds its heading too.
  name: 'Claude Code',
  connected: 'Claude Code is connected',
  connectedSay: `${Name} can see it on this computer, so your agents have something to run on. There is nothing for you to set up.`,
  trouble: 'Claude Code is here but not working',
  missing: 'Claude Code is not on this computer',
  // Not "your agents run on it": with Codex here they run on Codex instead.
  missingSay: `${Name} could not find Claude Code on this computer. Install it, then check again.`,
  missingLink: 'Get Claude Code',
  unsure: `${Name} could not check`,
  unsureSay: `${Name} has not been able to look for Claude Code on this computer. That is not the same as it being missing, only that the answer never came back. Try again in a moment.`,
  check: 'Check again',
  checking: 'Looking',
  // The row under the missing one, which is the only place on this screen that
  // sends anybody out of the app.
  getSay: 'It takes a few minutes. Come back here and press Check again, and your agents can run.',
  // AFTER A PRESS THAT TURNED NOTHING UP. It REPLACES the first sentence
  // rather than sitting under it, which is the walk's own rule and its own
  // reason: "repeating the first sentence at somebody who has just pressed a
  // button reads as a screen that did not notice the press."
  still: 'Still nothing here. A fresh install can take a moment to appear.',
  stillUnsure: `${Name} still could not get an answer. Nothing is necessarily wrong; try once more in a minute.`,
  where: (bin: string) => `${Name} runs it from ${bin}.`,
  /* * AND THE ROW THAT MEANS NOBODY WAITS FOR A RELEASE (w-ce8c1a9275).
     ${Name} asks your own login shell first and then looks in sixteen places,
     which between them cover every ordinary install. What they cannot cover is a
     copy somewhere nobody would guess, and until this row existed that was a
     path WE ship and a release YOU wait for. */
  point: 'Choose the file',
  pointLabel: 'Keep it somewhere else?',
  pointSay: `If ${Name} is looking in the wrong place, show it where Claude Code is.`,
  picking: 'Choosing',
  chosenLabel: 'You chose this one',
  chosenSay: `You showed ${Name} where it is, so it stopped looking. Let it look again if that was wrong.`,
  chosenGoneSay: `The file you chose is not there any more. Choose another, or let ${Name} look.`,
  searchAgain: 'Look for it instead',
} as const;

/* ------------------ AND THE SAME QUESTION ABOUT THE SECOND ---------------- */
// (a tester, 2026-09-05), asked after he ran the app with Codex
// selected and found that Settings said nothing about Codex at all.
//
// WHEN IT IS DRAWN: ON EVERY MAC (w-d5d632e503). It used to wait for an
// opt-in written into zero.config.json, and a tester who only uses Codex
// looked for it in Settings and found nothing, with no way to tell "not
// installed" from "not offered". Not found, the page says so and links the
// install.
//
// THE WORDS ARE THE ONES ABOVE, WITH CODEX AS THE SUBJECT. One difference, and
// it is the sentence that would otherwise be false: being connected does not
// mean her agents have something to run on -- Claude Code is that -- it means
// she can put a task on Codex instead.
const CODEX = {
  name: 'Codex',
  connected: 'Codex is connected',
  connectedSay: `${Name} can see it on this computer, so you can put a task on Codex instead of Claude Code. There is nothing for you to set up.`,
  trouble: 'Codex is here but not working',
  missing: 'Codex is not on this computer',
  missingSay: `${Name} could not find Codex on this computer, so every task runs on Claude Code. Install it, then check again.`,
  missingLink: 'Get Codex',
  unsure: `${Name} could not check`,
  unsureSay: `${Name} has not been able to look for Codex on this computer. That is not the same as it being missing, only that the answer never came back. Try again in a moment.`,
  check: 'Check again',
  checking: 'Looking',
  getSay: 'It takes a few minutes. Come back here and press Check again, and Codex is a choice on every task.',
  still: 'Still nothing here. A fresh install can take a moment to appear.',
  stillUnsure: `${Name} still could not get an answer. Nothing is necessarily wrong; try once more in a minute.`,
  where: (bin: string) => `${Name} runs it from ${bin}.`,
  // The same row, with Codex as the subject. See the note on Claude Code's.
  point: 'Choose the file',
  pointLabel: 'Keep it somewhere else?',
  pointSay: `If ${Name} is looking in the wrong place, show it where Codex is.`,
  picking: 'Choosing',
  chosenLabel: 'You chose this one',
  chosenSay: `You showed ${Name} where it is, so it stopped looking. Let it look again if that was wrong.`,
  chosenGoneSay: `The file you chose is not there any more. Choose another, or let ${Name} look.`,
  searchAgain: 'Look for it instead',
} as const;

type ConnectionCopy = typeof CLAUDE | typeof CODEX;

type EngineAccount = { email: string | null; name: string | null; plan: string | null; planNamed?: boolean; mode: string | null; accountId: string | null };

/*
 * THE NAME ON THE ACCOUNT, IN ONE LINE. Email first because that is the thing
   she would recognise, then the person's name, then the uuid as a last resort.
   Null when there is nothing worth saying, and then no row is drawn at all
   rather than one reading "Signed in as". */
function accountLine(account: EngineAccount): string | null {
  if (account.email) return `Signed in as ${account.email}`;
  if (account.name) return `Signed in as ${account.name}`;
  if (account.accountId) return `Signed in as ${account.accountId}`;
  return null;
}

/*
 * WHAT ELSE IS KNOWN ABOUT IT, as a sentence rather than three more rows. A
   plan is worth saying because it sets the limits the Usage panel above draws.
   An API-key login has no plan and no email and says so, because "signed in"
   over a key is a different arrangement from "signed in" over a subscription
   and the difference decides who gets billed. */
function accountSay(account: EngineAccount): string {
  const parts: string[] = [];
  if (account.email && account.name) parts.push(account.name);
  // A PLAN ID NOBODY MARKETS IS QUOTED AS CODEX'S WORD, not worn as ours. A real
  // account reports "prolite", and "On the prolite plan" reads like our
  // typo. Saying who reports it puts the oddness where it belongs.
  if (account.plan && account.planNamed !== false) parts.push(`On the ${account.plan} plan.`);
  else if (account.plan) parts.push(`Codex reports the plan as “${account.plan}”.`);
  else if (account.mode === 'apikey') parts.push('Signed in with an API key, so usage is billed to that key rather than to a subscription.');
  // NO PRODUCT NAME TYPED HERE. This sentence does not need the name to be
  // true, so it does not carry one.
  if (!parts.length) return 'This is the Codex login your tasks run on.';
  return parts.join('. ').replace(/\.\./g, '.');
}

type ConnectionState = 'connected' | 'trouble' | 'missing' | 'unsure';

/** Found but failing is its own state: "connected" over "its sessions die" said two things. */
export function connectionState({ found, certain, trouble }: { found: boolean; certain: boolean; trouble?: string | null }): ConnectionState {
  if (found) return trouble ? 'trouble' : 'connected';
  return certain ? 'missing' : 'unsure';
}

const STATE_WORD: Record<ConnectionState, string> = { connected: 'connected', trouble: 'not working', missing: 'not found', unsure: 'not sure' };

/*
 * ONE COMPONENT, TWO CODING AGENTS. The copy tables above are the whole of the
   difference between them, and they are tables rather than a second component
   for the reason the walk and this screen share one vocabulary: two drawings of
   the same three states drift within a week, and the state that drifts is
   always the unsure one, because it is the one nobody is looking at. */
function Connection({ copy, check, engine, found, certain, bin, chosen = false, url, trouble = null, account = null, onChecked }: {
  copy: ConnectionCopy;
  /**
   * WHICH AGENT THIS CARD IS ABOUT, and the only thing the window hands over
   *  when somebody points at the file themselves. The path comes back from the
   *  panel main opened; it never goes the other way (main/ipc.mjs,
   *  `zero:engine-bin`). */
  engine: 'claude' | 'codex';
  /**
   * The search this card's button runs. It is the engine's own, because
   *  looking for Claude Code tells you nothing about Codex. */
  check: () => Promise<{ found: boolean }>;
  found: boolean; certain: boolean; bin: string; url: string;
  /** Whether this path is one somebody chose rather than one we found. */
  chosen?: boolean;
  /**
   * WHO THIS MAC IS SIGNED IN AS, when the engine can say. Every field is
   *  independently null, so a login with no email still draws whatever it does
   *  know. */
  account?: EngineAccount | null;
  /**
   * WHY NOTHING RUNS ON IT DESPITE IT BEING HERE, or null. Main's sentence,
   *  never one derived here (main/settings.mjs `engineTroubleFor`, off
   *  shared/spawn-trouble.mjs). BEING FOUND IS NOT BEING USABLE: a subscription
   *  that lapsed leaves the binary exactly where it was and stops every task on
   *  that engine. */
  trouble?: string | null;
  /**
   * Re-read the whole settings model, the way every other write on this
   *  screen does: the page never draws what a press assumed. */
  onChecked: () => Promise<void> | void;
}) {
  const [checking, setChecking] = useState(false);
  // Whether the LAST press came back with nothing. Null until she has pressed,
  // because "still nothing here" said to somebody who has not pressed anything
  // is a screen answering a question nobody asked.
  const [again, setAgain] = useState<boolean | null>(null);
  // The panel is open, or main is refusing what came out of it in words. Both
  // belong to the one row below and to nothing else on this card.
  const [picking, setPicking] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const look = async () => {
    setChecking(true);
    try {
      const r = await check();
      setAgain(!r.found);
      // The search has already updated the path the rest of the app spawns
      // from (main/settings.mjs, recheckClaude and recheckCodex), so re-reading
      // settings is what puts this row and every other row in step with it.
      await onChecked();
    } finally {
      setChecking(false);
    }
  };

  /*
   * POINT AT THE FILE, OR HAND THE CHOICE BACK. One trip either way: main opens
   * the panel and applies what came out of it in the same call, so a cancel is
   * ok-with-nothing-changed and a refusal is a sentence rather than an error.
   * The page then re-reads itself, like every other write on this screen.
   */
  const point = async (action?: 'search') => {
    setPicking(true);
    setRefused(null);
    try {
      const r = await api.engineBin(engine, action);
      if (r?.refused) setRefused(r.refused);
      if (!r?.canceled) await onChecked();
    } finally {
      setPicking(false);
    }
  };

  const state = connectionState({ found, certain, trouble });
  const label = copy[state];
  /* * THE TROUBLE REPLACES THE LINE IT CONTRADICTS, rather than sitting under it. It
     is only ever read when the engine was FOUND, because a trouble about an engine that is
     not here has nothing to add to "it is not here".
  */
  const say = state === 'trouble' ? trouble
    : found ? copy.connectedSay
      : again ? (certain ? copy.still : copy.stillUnsure)
        : certain ? copy.missingSay : copy.unsureSay;

  return (
    <Group id="status" label="Status">
      <Row label={label} desc={say}>
        {/* The dot says the state and the word beside it says the same thing
            in English, so neither has to be learned from the other. There is
            no red anywhere in it: the standing rule is that Agentbox does not
            shout in colour, and this screen is not an emergency. */}
        <span className={`set-dot ${state === 'connected' ? 'live' : ''}`} />
        <span className="set-mono">{STATE_WORD[state]}</span>
        <button type="button" className="set-ghost" disabled={checking} onClick={() => void look()}>
          {checking ? copy.checking : copy.check}
        </button>
      </Row>
      {/* WHO IT IS SIGNED IN AS. Only ever drawn when the engine was FOUND: an
          account line over "Codex is not on this Mac" is two rows disagreeing
          about whether there is anything here at all. */}
      {found && account && (accountLine(account) !== null) && (
        <Row
          label={accountLine(account)!}
          desc={accountSay(account)}
        />
      )}
      {/* WHERE TO GET IT, and only when we are sure it is not here. An install
          link on an unsure answer sends somebody to reinstall software they
          probably already have. */}
      {!found && certain && (
        <Row label="Where to get it" desc={copy.getSay}>
          <a className="set-ghost" href={url} target="_blank" rel="noreferrer">{copy.missingLink}</a>
        </Row>
      )}
      {/* The path, and only when there is one. Its own row at the foot of the
          card, never in the status sentence, because it is the one thing here
          that is for somebody who already knows what it means. It is also the
          one row that says where a CHOSEN path is, so the row below never
          repeats it. */}
      {found && bin && <Row label="Runs from" desc={copy.where(bin)} />}
      {/* AND THE WAY OUT THAT IS NOT A RELEASE (w-ce8c1a9275).
          The search asks the login shell first and then looks in sixteen
          places, which between them cover every ordinary install; what they
          cannot cover is a copy somewhere nobody would guess, and every one of
          those used to be a path we ship and a release somebody waits for.

          ONE ROW, TWO STATES, because that is the whole decision: either show
          it where the file is, or -- if that turned out wrong -- let it look
          again. Drawn whether or not the agent was found, since somebody with a
          connected agent in the wrong place has exactly the same thing to say.

          THE REFUSAL REPLACES THE LINE IT CONTRADICTS, the same way `trouble`
          does above: picking a folder by mistake is answered where the press
          was, not in a second place. */}
      <Row
        label={chosen ? copy.chosenLabel : copy.pointLabel}
        desc={refused ?? (chosen ? (found ? copy.chosenSay : copy.chosenGoneSay) : copy.pointSay)}
      >
        <button
          type="button"
          className="set-ghost"
          disabled={picking}
          onClick={() => void point(chosen ? 'search' : undefined)}
        >
          {picking ? copy.picking : chosen ? copy.searchAgain : copy.point}
        </button>
      </Row>
    </Group>
  );
}

/*
 * EACH ENGINE'S OWN WORDS AND ITS OWN SEARCH, BOUND ONCE. The call sites then
   say which engine they are about and nothing else, and neither pair can be
   handed to the other page by accident. */
type EngineConnection = Omit<React.ComponentProps<typeof Connection>, 'copy' | 'check'>;

type EngineConnectionProps = Omit<EngineConnection, 'engine'>;

const ClaudeCode = (props: EngineConnectionProps) => (
  <Connection copy={CLAUDE} check={api.recheckClaude} engine="claude" {...props} />
);

const CodexCli = (props: EngineConnectionProps) => (
  <Connection copy={CODEX} check={api.recheckCodex} engine="codex" {...props} />
);

/* THE UPDATES GROUP CAME BACK, AS ONE ROW WITH ONE BUTTON (w-39d6c237f7,
   2026-10-07). It was taken out on 2026-09-23 (w-5737fe67cf) because the app
   keeps itself current on its own and a waiting version already reaches you in
   the sidebar, so the group was four rows of bookkeeping about something that
   needed no decision. What was missing is the one verb: "a way to pull a new
   version on demand, as many apps do, instead of waiting for the automatic
   check."

   SO IT IS A BUTTON AND THE ANSWER TO IT, and no more. The version this copy is
   running is the row's label, what the last check found is the sentence under
   it, and the button either looks now or restarts onto what is already on the
   disk. The words are all ../update-row.ts, shared with ⌘K.

   IT WORKS THE SAME ON BOTH KINDS OF COPY. Installed, the check is a release
   feed (main/updater.mjs); run from a checkout, it is `git fetch` against the
   branch (main/source-updater.mjs). Both answer the same door and the same
   shape, so there is nothing here that knows which one it is talking to.

   NOTHING IS ASSUMED ABOUT THE PRESS. The check's own answer is drawn, and the
   moment the window's snapshot moves, the snapshot wins: that is the rule the
   whole screen is built on, and here it matters more than anywhere, because the
   download that follows a check reports its progress through the snapshot and
   nothing else. */
function Updates({ state }: { state?: UpdateState | null }) {
  // WHAT THE CHECK JUST ANSWERED, HELD ONLY UNTIL THE SNAPSHOT CATCHES UP.
  // Stamped with the snapshot it was asked against, so a push that arrives
  // afterwards replaces it rather than being drawn over by an older answer.
  const [found, setFound] = useState<{ was: string; got: UpdateState } | null>(null);
  const [checking, setChecking] = useState(false);
  const key = JSON.stringify(state ?? null);
  const shown = found && found.was === key ? found.got : (state ?? found?.got ?? null);
  const look = updateLook(shown, { checking });

  const press = async () => {
    if (look.busy) return;
    if (look.restart) { void api.updateInstall(); return; }
    // THE COPY THAT CANNOT UPDATE ITSELF FROM WHERE IT IS: the press moves the
    // app into Applications and macOS relaunches it, so nothing after a
    // success here is ever drawn. A refusal arrives in the state, through the
    // snapshot, like every other failure (shared/where-it-runs-from.mjs).
    if (look.move) { void api.updateMove(); return; }
    setChecking(true);
    try {
      const got = await api.updateCheck();
      setFound({ was: key, got });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Group id="updates" label="Updates">
      <Row
        label={shown?.currentVersion ? `${Name} ${shown.currentVersion}` : Name}
        desc={look.sentence}
      >
        <button type="button" className="set-ghost" disabled={look.busy} onClick={() => void press()}>
          {look.button}
        </button>
      </Row>
    </Group>
  );
}

/* ---------------------------- the mark, changed --------------------------- */

// THE PICTURE BESIDE A PROJECT'S NAME, AND THE ONE CONTROL THAT CHANGES IT.
//
// Nothing is uploaded and nothing is hosted: the picture is copied into the
// project's own folder and read from there. main/project-identity.mjs says why
// it is copied rather than pointed at.
//
// THE MARK IS THE BUTTON. Clicking it opens the Mac's own picker. THE WAY BACK
// IS A CORNER BADGE, NOT A WORD BESIDE IT, so a project with a picture and one
// without put their name in exactly the same place.
function ProjectIcon({ project, onPick, onClear }: {
  project: ProjectSettings;
  onPick: () => Promise<void> | void;
  onClear: () => Promise<void> | void;
}) {
  return (
    <span className="set-icon-pick">
      <button
        type="button"
        className="set-icon-btn"
        onClick={() => void onPick()}
        title={project.logo ? 'Change this project’s picture' : 'Give this project a picture'}
        aria-label={project.logo ? `Change the picture for ${project.name}` : `Give ${project.name} a picture`}
      >
        <ProductMark src={project.logo} name={project.name} slug={project.slug} size={26} />
      </button>
      {project.logo && (
        <button
          type="button"
          className="set-icon-clear"
          onClick={() => void onClear()}
          title="Go back to the default mark"
          aria-label={`Remove the picture for ${project.name}`}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 3l4 4M7 3l-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      )}
    </span>
  );
}

/* ------------------------ the project's name, on its page ------------------ */

// THE NAME IS THE TITLE OF THE PAGE, AND THAT IS WHERE IT IS CHANGED. A menu
// row navigates and does nothing else (w-c4c4ad312c); here the name is the
// SUBJECT, and editing the thing itself is the only reading a click has.
//
// CLICK TO EDIT, ENTER SAVES, ESCAPE PUTS IT BACK, AND SO DOES CLICKING AWAY.
// Blur saving is what Finder does, and the cost of being wrong is one more
// rename. An empty name is refused by the main process (`cleanName`).
function ProjectTitle({ project, onRename }: {
  project: ProjectSettings;
  onRename: (name: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const input = useRef<HTMLInputElement | null>(null);

  // The box opens on the name it is editing, every time. Without this a rename,
  // an Escape and a second go would start from the abandoned draft.
  useEffect(() => {
    if (!editing) return;
    setDraft(project.name);
    // Selected, not merely focused: the common rename replaces the whole name.
    const id = requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); });
    return () => cancelAnimationFrame(id);
  }, [editing, project.name]);

  if (!editing) {
    return (
      <h1
        className="set-title set-title-edit"
        tabIndex={0}
        role="button"
        title="Click to rename this project"
        onClick={() => setEditing(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true); } }}
      >
        {project.name}
      </h1>
    );
  }

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== project.name) void onRename(next);
  };

  return (
    <input
      ref={input}
      className="set-title set-title-input"
      value={draft}
      aria-label={`Name for ${project.name}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // Stopped here, or Escape closes the whole Settings screen out from
        // under the edit and the name she was halfway through is gone.
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
      }}
    />
  );
}

/* --------------------------------- the menu -------------------------------- */

// ONE MARK PER PAGE, at the weight of the app's own sidebar icons: 1.4 hairline
// on a 24 grid, round caps, no fill except where the shape needs one.
function NavIcon({ id }: { id: SettingsPageId }) {
  const paths: Record<SettingsPageId, ReactNode> = {
    general: <><path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="17" r="2" /></>,
    appearance: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" /></>,
    shortcuts: <><rect x="3.5" y="6.5" width="17" height="11" rx="2" /><path d="M7.5 10.5h.01M11 10.5h.01M14.5 10.5h.01M8.5 14h7" /></>,
    phone: <><rect x="7" y="3" width="10" height="18" rx="2.2" /><path d="M11 17.5h2" /></>,
    claude: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="m7.5 10 2.5 2-2.5 2M12.5 14.5h4" /></>,
    codex: <><path d="m9 8-4 4 4 4M15 8l4 4-4 4" /></>,
    running: <><circle cx="12" cy="12" r="8" /><path d="M10.5 9.2v5.6l4.5-2.8z" /></>,
    cloud: <path d="M4 18V9M9.5 18V5M15 18v-6M20.5 18v-9" />,
    instructions: <path d="M6.5 3.5h7.5l4 4V20.5h-11.5zM14 3.5V8h4M9.5 12h5M9.5 16h5" />,
    projects: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
    team: <><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M16 14.6c2.3-.2 4 1.2 4.5 4" /></>,
    alpha: <><path d="M9.5 3.5h5M10.5 3.5v5.2L5.6 17.6a2 2 0 0 0 1.8 2.9h9.2a2 2 0 0 0 1.8-2.9l-4.9-8.9V3.5" /><path d="M7.6 14.5h8.8" /></>,
    rooms: <path d="M9.5 4.5 7.5 19.5M16.5 4.5l-2 15M5 9.5h14.5M4.5 14.5H19" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[id]}
    </svg>
  );
}

/** The page an old link or a ⌘K row names, read the way it always was: every
 *  name the screen has ever used still opens the page its content went to. */
function paneFrom(want: string, has: { team: boolean }): Pane {
  if (want.startsWith('project:')) return { project: want.slice('project:'.length) };
  if (want === 'themes') return 'appearance';
  if (want === 'priority') return 'projects';
  // The accounts were a page, then a group on Agents, then on General; they
  // are on each agent's own page now.
  if (want === 'accounts') return 'claude';
  if (want === 'agents') return 'running';
  if (want === 'team') return has.team ? 'team' : 'general';
  if (SETTINGS_PAGES.some((p) => p.id === want)) return want as SettingsPageId;
  return 'general';
}

/* --------------------------------- screen --------------------------------- */

export function Settings({ look, onSetLook, tune, onSetTune, onResetTune, keyHints, onSetKeyHints, startPane, usageReadings = [], now = Date.now(), embedded = false, onSectionChange, onPaneChange, onNewProject, ranked = [], onSetOrder, teamPane, projectShare, projectWho, account, phoneCloud, phoneWeb, onPhoneSignIn, update = null, onClose, onFeedback, cloud = null, onCloudSignIn, cloudPlans = null, roomsPane }: {
  /** Opens the feedback card. A phone has no Feedback button in its corner,
   *  so its own Settings page offers it (2026-10-12). */
  onFeedback?: () => void;
  /** The cloud, when this Mac is set up for it: its own logins are listed on the agent's page. */
  cloud?: CloudStatus | null;
  /** Signs a Claude account in to the cloud (a login's key to sign it in again), on the cloud's own screen. */
  onCloudSignIn?: (key: string | null, email: string | null) => void;
  /** Agentbox Cloud's plans, where this copy offers it: the Cloud page. */
  cloudPlans?: { signedIn: boolean; onSignIn: () => void } | null;
  // ONE control for the three of them. Light, dark and each picture are one
  // list, because a picture IS dark (skins.ts) and asking her to set a theme
  // and then a background is two decisions for one choice.
  look: Look;
  onSetLook: (l: Look) => void;
  // The dials on whichever picture is on. They only ever show under a picture,
  // so there is no disabled control on this screen for her to wonder about.
  tune: SkinTune;
  onSetTune: (t: SkinTune) => void;
  onResetTune: () => void;
  // Whether the app draws its keys when you point at something.
  keyHints: boolean;
  onSetKeyHints: (v: boolean) => void;
  /**
   * WHICH PAGE THIS OPENED ON, when whoever opened it had one in mind. Absent
   *  for the cog and for the ordinary ⌘K "Settings…" row, which both mean
   *  "take me to Settings" and land on General. */
  startPane?: string | null;
  embedded?: boolean;
  usageReadings?: Usage[];
  now?: number;
  onSectionChange?: (section: string | null) => void;
  /** The page up, by the name `startPane` takes back (`project:kestrel` for a
   *  project), so a reload can reopen it. */
  onPaneChange?: (pane: string) => void;
  // The new project card, from the Projects page.
  onNewProject?: () => void;
  // The running order, for the Projects page: every project already in order
  // (App's `rankedProducts`), and the write.
  ranked?: Product[];
  onSetOrder?: (slugs: string[]) => void | Promise<void>;
  /** Team management, handed in by whoever has the team's state. Absent on a
   *  build with no team cloud, and then there is no Team row either. */
  teamPane?: ReactNode;
  /** WHO SEES A PROJECT'S THREADS (w-b989839656), handed in the same way:
   *  the button beside a project's name, and the Projects list's column.
   *  Absent with nobody signed in, and then neither is drawn. */
  projectShare?: (slug: string) => ReactNode;
  projectWho?: (product: Product) => ReactNode;
  /** Who is signed in, for the Account group on General. Absent when nobody
   *  is, and then there is no group. */
  account?: { email: string; team?: string | null; onSignOut: () => void };
  /** HER PHONE WITH THE MAC SHUT (docs/cloud/PHONE-PLAN.md): present while
   *  she is signed in, with the phone site's address once there is one. */
  phoneCloud?: { site: string | null; siteQr: string | null; email?: string | null; sentAt?: number | null; error?: string | null };
  /** On the web app: the account it is signed in as, and its computer (cloud-bridge.ts). */
  phoneWeb?: PhoneWeb;
  /** Opens the sign-in the phone needs, when this build has a cloud to sign in to. */
  onPhoneSignIn?: () => void;
  /**
   * WHETHER A NEWER AGENTBOX IS WAITING, as the whole app already reads it
   *  (the sidebar card and ⌘K read the same field). Handed in rather than
   *  fetched, so the Updates row redraws off the snapshot like every other row
   *  on this screen; the button's own answer is only ever held until the next
   *  snapshot arrives. Null on a build with no updater behind it. */
  update?: UpdateState | null;
  /** Rooms (alpha): what people in your rooms see of you, handed in like the
   *  team's pane. Absent while Rooms is off, and then there is no Rooms row. */
  roomsPane?: ReactNode;
  onClose: () => void;
}) {
  const [model, setModel] = useState<SettingsModel | null>(null);
  // ?settings=claude, or ?settings=project:kestrel. Anything else (including the
  // bare ?settings=1 that only means "open") lands on General. `startPane` is
  // the same question asked from inside the app, and it wins.
  // ON A PHONE IT OPENS ON THE PHONE'S OWN PAGE, its alerts: "we probably need
  // a way in Settings for me to configure [notifications]" (2026-10-12). The
  // page was there, a tab along a strip that opened on General.
  const asked = startPane || new URLSearchParams(location.search).get('settings') || (onPhone() ? 'phone' : '');
  const [pane, setPane] = useState<Pane>(() => paneFrom(asked, { team: !!teamPane }));
  // WHICH PAGE IS UP, for the window around this screen.
  useEffect(() => {
    onSectionChange?.(typeof pane === 'object' ? 'projects' : pane === 'general' ? null : pane);
    onPaneChange?.(typeof pane === 'object' ? `project:${pane.project}` : pane);
  }, [pane]);

  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await api.settings();
    setModel(s);
    if (!s.ok) setError(s.error ?? 'could not read settings');
  }, []);

  useEffect(() => { void load(); }, [load]);
  // On the web app the computer's copy, and what it did with a change, arrive while the page is open.
  useEffect(() => {
    if (!onCloudPhone()) return undefined;
    const t = setInterval(() => { void load(); }, 5000);
    return () => clearInterval(t);
  }, [load]);

  // Every login's own usage, read when the Claude Code page opens and on
  // Refresh. A reading can take back a stale mark, so the page reloads after.
  const [accountReadings, setAccountReadings] = useState<AccountUsageReading[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const readAccounts = useCallback(async (refresh = false) => {
    setRefreshing(true);
    try {
      const readings = await api.accountUsage({ refresh });
      setAccountReadings(readings);
      if (readings.length) await load();
    } finally { setRefreshing(false); }
  }, [load]);
  useEffect(() => { if (pane !== 'claude') return; void readAccounts(); }, [pane, readAccounts]);

  // THE CODEX FIGURE, ASKED FOR AGAIN. It is held here rather than read off the
  // snapshot because that is where the refresh answers.
  const [codexReading, setCodexReading] = useState<Usage | null>(null);
  const [codexReadings, setCodexReadings] = useState<AccountUsageReading[]>([]);
  const [codexRefreshing, setCodexRefreshing] = useState(false);
  const refreshCodex = useCallback(async () => {
    setCodexRefreshing(true);
    try {
      const [r, readings] = await Promise.all([api.refreshUsage('codex'), api.accountUsage({ engine: 'codex' })]);
      // A refusal draws nothing of its own: the empty row below already says
      // why there is nothing.
      if (r.ok && r.reading) setCodexReading(r.reading);
      setCodexReadings(readings);
    } finally { setCodexRefreshing(false); }
  }, []);
  // Asked once on opening, so a figure Codex has already written down is on the
  // screen before anybody presses anything.
  useEffect(() => { if (pane !== 'codex') return; void refreshCodex(); }, [pane, refreshCodex]);

  /* THE SEARCH (w-ccadd13c46). Typing replaces the menu with what matches;
     ↑ and ↓ move through it and Enter opens one. Escape empties the box first
     and leaves Settings only once it is empty, so a search never costs the
     screen it was typed on. */
  const [query, setQuery] = useState('');
  const [hitAt, setHitAt] = useState(0);
  const searchBox = useRef<HTMLInputElement | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    // A search with words in it is emptied by its own Escape (`searchKeys`).
    const clearing = (e: KeyboardEvent) => !!queryRef.current && e.target === searchBox.current;
    const onKey = (e: KeyboardEvent) => {
      // A screen over this one, such as the cloud's sign-in, takes its own
      // keys; so does an open menu inside it (../settings-escape.ts).
      const takes = whatTakesEscape(document);
      if (takes === 'over') return;
      if (e.key === 'Escape' && takes === 'menu') return;
      if (e.key === 'Escape' && !clearing(e)) { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      // ⌘F, or / from anywhere that is not a box being typed in, goes to the search.
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable="true"]');
      if ((e.metaKey && e.key.toLowerCase() === 'f') || (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault(); e.stopPropagation();
        searchBox.current?.focus();
        searchBox.current?.select();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Every write returns the whole settings object, so the page redraws from
  // what the main process now believes. A refused write says so instead of
  // leaving a switch sitting in a position nothing agrees with.
  const write = useCallback(async (p: Promise<SettingsModel>) => {
    const s = await p;
    if (s.ok) { setModel(s); setError(null); }
    else setError(s.error ?? 'could not save that');
  }, []);

  /*
   * THE SIGN IN THAT IS RUNNING, or null. `command` is the line main handed
     back after making the folder and registering the login; the terminal types
     it. `error` is main refusing, which is rare and is said in place of the
     shell rather than under it. */
  const [adding, setAdding] = useState<{ engine?: string; name?: string; command?: string; error?: string } | null>(null);

  const setProject = (product: string, key: string, value: unknown) =>
    write(api.setProjectSetting({ product, key, value }));
  const setWorkspace = (key: string, value: unknown) =>
    write(api.setWorkspaceSetting({ key, value }));

  const projects = model?.projects ?? [];
  // WHO THE INSTRUCTIONS PAGE IS FOR. Held here so a project's own page can
  // open it already pointed at that project.
  const [instrScope, setInstrScope] = useState<string>(EVERY);
  const openInstructions = (slug: string) => { setInstrScope(slug); setPane('instructions'); };
  const current = useMemo(
    () => (typeof pane === 'string' ? null : projects.find((p) => p.slug === pane.project) ?? null),
    [pane, projects],
  );

  // A project that disappears while its page is open (archived, renamed) lands
  // on the list of projects rather than leaving a blank pane.
  // On the web app a project page is the computer's copy, which WebComputerPane checks itself.
  useEffect(() => {
    if (onCloudPhone()) return;
    if (typeof pane !== 'string' && model && !current) setPane('projects');
  }, [pane, model, current]);

  const w = model?.workspace;

  /*
   * WHETHER THIS MAC REALLY HAS TWO CODING AGENTS, and it is main's answer
     rather than a guess from the presence of a binary: `engineChoices` asks the
     capability gate first. IT IS THE ONLY THING ON THIS SCREEN THAT MAY MAKE A
     SENTENCE LONGER: every word Codex costs is behind this and appears on no
     other Mac. */
  const engineRows = w?.engineChoices ?? [];
  const twoEngines = engineRows.length > 1;

  /** The pages this Mac has. Codex on every Mac (w-d5d632e503); Team only on
   *  a build with a team cloud. */
  const webComputer: { computer: SettingsRow; commands: PhoneRows['commands'] } | null = onCloudPhone() && (model as { computer?: SettingsRow | null } | null)?.computer
    ? { computer: (model as unknown as { computer: SettingsRow }).computer, commands: (model as unknown as { settingCommands?: PhoneRows['commands'] }).settingCommands ?? [] }
    : null;
  const computerPages = webSettingsPages(webComputer?.computer ?? null);
  const pages = SETTINGS_PAGES.filter((p) => (p.id !== 'team' || !!teamPane) && (p.id !== 'cloud' || !!cloudPlans) && (p.id !== 'rooms' || !!roomsPane) && (!onCloudPhone() || WEB_PAGES.has(p.id) || computerPages.has(p.id)) && !(p.id === 'shortcuts' && phoneSized()))
    .map((p) => (onCloudPhone() && p.id === 'phone' ? { ...p, label: 'Account' } : p));
  const hits = useMemo(
    () => searchSettings(query, { pages: pages.map((p) => p.id), projects }),
    [query, pages.length, projects],
  );
  useEffect(() => { setHitAt(0); }, [query]);

  // WHERE A SEARCH LANDS: the page, then the group the hit names, lit for a
  // moment so the eye finds it on a page it may never have seen.
  const [landing, setLanding] = useState<{ anchor: string; at: number } | null>(null);
  const go = (h: SettingsHit) => {
    setQuery('');
    setPane(h.page.startsWith('project:') ? { project: h.page.slice('project:'.length) } : h.page as SettingsPageId);
    setLanding(h.anchor ? { anchor: h.anchor, at: Date.now() } : null);
  };
  const paneEl = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!landing) return undefined;
    const t = window.setTimeout(() => {
      const el = paneEl.current?.querySelector<HTMLElement>(`[data-find="${landing.anchor}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove('set-found');
      void el.offsetWidth;
      el.classList.add('set-found');
    }, 60);
    return () => window.clearTimeout(t);
  }, [landing, pane, model]);
  // A new page starts at its top.
  useEffect(() => { paneEl.current?.scrollTo({ top: 0 }); }, [typeof pane === 'string' ? pane : pane.project]);

  const searchKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); setQuery(''); return; }
    if (!hits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHitAt((i) => Math.min(hits.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHitAt((i) => Math.max(0, i - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); go(hits[hitAt] ?? hits[0]); searchBox.current?.blur(); }
  };

  const isOn = (id: SettingsPageId) => pane === id || (id === 'projects' && typeof pane === 'object');

  /** One coding agent's page: what is wrong with it if anything, how much is
   *  left, which account, and what it may do. */
  const enginePage = (engine: 'claude' | 'codex') => {
    if (!w) return null;
    const agent = agentStory(w, usageReadings, engine);
    const cloudHere = cloud?.setUp && (cloud.accounts ?? []).some((a) => a.engine === engine) ? cloud : null;
    const cloudLogins = cloudHere ? countedAccounts(cloudHere.accounts ?? []).filter((a) => a.engine === engine) : [];
    // The one the cloud runs on, by `pickCloudLogin`'s rule (cloud-menu.ts).
    const cloudInUse = cloudHere ? cloudAccountInUse(cloudHere.accounts ?? [], engine) : null;
    // Each login's own reading, never another's, and the cloud's when it is the same subscription and newer.
    // Codex's is the newer of the snapshot's and what Refresh just fetched.
    const accounts = engine === 'codex'
      ? codexAccountsOnce({ here: agent.accounts, cloud: cloudLogins, readings: codexReadings, current: newerReading(agent.reading, codexReading) })
      : accountsOnce({ here: agent.accounts, cloud: cloudLogins, readings: accountReadings, current: agent.reading });
    const tiles = accounts.map((a) => {
      const tile = accountTile(a, {
        many: agent.accounts.length > 1, now,
        onUse: (profile) => {
          void (async () => {
            const saved = await api.setWorkspaceSetting({ key: 'activeAccount', value: { engine, profile } });
            await write(Promise.resolve(saved));
            if (!saved.ok) return;
            try {
              await api.agentUpdate(engine, 'refresh');
              await write(api.settings());
            } catch (error) {
              setError(error instanceof Error ? error.message : String(error));
            } finally {
              window.dispatchEvent(new Event('agent-models-changed'));
            }
          })().catch(error => setError(error instanceof Error ? error.message : String(error)));
        },
        // Signing in to the cloud from a tile is Claude's alone.
        cloud: !!cloud?.setUp, onCloudSignIn: engine === 'claude' ? onCloudSignIn : undefined,
      });
      if (a.limits?.length) return tile;
      if (engine !== 'codex') return refreshing ? { ...tile, none: 'Reading its usage…' } : tile;
      // Codex writes an account's usage down only once it has worked.
      return { ...tile, none: tile.inUse ? 'Codex reports usage as it works' : 'No reading until this account runs' };
    });
    const lastRead = Math.max(0, ...tiles.map((a) => a.checkedAt ?? 0));
    const checked = lastRead ? usageCheckedAt(lastRead, now) : '';
    const busy = engine === 'codex' ? codexRefreshing : refreshing;
    const refresh = () => void (engine === 'codex' ? refreshCodex() : readAccounts(true));
    const addAccount = async (a: Agent) => {
      const r = a.engine === 'codex' ? await api.addCodexAccount() : await api.addClaudeAccount();
      setAdding(r.ok ? { engine: a.engine, name: a.name, command: r.command } : { engine: a.engine, name: a.name, error: r.error });
      // A Codex row appears now, reading "Not signed in". A Claude one appears
      // only once its sign-in lands, so an abandoned one is never listed.
      await load();
    };
    const status ={ found: agent.found, certain: agent.certain, bin: agent.bin, chosen: agent.chosen, url: agent.url, trouble: agent.trouble, onChecked: load };
    return (
      <Page title={agent.name}>
        {/* THE STATE SPEAKS ONLY WHEN IT IS BAD -- OR WHEN YOU MADE IT THIS WAY
            (w-ce8c1a9275). A path somebody chose themselves is the one healthy
            state worth a row, because the card is the only place that choice can
            be given back: a choice that could only be undone by hand-editing a
            file nobody is told about is not a door, it is a trap. */}
        {(!agent.found || agent.trouble || agent.chosen)
          && (engine === 'codex' ? <CodexCli {...status} /> : <ClaudeCode {...status} />)}
        {agent.found && (
          <>
            {/* "SIGNED IN", NOT "ACCOUNTS": a heading that works at any
                number, so one account is never shown a plural to fill. Refresh
                heads it because it reads every account on it, here and in the
                cloud. */}
            <Place
              id="usage"
              name="Signed in"
              action={(
                <span className="acct-place-act">
                  {!busy && checked && <span className="acct-checked">{checked}</span>}
                  <button type="button" className="set-ghost" disabled={busy} onClick={refresh}>{busy ? 'Refreshing…' : 'Refresh'}</button>
                </span>
              )}
              /* TWO FOLDERS, ONE SUBSCRIPTION, SAID ABOVE THE ROWS
                 (w-f2a5c9894e). Main's sentence, about Claude's pair. */
              warn={engine === 'claude' ? w.accountsNote : null}
              /* WHY A SECOND ACCOUNT BUYS NO MORE AGENTS, said only where
                 somebody can see two of their own (w-dac993a554). */
              line={tiles.length > 1 ? 'Your agents run on one account at a time.' : null}
              accounts={tiles}
              now={now}
              onAdd={() => void addAccount(agent)}
            />
            {cloudHere && (
              <Group id="cloud-accounts" label="Cloud">
                <Row label="Use the cloud" desc={cloudRunsLine(cloudHere.mode, cloudInUse ? accountLabel(cloudInUse, cloudLogins) : null)}>
                  <Switch
                    on={cloudHere.mode !== 'mac'}
                    label="Use the cloud"
                    onChange={() => void write(api.setWorkspaceSetting({ key: 'cloudRuns', value: cloudToggleTarget(cloudHere) }))}
                  />
                </Row>
              </Group>
            )}
            {/* SIGNING A SECOND ACCOUNT IN, IN THE APP (w-c2904cc8d9). Main
                makes the folder and registers the login, and the shell below
                is left with the one part that is genuinely hers, signing in to
                the vendor in a browser. */}
            {adding && adding.engine === engine && (
              <div className="ac-adding">
                <div className="ac-adding-top">
                  <span>{adding.error ? 'Could not add an account' : `Sign in to ${adding.name ?? 'your account'}`}</span>
                  <button type="button" className="ac-adding-x" aria-label="Close" onClick={() => { setAdding(null); void load(); }}>&#215;</button>
                </div>
                {adding.error
                  ? <p>{adding.error}</p>
                  : <p>Finish signing in below. It opens your browser, and the account appears above when it is done.</p>}
                {!adding.error && <SettingsTerminal command={adding.command} onFinished={() => void load()} />}
              </div>
            )}
            {engine === 'codex' ? (
              <Group id="permissions" label="Permissions">
                {/* AND NOT `RULES_ALWAYS_APPLY` UNDER THIS ONE. That caveat is
                    about Claude Code's allow and deny rules sitting on top of a
                    mode. Codex has no such list. */}
                <Row label={cloudHere ? 'On this computer' : 'Permission mode'} desc={CODEX_MODES[w.codexMode]?.what}>
                  <Picker
                    bare
                    label="Permission mode"
                    title="The starting point for every Codex agent. A project can be set to its own."
                    value={w.codexMode}
                    options={CODEX_MODE_OPTIONS}
                    onChange={(v) => setWorkspace('codexMode', v)}
                  />
                </Row>
                {cloudHere && (
                  <Row label="In the cloud" desc={w.cloudCodexMode && w.cloudCodexMode !== 'same' ? CODEX_CLOUD_WHAT[w.cloudCodexMode] : SAME_AS_HERE}>
                    <Picker
                      bare
                      label="Permission mode in the cloud"
                      title="The mode every cloud run starts in."
                      value={w.cloudCodexMode ?? 'same'}
                      options={[{ value: 'same', label: 'Same as this computer' }, ...CODEX_MODE_OPTIONS]}
                      onChange={(v) => write(api.setWorkspaceSetting({ key: 'cloudCodexMode', value: v }))}
                    />
                  </Row>
                )}
              </Group>
            ) : (
              <Group id="permissions" label="Permissions">
                {w.permission === 'custom' ? (
                  <Row label="Permission mode" desc={PERMISSION_SENTENCE.custom} />
                ) : (
                  <Row label={cloudHere ? 'On this computer' : 'Permission mode'} desc={PERMISSION_SENTENCE[w.permission]}>
                    {/* The caveat that your own allow and deny rules sit on top
                        of the mode rides on the picker rather than as a
                        paragraph under the card. */}
                    <Picker
                      bare
                      label="Permission mode"
                      title={`Claude Code's own modes. The starting point for every Claude Code agent, and a single reply can be sent in another. ${RULES_ALWAYS_APPLY}`}
                      value={w.permission}
                      options={PERMISSION_OPTIONS}
                      onChange={(v) => setWorkspace('permission', v)}
                    />
                  </Row>
                )}
                {/* THE CLOUD'S OWN MODE: a cloud run works on a throwaway copy
                    with nobody there to approve anything, so by default it
                    does not ask (main/cloud-permission.mjs). */}
                {cloudHere && (
                  <Row label="In the cloud" desc={w.cloudPermission && w.cloudPermission !== 'same' ? PERMISSION_SENTENCE[w.cloudPermission] : SAME_AS_HERE}>
                    <Picker
                      bare
                      label="Permission mode in the cloud"
                      title={`The mode every cloud run starts in. ${RULES_ALWAYS_APPLY}`}
                      value={w.cloudPermission ?? 'same'}
                      options={[{ value: 'same', label: 'Same as this computer' }, ...PERMISSION_OPTIONS]}
                      onChange={(v) => write(api.setWorkspaceSetting({ key: 'cloudPermission', value: v }))}
                    />
                  </Row>
                )}
              </Group>
            )}
          </>
        )}
      </Page>
    );
  };

  return (
    <div className={`settings-screen${embedded ? ' settings-embedded' : ''}`} data-pane={typeof pane === 'string' ? pane : 'project'}>
      <div className="set-nav">
        {/* THE WAY OUT, WHERE SHE LOOKS FOR IT: the first row of the menu, the
            way Linear has it. The strip is a drag region for the frameless
            window, so the button and the search box opt out of it or they
            cannot be clicked. */}
        <div className="set-nav-top">
          <button type="button" className="set-nav-back" onClick={onClose} aria-label="Back to app" title="Back to app (esc)">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
            <span className="set-nav-title">Back to app</span>
            <kbd className="set-nav-esc">esc</kbd>
          </button>
          <label className="set-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 4.5 4.5" /></svg>
            <input
              ref={searchBox}
              type="text"
              value={query}
              placeholder="Search"
              aria-label="Search settings"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={searchKeys}
            />
          </label>
        </div>
        <div className="set-nav-scroll">
          {query.trim() ? (
            hits.length ? hits.map((h, i) => (
              <button
                key={`${h.page}:${h.label}`}
                type="button"
                className={`set-nav-item set-hit${i === hitAt ? ' on' : ''}`}
                onMouseEnter={() => setHitAt(i)}
                onClick={() => go(h)}
              >
                <span className="set-hit-label">{h.label}</span>
                <span className="set-hit-page">{h.pageLabel}</span>
              </button>
            )) : <div className="set-nav-empty">Nothing matches “{query.trim()}”.</div>
          ) : (['Personal', 'Agents', 'Workspace', 'Billing'] as const).map((group) => pages.some((p) => p.group === group) && (
            <Fragment key={group}>
              <div className="set-nav-group">{group}</div>
              {pages.filter((p) => p.group === group).map((p) => (
                <Fragment key={p.id}>
                  <button
                    type="button"
                    className={`set-nav-item ${isOn(p.id) ? 'on' : ''}`}
                    aria-current={isOn(p.id) ? 'page' : undefined}
                    onClick={() => setPane(p.id)}
                  >
                    <span className="set-nav-ico"><NavIcon id={p.id} /></span>
                    <span className="set-nav-label">{p.label}</span>
                  </button>
                  {/* AND WHERE YOU ARE, when you are inside a project. A menu
                      row navigates and does nothing else (w-c4c4ad312c); the
                      rename lives on the page this opens. */}
                  {p.id === 'projects' && current && (
                    <button type="button" className="set-nav-item set-nav-sub on" onClick={() => setPane({ project: current.slug })}>
                      <span className="set-nav-ico"><ProductMark src={current.logo} name={current.name} slug={current.slug} size={14} /></span>
                      <span className="set-nav-label">{current.name}</span>
                    </button>
                  )}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="set-pane" ref={paneEl}>
        {pane === 'instructions' && <InstructionSettings projects={projects} scope={instrScope} onScope={setInstrScope} onSaved={load} />}
        {/* The settings error is left off the pages that read nothing from the
            settings file. The stale-build note is shown nowhere
            (w-b3e123a0af): a released app replaces its window and its process
            in the same restart, so nobody using one can reach it. */}
        {error && error !== RESTART_NOTE && pane !== 'shortcuts' && pane !== 'team' && <div className="set-error">{error}</div>}
        {!model && pane !== 'shortcuts' && pane !== 'instructions' && pane !== 'team' && <div className="set-inner"><div className="set-lede">Reading settings…</div></div>}

        {/* TEAM MANAGEMENT (w-8415594d19). It does not wait on `model`, because
            nothing on it comes from the settings file. */}
        {pane === 'cloud' && cloudPlans && <CloudPlansPage signedIn={cloudPlans.signedIn} onSignIn={cloudPlans.onSignIn} />}

        {pane === 'rooms' && roomsPane && (
          <Page title="Rooms" lede="What people in your rooms see of you. Private threads never show.">
            {roomsPane}
          </Page>
        )}

        {pane === 'team' && teamPane && (
          <Page title="Team" lede="Who is on your team, who has been invited, and the team's name. Everyone sees a short summary of your threads unless you mark one private.">
            {teamPane}
          </Page>
        )}

        {webComputer && (typeof pane === 'object' || computerPages.has(pane)) && pane !== 'appearance' && pane !== 'phone' && (
          <WebComputerPane pane={pane} web={webComputer} onWorkspace={setWorkspace} onProject={setProject} onOpenProject={(slug) => setPane({ project: slug })} />
        )}

        {model && pane === 'projects' && !onCloudPhone() && (
          <div className="set-inner">
            <ProjectsPage
              ranked={ranked}
              details={projects}
              home={w?.homePath ?? null}
              onSetOrder={onSetOrder}
              who={projectWho}
              onOpen={(slug) => setPane({ project: slug })}
              onNew={onNewProject}
              archived={model?.archivedProjects ?? []}
              onUnarchive={(slug) => write(api.archiveProject({ product: slug, archived: false }))}
              onArchive={async (slugs) => {
                for (const slug of slugs) await write(api.archiveProject({ product: slug, archived: true }));
              }}
            />
          </div>
        )}

        {/* GENERAL: you, your keys, what leaves this Mac and where your work is
            kept. Four small things set once. */}
        {model && w && pane === 'alpha' && (
          <Page title="Alpha features" lede="Early features you can try before they are finished. They may change or go away.">
            <Group id="alpha">
              <Row label="Rooms" desc="See the people you work with and their agents, with a chat beside them. Needs a team sign-in.">
                <Switch label="Rooms" on={!!w.alpha?.rooms} onChange={(v) => setWorkspace('alphaRooms', v)} />
              </Row>
              <Row label="Teammates" desc="Agents with a standing job that work on their own, talk in one team chat and reach you only when they need you.">
                <Switch label="Teammates" on={!!w.alpha?.teammates} onChange={(v) => setWorkspace('alphaTeammates', v)} />
              </Row>
              <Row label="Multiplayer" desc="Share projects with your team and see their threads beside yours. Needs a sign-in.">
                <Switch label="Multiplayer" on={!!w.alpha?.multiplayer} onChange={(v) => setWorkspace('alphaMultiplayer', v)} />
              </Row>
            </Group>
          </Page>
        )}

        {model && w && pane === 'general' && (
          <Page title="General">
            <Group id="keys" label="Keyboard">
              <Row
                label="Show keyboard shortcut hints"
                desc="Point at something and its keys appear beside it. Off, every key still works."
              >
                <Switch label="Show keyboard shortcut hints" on={keyHints} onChange={onSetKeyHints} />
              </Row>
            </Group>
            {/* THE CORNER TAG (w-dafae58a23). The tag itself only hides for a
                while; this is the one place it turns off for good, so it can
                never become a thing she closed once and forgot. */}
            <Group id="corner-tag" label="Agent Tray">
              <Row
                label="Show the Agent Tray"
                desc="A small tag over your other apps says when an agent has something for you. Drag it anywhere; it keeps that corner on every screen, and sizes itself to the screen it is on. Make it bigger or smaller with Size, at the foot of the list that opens when you point at it. Right-click it to hide it a while or turn it off."
              >
                <Switch label="Show the Agent Tray" on={w.cornerTag !== false} onChange={(v) => setWorkspace('cornerTag', v)} />
              </Row>
            </Group>
            {/* ONE SWITCH OVER EVERYTHING THAT LEAVES THE MACHINE, and there is
                deliberately no second one and no partial mode, because the
                privacy page (section 10) promises there is not. */}
            <Group id="privacy" label={`What ${NAME} sends`}>
              <Row
                label="Counts and crash reports"
                desc={`That ${NAME} was opened, that a task was opened, that a reply was sent, and a report when something breaks. Never your code, your prompts, your keys or your paths, and never a title.`}
              >
                <Switch label="Counts and crash reports" on={w.diagnostics} onChange={(v) => setWorkspace('diagnostics', v)} />
              </Row>
            </Group>
            {/* WHERE THE USER'S FILES ARE is a fact about folders, under a
                heading about folders. Where Claude Code lives on disk is not
                here: it is the grey note under that agent's status, which only
                speaks when something is wrong. */}
            <Group id="storage" label={`Where ${NAME} keeps things on this computer`}>
              <Row label="Your projects, tasks and documents" desc={w.storePath} />
            </Group>
            {/* THE VERSION AND THE WAY TO ASK FOR A NEWER ONE (w-39d6c237f7).
                Under the folders and above Account, because it is the same kind
                of fact as the folders: something about this install rather than
                something to decide. */}
            <Updates state={update} />
            {/* SIGN OUT IS THE LAST THING ON THE PAGE (w-a09476712f), where
                "How do i log out" looks for it: "should be at bottom of
                settings page". Your account menu in the sidebar's corner has
                it too. */}
            {account && (
              <Group id="account" label="Account">
                <Row label={`Signed in as ${account.email}`} desc={account.team ? `On the ${account.team} team.` : undefined}>
                  <button type="button" className="set-ghost" onClick={account.onSignOut}>Sign out</button>
                </Row>
              </Group>
            )}
          </Page>
        )}

        {model && w && pane === 'claude' && enginePage('claude')}
        {model && w && pane === 'codex' && w.codex && enginePage('codex')}

        {/* RUNNING: how many agents work at once, what holds them back when the
            Mac is short of memory, and which of your own reach the inbox. */}
        {model && w && pane === 'running' && (
          <Page title="Running">
            {/* WHAT IT MEASURED, FIRST (w-e5225b62ba, her drawing). These facts
                used to be the last clause of three grey paragraphs — "6 running
                now", "Holding 3 commands now; memory is tight", "Nothing running
                now" — so the one measured part of the screen was the part read
                last. It leads now, and anything the app does not actually know
                is left out rather than filled in. */}
            <Reading running={w.running} capacity={w.agentsTotal ?? w.capacity} gate={w.memoryGate} />
            <Group id="at-once" label="Agents">
              {/* PAUSING IS A COMMAND, NOT A SETTING (w-12081d32cc): Pause
                  agents and Unpause agents are on ⌘K. */}
              {/* HOW MANY RUN AT ONCE, which Agentbox answers now (w-e5225b62ba).
                  "Realistically, the user shouldn't have to figure out how many
                  agents they want at once. That's more of an override that
                  technical people should handle."

                  THE NUMBER SHOWN IS THE MACHINE'S, NOT THE ACCOUNT'S. The
                  stepper was per account while the sentence beside it talked
                  about the total, so this Mac showed 3 and said 6. Automatic
                  answers for the Mac and main/machine.mjs shares it out; the
                  per-account number is arithmetic nobody is asked to do.

                  A PLAN THAT ALLOWS ONE AT A TIME STILL SAYS SO, because that is
                  a fact about the subscription rather than about this Mac. */}
              <Row
                label="How many run at once"
                desc={w.sessionsAtOnceFromPlan
                  ? `Your plan is ${w.sessionsAtOnceFromPlan}, so ${NAME} starts one ${twoEngines ? 'Claude Code agent ' : ''}at a time.`
                  : w.agentsAuto
                    ? 'From this computer’s memory, kept there as you add accounts or turn the memory check on.'
                    : `You set this. Automatic would run ${w.agentsAutoTotal ?? w.sessionsAtOnce} on this computer.`}
              >
                {/* ONE DROPDOWN, NOT A CHOICE AND THEN A NUMBER (2026-10-05, her
                    note). Automatic and every number it could be are the same
                    question, so they are the same menu, and the number it
                    settled on is read off the row without opening anything.

                    EVERY OPTION IS A NUMBER FOR THE MACHINE, including the
                    manual ones. The cap stored underneath is still per account,
                    so the label multiplies it by the logins and the value is the
                    per-account number — which keeps this page talking in the one
                    unit it talks in everywhere else. */}
                <Picker
                  label="How many run at once"
                  value={w.agentsAuto ? 'auto' : String(w.sessionsAtOnce)}
                  options={agentCountOptions(w)}
                  onChange={(v) => (v === 'auto'
                    ? setWorkspace('agentsAuto', true)
                    : setWorkspace('sessionsAtOnce', Number(v)))}
                />
              </Row>
            {/* HOLD HEAVY WORK WHEN MEMORY IS SHORT (w-3958c3753d). An agent
                waiting on the model costs a few hundred MB; one running tests
                or a build costs a gigabyte or more, so the number that runs
                out is heavy commands, not agents. Off out of the box. */}
              {w.memoryGate && (
                <Row
                  label="Hold heavy work when memory is short"
                  desc={`Tests and builds take turns, urgent first, and new agents wait to start until memory frees up.${twoEngines ? ' Claude Code and Codex both.' : ''}`}
                >
                  <Switch label="Hold heavy work when memory is short" on={w.memoryGate.on} onChange={(v) => setWorkspace('memoryGate', v)} />
                </Row>
              )}
              {/* HOW MANY HEAVY COMMANDS, kept but moved out of the way: it is
                  the one number on this page a person has no way to pick well,
                  so it only appears once they have taken the decision back.
                  Stepping back onto Auto's own number IS Auto, so there is
                  always a way back without a second control. */}
              {w.memoryGate?.on && !w.agentsAuto && (
                <Row
                  label="Heavy commands at once"
                  desc={w.memoryGate.slots === null
                    ? `Auto: ${w.memoryGate.slotsAuto} on this computer, one for every 8 GB of memory.`
                    : `You picked ${w.memoryGate.slots}. Auto is ${w.memoryGate.slotsAuto} on this computer.`}
                >
                  <Stepper
                    label="Heavy commands at once"
                    value={w.memoryGate.slots ?? w.memoryGate.slotsAuto}
                    min={1}
                    max={w.memoryGate.slotsMax}
                    onChange={(v) => setWorkspace('memoryGateSlots', v === w.memoryGate?.slotsAuto ? null : v)}
                  />
                </Row>
              )}
              {/* STOP WHAT FINISHED AGENTS LEAVE RUNNING (2026-10-05). A night
                  of agents left 7.7 GB running after every agent had finished
                  and the Mac ran out of memory; main/leftovers.mjs has the
                  numbers and the rules agreed with Codex. Its own switch,
                  because the memory switch only ever delays commands and this
                  one stops programs, and the person should agree to that by
                  name.

                  IT READS AS A SENTENCE NOW, AND THE BUTTON IS GONE
                  (2026-10-05, her note). The label was "Stop what finished
                  agents leave running", which she read back as "Stop what?
                  Finish agents from running" — four verbs and no object, so the
                  row was unparseable before the setting was even considered. And
                  a "What it stops" button sitting beside the toggle "is a little
                  strange": two controls where there is one decision, the second
                  one named so vaguely she said she did not know what it meant.

                  SO THE POLICY IS BACK IN THE ROW, in two sentences rather than
                  six lines: what is stopped and when, then what never is. That
                  is the whole promise, which is the part that must not be a
                  surprise later, and it costs the row one line more than the
                  button did. */}
              {w.leftovers && (
                <Row
                  label="Stop programs agents leave behind"
                  desc={`Dev servers, previews and test runs an agent started keep running until you close its task, or until memory runs short. Apps installed on this computer are never stopped.${twoEngines ? ' Codex agents’ programs are not found yet.' : ''}${w.leftovers.now ? ` ${w.leftovers.now}` : ''}`}
                >
                  <Switch label="Stop programs agents leave behind" on={w.leftovers.on} onChange={(v) => setWorkspace('cleanupLeftovers', v)} />
                </Row>
              )}
              {/* COPIES OF A PROJECT THIS APP DID NOT MAKE (2026-10-07,
                  w-330eea6c66). Thirteen worktrees of one repository were found
                  outside the folder the app keeps its own in, about 740 MB, and
                  nothing in the app could list, show or sweep one: the same
                  invisibility that stranded 26 GB a fortnight earlier, in a new
                  place. main/task-folders.mjs has the measurement and the rules.

                  A SENTENCE AND NO CONTROL, and the row is absent whenever there
                  is nothing to say. A folder the app did not make is not the
                  app's to remove — it is the only copy of whatever is
                  uncommitted inside it — so there is nothing here to decide,
                  only something to know. A permanent row saying "none" would be
                  bookkeeping on a page that is already long. */}
              {w.strayFolders && <Row label="Copies of a project made by hand" desc={w.strayFolders.now} />}
              {/* THE ONE LEVER NO READING REPLACES. She is sitting in front of
                  the Mac and the app is not: "If there are issues with that, the
                  user determines whether they can take some sort of more manual
                  control or indicate that there were issues." It only ever
                  subtracts, and never below one agent. */}
              {w.agentsAuto && (
                <Row
                  label="Something felt slow"
                  desc={w.agentsNudge
                    ? `${NAME} is running ${w.agentsNudge} fewer than this computer suggests.`
                    : `${NAME} runs one fewer from now on, and remembers that it did.`}
                >
                  {!!w.agentsNudge && <button type="button" className="set-ghost" onClick={() => setWorkspace('agentsFeltSlow', 'reset')}>Undo</button>}
                  <button type="button" className="set-ghost" onClick={() => setWorkspace('agentsFeltSlow', true)}>Tell it</button>
                </Row>
              )}
            </Group>
            {/* THE USER'S OWN CLAUDE CODE, the sessions Agentbox did not start.
                They are rows in the Inbox and in no other list since
                2026-08-17; this is the only place that decides how many of
                them get there. */}
            <Group id="outside" label="Agents you started yourself">
              <Row
                label="Show while they run"
                desc={`Claude Code started in a terminal, not from here. ${AGENT_SENTENCE[w.outsideAgents]}`}
              >
                <Picker bare label="Agents you started yourself" value={w.outsideAgents} options={AGENT_OPTIONS} onChange={(v) => setWorkspace('outsideAgents', v)} />
              </Row>
              {/* The moment after the row above: a chat that has stopped. */}
              <Row
                label="Bring in new chats"
                desc="A new Claude Code or Codex chat in one of your projects comes in after ten quiet minutes. Waiting ones go to Needs you, finished ones to Done."
              >
                <Switch label="Bring in new chats" on={w.importNew === true} onChange={(v) => setWorkspace('importNew', v)} />
              </Row>
            </Group>
          </Page>
        )}

        {model && pane === 'appearance' && (
          <Page title="Appearance">
            {/* A theme is the one setting on this screen you judge by LOOKING at
                it, so the picture is the control. */}
            <Group id="theme" label="Theme">
              <div className="look-row">
                {LOOKS.map((l) => (
                  <button
                    key={l.id}
                    className={`look${look === l.id ? ' on' : ''}`}
                    aria-pressed={look === l.id}
                    onPointerEnter={() => void readySkin(lookMeans(l.id).skin)}
                    onFocus={() => void readySkin(lookMeans(l.id).skin)}
                    onClick={() => onSetLook(l.id)}
                  >
                    <span className={`look-swatch ${l.id}`} aria-hidden="true">
                      {l.id === 'match' && <MatchMark />}
                      <span className="look-tick" aria-hidden="true">
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M1.6 5.7 4.2 8.3 9.4 2.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </span>
                    <span className="look-name">{l.name}</span>
                  </button>
                ))}
              </div>
            </Group>
            {/* THE DIALS, and only under a picture. Both move the window she is
                looking at as she drags. Dark is Ember Grid, which has no
                picture to blur or dim, so they do not show for it
                (w-9e434e8671). */}
            {isSkin(look) && look !== 'ember-grid' && (
              <Group id="tune" label={skinLabel(look)}>
                {TUNE_DEFAULT[look].panelOpacity !== undefined && <Dial label={look === 'orbital-glass' ? 'Panel tint' : 'Panel whiteness'} desc="Reduce the tint to let more of the background show through." value={tune.panelOpacity ?? TUNE_DEFAULT[look].panelOpacity!} {...TUNE_LIMITS.panelOpacity} format={(v) => `${Math.round(v * 100)}%`} onChange={(panelOpacity) => onSetTune({ ...tune, panelOpacity })} />}
                <Dial
                  label="Foreground blur"
                  desc="Softens the glass behind your tasks."
                  value={tune.blur}
                  {...TUNE_LIMITS.blur}
                  format={(v) => (v === 0 ? 'none' : `${v}px`)}
                  onChange={(blur) => onSetTune({ ...tune, blur })}
                />
                <Dial label="Background blur" desc="Softens the whole backdrop, including behind the sidebar." value={tune.backgroundBlur ?? 0} {...TUNE_LIMITS.backgroundBlur} format={(v) => `${v}px`} onChange={(backgroundBlur) => onSetTune({ ...tune, backgroundBlur })} />
                <Dial
                  label="Darkness"
                  desc="How far the picture is turned down under the app."
                  value={tune.dim}
                  {...TUNE_LIMITS.dim}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(dim) => onSetTune({ ...tune, dim })}
                />
                <Row
                  label="What it shipped with"
                  desc={`Foreground blur ${TUNE_DEFAULT[look].blur}px, background blur ${TUNE_DEFAULT[look].backgroundBlur ?? 0}px, darkness ${Math.round(TUNE_DEFAULT[look].dim * 100)}%${TUNE_DEFAULT[look].panelOpacity !== undefined ? `, panel whiteness ${Math.round(TUNE_DEFAULT[look].panelOpacity! * 100)}%` : ''}.`}
                >
                  <button
                    type="button"
                    className="set-ghost"
                    disabled={tune.panelOpacity === TUNE_DEFAULT[look].panelOpacity && (tune.backgroundBlur ?? 0) === (TUNE_DEFAULT[look].backgroundBlur ?? 0) && tune.blur === TUNE_DEFAULT[look].blur && tune.dim === TUNE_DEFAULT[look].dim}
                    onClick={onResetTune}
                  >
                    Put it back
                  </button>
                </Row>
              </Group>
            )}
          </Page>
        )}

        {/* THE SHORTCUTS PAGE (w-fb22ca8895). NOTHING ON THIS PAGE IS A
            CONTROL: it is the one page you read rather than set. What is here
            is what a person actually presses, grouped by the moment they would
            want it; ../shortcuts.ts holds the list. Every key on it works today
            (`tests/the-shortcuts-page-lists-keys-that-work.test.mjs`). */}
        {pane === 'phone' && <PhonePage onFeedback={onFeedback} onSignIn={onPhoneSignIn} web={phoneWeb}
          onPhoneProjects={webComputer ? <WebPhoneProjects web={webComputer} onWorkspace={setWorkspace} /> : undefined} macShut={phoneCloud ? { ...phoneCloud, all: model?.workspace?.phoneAll !== false, projects: projects.filter((p) => p.slug !== 'practice'), onChoose: (all, except) => setWorkspace('phoneProjects', { all, except }) } : undefined} />}
        {pane === 'shortcuts' && (
          <div className="set-inner set-keys-page">
            <h1 className="set-title">Shortcuts</h1>
            {/* ONE GRID FOR THE WHOLE PAGE, NOT ONE PER GROUP (w-1bc916a880),
                so every sentence on the page starts on the same line. */}
            <div className="set-keys-grid">
              {SHORTCUTS.map((g) => (
                <div className="set-group" key={g.label}>
                  <div className="set-group-label">{g.label}</div>
                  <div className="set-plate set-keys">
                    {g.keys.map((k) => <KeyRow key={k.keys.join('+')} {...k} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {model && current && (
          <div className="set-inner">
            <button type="button" className="set-crumb" onClick={() => setPane('projects')}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
              <span>Projects</span>
            </button>
            {/* THE MARK AND THE NAME, at the size of a title, each changed in
                the one place it is legible. */}
            <div className="set-title-row">
              <ProjectIcon project={current} onPick={() => write(api.pickProjectIcon({ product: current.slug }))} onClear={() => write(api.clearProjectIcon({ product: current.slug }))} />
              <ProjectTitle project={current} onRename={(name) => write(api.renameProject({ product: current.slug, name }))} />
              {/* WHO SEES ITS THREADS, drawn as the answer (design 2B,
                  w-b989839656). Handed in, like the Team pane: on a team
                  build the window passes the button, and with nobody signed
                  in there is nothing here. */}
              {projectShare?.(current.slug)}
            </div>

            {/* FIVE CONTROLS BECAME ONE (w-d19d6d387c, 2026-09-22): whether a
                task an AGENT files here waits for her. Her own tasks always
                start, and a question or a review always waits.

                A PROJECT'S PERMISSION MODE IS STILL HONOURED AND IS NO LONGER
                OFFERED. The row below appears on a project that HAS one and
                gives her the way back to the workspace default. */}
            <Group label="How it runs">
              <Row
                label="Let agents start the tasks they file here"
                desc="A task an agent writes on this project gets a session straight away. Without this it waits in your inbox for your yes. Questions and reviews always wait for you either way."
              >
                <Switch label="Let agents start the tasks they file here" on={current.autonomous} onChange={(v) => setProject(current.slug, 'autonomous', v)} />
              </Row>
              {/* ONE LOGIN, NO ROW. The choice is only a choice with a second
                  account signed in, and on the one-account Mac -- which is
                  nearly every Mac -- this page reads exactly as it did.

                  UNLESS SOMETHING IS ALREADY TIED, and then it shows however few
                  accounts are left. Signing out of the second login would
                  otherwise hide the row with the tie still written in the config,
                  leaving a setting nothing on any screen could undo. The
                  supervisor ignores a tie whose account has gone (`_projectProfile`),
                  so what this row can show is always a login that is really here. */}
              {((w?.accounts ?? []).length > 1 || (current.account ?? 'any') !== 'any') && (
                <Row
                  label="Claude account"
                  desc="Every Claude Code agent on this project runs on this account and on no other. If the account cannot run, the work waits."
                >
                  <Picker
                    bare
                    label="Claude account"
                    title="The Claude account this project's agents run on."
                    value={current.account ?? 'any'}
                    options={[
                      /* 'any' IS THE ABSENCE OF A TIE, not a rotation: it read
                         "Any account" while there was one (w-dac993a554). */
                      { value: 'any', label: 'The account in use' },
                      ...(w?.accounts ?? []).map((a) => ({ value: a.profile, label: a.email ? `${a.email} (${a.label})` : a.label })),
                    ]}
                    onChange={(v) => setProject(current.slug, 'account', v)}
                  />
                </Row>
              )}
              {current.permission !== 'workspace' && (
                <Row
                  label={twoEngines ? 'This project has its own Claude Code permissions' : 'This project has its own permissions'}
                  desc={current.permission === 'custom' ? PERMISSION_SENTENCE.custom : `${PERMISSION_SENTENCE[current.permission]} ${RULES_ALWAYS_APPLY}`}
                >
                  <button type="button" className="set-ghost" onClick={() => setProject(current.slug, 'permission', 'workspace')}>
                    Use the workspace setting
                  </button>
                </Row>
              )}
              {twoEngines && current.codexMode !== 'workspace' && (
                <Row
                  label="This project has its own Codex permissions"
                  desc={CODEX_MODES[current.codexMode]?.what ?? ''}
                >
                  <button type="button" className="set-ghost" onClick={() => setProject(current.slug, 'codexMode', 'workspace')}>
                    Use the workspace setting
                  </button>
                </Row>
              )}
            </Group>

            {/* ONE PLACE FOR A PROJECT'S INSTRUCTIONS (w-4cbcd888ae): the
                Instructions page, pointed at this project. */}
            <Group label="Instructions">
              <Row label="Instructions for this project" desc={current.instructions.trim() ? sizeLabel(current.instructions.length) : 'None yet.'}>
                <button type="button" className="set-ghost" onClick={() => openInstructions(current.slug)}>Open</button>
              </Row>
            </Group>

            <Group label="Where this project is kept on this computer">
              <Row label="Documents" desc={current.dir} />
              <Row label="Repository" desc={current.repoPath ?? 'No code repo registered for this project.'} />
            </Group>

            {/* ARCHIVE, NOT DELETE (w-bb5047e258): one flag in its
                project.json, its folder untouched, and the Projects page lists
                it to bring back. */}
            <Group label="Archive">
              <Row
                label="Archive this project"
                desc={`It leaves your inbox, the sidebar and Projects, and no new agents start on it${current.running ? '; the ones running now finish' : ''}. Its files stay where they are, and you can bring it back from Projects.`}
              >
                <button type="button" className="set-ghost" onClick={() => write(api.archiveProject({ product: current.slug, archived: true }))}>Archive</button>
              </Row>
            </Group>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------- the computer, on the web app ------------------------ */
// Its settings as the copy it uploads has them (web-settings.ts), in the words
// of the pages above. A change is left for the computer and reads as waiting
// until it takes it. Below the screen, so tests that find a page by its first
// mention find the desktop's.
type WebComputer = { computer: SettingsRow; commands: PhoneRows['commands'] };
const WEB_MODES = MODE_ORDER.filter((m) => m !== 'custom').map((m) => ({ value: m as string, label: MODE_WORDS[m] }));
const WEB_CODEX_MODES = CODEX_MODE_ORDER.map((m) => ({ value: m as string, label: CODEX_MODES[m].label }));

/** A row with the line a change left for the computer is waiting or was refused on. */
function ReadRow({ label, desc, reading, children }: { label: string; desc?: ReactNode; reading?: Reading; children?: ReactNode }) {
  const line = reading?.waiting ? 'Waiting for your computer' : reading?.refused ? `Not changed (${reading.refused})` : null;
  return (
    <Row label={label} desc={line ? <>{desc}<span className={`set-wait${reading?.waiting ? ' on' : ''}`}>{line}</span></> : desc}>
      {children}
    </Row>
  );
}

function WebPhoneProjects({ web, onWorkspace }: { web: WebComputer; onWorkspace: (key: string, value: unknown) => void }) {
  const r = readingOf(changesOn(web.computer, web.commands), 'workspace', 'phoneProjects', null);
  const pending = r.value as { all: boolean; except: string[] } | null;
  const projects = (web.computer.settings.projects ?? []).map((p: { slug: string; name: string; onPhone: boolean }) => ({
    ...p, onPhone: pending ? pending.all && !pending.except.includes(p.slug) : !!p.onPhone,
  }));
  const macShut = { site: null, siteQr: null, all: true, projects: projects as ProjectSettings[], onChoose: (all: boolean, except: string[]) => onWorkspace('phoneProjects', { all, except }) };
  return (
    <ReadRow label="Projects on your phone" desc="A copy of their threads is kept in your account, so your phone can read and reply with this computer closed." reading={r}>
      <PhoneProjectsPicker macShut={macShut} />
    </ReadRow>
  );
}

type WebAccount = { id: string; email: string | null; name?: string | null; plan: string | null; chosen: boolean; note?: string | null; signedIn?: boolean };
type AccountAsk = { engine: string; account: string | null };
function WebAccounts({ engine, list, reading, refusedAsk, onUse }: { engine: 'claude' | 'codex'; list: WebAccount[]; reading: Reading; refusedAsk: AccountAsk | null; onUse: (id: string) => void }) {
  const asked = reading.value as AccountAsk | null;
  const mine = asked?.engine === engine ? asked : null;
  const chosen = (a: WebAccount) => (mine ? mine.account === a.id : a.chosen);
  const picked = list.some(chosen);
  const refusedHere = (a: WebAccount) => !!reading.refused && refusedAsk?.engine === engine && refusedAsk.account === a.id;
  if (!list.length) return <Row label="Not signed in" />;
  return (
    <>
      {list.map((a) => {
        const live = picked && chosen(a);
        return (
          <ReadRow key={a.id} label={a.email ?? a.name ?? 'Not signed in'} desc={a.note ?? (a.signedIn === false ? 'Finish signing in to use it' : a.plan ?? 'Signed in')} reading={(mine && live) || refusedHere(a) ? reading : undefined}>
            {live ? <span className="set-in-use">In use</span>
              : list.length > 1 && <button type="button" className="set-ghost" onClick={() => onUse(a.id)}>{picked ? 'Use this one' : 'Use only this one'}</button>}
          </ReadRow>
        );
      })}
    </>
  );
}

function WebComputerPane({ pane, web, onWorkspace, onProject, onOpenProject }: {
  pane: Pane; web: WebComputer;
  onWorkspace: (key: string, value: unknown) => void;
  onProject: (product: string, key: string, value: unknown) => void;
  onOpenProject: (slug: string) => void;
}) {
  const s = web.computer.settings;
  const w = s.workspace;
  const changes = changesOn(web.computer, web.commands);
  const read = (key: string, copy: unknown) => readingOf(changes, 'workspace', key, copy);
  const toggle = (label: string, key: string, copy: boolean, desc?: string) => {
    const r = read(key, copy);
    return <ReadRow label={label} desc={desc} reading={r}><Switch label={label} on={!!r.value} onChange={(v) => onWorkspace(key, v)} /></ReadRow>;
  };
  const two = (w.engines ?? []).length > 1;

  if (pane === 'general') {
    return (
      <Page title="General">
        <Group id="privacy" label={`What ${NAME} sends`}>
          {toggle('Counts and crash reports', 'diagnostics', w.diagnostics, `That ${NAME} was opened, that a task was opened, that a reply was sent, and a report when something breaks. Never your code, your prompts, your keys or your paths, and never a title.`)}
        </Group>
        <Group id="adhd">{toggle('ADHD mode', 'adhdMode', w.adhdMode)}</Group>
        <Group id="updates" label="Updates"><Row label={`${NAME} ${s.version}`} /></Group>
      </Page>
    );
  }
  if (pane === 'alpha') {
    return (
      <Page title="Alpha features" lede="Early features you can try before they are finished. They may change or go away.">
        <Group id="alpha">{toggle('Rooms', 'alphaRooms', !!w.alpha?.rooms, 'See the people you work with and their agents, with a chat beside them. Needs a team sign-in.')}</Group>
      </Page>
    );
  }
  if (pane === 'claude' || pane === 'codex') {
    const claude = pane === 'claude';
    const mode = read(claude ? 'permission' : 'codexMode', claude ? w.permission : (w.codexMode ?? 'auto'));
    const account = read('activeAccount', null);
    // Nothing installed is one answer, not one answer and two more under it
    // (QA batch 005, F-119).
    const groups = webSettingsGroups(w, claude ? 'claude' : 'codex');
    if (!groups.includes('accounts')) {
      return (
        <Page title={claude ? 'Claude Code' : 'Codex'}>
          <Group id="status" label="Status"><Row label={`${claude ? 'Claude Code' : 'Codex'} is not on this computer`} /></Group>
        </Page>
      );
    }
    return (
      <Page title={claude ? 'Claude Code' : 'Codex'}>
        <Group id="accounts" label="Signed in">
          <WebAccounts engine={claude ? 'claude' : 'codex'} list={(claude ? w.accounts : w.codexAccounts) ?? []} reading={account} refusedAsk={lastAccountAsk(web.commands, web.computer.device)}
            onUse={(id) => onWorkspace('activeAccount', { engine: claude ? 'claude' : 'codex', account: id })} />
        </Group>
        <Group id="permissions" label="Permissions">
          {claude && w.permission === 'custom'
            ? <Row label="Permission mode" desc={MODE_SENTENCE.custom} />
            : (
              <ReadRow label="Permission mode" reading={mode}
                desc={claude ? MODE_SENTENCE[mode.value as keyof typeof MODE_SENTENCE] : CODEX_MODES[mode.value as keyof typeof CODEX_MODES]?.what}>
                <Picker bare label="Permission mode" value={mode.value as string} options={claude ? WEB_MODES : WEB_CODEX_MODES}
                  onChange={(v) => onWorkspace(claude ? 'permission' : 'codexMode', v)} />
              </ReadRow>
            )}
        </Group>
      </Page>
    );
  }
  if (pane === 'running') {
    const auto = read('agentsAuto', w.agentsAuto);
    const count = read('sessionsAtOnce', w.sessionsAtOnce);
    const isAuto = auto.waiting ? !!auto.value : count.waiting ? false : !!auto.value;
    const gate = read('memoryGate', w.memoryGate?.on);
    const slots = read('memoryGateSlots', w.memoryGate?.slots ?? null);
    const slow = read('agentsFeltSlow', null);
    const outside = read('outsideAgents', w.outsideAgents);
    const say = (n: number) => `${n} ${n === 1 ? 'agent' : 'agents'}`;
    const options = [{ value: 'auto', label: `Automatic (${say(w.agentsTotal)})` }, ...Array.from({ length: w.slotsMax ?? 12 }, (_, i) => ({ value: String(i + 1), label: say(i + 1) }))];
    return (
      <Page title="Running">
        <Group id="agents" label="Agents">
          <ReadRow label="How many run at once" reading={auto.waiting || auto.refused ? auto : count}
            desc={isAuto ? 'From this computer’s memory, kept there as you add accounts or turn the memory check on.' : `You set this. Automatic would run ${w.agentsAutoTotal ?? w.sessionsAtOnce} on this computer.`}>
            <Picker bare label="How many run at once" value={isAuto ? 'auto' : String(count.value)} options={options}
              onChange={(v) => (v === 'auto' ? onWorkspace('agentsAuto', true) : onWorkspace('sessionsAtOnce', Number(v)))} />
          </ReadRow>
          <ReadRow label="Hold heavy work when memory is short" reading={gate}
            desc={`Tests and builds take turns, urgent first, and new agents wait to start until memory frees up.${two ? ' Claude Code and Codex both.' : ''}`}>
            <Switch label="Hold heavy work when memory is short" on={!!gate.value} onChange={(v) => onWorkspace('memoryGate', v)} />
          </ReadRow>
          {gate.value && !isAuto && (
            <ReadRow label="Heavy commands at once" reading={slots}
              desc={slots.value === null ? `Auto: ${w.memoryGate.slotsAuto} on this computer, one for every 8 GB of memory.` : `You picked ${slots.value}. Auto is ${w.memoryGate.slotsAuto} on this computer.`}>
              <Stepper label="Heavy commands at once" value={(slots.value as number | null) ?? w.memoryGate.slotsAuto} min={1} max={w.memoryGate.slotsMax ?? 8}
                onChange={(v) => onWorkspace('memoryGateSlots', v === w.memoryGate.slotsAuto ? null : v)} />
            </ReadRow>
          )}
          {toggle('Stop programs agents leave behind', 'cleanupLeftovers', !!w.leftovers?.on, `Dev servers, previews and test runs an agent started keep running until you close its task, or until memory runs short. Apps installed on this computer are never stopped.${two ? ' Codex agents’ programs are not found yet.' : ''}`)}
          <ReadRow label="Something felt slow" reading={slow}
            desc={w.agentsNudge ? `${NAME} is running ${w.agentsNudge} fewer than this computer suggests.` : `${NAME} runs one fewer from now on, and remembers that it did.`}>
            {!!w.agentsNudge && <button type="button" className="set-ghost" onClick={() => onWorkspace('agentsFeltSlow', 'reset')}>Undo</button>}
            <button type="button" className="set-ghost" onClick={() => onWorkspace('agentsFeltSlow', 'more')}>Tell it</button>
          </ReadRow>
        </Group>
        {/* Bring in new chats is not in the copy, so it is not drawn here. */}
        <Group id="outside" label="Agents you started yourself">
          <ReadRow label="Show while they run" reading={outside} desc={`Claude Code started in a terminal, not from here. ${AGENT_SENTENCE[outside.value as AgentMode] ?? ''}`}>
            <Picker bare label="Agents you started yourself" value={outside.value as string} options={AGENT_OPTIONS} onChange={(v) => onWorkspace('outsideAgents', v)} />
          </ReadRow>
        </Group>
      </Page>
    );
  }
  const projects: Array<{ slug: string; name: string; running?: number; onPhone?: boolean; autonomous: boolean; permission: string; codexMode: string; account: string }> = s.projects ?? [];
  const p = typeof pane === 'object' ? projects.find((x) => x.slug === pane.project) : undefined;
  if (p) {
    const own = (key: string, copy: unknown) => readingOf(changes, 'project', key, copy, p.slug);
    const auto = own('autonomous', p.autonomous);
    const account = own('account', p.account);
    const permission = own('permission', p.permission);
    const codex = own('codexMode', p.codexMode);
    const accounts: WebAccount[] = w.accounts ?? [];
    return (
      <Page title={p.name}>
        <Group id="how-it-runs" label="How it runs">
          <ReadRow label="Let agents start the tasks they file here" reading={auto}
            desc="A task an agent writes on this project gets a session straight away. Without this it waits in your inbox for your yes. Questions and reviews always wait for you either way.">
            <Switch label="Let agents start the tasks they file here" on={!!auto.value} onChange={(v) => onProject(p.slug, 'autonomous', v)} />
          </ReadRow>
          {(accounts.length > 1 || account.value !== 'any') && (
            <ReadRow label="Claude account" reading={account} desc="Every Claude Code agent on this project runs on this account and on no other. If the account cannot run, the work waits.">
              <Picker bare label="Claude account" value={account.value as string} options={[{ value: 'any', label: 'Any account' }, ...accounts.map((a) => ({ value: a.id, label: a.email ?? a.id }))]}
                onChange={(v) => onProject(p.slug, 'account', v)} />
            </ReadRow>
          )}
          {permission.value !== 'workspace' && (
            <ReadRow label={two ? 'This project has its own Claude Code permissions' : 'This project has its own permissions'} reading={permission}
              desc={permission.value === 'custom' ? MODE_SENTENCE.custom : `${MODE_SENTENCE[permission.value as keyof typeof MODE_SENTENCE] ?? ''} ${RULES_ALWAYS_APPLY}`}>
              <button type="button" className="set-ghost" onClick={() => onProject(p.slug, 'permission', 'workspace')}>Use the workspace setting</button>
            </ReadRow>
          )}
          {two && codex.value !== 'workspace' && (
            <ReadRow label="This project has its own Codex permissions" reading={codex} desc={CODEX_MODES[codex.value as keyof typeof CODEX_MODES]?.what ?? ''}>
              <button type="button" className="set-ghost" onClick={() => onProject(p.slug, 'codexMode', 'workspace')}>Use the workspace setting</button>
            </ReadRow>
          )}
        </Group>
      </Page>
    );
  }
  // A project the copy no longer has lands on the list.
  if (pane === 'projects' || typeof pane === 'object') {
    return (
      <Page title="Projects">
        <Group id="projects">
          {projects.length ? projects.map((x) => (
            <Row key={x.slug} label={x.name} desc={webProjectRow(x).desc}>
              <button type="button" className="set-ghost" onClick={() => onOpenProject(x.slug)}>Open</button>
            </Row>
          )) : <Row label="No projects yet." />}
        </Group>
      </Page>
    );
  }
  return null;
}
