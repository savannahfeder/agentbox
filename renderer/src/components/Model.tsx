// The model, as a word in the composer's sentence: "On Opus."
//
// It is the priority drawer's twin on purpose. Same trigger (a `.compose-word`,
// `font: inherit`, no padding, no border, so its baseline IS the line's
// baseline), same drawer, same keys, and it borrows `.prio-menu` rather than
// growing a second popover that would then drift from it. The only difference
// is what the rows say, and that list lives in ../models so settings and the
// card cannot disagree about the names.
//
// THE PICK IS ABOUT THE NEXT RUN. Every turn is a fresh `claude -p` spawn, so
// there is no session to switch mid-flight; choosing here says which model
// picks the task up, and nothing about a run already going.

import { useEffect, useRef, useState } from 'react';
import {
  defaultModelFor, engineModelChoices, engineModelLabel, type ModelChoice,
} from '../models';
import { defaultEffortFor, effortChoicesFor, effortShown, type EffortChoice } from '../effort';
import { useKeepInWindow } from '../keep-in-window';
import {useAgentUpdates} from './AgentUpdates';

// THE EFFORT LIVES IN HERE TOO.The levels sit under a hairline at the foot of
// this drawer, as a strip, and the sentence outside stays "On Fable 5.1."
// whatever is picked. The one thing she ruled out was more words on the line,
// so the level is never written into it.
//
// AND THE STRIP BELONGS TO THE ENGINE AND THE MODEL, the way the rows above it
// do. Claude Code's five are the same for every model; a Codex model's are its
// own, read off this Mac beside its name, so the strip redraws when the model
// row changes and draws nothing for a model with no known list
// (`effortChoicesFor` in ../effort says why nothing beats a guess).
//
// NO BUTTON IS LIT UNTIL SHE PICKS ONE. Nothing picked means nothing is sent
// and the engine chooses for the model, and this app does not know what it
// chooses, so it does not draw a guess as if it were running it. Pressing the
// lit button again unpicks it, which is the way back to that.
export function ModelPicker({ value, onChange, title, onOpenChange, engine = null, codexModels = [], codexDefault = null, effort = null, onEffortChange }: {
  value: string | null;
  onChange: (id: string | null) => void;
  title?: string;
  onOpenChange?: (open: boolean) => void;
  /** The level, or null for "let the engine choose". Omit the callback to draw no strip. */
  effort?: string | null;
  onEffortChange?: (id: string | null) => void;
  // WHICH ENGINE THIS CARD IS FOR. The names are not shared between the two:
  // Claude Code takes the alias `opus`, Codex takes the slug `gpt-5.6-sol`,
  // and drawing one engine's list beside the other's word was the defect she
  // reported on 2026-08-26. Since 2026-09-04 it is worse than a misreading --
  // `codexModelRefusal` in main/supervisor.mjs stops a Codex run whose model
  // this Mac's Codex does not know, so a Claude alias on a Codex card is a row
  // that cannot run at all. Absent means Claude Code, which is every card on a
  // Mac with no Codex on it.
  engine?: string | null;
  codexModels?: ModelChoice[];
  codexDefault?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const {updates,start}=useAgentUpdates();
  const updateEngine=engine==='codex'?'codex':'claude';
  const update=updates[updateEngine];
  const showUpdate=['available','running','failed'].includes(update?.state);
  const [cursor, setCursor] = useState(0);
  // A span, not a div: this sits inside a line of prose and a div there is not
  // phrasing content.
  const wrap = useRef<HTMLSpanElement>(null);
  const fallback = defaultModelFor(engine, codexDefault);
  const rows = engineModelChoices(engine, value, { codexModels, codexDefault });
  // The levels for the model the drawer is showing as picked, for this engine.
  const efforts: EffortChoice[] = onEffortChange ? effortChoicesFor(engine, value, { codexModels, codexDefault }) : [];
  // AND WHICH ONE IS LIT.So the strip lights her pick, and when she has not
  // picked, the level THIS model thinks at on its own, read out of the same
  // catalog its name came from. It moves when she changes the model above it,
  // because the answer really is per model.
  const lit = effortShown(effort, efforts, defaultEffortFor(engine, value, { codexModels, codexDefault }));

  useEffect(() => { onOpenChange?.(open); }, [open]);
  useKeepInWindow(wrap, open, [rows.length, efforts.length,showUpdate]);

  useEffect(() => {
    if (!open) return;
    setCursor(Math.max(0, rows.findIndex((m) => m.id === (value ?? fallback))));
    // Pointerdown, not click, and the same reason as the priority drawer: a
    // click aimed at the textarea should close this AND land the caret.
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, value, engine]);

  const pick = (id: string) => { onChange(id === fallback ? null : id); setOpen(false); };

  return (
    <span className="compose-word-wrap" ref={wrap}>
      {open && (
        <span className="prio-menu model-menu" role="listbox" aria-label="Model">
          {showUpdate&&<span className="model-update-row"><span>{updateEngine==='codex'?'Codex':'Claude Code'}</span><button type="button" title={`Update ${updateEngine==='codex'?'Codex':'Claude Code'} in the app terminal`} onClick={()=>{setOpen(false);start(updateEngine);}}>{update.state==='running'?'Updating…':'Update now'}</button></span>}
          {rows.map((m, i) => (
            <button
              key={m.id}
              role="option"
              aria-selected={m.id === (value ?? fallback)}
              className={`prio-menu-row ${i === cursor ? 'cursor' : ''} ${m.id === (value ?? fallback) ? 'on' : ''}`}
              onPointerEnter={() => setCursor(i)}
              onClick={() => pick(m.id)}
            >
              <span className="prio-menu-label">{m.label}</span>
            </button>
          ))}
          {onEffortChange && efforts.length > 0 && (
            <>
              <span className="model-menu-rule" role="separator" />
              <span className="effort-head" id="effort-head">Effort</span>
              <span className="effort-strip" role="radiogroup" aria-labelledby="effort-head">
                {efforts.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    role="radio"
                    aria-checked={e.id === lit}
                    className={e.id === lit ? 'on' : ''}
                    // The pick stays in the drawer: she may be here to set both
                    // the model and the level, and closing on the first would
                    // make her open it twice.
                    //
                    // AND THE TOGGLE IS AGAINST HER OWN PICK, NOT AGAINST WHAT
                    // IS LIT. Clicking the lit default therefore SETS it rather
                    // than clearing something she never chose, which is what
                    // somebody clicking a highlighted word means. Clicking a
                    // level she did choose still clears it, back to the model's
                    // own, and the strip looks the same either way.
                    onClick={() => onEffortChange(e.id === effort ? null : e.id)}
                  >{e.label}</button>
                ))}
              </span>
            </>
          )}
        </span>
      )}
      <button
        type="button"
        className={`compose-word ${value ? 'set' : ''} ${open ? 'open' : ''}`}
        title={title ?? 'Which model picks this up'}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open) {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(true);
            }
            return;
          }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % rows.length); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + rows.length) % rows.length); }
          if (e.key === 'Enter') { e.preventDefault(); if (rows[cursor]) pick(rows[cursor].id); }
        }}
      >{engineModelLabel(engine, value, { codexModels, codexDefault })}</button>
    </span>
  );
}
