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
import type { AgentMode, CodexModeId, PermissionMode, ProjectSettings, Settings as SettingsModel } from '../types';
import { api, RESTART_NOTE } from '../api';
import { InstructionSettings, sizeLabel } from './InstructionSettings';
import { EVERY } from '../instruction-scope';
import type {Usage, WorkspaceSettings} from '../types';
import { limitRows } from '../../../shared/usage.mjs';
import { LOOKS, lookMeans, SKINS, TUNE_DEFAULT, TUNE_LIMITS, type Look, type SkinId, type SkinTune } from '../skins';
import { readySkin } from '../look-switch';
import { MatchMark } from './MatchMark';
import { MODE_ORDER, MODE_SENTENCE, MODE_WORDS, RULES_ALWAYS_APPLY } from '../modes';
import { CODEX_MODES, CODEX_MODE_ORDER } from '../codex-modes';
import { ProductMark } from './ProductMark';
import { SHORTCUTS } from '../shortcuts';
import { capWord } from '../hint-plate';
import { NAME, Name } from '../../../shared/product-name.mjs';
import { SETTINGS_TERMINAL } from '../../../shared/settings-terminal.mjs';
import { TaskTerminal } from './TaskTerminal';
import { ProjectsPage } from './ProjectsPage';
import { searchSettings, SETTINGS_PAGES, type SettingsHit, type SettingsPageId } from '../settings-search';
import type { Product } from '../types';
import './settings.css';

/* * TEAM IS A PANE HERE (w-8415594d19, 2026-10-01). The pane's CONTENT is
 handed in as `teamPane` rather than imported, so this screen, which is shared
 with the single-person build, keeps no team code. No pane handed in, no row.
*/
type Pane = SettingsPageId | { project: string };

// A path a person can read in a narrow column: the home directory as ~, and the
// account uuid cut to the part that distinguishes it. The whole path is still
// on the General pane and in the title attribute, so nothing is hidden.
export function shortPath(full: string): string {
  const home = full.match(/^\/Users\/[^/]+/)?.[0];
  const short = home ? `~${full.slice(home.length)}` : full;
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

type CardAccount = {
  profile: string;
  email: string | null;
  plan: string | null;
  chosen: boolean;
  signedIn: boolean;
  /**
   * WHY THIS ACCOUNT CANNOT BE USED, in main's words, or null. Kept because it
   * is the one thing on an account row she can act on: a signed-out
   * subscription reads as healthy-but-resting without it. */
  trouble: string | null;
  /** The folder, needed only to print the command that signs it back in. */
  dir: string | null;
};

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
    url: w.claudeInstallUrl ?? '',
    accounts: (w.accounts ?? []).map((a): CardAccount => ({
      profile: a.profile,
      email: a.email ?? null,
      plan: a.plan?.label ?? null,
      chosen: !!a.chosen,
      signedIn: !!a.email,
      trouble: a.trouble?.note ?? null,
      dir: a.dir ?? null,
    })),
  };
}

type Agent = ReturnType<typeof agentStory>;

/**
 * THE METERS, one row each: the window's name, when it resets, and how much of
 *  it is spent. Same `usage-meter` markup the sidebar's usage corner draws. */
function UsageRows({ reading, now }: { reading: Usage | null; now: number }) {
  const rows = reading?.limits?.length ? limitRows(reading.limits, now) : [];
  if (!rows.length) return <Row label="No usage reading yet" />;
  return (
    <>
      {rows.map((r) => (
        <Row key={r.key} label={r.name} desc={r.when || undefined}>
          <span className="set-usage">
            <span className="usage-meter wide" aria-hidden="true"><i style={{ width: `${r.used}%` }} /></span>
            <span className="set-usage-pct">{r.used}% used</span>
          </span>
        </Row>
      ))}
    </>
  );
}

/**
 * THE ACCOUNTS, one row each.
 *
 *  NOTHING IS MARKED WHEN SHE HAS NOT PICKED, and then every account really
 *  does run. Marking one at random would be the page telling her something
 *  about her own machine that is not true. Once she has picked, the live one
 *  says In use beside the address, in words, and every other one offers itself.
 *
 *  A TROUBLED ACCOUNT IS NOT SOMETHING TO PICK, IT IS SOMETHING TO FIX. It says
 *  what is wrong in main's own words and carries the command that puts it
 *  right (w-3da36a45e5). */
function AccountRows({ agent, onChoose, onAdd }: {
  agent: Agent;
  onChoose: (engine: string, profile: string) => void;
  onAdd: (agent: Agent) => void;
}) {
  const accounts = agent.accounts;
  const picked = accounts.some((a) => a.chosen);
  return (
    <>
      {accounts.map((a) => {
        const live = picked ? a.chosen : false;
        const label = a.email ?? 'Not signed in';
        if (a.trouble) {
          return (
            <Row key={a.profile} label={label} desc={a.trouble}>
              {a.dir && <CopyCmd cmd={`CLAUDE_CONFIG_DIR=${a.dir} claude`} />}
            </Row>
          );
        }
        return (
          <div className={`set-row set-acct-row${live ? ' on' : ''}`} key={a.profile}>
            <div className="set-row-text">
              <div className="set-row-label">
                {label}
                {live && <span className="set-badge">In use</span>}
              </div>
              <div className="set-row-desc">{a.plan ?? (a.signedIn ? 'Signed in' : 'Finish signing in to use it')}</div>
            </div>
            {/* One account has nothing to choose between. */}
            {!live && accounts.length > 1 && (
              <div className="set-row-ctl">
                <button type="button" className="set-ghost" onClick={() => onChoose(agent.engine, a.profile)}>
                  {picked ? 'Use this one' : 'Use only this one'}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {/* BOTH AGENTS OFFER IT SINCE 2026-09-22 (w-3498e0cad2): a work login and
          a personal login, both live on one Mac. A DOOR, NOT A PITCH: the row
          says what it does and nothing about what a second one would add. */}
      <Row label="Add account">
        <button type="button" className="set-ghost" onClick={() => onAdd(agent)}>Add</button>
      </Row>
    </>
  );
}

/*
 * THE SETTINGS SHELL, which is the app's own terminal opened against the one
   reserved key that belongs to no task (shared/settings-terminal.mjs). It is
   `TaskTerminal` and not a second terminal: one xterm in this app, one set of
   keys, one scrollback rule.

   IT TYPES THE COMMAND ONCE. The line came back from main, which made the
   folder it points at, so there is nothing for her to remember, retype or get
   wrong. `sent` guards the write because React may run this twice and signing
   in twice is worse than not at all. */
function SettingsTerminal({ command }: { command?: string }) {
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
      <TaskTerminal product={SETTINGS_TERMINAL.product} id={SETTINGS_TERMINAL.id} startOpen />
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
const Group = ({ id, label, warn, children }: { id?: string; label?: string; warn?: string | null; children: React.ReactNode }) => (
  <div className="set-group" data-find={id}>
    {label && <div className="set-group-label">{label}</div>}
    <div className="set-plate">
      {warn && <div className="set-row set-row-warn" role="status">{warn}</div>}
      {children}
    </div>
  </div>
);

/** A page: its title, the sentence under it when there is one worth saying,
 *  and its groups. */
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
function KeyRow({ keys, join, what }: { keys: string[]; join?: 'or' | 'to'; what: string }) {
  return (
    <div className="set-key-row">
      <div className="set-key-caps">
        {keys.map((k, i) => (
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
  off: 'None reach your inbox. Each is still in its project’s sidebar.',
};

/* --------------------- IS CLAUDE CODE CONNECTED OR NOT -------------------- */
// MARGARETTE WENT LOOKING FOR THIS AND FOUND NOWHERE TO LOOK (2026-08-28).
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
  connectedSay: `${Name} can see it on this Mac, so your agents have something to run on. There is nothing for you to set up.`,
  missing: 'Claude Code is not on this Mac',
  // Not "your agents run on it": with Codex here they run on Codex instead.
  missingSay: `${Name} could not find Claude Code on this Mac. Install it, then check again.`,
  missingLink: 'Get Claude Code',
  unsure: `${Name} could not check`,
  unsureSay: `${Name} has not been able to look for Claude Code on this Mac. That is not the same as it being missing, only that the answer never came back. Try again in a moment.`,
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
} as const;

/* ------------------ AND THE SAME QUESTION ABOUT THE SECOND ---------------- */
// (a tester, 2026-09-05), asked after he ran the app with Codex
// selected and found that Settings said nothing about Codex at all.
//
// WHEN IT IS DRAWN, WHICH IS THE JUDGEMENT AND NOT A SYMMETRY. Codex is
// OPTIONAL, so an always-present Codex page is furniture for everybody who
// never uses it. It is drawn when this Mac has ASKED for Codex, and the asking
// is the opt-in moment in zero.config.json somebody writes by hand. `w.codex`
// on the settings payload is the whole rule, answered by
// `Supervisor#engineChoiceOpened` in the one file allowed to read the opt-in,
// so the screen and the routing cannot come apart. Absent means silence.
//
// THE WORDS ARE THE ONES ABOVE, WITH CODEX AS THE SUBJECT. One difference, and
// it is the sentence that would otherwise be false: being connected does not
// mean her agents have something to run on -- Claude Code is that -- it means
// she can put a task on Codex instead.
const CODEX = {
  name: 'Codex',
  connected: 'Codex is connected',
  connectedSay: `${Name} can see it on this Mac, so you can put a task on Codex instead of Claude Code. There is nothing for you to set up.`,
  missing: 'Codex is not on this Mac',
  missingSay: `${Name} could not find Codex on this Mac, so every task runs on Claude Code. Install it, then check again.`,
  missingLink: 'Get Codex',
  unsure: `${Name} could not check`,
  unsureSay: `${Name} has not been able to look for Codex on this Mac. That is not the same as it being missing, only that the answer never came back. Try again in a moment.`,
  check: 'Check again',
  checking: 'Looking',
  getSay: 'It takes a few minutes. Come back here and press Check again, and Codex is a choice on every task.',
  still: 'Still nothing here. A fresh install can take a moment to appear.',
  stillUnsure: `${Name} still could not get an answer. Nothing is necessarily wrong; try once more in a minute.`,
  where: (bin: string) => `${Name} runs it from ${bin}.`,
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

/*
 * ONE COMPONENT, TWO CODING AGENTS. The copy tables above are the whole of the
   difference between them, and they are tables rather than a second component
   for the reason the walk and this screen share one vocabulary: two drawings of
   the same three states drift within a week, and the state that drifts is
   always the unsure one, because it is the one nobody is looking at. */
function Connection({ copy, check, found, certain, bin, url, trouble = null, account = null, onChecked }: {
  copy: ConnectionCopy;
  /**
   * The search this card's button runs. It is the engine's own, because
   *  looking for Claude Code tells you nothing about Codex. */
  check: () => Promise<{ found: boolean }>;
  found: boolean; certain: boolean; bin: string; url: string;
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

  const label = found ? copy.connected : certain ? copy.missing : copy.unsure;
  /* * THE TROUBLE REPLACES THE LINE IT CONTRADICTS, rather than sitting under it. It
     is only ever read when the engine was FOUND, because a trouble about an engine that is
     not here has nothing to add to "it is not here".
  */
  const say = trouble && found ? trouble
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
        <span className={`set-dot ${found ? 'live' : ''}`} />
        <span className="set-mono">{found ? 'connected' : certain ? 'not found' : 'not sure'}</span>
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
          that is for somebody who already knows what it means. */}
      {found && bin && <Row label="Runs from" desc={copy.where(bin)} />}
    </Group>
  );
}

/*
 * EACH ENGINE'S OWN WORDS AND ITS OWN SEARCH, BOUND ONCE. The call sites then
   say which engine they are about and nothing else, and neither pair can be
   handed to the other page by accident. */
type EngineConnection = Omit<React.ComponentProps<typeof Connection>, 'copy' | 'check'>;

const ClaudeCode = (props: EngineConnection) => (
  <Connection copy={CLAUDE} check={api.recheckClaude} {...props} />
);

const CodexCli = (props: EngineConnection) => (
  <Connection copy={CODEX} check={api.recheckCodex} {...props} />
);

/* THE UPDATES GROUP IS GONE (w-5737fe67cf, 2026-09-23). The app still keeps
   itself current on its own (main/updater.mjs), and a version that is waiting
   still reaches the user as a row in the inbox (../update-row.ts). */

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
    claude: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="m7.5 10 2.5 2-2.5 2M12.5 14.5h4" /></>,
    codex: <><path d="m9 8-4 4 4 4M15 8l4 4-4 4" /></>,
    running: <><circle cx="12" cy="12" r="8" /><path d="M10.5 9.2v5.6l4.5-2.8z" /></>,
    instructions: <path d="M6.5 3.5h7.5l4 4V20.5h-11.5zM14 3.5V8h4M9.5 12h5M9.5 16h5" />,
    projects: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
    team: <><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M16 14.6c2.3-.2 4 1.2 4.5 4" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[id]}
    </svg>
  );
}

/** The page an old link or a ⌘K row names, read the way it always was: every
 *  name the screen has ever used still opens the page its content went to. */
function paneFrom(want: string, has: { team: boolean; codex: boolean }): Pane {
  if (want.startsWith('project:')) return { project: want.slice('project:'.length) };
  if (want === 'themes') return 'appearance';
  if (want === 'priority') return 'projects';
  // The accounts were a page, then a group on Agents, then on General; they
  // are on each agent's own page now.
  if (want === 'accounts') return 'claude';
  if (want === 'agents') return 'running';
  if (want === 'team') return has.team ? 'team' : 'general';
  if (want === 'codex') return has.codex ? 'codex' : 'claude';
  if (SETTINGS_PAGES.some((p) => p.id === want)) return want as SettingsPageId;
  return 'general';
}

/* --------------------------------- screen --------------------------------- */

export function Settings({ look, onSetLook, tune, onSetTune, onResetTune, keyHints, onSetKeyHints, startPane, usageReadings = [], now = Date.now(), embedded = false, onSectionChange, onNewProject, ranked = [], onSetOrder, teamPane, account, onClose }: {
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
  // The new project card, from the Projects page.
  onNewProject?: () => void;
  // The running order, for the Projects page: every project already in order
  // (App's `rankedProducts`), and the write.
  ranked?: Product[];
  onSetOrder?: (slugs: string[]) => void | Promise<void>;
  /** Team management, handed in by whoever has the team's state. Absent on a
   *  build with no team cloud, and then there is no Team row either. */
  teamPane?: ReactNode;
  /** Who is signed in, for the Account group on General. Absent when nobody
   *  is, and then there is no group. */
  account?: { email: string; team?: string | null; onSignOut: () => void };
  onClose: () => void;
}) {
  const [model, setModel] = useState<SettingsModel | null>(null);
  // ?settings=claude, or ?settings=project:kestrel. Anything else (including the
  // bare ?settings=1 that only means "open") lands on General. `startPane` is
  // the same question asked from inside the app, and it wins.
  const [pane, setPane] = useState<Pane>(() => paneFrom(
    startPane || new URLSearchParams(location.search).get('settings') || '',
    // Codex is only known once the settings are read; a link to it lands on
    // its page and falls back below if this Mac turns out not to have it.
    { team: !!teamPane, codex: true },
  ));
  // WHICH PAGE IS UP, for the window around this screen.
  useEffect(() => {
    onSectionChange?.(typeof pane === 'object' ? 'projects' : pane === 'general' ? null : pane);
  }, [pane]);

  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await api.settings();
    setModel(s);
    if (!s.ok) setError(s.error ?? 'could not read settings');
  }, []);

  useEffect(() => { void load(); }, [load]);

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
  useEffect(() => {
    if (typeof pane !== 'string' && model && !current) setPane('projects');
  }, [pane, model, current]);

  const w = model?.workspace;
  // A link to Codex on a Mac that has not opened the gate lands on Claude Code.
  useEffect(() => {
    if (pane === 'codex' && w && !w.codex) setPane('claude');
  }, [pane, w]);

  /*
   * WHETHER THIS MAC REALLY HAS TWO CODING AGENTS, and it is main's answer
     rather than a guess from the presence of a binary: `engineChoices` asks the
     capability gate first. IT IS THE ONLY THING ON THIS SCREEN THAT MAY MAKE A
     SENTENCE LONGER: every word Codex costs is behind this and appears on no
     other Mac. */
  const engineRows = w?.engineChoices ?? [];
  const twoEngines = engineRows.length > 1;

  /** The pages this Mac has. Codex only once the opt-in is written; Team only
   *  on a build with a team cloud. */
  const pages = SETTINGS_PAGES.filter((p) => (p.id !== 'codex' || !!w?.codex) && (p.id !== 'team' || !!teamPane));
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
    const status = { found: agent.found, certain: agent.certain, bin: agent.bin, url: agent.url, trouble: agent.trouble, onChecked: load };
    return (
      <Page title={agent.name}>
        {/* THE STATE SPEAKS ONLY WHEN IT IS BAD. */}
        {(!agent.found || agent.trouble) && (engine === 'codex' ? <CodexCli {...status} /> : <ClaudeCode {...status} />)}
        {agent.found && (
          <>
            <Group id="usage" label="Usage">
              <UsageRows reading={agent.reading} now={now} />
            </Group>
            {/* "SIGNED IN", NOT "ACCOUNTS": a heading that works at any
                number, so one account is never shown a plural to fill. */}
            <Group
              id="accounts"
              label="Signed in"
              /* TWO FOLDERS, ONE SUBSCRIPTION, SAID ABOVE THE ROWS
                 (w-f2a5c9894e). Main's sentence, about the pair. */
              warn={engine === 'claude' ? w.accountsNote : null}
            >
              <AccountRows
                agent={agent}
                onChoose={(e, profile) => write(api.setWorkspaceSetting({ key: 'activeAccount', value: { engine: e, profile } }))}
                onAdd={async (a) => {
                  const r = a.engine === 'codex' ? await api.addCodexAccount() : await api.addClaudeAccount();
                  setAdding(r.ok ? { engine: a.engine, name: a.name, command: r.command } : { engine: a.engine, name: a.name, error: r.error });
                  // The row for the new login appears immediately, reading
                  // "Not signed in", so an abandoned sign in leaves something
                  // she can see rather than a folder nothing mentions.
                  await load();
                }}
              />
            </Group>
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
                {!adding.error && <SettingsTerminal command={adding.command} />}
              </div>
            )}
            {engine === 'codex' ? (
              <Group id="permissions" label="Permissions">
                {/* AND NOT `RULES_ALWAYS_APPLY` UNDER THIS ONE. That caveat is
                    about Claude Code's allow and deny rules sitting on top of a
                    mode. Codex has no such list. */}
                <Row label="Permission mode" desc={CODEX_MODES[w.codexMode]?.what}>
                  <Picker
                    bare
                    label="Permission mode"
                    title="The starting point for every Codex agent. A project can be set to its own."
                    value={w.codexMode}
                    options={CODEX_MODE_OPTIONS}
                    onChange={(v) => setWorkspace('codexMode', v)}
                  />
                </Row>
              </Group>
            ) : (
              <Group id="permissions" label="Permissions">
                {w.permission === 'custom' ? (
                  <Row label="Permission mode" desc={PERMISSION_SENTENCE.custom} />
                ) : (
                  <Row label="Permission mode" desc={PERMISSION_SENTENCE[w.permission]}>
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
            window, so the button opts out of it or it cannot be clicked. */}
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
          ) : (['Personal', 'Agents', 'Workspace'] as const).map((group) => (
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
        {pane === 'team' && teamPane && (
          <Page title="Team" lede="Who is on your team, who has been invited, and the team's name. Everyone sees a short summary of your threads unless you mark one private.">
            {teamPane}
          </Page>
        )}

        {model && pane === 'projects' && (
          <div className="set-inner">
            <ProjectsPage
              ranked={ranked}
              details={projects}
              onSetOrder={onSetOrder}
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
            <Group id="storage" label={`Where ${NAME} keeps things on this Mac`}>
              <Row label="Your projects, tasks and documents" desc={w.storePath} />
            </Group>
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
            <Group id="at-once" label="Agents">
              {/* PAUSING IS A COMMAND, NOT A SETTING (w-12081d32cc): Pause
                  agents and Unpause agents are on ⌘K. */}
              <Row
                label="Agents at once"
                /* * WHY THE NUMBER IS WHAT IT IS, when Agentbox chose it rather
                   than the person (w-7d5cb36913). A smaller plan gets one at a
                   time instead of three. AND IT NAMES THE ENGINE ONLY WHERE THERE
                   ARE TWO: the plan is a fact about her ANTHROPIC subscription,
                   and the number it sets caps Claude Code alone
                   (main/supervisor.mjs, `_slotsPerAccount`).
                */
                desc={`${w.sessionsAtOnceFromPlan ? `Your plan is ${w.sessionsAtOnceFromPlan}, so ${NAME} starts one ${twoEngines ? 'Claude Code agent ' : ''}at a time. Put it up whenever you like. ` : ''}${w.accounts.length > 1
                  ? `Per account. With ${w.accounts.length} connected, up to ${w.sessionsAtOnce * w.accounts.length} run together. The rest wait in line.`
                  : w.sessionsAtOnce > 1
                    ? `Up to ${w.sessionsAtOnce} run together. The rest wait in line.`
                    /*
                     * The plan sentence above has already said one at a time,
                       so saying it again is the stutter this read as when it
                       was photographed on a Pro payload. */
                    : w.sessionsAtOnceFromPlan
                      ? 'The rest wait in line.'
                      : 'One runs at a time. The rest wait in line.'}${w.machineNote ? ` ${w.machineNote}` : ''}${w.running ? ` ${w.running} running now.` : ''}`}
              >
                {/* THE STEPPER'S RANGE IS THE SAME ON EVERY MAC (w-3d634cbc44).
                    The hardware reading is in the sentence above, where it
                    suggests, and the control goes where it always went. */}
                <Stepper label="Agents at once" value={w.sessionsAtOnce} min={1} max={w.slotsMax ?? 12} onChange={(v) => setWorkspace('sessionsAtOnce', v)} />
              </Row>
            </Group>
            {/* HOLD HEAVY WORK WHEN MEMORY IS SHORT (w-3958c3753d). An agent
                waiting on the model costs a few hundred MB; one running tests
                or a build costs a gigabyte or more, so the number that runs
                out is heavy commands, not agents. Off out of the box. */}
            {w.memoryGate && (
              <Group id="memory" label="Memory">
                <Row
                  label="Hold heavy work when memory is short"
                  /* Codex workers do not carry the check yet. Said only where
                     Codex can be chosen at all. */
                  /* AND IT CLEARS UP AFTER THEM (2026-10-05). A night of agents
                     left 7.7 GB running after every agent had finished, and the
                     Mac ran out of memory; main/leftovers.mjs has the numbers. */
                  desc={`Tests and builds run a few at a time, urgent first, and what finished agents left running is stopped.${twoEngines ? ' Claude Code only for now.' : ''}${w.memoryGate.on && w.memoryGate.now ? ` ${w.memoryGate.now}` : ''}`}
                >
                  <Switch label="Hold heavy work when memory is short" on={w.memoryGate.on} onChange={(v) => setWorkspace('memoryGate', v)} />
                </Row>
                {w.memoryGate.on && (
                  <Row
                    label="Heavy commands at once"
                    desc={w.memoryGate.slots === null
                      ? `Auto: ${w.memoryGate.slotsAuto} on this Mac, one for every 8 GB of memory.`
                      : `You picked ${w.memoryGate.slots}. Auto is ${w.memoryGate.slotsAuto} on this Mac.`}
                  >
                    {/* Stepping back onto Auto's own number IS Auto, so there is
                        always a way back without a second control. */}
                    <Stepper
                      label="Heavy commands at once"
                      value={w.memoryGate.slots ?? w.memoryGate.slotsAuto}
                      min={1}
                      max={w.memoryGate.slotsMax}
                      onChange={(v) => setWorkspace('memoryGateSlots', v === w.memoryGate?.slotsAuto ? null : v)}
                    />
                  </Row>
                )}
              </Group>
            )}
            {/* THE USER'S OWN CLAUDE CODE, the sessions Agentbox did not start.
                They are rows in the Inbox and in no other list since
                2026-08-17; this is the only place that decides how many of
                them get there. */}
            <Group id="outside" label="Agents you started yourself">
              <Row
                label="Show in your inbox"
                desc={`Claude Code started in a terminal, not from here. ${AGENT_SENTENCE[w.outsideAgents]}`}
              >
                <Picker bare label="Agents you started yourself" value={w.outsideAgents} options={AGENT_OPTIONS} onChange={(v) => setWorkspace('outsideAgents', v)} />
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

            <Group label="Where this project is kept on this Mac">
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
