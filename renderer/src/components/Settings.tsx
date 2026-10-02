// Settings: the workspace, and every project's own.
//
// It is a SCREEN, not a dialog, and it opens from the cog in the corner or from
// ⌘K.
//
// So the nav lists the projects and every project's settings live on its own
// page.
//
// The shape is the ordinary one — a nav column, one pane, rows that are a
// label, a sentence and a control on the right edge — because the four settings
// this screen exists to surface were previously arrays of slugs in a JSON file,
// and the whole point is that nothing here has to be learned.
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
import { ago } from '../format';
import { LOOKS, lookMeans, SKINS, TUNE_DEFAULT, TUNE_LIMITS, type Look, type SkinId, type SkinTune } from '../skins';
import { readySkin } from '../look-switch';
import { MatchMark } from './MatchMark';
import { MODE_ORDER, MODE_SENTENCE, MODE_WORDS, RULES_ALWAYS_APPLY } from '../modes';
import { CODEX_MODES, CODEX_MODE_ORDER } from '../codex-modes';
import { ProductMark } from './ProductMark';
import { SHORTCUTS } from '../shortcuts';
import { NAME, Name } from '../../../shared/product-name.mjs';
import { SETTINGS_TERMINAL } from '../../../shared/settings-terminal.mjs';
import { TaskTerminal } from './TaskTerminal';
import { ProjectsPage } from './ProjectsPage';
import type { Product } from '../types';

/* * THERE IS NO ACCOUNTS PANE ANY MORE. It is a group on the Agents page now, next to the
 number of agents whose ceiling that subscription sets. `?settings=accounts` still opens
 Agents rather than dead-ending on General.
*/
// 'agents' is gone from this union with the pane itself; the name is still
// accepted at the door above and resolves to 'general'.
/* * TEAM IS A PANE HERE NOW (w-8415594d19, 2026-10-01). Team management
 belongs in Settings. The sidebar used to carry a Team members page of its own
 beside Invite people, which was the same door twice.
 The pane's CONTENT is handed in as `teamPane` rather than imported, so this
 screen, which is shared with the single-person build, keeps no team code and
 the two codebases stay easy to compare. No pane handed in, no row.
*/
type Pane = 'instructions' | 'general' | 'appearance' | 'shortcuts' | 'projects' | 'team' | { project: string };

const paneKey = (p: Pane) => (typeof p === 'string' ? p : `project:${p.project}`);

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
    <div className="set-step" aria-label={label}>
      <button type="button" aria-label={`${label}, fewer`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="val">{value}</span>
      <button type="button" aria-label={`${label}, more`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

function Segbar<T extends string>({ value, options, onChange }: {
  value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void;
}) {
  return (
    <div className="set-seg">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A ONE-LINE PICKER: the value you are on, and the list behind it.
 *
 *  WHY THIS EXISTS BESIDE `Segbar` RATHER THAN REPLACING IT. Claude Code has six
 *  permission modes and Codex has three. Six chips laid out side by side do not
 *  fit in half a card, and the result showed it: the control wrapped onto
 *  two lines on one engine and not the other, so the two cards read as different
 *  designs. A menu is the same choice in a fixed width.
 *
 *  THE CHEVRON IS DRAWN, NOT TYPED. The first version used the character
 *  U+25BC, which is a solid triangle sized by the font, far heavier than
 *  anything else on the screen, and the icon was the thing that looked
 *  unpolished. This is a 9px stroked path at the same optical weight as the
 *  text beside it.
 *
 *  ITS FACE IS `--film-strong` AND NOT `--control-face`, which is the one thing
 *  in here that is a rule about the whole app rather than about this control.
 *  Measured on 2026-09-23: under Frost Haze `--control-face` resolves to
 *  `rgba(255,255,255,.453)`, a white film, and over a pale photograph that reads
 *  as a white slab. The rule: light mode components never use a plain
 *  white background. `--film-strong` is `rgba(17,25,48,.075)` on a light theme
 *  and `rgba(255,255,255,.1)` on a dark one, so it is a TINT OF THE THEME in
 *  both directions and can never be white.
 */
function Picker<T extends string>({ label, value, options, onChange, title }: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  title?: string;
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
    <div className={`set-picker${open ? ' open' : ''}`}>
      <div className="set-picker-label">{label}</div>
      <span className="set-picker-wrap" ref={wrap}>
        <button
          type="button"
          className="set-picker-now"
          title={title}
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
// no true/false answer: blur and darkness are matters of degree. The track and the thumb are drawn off the same tokens as the switch above
// them rather than left to the platform, which draws a blue capsule that
// belongs to macOS and to nothing else here.
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
  // above the sentence. The Accounts rows use it to name the account they are
  // actually signed in as.
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
 printed on the account rows and `user-select: none` on the body meant selecting it did
 nothing, so the only way to run it was to retype it by hand off the screen. The stylesheet
 opts this whole pane back in; this button is for the one string that is a command rather
 than prose, because selecting a phrase out of the middle of a sentence is still work.

   Same 1200ms flash Focus and DocText already use, so a copy confirms the same
   way everywhere in the app.
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

/*
 * `warn` sits ABOVE the rows rather than under one of them, because the only
   thing that uses it is true of the list as a whole and of neither row on its
   own: two folders that turn out to hold one subscription. It kept that
   position when the account list moved off its own page and into a group on
   Agents (w-7d5cb36913). */

/* * ==========================================================================
   ONE CARD PER CODING AGENT (w-c2904cc8d9).

   Five rounds of drawings got here. What the page did
   before: Claude Code was described in THREE places that never touched -- the
   Usage block at the top, a connection card, an accounts group -- and Codex in
   two more, with the app's own business dropped in between. So the question
   anybody opens this page with, which account am I on and how much is left, was
   answered in pieces.

   Now one card holds one agent's whole story, in the order a person asks it: how much
   is left, then which account, then whether it is here at all (which says
   nothing while the answer is yes).

 THE CONTROLS ARE MADE OF GLASS AND NOTHING ELSE. The old buttons fill themselves with
 `--surface`, which on every haze skin is the opaque `#2e3136`, over a card that is
 `rgba(255,255,255,0.065)`: an opaque rectangle on a sheet of glass over a photograph.
 Nothing here uses `.set-ghost` or `.set-seg`. A control is a film of white and a hairline,
 and it gets BRIGHTER to say live, never darker, because darker is a hole in the picture.

   AND NO DRAWN ICONS. Every mark is type or a rule. A tick I drew in an earlier
   round was one more shape to learn.

 Any one of those alone was missable, and was missed.
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

/**
 * THE METERS, KEPT AS THEY WERE.Same markup and the same class the Usage
 * panel has always used. */
function CardMeters({ reading, now }: { reading: Usage | null; now: number }) {
  const rows = reading?.limits?.length ? limitRows(reading.limits, now) : [];
  if (!rows.length) return <p className="ac-none">No usage reading yet</p>;
  return (
    <>
      {rows.map((r) => (
        <div className="settings-usage-window" key={r.key}>
          <div><span>{r.name}</span><span>{r.used}% used</span></div>
          <span className="usage-meter wide" aria-hidden="true"><i style={{ width: `${r.used}%` }} /></span>
          {r.when && <p>{r.when}</p>}
        </div>
      ))}
    </>
  );
}

function AgentCard({ agent, now, onChoose, onAdd, onChecked, settings }: {
  agent: ReturnType<typeof agentStory>;
  now: number;
  onChoose: (engine: string, profile: string) => void;
  onAdd: (agent: ReturnType<typeof agentStory>) => void;
  /**
   * Re-read the whole settings model, the way every other write on this screen
   *  does: the page never draws what a press assumed. */
  onChecked: () => Promise<void> | void;
  /**
   * THIS ENGINE'S OWN SETTINGS, drawn at the foot of its own card (2026-09-23).
   *
   *  The Codex and Claude Code settings belong in the Codex and Claude Code
   *  cards. Before this they were groups further down the page, and
   *  the Model row was one control that changed meaning depending on which
   *  engine was selected above it -- which is the defect a tester filed on
   *  2026-09-05 (with Codex selected, the row below still listed Claude
   *  models) and which three rounds of scoped sentences never really
   *  fixed. A setting inside the card cannot be about the other engine.
   *
   *  It is a slot rather than something this component builds, because the
   *  controls need `setWorkspace`, the model lists and the mode lists, all of
   *  which live in the pane. The card owns WHERE it goes, the pane owns WHAT it
   *  is. */
  settings?: React.ReactNode;
}) {
  const [checking, setChecking] = useState(false);
  // Whether the LAST press came back with nothing. Null until she has pressed,
  // because "still nothing" said to somebody who has not pressed is a screen
  // answering a question nobody asked.
  const [checked, setChecked] = useState<boolean | null>(null);
  const look = async () => {
    setChecking(true);
    try {
      const r = await (agent.engine === 'codex' ? api.recheckCodex() : api.recheckClaude());
      setChecked(r.found);
      await onChecked();
    } finally {
      setChecking(false);
    }
  };
  const accounts = agent.accounts;
  // NOTHING IS MARKED WHEN SHE HAS NOT PICKED, and then every account really
  // does run. Marking one at random would be the card telling her something
  // about her own machine that is not true.
  const picked = accounts.some((a) => a.chosen);

  return (
    <section className="ac-card" aria-label={agent.name}>
      <div className="ac-top">
        <span className="ac-name">{agent.name}</span>
        {/* THE STATE SPEAKS ONLY WHEN IT IS BAD. "Connected" on a healthy Mac is
            a word she has read a thousand times; the one worth interrupting for
            is the other one. */}
        {!agent.found && <span className="ac-warn">{agent.certain ? 'not on this Mac' : 'cannot tell'}</span>}
      </div>
      {/* WHY NOTHING RUNS ON IT DESPITE IT BEING HERE. Main's sentence, never
          one derived on this side: being found is not being usable, and a
          lapsed subscription leaves the binary exactly where it was. */}
      {agent.found && agent.trouble && <p className="ac-trouble">{agent.trouble}</p>}

      {/* TWO COLUMNS, SPLIT BY SUBJECT (2026-09-23, chosen after four rounds).
          LEFT is what this engine has spent and nothing else. RIGHT is
          everything else, stacked in this order: the accounts, then
          the model, then what it may do.

          The rule between them is the only divider in the card, because there is
          only one boundary that matters. The settings used to sit in a band
          under the accounts; giving them a column of their own is also what
          stops a six-option control wrapping, which is the defect that made the
          two cards read as different designs.

          KNOWN AND ACCEPTED: the left column runs out before the right one does,
          so there is space under the meters, most of it on Codex, which reports
          two windows where Claude Code reports three. Filling it would mean
          moving something back to the left, which is what this change took off
          it. */}
      <div className="ac-split">
        <div className="ac-usage"><CardMeters reading={agent.reading} now={now} /></div>
        <div className="ac-rest">

      {agent.found && (
        <div className="ac-list">
          {accounts.map((a) => {
            const live = picked ? a.chosen : false;
            const label = a.email ?? 'Not signed in';
            /*
             * A TROUBLED ACCOUNT IS NOT SOMETHING TO PICK, IT IS SOMETHING TO
               FIX. So it is not the clickable row: it says what is wrong in
               main's own words and carries the command that puts it right,
               which is the only thing she can do about it from here
               (w-3da36a45e5). It is also why this cannot be a <button>: the
               copy control inside it is one. */
            if (a.trouble) {
              return (
                <div className="ac-item ac-item-bad" key={a.profile}>
                  <div className="ac-bad-text">
                    <span className="ac-item-mail">{label}</span>
                    <span className="ac-bad-note">{a.trouble}</span>
                  </div>
                  {a.dir && <CopyCmd cmd={`CLAUDE_CONFIG_DIR=${a.dir} claude`} />}
                </div>
              );
            }
            return (
              <button
                key={a.profile}
                type="button"
                className={`ac-item ${live ? 'on' : ''}`}
                aria-pressed={live}
                onClick={() => onChoose(agent.engine, a.profile)}
              >
                <span className="ac-item-mail">{label}</span>
                {/* THE WORD SITS BESIDE THE ADDRESS, not out on the right margin
                    where it was missed. */}
                {live && <span className="ac-badge">In use</span>}
                <span className="ac-item-end">{a.plan ?? (a.signedIn ? '' : 'sign in')}</span>
              </button>
            );
          })}
          {!picked && accounts.length > 1 && (
            <p className="ac-hint">Work runs on all of these. Pick one to use it on its own.</p>
          )}
          {/* BOTH CARDS OFFER IT SINCE 2026-09-22 (w-3498e0cad2). Adding was a Codex
             row only, because a commercial product should not encourage multi
             accounting on Anthropic's side. That reason no longer applies now
             the app is not sold, so multiple accounts are allowed on both. The
             use case is a work login and a personal login, both live on one
             Mac. */}
          <button type="button" className="ac-item ac-item-add" onClick={() => onAdd(agent)}>
            <span className="ac-item-mail">Add account</span>
            <span className="ac-item-end">+</span>
          </button>
        </div>
      )}

      {/* WHEN IT IS NOT HERE, the card stops being about accounts and becomes
          the two things that can be done about it: get it, and look again. The
          second one matters because the first one happens in another window,
          and without it the only way to make this page notice an install is to
          restart the app. It is the engine's OWN search: looking for Claude
          Code tells you nothing about Codex. */}
      {!agent.found && (
        <div className="ac-list">
          {agent.certain && (
            <a className="ac-item ac-item-add" href={agent.url} target="_blank" rel="noreferrer">
              <span className="ac-item-mail">Get {agent.name}</span>
              <span className="ac-item-end">&#8599;</span>
            </a>
          )}
          <button type="button" className="ac-item ac-item-add" disabled={checking} onClick={look}>
            <span className="ac-item-mail">{checking ? 'Looking…' : 'Check again'}</span>
            <span className="ac-item-end">{checked === false ? 'still nothing' : ''}</span>
          </button>
        </div>
      )}

      {/* AND ONLY ON AN ENGINE THAT IS ACTUALLY HERE. Settings for software this
          Mac does not have are settings that cannot take effect, under a card
          already saying it is not installed. */}
      {agent.found && settings && <div className="ac-settings">{settings}</div>}
        </div>
      </div>
    </section>
  );
}

/*
 * THE SETTINGS SHELL, which is the app's own terminal opened against the one
   reserved key that belongs to no task (shared/settings-terminal.mjs). It is
   `TaskTerminal` and not a second terminal: one xterm in this app, one set of
   keys, one scrollback rule.

   IT TYPES THE COMMAND ONCE. The line came back from main, which made the
   folder it points at, so there is nothing for her to remember, retype or get
   wrong -- which is exactly what went wrong when this was a command printed on
   a card (w-c2904cc8d9). `sent` guards the write because React may run this
   twice and signing in twice is worse than not at all. */
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

const Group = ({ label, note, warn, children }: { label?: string; note?: string; warn?: string | null; children: React.ReactNode }) => (
  <div className="set-group">
    {label && <div className="set-group-label">{label}</div>}
    {warn && <p className="set-warn set-group-warn">{warn}</p>}
    <div className="set-plate">{children}</div>
    {note && <div className="set-group-note">{note}</div>}
  </div>
);

/* ------------------------------- a shortcut ------------------------------- */
// ONE KEY, DRAWN THE WAY THE APP ALREADY DRAWS KEYS. The cap is the row hint's
// cap and the walk's cap (`.row-keys kbd`, `.fr-tether kbd`) rather than a
// third picture of a key: a page whose whole job is to teach the app's keys
// must not be the one place they look different.
//
// THE CAPS ARE ON THE LEFT AND THE SENTENCE IS BESIDE THEM, which is the one
// place this pane departs from every other row on this screen (label left,
// control right). It is a REFERENCE, read by scanning down a column for the
// key you half-remember, and a key hiding at the right-hand end of a sentence
// cannot be scanned for. The column is a fixed width so every sentence starts
// on the same line, which is the whole of what makes a list of eighteen calm
// instead of ragged.
function KeyRow({ keys, join, what }: { keys: string[]; join?: 'or' | 'to'; what: string }) {
  return (
    <div className="set-key-row">
      <div className="set-key-caps">
        {keys.map((k, i) => (
          <Fragment key={k}>
            {i > 0 && join && <span className="set-key-join">{join}</span>}
            <kbd>{k}</kbd>
          </Fragment>
        ))}
      </div>
      <div className="set-key-say">{what}</div>
    </div>
  );
}

/* ------------------------------ permissions ------------------------------- */
// CLAUDE CODE'S SIX MODES, NOT SHAPES OF OURS. This block used to describe
// "three named shapes over the CLI flags, and an honest fourth", ordered by how
// much could go wrong, reached through a backslash menu. Every clause of that
// is now false: there are six, they are Anthropic's, the order is their table's
// and the menu opens on a slash. The words themselves live in ../modes.ts so
// this screen, the walk and the reply box cannot drift apart.
const PERMISSION_WORDS = MODE_WORDS;
const PERMISSION_SENTENCE = MODE_SENTENCE;

// MODE_ORDER is Anthropic's own row order, and deliberately not a risk ranking
// of ours. A person who has read their page finds our list in the shape they
// already saw; modes.ts says why at more length.
const PERMISSION_OPTIONS: Array<{ value: PermissionMode; label: string }> = MODE_ORDER.map(
  (value) => ({ value, label: MODE_WORDS[value] }),
);

// CODEX'S THREE, in the order shared/codex-modes.mjs keeps them, which is
// least to most an agent may do. That file is the only place the list lives, so
// a mode added or renamed there reaches both pickers without a second edit.
const CODEX_MODE_OPTIONS: Array<{ value: CodexModeId; label: string }> = CODEX_MODE_ORDER.map(
  (value) => ({ value, label: CODEX_MODES[value].label }),
);

/* -------------------- the model is not asked here ------------------------- */
// The lists and the picker that used to stand here are gone (w-12081d32cc).
// Both engine cards carried a Model row; the new task card asks the same
// question where the task is written, keeps the answer between cards, and is
// the only place it is asked now. The `--model` flag in zero.config.json is
// still read as a fallback and is still writable by hand, so nothing
// underneath this screen changed.

/* ------------------- her own agents, and how loud they are ---------------- */
// Three positions, not a switch, because the middle one is the interesting one
// and a switch cannot hold it: a machine that has been swept once wants only
// the sessions that are actually stopped on a question.
const AGENT_OPTIONS: Array<{ value: AgentMode; label: string }> = [
  { value: 'all', label: 'All of them' },
  { value: 'waiting', label: 'Only the stuck ones' },
  { value: 'off', label: 'None' },
];

const AGENT_SENTENCE: Record<AgentMode, string> = {
  all: 'Every one of them is a row in your inbox you can read and close. Closing one only takes it out of the inbox.',
  waiting: 'Only the ones that have stopped and are waiting for you to type. The rest run without interrupting you.',
  off: 'None of them reach your inbox. One running in a project’s folder is still in that project’s sidebar, so you can open it from there.',
};

/* ------------------ the two files every agent starts with ----------------- */
// So Your rules and How agents write to you no longer have an Edit button that
// opens a card over this screen. The text is on the page, in a box, saving as
// she types, which is exactly what a project's own instructions box (below)
// has always done. Three boxes on this screen, one shape, one mechanism.
//
// The card itself still exists and is still the way in from ⌘K, which is where
// she opens her rules from when she is not in Settings. What came off is the
// button here, not the feature.
//
// It saves as she types for the same reason that box does: the alternative is
// a rule she believes she has set sitting unsaved behind an Apply button while
// the fleet works without it.
/* --------------------- IS CLAUDE CODE CONNECTED OR NOT -------------------- */
// MARGARETTE WENT LOOKING FOR THIS AND FOUND NOWHERE TO LOOK (2026-08-28). The
// first thing she did once she was through the walk:
//
// The app has always known the answer. It was drawn as a row called "Claude
// Code" inside the group headed "Where Agentbox keeps things on this Mac", whose
// whole sentence was a filesystem path and whose whole verdict was the word
// "found" beside a dot. Three things were wrong with that and all three are
// why she could not see it: it was filed under a heading about FOLDERS, so
// nobody scanning for a connection reads that far; "found" is a word about a
// search, not about her; and there was no way to ask again without leaving the
// screen and coming back. So the row moves up into a group of its own, says
// whether it is connected in the word she used, and carries the button.
//
// THREE STATES, NEVER TWO.A login shell that timed out, or a Mac carrying
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
// IT SAID NOTHING ON THE ONE MAC WHERE THERE WAS A QUESTION. The only Codex
// control anywhere was the Coding agent picker, and that is drawn only when
// there are two engines to choose between -- which needs Codex already FOUND.
// So the person whose Codex Agentbox cannot see got no status, no install link,
// and no way to tell "not installed" from "installed somewhere the search
// cannot reach". That second case is exactly what the third state above exists
// for, and the facts were already computed and read by nobody
// (main/codex-bin.mjs answers found/certain/path just as its sibling does).
//
// WHEN IT IS DRAWN, WHICH IS THE JUDGEMENT AND NOT A SYMMETRY. Claude Code's
// card is on every Mac because the inbox does not open without Claude Code.
// Codex is OPTIONAL, so an always-present Codex card is furniture for everybody
// who never uses it, and a dense screen is a failed screen. It is drawn when
// this Mac has ASKED for Codex, and the asking is the opt-in moment in
// zero.config.json somebody writes by hand: before it Agentbox has never said the
// word Codex on any screen, so a card here would be the app volunteering a
// topic -- and it would say "connected" over an engine that is going to run
// nothing, because every row is refused to Claude Code until the gate is open.
//
// IT IS NOT "ARE THERE TWO ENGINES". That is the question the picker asks, and
// its answer is NO on precisely the Mac this card is for. `w.codex` on the
// settings payload is the whole rule, answered by
// `Supervisor#engineChoiceOpened` in the one file allowed to read the opt-in,
// so the screen and the routing cannot come apart. Absent means silence.
//
// THE WORDS ARE THE ONES ABOVE, WITH CODEX AS THE SUBJECT. One difference, and
// it is the sentence that would otherwise be false: being connected does not
// mean her agents have something to run on -- Claude Code is that -- it means
// she can put a task on Codex instead.
//
// AND IT SAYS WHICH ACCOUNT, WHICH IT COULD NOT UNTIL 2026-09-18. This comment
// used to read "there is no account row under it", and the reason it gave was
// true when it was written: `~/.codex/auth.json` carried a mode and an opaque
// account id, no email and no plan, and a uuid is not a person.
//
// `codex login status` still names nobody, so the file is the only source there
// is. main/codex-account.mjs reads it.
//
// So the account line sits under the connected row, the way Claude Code's
// Accounts group sits under its card, because "is Codex here, and who is it
// signed in as" are one question asked twice. A second Codex login is still not
// supported, so this is one line and not a list.
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
  // NO PRODUCT NAME TYPED HERE. The app is being renamed on another branch,
  // where the name becomes something read from one place rather than spelled
  // out in each of 431. This sentence does not need the name to be true, so it
  // does not carry one.
  if (!parts.length) return 'This is the Codex login your tasks run on.';
  return parts.join('. ').replace(/\.\./g, '.');
}

/*
 * NOTHING ON THE SETTINGS PAGE RENDERS THIS ANY MORE (
   2026-09-21). `Connection`, its two copy tables, `ClaudeCode`, `CodexCli`,
   `accountLine` and `accountSay` were the connection cards; each coding agent
   is now ONE card carrying its status, its limits and its logins together
   (`AgentCard`, above), because this page had come to describe Claude Code in
   three separate places that never touched.

   They are still here, and still under test, because the copy tables hold a
   run of product decisions about what those three states may say -- and
   deleting them in the same change as the redesign would have put a second
   large diff under a review that is about a drawing. Taking them out is its own
   task; see decisions.md. Do not add to them, and do not edit them expecting
   the screen to change: it will not.

   ONE CARD, TWO CODING AGENTS. The copy tables above are the whole of the
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
   * WHO THIS MAC IS SIGNED IN AS, when the engine can say. Only Codex hands one
   *  over today: Claude Code's logins are a list rather than a line, and they
   *  have their own group under this card. Every field is independently null, so
   *  a login with no email still draws whatever it does know. */
  account?: EngineAccount | null;
  /**
   * WHY NOTHING RUNS ON IT DESPITE IT BEING HERE, or null. Main's sentence,
   *  never one derived here (main/settings.mjs `engineTroubleFor`, off
   *  shared/spawn-trouble.mjs). BEING FOUND IS NOT BEING USABLE: a subscription
   *  that lapsed leaves the binary exactly where it was and stops every task on
   *  that engine, and until this the fact lived only on the individual rows --
   *  the trouble is filed per account under a key (`codex:default`) that the
   *  Accounts page below could never match. */
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
  /* * THE TROUBLE REPLACES THE LINE IT CONTRADICTS, rather than sitting under it. Same move
     the account rows already make, where the trouble sentence replaces the folder line. It
     is only ever read when the engine was FOUND, because a trouble about an engine that is
     not here has nothing to add to "it is not here".
  */
  const say = trouble && found ? trouble
    : found ? copy.connectedSay
      : again ? (certain ? copy.still : copy.stillUnsure)
        : certain ? copy.missingSay : copy.unsureSay;

  return (
    <Group
      label={copy.name}
      /*
       * The path, and only when there is one. It is under the plate with the
         other grey notes rather than in the row, because it is the one thing
         here that is for somebody who already knows what it means. */
      note={found && bin ? copy.where(bin) : undefined}
    >
      <Row label={label} desc={say}>
        {/* The dot says the state and the word beside it says the same thing
            in English, so neither has to be learned from the other. It is the
            app's own dot (.set-dot), and there is no red anywhere in it: the
            standing rule is that Agentbox does not shout in colour, and this
            screen is not an emergency. This is the only dot left on the
            screen. The account rows carried one too until 2026-08-30, when that
            group proved hard to understand; a dot earns its
            place here because this row is a yes or no about one thing, and it
            did not there, where it sat beside five other facts. */}
        <span className={`set-dot ${found ? 'live' : ''}`} />
        <span className="set-mono">{found ? 'connected' : certain ? 'not found' : 'not sure'}</span>
        <button type="button" className="set-ghost" disabled={checking} onClick={() => void look()}>
          {checking ? copy.checking : copy.check}
        </button>
      </Row>
      {/* WHO IT IS SIGNED IN AS (w-c2904cc8d9). Only ever drawn when the engine
          was FOUND: an account line over "Codex is not on this Mac" is two rows
          disagreeing about whether there is anything here at all.

          THE EMAIL IS THE ANSWER AND THE REST IS DECORATION. The question is
          "which account", so the email is the label and carries the row on its
          own. The plan rides the sentence underneath because it is the next
          thing anybody asks and costs no line of its own. The uuid is drawn
          ONLY when there is no email: it is not a person, and a row that leads
          with one has not answered the question. */}
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
    </Group>
  );
}

/*
 * EACH ENGINE'S OWN WORDS AND ITS OWN SEARCH, BOUND ONCE. The call sites then
   say which engine they are about and nothing else, and neither pair can be
   handed to the other card by accident. */
type EngineConnection = Omit<React.ComponentProps<typeof Connection>, 'copy' | 'check'>;

const ClaudeCode = (props: EngineConnection) => (
  <Connection copy={CLAUDE} check={api.recheckClaude} {...props} />
);

const CodexCli = (props: EngineConnection) => (
  <Connection copy={CODEX} check={api.recheckCodex} {...props} />
);

/* THE UPDATES GROUP IS GONE (w-5737fe67cf, 2026-09-23), along with Digest,
   cutting Settings down for launch. The app still
   keeps itself current on its own (main/updater.mjs), and a version that is
   downloaded and waiting still reaches the user as a row in the inbox
   (../update-row.ts), which is where it asks for the one thing that is the
   user's to time, the restart. What went is only the page that reported on it. */

/* ---------------------------- the mark, changed --------------------------- */

// THE PICTURE BESIDE A PROJECT'S NAME, AND THE ONE CONTROL THAT CHANGES IT.
//
// Nothing is uploaded and nothing is hosted: the picture is copied into the
// project's own folder and read from there. main/project-identity.mjs says why
// it is copied rather than pointed at.
//
// THE MARK IS THE BUTTON. There is no "Choose file…" row and no file name
// printed anywhere, because the only question anybody has here is what it looks
// like in the app, and the answer is the control itself. Clicking it opens the
// Mac's own picker.
//
// THE WAY BACK IS A CORNER BADGE, NOT A WORD BESIDE IT. A "Remove" link next to
// the mark is the obvious build and it is wrong twice: it exists only on a
// project that HAS a mark, so the name beside it would sit in two different
// places depending on a setting, and hiding it with opacity leaves it holding
// that width anyway. Measured on the first build of this, photographed: 60px of
// empty air between the mark and the title on every project with a picture. So
// the × sits ON the mark, takes no layout at all, and appears under the pointer,
// which is where every avatar on this Mac already puts it.
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

// THE NAME IS THE TITLE OF THE PAGE, AND THAT IS WHERE IT IS CHANGED.
//
// This was a nav row for one round.
//
// The reason it moved is worth keeping: a nav column's whole job is
// getting you to a page, so a click that sometimes navigates and sometimes
// starts an edit is a control you have to think about before pressing. Here the
// name is the SUBJECT rather than a label pointing at one, and editing the thing
// itself is the only reading a click has.
//
// The rail has the same pair (Rail.tsx), and both are wired to the same one-line write.
//
// CLICK TO EDIT, ENTER SAVES, ESCAPE PUTS IT BACK, AND SO DOES CLICKING AWAY.
// Blur saving is the arguable one: it is what Finder does, and the cost of being
// wrong is one more rename, so it follows Finder. An empty name is refused by the
// main process (`cleanName`), which means the page keeps the name it had rather
// than showing a blank heading with no handle left to fix it by.
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

/* --------------------------------- screen --------------------------------- */

/* ------------------------------ all her projects --------------------------- */
// THE PROJECTS PAGE is ./ProjectsPage.tsx: every project in the order the
// agents work them, each row the door to that project's own page. It replaced
// a plain index here and a separate Priority page (w-a514b58055).

export function Settings({ look, onSetLook, tune, onSetTune, onResetTune, keyHints, onSetKeyHints, startPane, usageReadings = [], now = Date.now(), embedded = false, onSectionChange, onNewProject, ranked = [], onSetOrder, teamPane, onClose }: {
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
  // Whether the app draws its keys when you point at something. On General,
  // where people look for it (w-5737fe67cf).
  keyHints: boolean;
  onSetKeyHints: (v: boolean) => void;
  /**
   * WHICH PAGE THIS OPENED ON, when whoever opened it had one in mind. ⌘K has
   *  a row for the shortcuts, and a row that opened Settings on General and
   *  left somebody to find Shortcuts in the nav would be a door onto a
   *  corridor. Absent for the cog and for the ordinary ⌘K "Settings…" row,
   *  which both mean "take me to Settings" and land where they always did. */
  startPane?: string | null;
  embedded?: boolean;
  usageReadings?: Usage[];
  now?: number;
  onSectionChange?: (section: string | null) => void;
  // Door C: the + on the PROJECTS heading, opening the new project card.
  onNewProject?: () => void;
  // The running order, for the Priority page: every project already in order
  // (App's `rankedProducts`), and the write. Absent means no Priority row.
  ranked?: Product[];
  onSetOrder?: (slugs: string[]) => void | Promise<void>;
  /** Team management, handed in by whoever has the team's state. Absent on a
   *  build with no team cloud, and then there is no Team row either. */
  teamPane?: ReactNode;
  onClose: () => void;
}) {
  const [model, setModel] = useState<SettingsModel | null>(null);
  // ?settings=agents, or ?settings=project:kestrel. Anything else (including the
  // bare ?settings=1 that only means "open") lands on General. `startPane` is
  // the same question asked from inside the app instead of from the address
  // bar, and it wins, because a press that named a page is more recent than a
  // URL the window was opened with.
  const [pane, setPane] = useState<Pane>(() => {
    const want = startPane || new URLSearchParams(location.search).get('settings') || '';
    if (want === 'instructions' || want === 'appearance' || want === 'general' || want === 'shortcuts' || want === 'projects') return want;
    // Priority was its own page for a round and is now the Projects page itself
    // (w-a514b58055), so the old name opens the page its content went to.
    if (want === 'priority') return 'projects';
    // ?settings=team, and the Invite people shortcut in the sidebar foot. On a
    // build with no team cloud there is nothing to draw, so it lands on
    // General rather than on an empty screen.
    if (want === 'team') return teamPane ? 'team' : 'general';
    // The page moved into Agents, so the old name lands where its content went.
    // ?settings=accounts still opens the account rows, wherever they live.). An
    // old link is not somebody's mistake. AND AGENTS ITSELF JOINED THEM ON
    // 2026-09-22: the whole pane is groups on General now, so the name resolves
    // the same way the accounts name has since August rather than opening an
    // empty screen.
    if (want === 'accounts' || want === 'agents') return 'general';
    // The page was renamed Themes (w-5737fe67cf); its id stays `appearance`
    // so every old link still opens it, and the new name opens it too.
    if (want === 'themes') return 'appearance';
    if (want.startsWith('project:')) return { project: want.slice('project:'.length) };
    return 'general';
  });
  // WHICH SIDEBAR ROW IS LIT. A project's own page reports `projects` rather
  // than a name of its own, because the row she pressed to get here says
  // Projects and a row that goes dark the moment you arrive somewhere is how
  // "I'm stuck in settings" (w-69e7f56362) happened the first time.
  useEffect(() => {
    onSectionChange?.(
      pane === 'instructions' || pane === 'shortcuts' || pane === 'projects' || pane === 'team' ? pane
        : typeof pane === 'object' ? 'projects'
          : null,
    );
  }, [pane]);

  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await api.settings();
    setModel(s);
    if (!s.ok) setError(s.error ?? 'could not read settings');
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
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
  // open it already pointed at that project, which is the one place a
  // project's instructions are written now.
  const [instrScope, setInstrScope] = useState<string>(EVERY);
  const openInstructions = (slug: string) => { setInstrScope(slug); setPane('instructions'); };
  const current = useMemo(
    () => (typeof pane === 'string' ? null : projects.find((p) => p.slug === pane.project) ?? null),
    [pane, projects],
  );

  // A project that disappears while its page is open (archived, renamed) would
  // otherwise leave a blank pane with a nav row selected. It lands on the list
  // of projects rather than on General, because the page it fell out of was a
  // project's and the list is the nearest place that still answers the question
  // it was asked.
  useEffect(() => {
    if (typeof pane !== 'string' && model && !current) setPane('projects');
  }, [pane, model, current]);

  const w = model?.workspace;
  /*
   * WHETHER THIS MAC REALLY HAS TWO CODING AGENTS, and it is main's answer
     rather than a guess from the presence of a binary: `engineChoices` asks the
     capability gate first, so a Mac with Codex installed and the gate shut reads
     as one engine here -- because every row on it is going to run on Claude Code
     whatever this screen says.
     IT IS THE ONLY THING ON THIS SCREEN THAT MAY MAKE A SENTENCE LONGER. A dense
     screen is a failed screen, and a clause explaining a second coding agent to
     somebody who has one is pure density, so every word Codex costs is behind
     this and appears on no other Mac.
     ONE NAME, BECAUSE FIVE ROWS NOW ASK IT. Agents at once, Coding agent, Model,
     the workspace Permissions note and the per-project permission row were
     spelling the same question three different ways in one file, and the two
     panes are four hundred lines apart. Two spellings of one question is how the
     one that gets taught and the one that does not end up on adjacent screens.
     THE LIST AND NOT ONLY THE COUNT, which is the same pair the composer's
     footer already keeps (`engineRows`, Compose.tsx): the Coding agent row needs
     the entries to draw its options, and a row that asked the count off one
     expression and the entries off another is one edit from offering a choice it
     has already decided not to draw. Empty until main says otherwise, which is
     every Mac with the gate shut. */
  const engineRows = w?.engineChoices ?? [];
  const twoEngines = engineRows.length > 1;
  /** THE WORKSPACE GROUP IN THE NAV COLUMN.
   *
   *  Team is in it, and not under Projects, because a team owns the whole
   *  workspace rather than one project. It is before Shortcuts for the reason
   *  on Shortcuts below: that one is a page you read once, so it stays last.
   *  With no team cloud in the build there is no pane to open, so there is no
   *  row either.
   */
  const navRows: Array<[string, string]> = [
    ['general', 'General'],
    ['appearance', 'Themes'],
    ['instructions', 'Instructions'],
    ...(teamPane ? [['team', 'Team'] as [string, string]] : []),
    /* * THE KEYS, WITH A DOOR OF THEIR OWN. It is last in this group because it is
       a page you read once, not a setting you come back to, and it is in this group
       rather than under Projects because the keys are the app's, not any one
       project's.
    */
    ['shortcuts', 'Shortcuts'],
  ];
  // THE CODEX MODEL LIST WAS READ HERE and is not read any more
  // (w-12081d32cc): the card asks which model a run goes out on, so neither
  // card on this screen draws a Model row. `engineModelChoices` still keeps
  // that list for the composer's own picker.

  return (
    <div className={`settings-screen${embedded ? ' settings-embedded' : ''}`} data-pane={typeof pane === 'string' ? pane : 'project'}>
      <div className="set-nav">
        {/* THE WAY OUT, WHERE SHE LOOKS FOR IT. The strip is a drag region for the frameless
           window, so the button opts out of it or it cannot be clicked.
         */}
        <div className="set-nav-top">
          <button type="button" className="set-nav-back" onClick={onClose} aria-label="Back">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
            <span>esc</span>
          </button>
          <div className="set-nav-title">Settings</div>
        </div>
        <div className="set-nav-scroll">
          <div className="set-nav-group">Workspace</div>
          {/* AGENTS IS NOT A ROW HERE ANY MORE (w-3d634cbc44). Its content is
              on General, and a nav row pointing at a
              second pane that no longer exists is a door into a wall. The
              `agents` name itself still resolves, one level up, so a link
              anybody saved still opens the page its content went to. */}
          {navRows.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`set-nav-item ${pane === id ? 'on' : ''}`}
              onClick={() => setPane(id as Pane)}
            >
              <span className="set-nav-label">{label}</span>
              {/* The account count that used to sit beside the Accounts row is
                  gone with the row. On a Mac with one subscription it was a
                  standing "1" next to a plural, which is a scoreboard inviting
                  a 2 (w-7d5cb36913). */}
              {/* The count follows its rows to General (w-3d634cbc44). It is
                  the one number on this column that changes while she watches,
                  and it has to sit on the door that now opens onto it. */}
              {id === 'general' && w && w.running > 0 && <span className="set-nav-flag">{w.running} running</span>}
            </button>
          ))}

          {/* DOOR C.
           */}
          <div className="set-nav-group np-head">
            <span>Projects</span>
            {onNewProject && (
              <button type="button" className="np-plus" title="New project" aria-label="New project" onClick={onNewProject}>+</button>
            )}
          </div>
          {/* ONE DOOR, NOT THIRTY-SIX (w-c2904cc8d9). Every project used to be a row here.

              The count is on the row because it is the fact that decides whether
              opening it is worth doing, and because a nav row reading "Projects"
              with nothing beside it is the heading again.

              CALLED PROJECTS, AND IT IS ALSO WHERE THE ORDER IS SET. Priority was
              its own row for a round; the founder merged the two into one page
              and named it Projects (w-a514b58055).
           */}
          <button
            type="button"
            className={`set-nav-item ${pane === 'projects' ? 'on' : ''}`}
            onClick={() => setPane('projects')}
          >
            <span className="set-nav-label">Projects</span>
            {!!projects.length && <span className="set-nav-flag">{projects.length}</span>}
          </button>
          {/* AND WHERE YOU ARE, when you are inside one. Opening a project used
              to leave its row highlighted in a list of all of them; with the
              list gone the column would otherwise say nothing at all about which
              project's page is on screen, which is worse than the clutter was.
              A NAV ROW NAVIGATES AND DOES NOTHING ELSE, which is the rule set
              on w-c4c4ad312c, because a sidebar row that also edits is
              illogical. The
              rename lives where the name is the subject, on the page this opens,
              and on the rail. */}
          {current && (
            <button
              type="button"
              className="set-nav-item on"
              onClick={() => setPane({ project: current.slug })}
            >
              <span className="set-nav-ico"><ProductMark src={current.logo} name={current.name} slug={current.slug} size={15} /></span>
              <span className="set-nav-label">{current.name}</span>
            </button>
          )}
          {model && !projects.length && <div className="set-nav-empty">No projects yet.</div>}
        </div>
        {/* The store, short enough to read at a glance in a 244px column. The
            full path is on the General pane, where there is room for it. */}
        {w && <div className="set-nav-foot" title={w.storePath}>{shortPath(w.storePath)}</div>}
      </div>

      <div className="set-pane">
        {pane === 'instructions' && <InstructionSettings projects={projects} scope={instrScope} onScope={setInstrScope} onSaved={load} />}
        {/* AND THE SETTINGS ERROR IS EXCLUDED FROM SHORTCUTS FOR THE SAME REASON AS THE WAIT
           BELOW (w-1bc916a880, 2026-09-22). This banner says "quit and reopen agentbox to
           change settings", which is what `api.ts` answers when the window has outrun the
           main process it is attached to and `settingsRead` is not there to call. That is
           true and worth saying on a pane made of settings. The Shortcuts page reads
           nothing off the main process, so on that one it is a warning about a thing the
           page was never going to do.

           AND THE STALE-BUILD NOTE IS NOT SHOWN ANYWHERE NOW (w-b3e123a0af), because it
           should not exist in any form. A released app replaces its window and its process in the same restart, so nobody
           using one can reach it; only a window reloaded with ⌘R onto a newer build in
           development can. A real failure to save still shows here.
         */}
        {error && error !== RESTART_NOTE && pane !== 'shortcuts' && pane !== 'team' && <div className="set-error">{error}</div>}
        {/* The Shortcuts page is excluded: it reads nothing off the main
            process, so "Reading settings…" over it would be the app waiting
            for an answer it does not need. Team is excluded for the same
            reason: nothing on it comes out of the settings file. */}
        {!model && pane !== 'shortcuts' && pane !== 'instructions' && pane !== 'team' && <div className="set-inner"><div className="set-lede">Reading settings…</div></div>}

        {/* TEAM MANAGEMENT (w-8415594d19): the page that used to sit in the
            sidebar, drawn here. It does not wait on `model`, because nothing on
            it comes from the settings file; the team's state arrives with the
            pane itself. */}
        {pane === 'team' && teamPane && (
          <div className="set-inner">
            <h1 className="set-title">Team</h1>
            <p className="set-lede">Who is on your team, who has been invited, and the team's name. Everyone sees a short summary of your threads unless you mark one private.</p>
            {teamPane}
          </div>
        )}

        {model && pane === 'projects' && (
          <div className="set-inner">
            <ProjectsPage
              ranked={ranked}
              details={projects}
              onSetOrder={onSetOrder}
              onOpen={(slug) => setPane({ project: slug })}
              onNew={onNewProject}
            />
          </div>
        )}

        {model && w && pane === 'general' && (
          <div className="set-inner">
            <h1 className="set-title">General</h1>
            <p className="set-lede">Your usage, your coding agents, how many run at once, and what they are allowed to do.</p>
            {/* ONE CARD PER CODING AGENT (w-c2904cc8d9). What stood here was
                the same three subjects filed five ways: a Usage block naming
                both agents, a connection card each, and an accounts group under
                one of them. Claude Code was described in three separate places
                on one page. The card gathers one agent's whole story instead,
                and the component above says what each part of it is for. */}
            {/* TWO FOLDERS, ONE SUBSCRIPTION, SAID ABOVE THE CARDS. The morning
                this exists for (w-f2a5c9894e): both account rows had
                quietly become the same login, and nothing on the screen could
                say so. It is main's sentence and it belongs over the whole set
                rather than inside one card, because it is about the pair. */}
            {w.accountsNote && <p className="ac-note" role="status">{w.accountsNote}</p>}
            <div className="ac-cards">
              {([agentStory(w, usageReadings, 'claude'),
                ...(w.codex ? [agentStory(w, usageReadings, 'codex')] : [])]).map((a) => (
                <AgentCard
                  key={a.engine}
                  agent={a}
                  now={now}
                  settings={a.engine === 'codex' ? (
                    <>
                      {/* NO MODEL ROW IN THIS CARD (w-12081d32cc). The new
                          task card asks which model a run goes out on, keeps
                          the answer between cards, and is the only place the
                          question is asked now. A Codex card with no model
                          named still follows the person's own
                          ~/.codex/config.toml, which is what the absence of the
                          setting has always meant. */}
                      <div className="ac-field">
                        <Picker
                          label="What it may do"
                          title="The starting point for every Codex agent. A project can be set to its own."
                          value={w.codexMode}
                          options={CODEX_MODE_OPTIONS}
                          onChange={(v) => setWorkspace('codexMode', v)}
                        />
                        {/* AND NOT `RULES_ALWAYS_APPLY` UNDER THIS ONE. That
                            caveat is about Claude Code's allow and deny rules
                            sitting on top of a mode. Codex has no such list, so
                            repeating it here would describe a thing this engine
                            does not have. */}
                        <div className="ac-field-line">{CODEX_MODES[w.codexMode]?.what}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* NO MODEL ROW IN THIS CARD EITHER (w-12081d32cc). The
                          new task card carries the model, remembers what was
                          picked last, and opens a first task on Opus, so a
                          second control here is a second answer that can
                          disagree with the one on the card being sent. */}
                      <div className="ac-field">
                        {w.permission === 'custom' ? (
                          <>
                            {/* THE WORD PEOPLE LOOK FOR. It is Claude Code's own
                                name for this whole area and the word people
                                search this screen for, so it stays the label even
                                inside the card that already says whose it is. */}
                            <div className="set-picker-label">Permissions</div>
                            <div className="ac-field-line">{PERMISSION_SENTENCE.custom}</div>
                          </>
                        ) : (
                          <>
                            <Picker
                              label="Permissions"
                              title="Claude Code's own modes. The starting point for every Claude Code agent, and a single reply can be sent in another."
                              value={w.permission}
                              options={PERMISSION_OPTIONS}
                              onChange={(v) => setWorkspace('permission', v)}
                            />
                            <div className="ac-field-line">{PERMISSION_SENTENCE[w.permission]}</div>
                            <div className="ac-field-line">{RULES_ALWAYS_APPLY}</div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                  onChoose={(engine, profile) => write(api.setWorkspaceSetting({
                    key: 'activeAccount', value: { engine, profile },
                  }))}
                  onAdd={async (a) => {
                    // WHICH AGENT SHE PRESSED ON, because both cards offer this
                    // now and the panel below names the one she is signing in to.
                    const r = a.engine === 'codex' ? await api.addCodexAccount() : await api.addClaudeAccount();
                    setAdding(r.ok ? { engine: a.engine, name: a.name, command: r.command } : { engine: a.engine, name: a.name, error: r.error });
                    // The row for the new login appears immediately, reading
                    // "Not signed in", so an abandoned sign in leaves something
                    // she can see rather than a folder nothing mentions.
                    await load();
                  }}
                  onChecked={load}
                />
              ))}
            </div>

            {/* HOW A SECOND LOGIN IS ACTUALLY MADE. Neither agent has an account switcher:
               each keeps ONE login per home folder, so a second account is a second folder
               with its own sign in.
             */}
            {/* SIGNING A SECOND ACCOUNT IN, IN THE APP (w-c2904cc8d9). This printed a
               command for a round, and the command was wrong: codex-cli refuses a
               CODEX_HOME that does not exist, so it failed on the first try.

                So main makes the folder and registers the login, and the shell
                below is left with the one part that is genuinely the user's, which is
                signing in to the vendor in a browser. The command is typed for her;
                nothing here asks her to remember or retype anything.

                IT NAMES THE AGENT SHE PRESSED ON. Two cards can open this panel
                since w-3498e0cad2, and a heading that said Codex over a Claude
                sign in would be the screen telling her something untrue about
                her own machine.
             */}
            {adding && (
              <div className="ac-adding">
                <div className="ac-adding-top">
                  <span>{adding.error ? 'Could not add an account' : `Sign in to ${adding.name ?? 'your account'}`}</span>
                  <button type="button" className="ac-adding-x" aria-label="Close" onClick={() => { setAdding(null); void load(); }}>&#215;</button>
                </div>
                {adding.error
                  ? <p>{adding.error}</p>
                  : <p>
                    Finish signing in below. It opens your browser, and the account lands in the {adding.name ?? 'agent'}
                    {' '}card when it is done.
                  </p>}
                {!adding.error && <SettingsTerminal command={adding.command} />}
              </div>
            )}

          </div>
        )}

        {/* THE AGENTS PAGE IS PART OF GENERAL NOW (w-3d634cbc44).

            A page called General in an app whose whole subject is agents, with
            Agents filed beside it as a second page, splits one subject in two
            and hides the number that matters most one click deep. The nav row is gone and `agents`
            now resolves to this pane, so every old link still lands.

            TWO BLOCKS AND NOT ONE, and the reason is spacing rather than
            structure. `.set-inner` carries the page's own top and bottom air; a
            second one under the first would stack 96px onto 64px and leave a
            hole in the middle of a page that has none anywhere else. The
            stylesheet takes that air off the seam (`.set-inner + .set-inner`),
            so the two blocks read as one column and each group keeps the same
            54px above it that every other group on the page has.

            AND THE COUNT COMES FIRST, above the odds and ends that used to sit
            here. It is the important one, and the four workspace switches
            below it are things set once.
         */}
        {model && w && pane === 'general' && (
          <div className="set-inner">

            {/* THE GROUP GAINS THE HEADING THE PAGE USED TO GIVE IT. It had
                none while it was the first thing under an <h1> reading Agents;
                here it is one group among nine and an unlabelled one would be
                the only group on the page with nothing saying what it is. */}
            <Group
              label="Agents"
              note={w.running
                ? `${w.running} running right now, of ${w.capacity} at once.`
                : `Nothing running right now. Room for ${w.capacity} at once.`}
            >
              {/* PAUSING IS A COMMAND, NOT A SETTING (w-12081d32cc). This row
                  was a switch reading "Agents are running", and the command
                  palette has carried the same switch all along, as Pause agents
                  and Unpause agents (renderer/src/components/Palette.tsx).
                  Stopping the queue is something done in the moment, which is
                  what the palette is for, and this page is for the handful of
                  things set once. The state is still on the snapshot and still
                  written through the supervisor, so nothing underneath moved. */}
              <Row
                label="Agents at once"
                /* * WHY THE NUMBER IS WHAT IT IS, when Agentbox chose it rather
                   than the person (w-7d5cb36913). A smaller plan gets one at a
                   time instead of three, and a stepper that quietly says one
                   with no reason beside it is the same silence a tester ran into.
                   The sentence goes first because it is the surprising part,
                   and it is gone entirely for anybody who set their own.

                   Two accounts already connected still read what they add up to, because
                   that is their own machine described rather than a suggestion.

                   AND IT NAMES THE ENGINE ONLY WHERE THERE ARE TWO. The plan is
                   a fact about her ANTHROPIC subscription, and the number it
                   sets now caps Claude Code alone (main/supervisor.mjs,
                   `_slotsPerAccount`): a Codex thread spends none of that plan,
                   so it is not throttled by it. On a Mac with a second coding
                   agent the unqualified sentence is therefore false — the app
                   starts one Claude Code agent at a time and three Codex ones,
                   under a line that has just said there is room for four. On
                   every other Mac, which is every downloaded copy, it is true as
                   it stands, and naming an engine there would be a word about
                   software she does not have. Drawn off the same list every
                   other engine surface on this screen reads.
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
                      : 'One runs at a time. The rest wait in line.'}${w.machineNote ? ` ${w.machineNote}` : ''}`}
              >
                {/* THE STEPPER'S RANGE IS THE SAME ON EVERY MAC, AND FOR ONE ROUND IT WAS
                   NOT (w-3d634cbc44). It shipped stopping at what main thought the hardware
                   would carry.

                    So the hardware reading moved into the SENTENCE above, where
                    it suggests, and the control goes where it always went. What
                    the machine still does is choose the number somebody STARTS
                    on, once, in main/config.mjs, which is a default and not a
                    wall.
                 */}
                <Stepper label="Agents at once" value={w.sessionsAtOnce} min={1} max={w.slotsMax ?? 12} onChange={(v) => setWorkspace('sessionsAtOnce', v)} />
              </Row>
              {/* THE CODING AGENT IS CHOSEN ON THE CARD (w-12081d32cc). A row
                  offering Claude Code or Codex stood here until 2026-09-23, on
                  a Mac that had both. The new task card asks the same question
                  where the work is described, remembers the answer between
                  cards and opens a first task on Claude Code, so this row was a
                  second answer to a question already answered somewhere it can
                  be seen while the task is being written. */}
              {/* THE MODEL ROW MOVED INTO THE CARDS (2026-09-23). It used to be
                  here, as ONE control that changed meaning with the Coding agent
                  row above it, which is the defect a tester filed on 2026-09-05:
                  with Codex selected, the row below still listed Claude
                  models. Three rounds of scoping the sentence under it
                  never fixed that, because the control still LOOKED like it
                  belonged to whatever was lit one row up.

                  Two Model rows, one inside each engine's own card, is the thing
                  the old comment here argued against on density grounds. That
                  was overruled on 2026-09-23: each engine's settings go in
                  that engine's card. It also costs nothing in rows on a Mac with
                  one engine, where there is one card. */}
            </Group>


            {/* THE PERMISSIONS GROUP AND THE CODEX GROUP BOTH MOVED INTO THE
                CARDS (2026-09-23): each engine's settings belong in that
                engine's card.

                What stood here was two groups whose whole job was saying WHOSE
                settings they were -- a note ending "Codex has its own three,
                below", and a second group repeating the point in reverse. A
                control inside the Claude Code card cannot be mistaken for a
                Codex one, so the disambiguating sentences went with the move
                and the labels got shorter rather than longer.

                The word Permissions survives as the Claude Code row's label. It
                is the word people scan this screen for, and Claude Code's own
                name for the area. Not to be confused with their `/permissions` COMMAND,
                which manages allow and deny rules rather than modes. */}

            {/* THE USER'S OWN CLAUDE CODE, the sessions Agentbox did not start. They are
                rows in the Inbox and in no other list since 2026-08-17; this is
                the only place that decides how many of them get there. */}
            <Group
              label="Agents you started yourself"
              note={`${Name} reads this Mac every few seconds. An agent you answer in its own terminal leaves your inbox on its own.`}
            >
              <div className="set-row set-row-stack">
                <Segbar value={w.outsideAgents} options={AGENT_OPTIONS} onChange={(v) => setWorkspace('outsideAgents', v)} />
                <div className="set-row-desc set-stack-desc">
                  Claude Code you started in a terminal or another app, not from here.
                  {' '}{AGENT_SENTENCE[w.outsideAgents]}
                </div>
              </div>
            </Group>

            {/* "WHEN A PROJECT GOES QUIET" WAS A GROUP HERE AND IT IS GONE
                (w-d19d6d387c, 2026-09-22). It was the master switch for the
                drive, the loop that read a quiet project and filed what it
                thought should happen next. Code that drives a product on its
                own does not belong in the app, least of all in an open source
                one. The switch, the loop, the ⌘K row and the per-project exception
                all went in one commit, so nothing on this screen offers a thing
                the app can no longer do. */}

            {/* THREE GROUPS WENT HERE (w-5737fe67cf, 2026-09-23), cutting
                Settings down for launch: Updates and Digests. And
                "How agents split up work" became an always-on rule rather than
                a switch. Off only took one paragraph out of every brief, and it
                was never turned off in practice, so every agent now gets it (main/supervisor.mjs, buildBrief). */}

            {/* THE HINTS SWITCH CAME HERE FROM APPEARANCE (w-5737fe67cf), because
                nobody noticed it under Appearance and General is where it
                belongs. That page is Themes now and holds the theme alone. */}
            <Group label="Keys" note="The keys themselves are on the Shortcuts page.">
              <Row
                label="Show keyboard shortcut hints"
                desc="Point at a task and its right end says that task's keys. The tabs say the tab key moves between them, and the magnifier and the plus name theirs. Off, none of it is drawn and every key still works."
              >
                <Switch label="Show keyboard shortcut hints" on={keyHints} onChange={onSetKeyHints} />
              </Row>
            </Group>

            {/* THE CLAUDE CODE ROW USED TO BE THE SECOND ROW OF THIS GROUP AND
                IT IS NOT ANY MORE (w-fb22ca8895). Everything it was built to
                say — three states not two, never "missing" off a search that
                came back unsure, a link rather than a grey
                dot — is kept word for word at the top of this pane in
                `ClaudeCode`, with a Check again button it did not have. What
                moved is only WHERE, and why it had to move is the whole of
                a tester's session: filed under a heading about folders, with
                a filesystem path for its sentence and "found" for its verdict,
                it was invisible to the one person who went looking for it.

                THIS GROUP KEEPS ITS ONE HONEST ROW. Where Agentbox keeps the
                user's files is a fact about folders and belongs under a heading about
                folders. Where Claude Code lives on disk is now the quiet grey
                note under the status plate above, which is as much attention
                as a path deserves on a screen a stranger reads. */}
            <Group label={`Where ${NAME} keeps things on this Mac`}>
              <Row label="Your projects, tasks and documents" desc={w.storePath} />
            </Group>
            {/* ONE SWITCH OVER EVERYTHING THAT LEAVES THE MACHINE, and there is
                deliberately no second one and no partial mode, because the
                privacy page (section 10) promises there is not. The words here
                say what is sent and what is never sent, in plain words, so
                nobody has to open a policy to know what this does. */}
            <Group
              label={`What ${NAME} sends`}
              note={w.diagnosticsDestination
                ? 'Turning it off stops both from that moment. It does not delete what was sent before.'
                : 'This copy has nowhere to send to, so nothing leaves it either way.'}
            >
              <Row
                label="Counts and crash reports"
                desc={`That ${NAME} was opened, that a task was opened, that a reply was sent, and a report when something breaks. Never your code, your prompts, your keys or your paths, and never a title.`}
              >
                <Switch label="Counts and crash reports" on={w.diagnostics} onChange={(v) => setWorkspace('diagnostics', v)} />
              </Row>
            </Group>

          </div>
        )}

        {model && pane === 'appearance' && (
          <div className="set-inner">
            <h1 className="set-title">Themes</h1>
            <p className="set-lede">How the app looks. Also on ⌘K.</p>
            {/* A theme is the one setting on this screen you judge by LOOKING at it, so the
               picture is the control: it sits on the page, at a size worth looking at, and
               the only edge on it is its own.
             */}
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
            {/* THE DIALS, and only under a picture. Both move the window she is looking at
               as she drags, because a theme you have to close a screen to see is a theme
               you tune by memory.
             */}
            {/* Dark is Ember Grid, which has no picture to blur or dim, so the
                dials no longer show for any of the three (w-9e434e8671). */}
            {isSkin(look) && look !== 'ember-grid' && (
              <Group label={skinLabel(look)} note="Changes appear immediately and are saved for this theme.">
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
            {/* The keyboard hints switch sat here until w-5737fe67cf and is on
                General now, where people look for it. */}
          </div>
        )}

        {/* THE SHORTCUTS PAGE (w-fb22ca8895).

            NOTHING ON THIS PAGE IS A CONTROL. It is the one screen in Settings
            you read rather than set, which is why it has no plate borders, no
            switches and no right-hand column: four headings, eighteen lines,
            and air. A DENSE SCREEN IS A FAILED SCREEN, and the danger on a
            reference page is real — the temptation is to list everything the
            app can do. What is here is what a person actually presses, grouped
            by the moment they would want it rather than by which handler runs
            it; ../shortcuts.ts holds the list, says what was left out, and says
            why each omission is a kindness rather than a gap.

            THE LEDE IS THE PROMISE THE PAGE HAS TO KEEP: every key on it works
            today. A page that lists a key which does nothing teaches somebody
            that this app ignores them, which is worse than never having said
            anything. `tests/the-shortcuts-page-lists-keys-that-work.test.mjs`
            is how that promise is kept honest.
         */}
        {pane === 'shortcuts' && (
          <div className="set-inner set-keys-page">
            <h1 className="set-title">Shortcuts</h1>
            {/* NO LEDE. The page is the title and the keys (w-1bc916a880, 2026-09-22).
             */}
            {/* ONE GRID FOR THE WHOLE PAGE, NOT ONE PER GROUP (w-1bc916a880).
                Four grids meant four different column widths, each set by the
                widest cap in its own group: measured on the built page, the
                sentences began at 412, 365, 334 and 390 points, so the one
                thing that made this a list rather than four lists was missing
                exactly where the eye looks for it. The groups, their plates
                and their rows are all `display: contents`, so every cap and
                every sentence on the page is an item of this single grid and
                the column is as wide as the widest cap ANYWHERE. No number is
                written down, so it cannot go stale when a key is added. */}
            <div className="set-keys-grid">
              {SHORTCUTS.map((g) => (
                /* A HEADING AND ITS KEYS. NOTHING ELSE (w-1bc916a880). Three groups used to
                   carry a sentence under the heading.
                */
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
            {/* THE WAY BACK TO THE LIST. Same control as the one above the title in the
               column, for the same reason: one arrow, where a hand looks.
             */}
            <button type="button" className="set-crumb" onClick={() => setPane('projects')}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
              <span>Projects</span>
            </button>
            {/* THE SAME TWO THINGS AS THE SIDEBAR ROW, at the size of a title.
                The name is edited in the sidebar, and the mark is changed here,
                because a 15px burst in a 244px column is not something you can
                aim a picture at and judge the result of. One control each, in
                the one place each is legible. */}
            <div className="set-title-row">
              <ProjectIcon project={current} onPick={() => write(api.pickProjectIcon({ product: current.slug }))} onClear={() => write(api.clearProjectIcon({ product: current.slug }))} />
              {/* THE NAME IS THE TITLE, AND THE TITLE IS WHERE IT IS CHANGED
                  (w-c4c4ad312c). It was in the nav column for one round and came
                  off, because a sidebar row that also renames is illogical. Here the name is the
                  subject of the page rather than a label pointing at one, so
                  editing it in place is the obvious reading of a click. */}
              <ProjectTitle project={current} onRename={(name) => write(api.renameProject({ product: current.slug, name }))} />
            </div>
            <p className="set-lede">Everything here is this project only. Other projects are unaffected.</p>

            {/* FIVE CONTROLS BECAME ONE (w-d19d6d387c, 2026-09-22).

                The project level settings were hard to understand, largely
                unnecessary and almost never discovered, and even explained they
                did not read clearly. Project-level instructions are what is
                actually wanted.

                In practice almost none of the five were ever used, and one of
                them could not be, since the drive was off for the whole
                workspace.

                The drive, the per-project pause and personal mode are deleted
                from the app, not hidden. What is left is the one thing a
                project genuinely decides for itself, said in words that answer
                the user's question rather than name our machinery: whether a
                task an AGENT files here waits for her. Her own tasks always
                start, and a question or a review always waits, whatever this
                says.

                A PROJECT'S PERMISSION MODE IS STILL HONOURED AND IS NO LONGER
                OFFERED. `projectSessionArgs` still reaches the spawn for anyone
                who writes one into the config, so the row below appears on a
                project that HAS one and gives her the way back to the workspace
                default. On an ordinary project it draws nothing. */}
            <Group label="How it runs">
              <Row
                label="Let agents start the tasks they file here"
                desc="A task an agent writes on this project gets a session straight away. Without this it waits in your inbox for your yes. Questions and reviews always wait for you either way."
              >
                <Switch label="Let agents start the tasks they file here" on={current.autonomous} onChange={(v) => setProject(current.slug, 'autonomous', v)} />
              </Row>
              {/* AND THE SAME RULE FOR A SECOND ENGINE'S MODE, which landed
                  on main on 2026-09-23 while this was on a branch: a project can
                  carry a Codex mode of its own as well. Both rows appear only on
                  a project that HAS one, and each offers the way back, so the
                  page opened to change a project's rules is not two strips of another
                  tool's vocabulary. */}
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

            {/* ONE PLACE FOR A PROJECT'S INSTRUCTIONS (w-4cbcd888ae). They are
                written on the Instructions page, pointed at this project, and
                this row is the door to it rather than a second box onto the
                same file. */}
            <Group label="Instructions">
              <Row label="Instructions for this project" desc={current.instructions.trim() ? sizeLabel(current.instructions.length) : 'None yet.'}>
                <button type="button" className="set-ghost" onClick={() => openInstructions(current.slug)}>Open</button>
              </Row>
            </Group>

            <Group label="Where this project is kept on this Mac">
              <Row label="Documents" desc={current.dir} />
              <Row label="Repository" desc={current.repoPath ?? 'No code repo registered for this project.'} />
            </Group>
          </div>
        )}
      </div>
    </div>
  );
}
