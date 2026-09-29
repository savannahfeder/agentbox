// The founder's standing instructions: rules she writes once that every
// session is briefed with, ahead of its own brief.
//
// One text box over one file (briefs/founder.md). No rule list, no per-product
// scoping, no enable toggles: the fleet is a room full of capable readers, and
// what they need is the user's own words, not a schema to fill in. The supervisor
// injects the text at the single point every session's arguments are built, so
// workers, the dispatcher, digests and her own personal tasks all get it.
//
// It saves as she types, because the alternative is a rule she believed she had
// set sitting unsaved behind an Apply button while the fleet works without it.

import { useEffect, useRef, useState } from 'react';
import { NAME } from '../../../shared/product-name.mjs';

type Save = 'idle' | 'saving' | 'saved' | 'failed';

// A renderer can outrun the main process it is talking to: ⌘R reloads the page
// but keeps the running main process, so a window built after a new IPC channel
// existed can be attached to a main process that has never heard of it. Say
// that in words she can act on rather than repeating Electron's sentence about
// registered handlers.
export const RESTART = `quit and reopen ${NAME} to edit these`;
export const isMissingHandler = (message: string) => /No handler registered/i.test(message);

// The box is one mechanism over two files. Her standing instructions are the
// rules she writes; the writing rules are the ones the app ships and she may
// rewrite or empty. Same box, same saving, same failure sentence: two
// components would drift, and the second one would be the one that quietly
// stopped saving. The channels are looked up when the box opens, never at
// module load: a window reloaded onto an older main process has to be able
// to see that the handler is missing and say so, which a captured undefined
// cannot.
export type Instructions = {
  // The one line of English in the footer, which is the only label the card
  // has. It says which box this is and what typing in it does, in that order,
  // because those are the two things she cannot get from the text on screen.
  sentence: string;
  placeholder: string;
  reader: () => (() => Promise<{ text: string; error?: string }>) | undefined;
  writer: () => ((p: { text: string }) => Promise<{ ok: boolean; error?: string }>) | undefined;
};

export const STANDING: Instructions = {
  // The same name as the ⌘K row and the Settings box
  // (w-3dc46f3a67). Three surfaces onto one file said three different things.
  sentence: 'General agent instructions. Every agent reads them before your task, on every project.',
  placeholder: 'Don\'t hand me summary .md files. Put the answer on the work item.',
  reader: () => window.zero?.standingRead,
  writer: () => window.zero?.standingWrite,
};

// THE SECOND FILE, AND IT USED TO BE TWO (w-3dc46f3a67, 2026-09-22). One box
// said how agents write during a task and another said how they end one, which
// is a seam in our code and not a distinction anybody makes while typing. The
// sentence says the one thing a stranger cannot get from the text on screen:
// that this reaches every run, not only the ones that got the worker brief.
export const MESSAGE_RULES: Instructions = {
  sentence: 'How agents write to you. Every task, every kind. Empty the box and they follow none of it.',
  placeholder: 'Open with what happened and what you need from me.',
  reader: () => window.zero?.messageRulesRead,
  writer: () => window.zero?.messageRulesWrite,
};

export function Standing({ kind = STANDING, onClose }: { kind?: Instructions; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [save, setSave] = useState<Save>('idle');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | null>(null);
  // What is on disk, so closing can flush a pending edit exactly once.
  const pending = useRef<string | null>(null);

  useEffect(() => {
    const read = kind.reader();
    // A window that cannot reach the file must not leave her typing into a box
    // that will never save. It says so ).
    if (!read) { setText(''); setSave('failed'); setError(RESTART); return; }
    read()
      .then((r) => { setText(r?.text ?? ''); if (r?.error) { setSave('failed'); setError(r.error); } })
      .catch(() => { setText(''); setSave('failed'); setError(RESTART); });
  }, []);

  // Focused at the TOP, caret before the first word. A textarea handed several
  // pages of text focuses at the end of it, and the writing rules are thirteen
  // thousand characters: opening the box would show her the middle of the last
  // sentence in the file and nothing that says what she is looking at.
  useEffect(() => {
    if (text === null) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, 0);
    el.scrollTop = 0;
  }, [text !== null]);

  const flush = async (value: string) => {
    setSave('saving');
    try {
      const write = kind.writer();
      if (!write) throw new Error('this window cannot reach the instructions file');
      const r = await write({ text: value });
      if (r && r.ok === false) throw new Error(r.error || 'could not save');
      pending.current = null;
      setSave('saved');
      setError(null);
    } catch (e: any) {
      // A rule she thinks the fleet has and it does not is the whole failure
      // mode this feature can have, so a failed save says so on screen. In the
      // footer's voice, not in red: she cannot do anything about it from here
      // beyond the one thing this line asks for.
      const message = String(e?.message ?? e);
      setSave('failed');
      setError(isMissingHandler(message) ? RESTART : message);
    }
  };

  const edit = (value: string) => {
    setText(value);
    pending.current = value;
    setSave('saving');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(value), 400);
  };

  const close = () => {
    if (timer.current) window.clearTimeout(timer.current);
    // Whatever was typed in the last 400ms goes to disk before the box does.
    if (pending.current !== null) flush(pending.current).finally(onClose);
    else onClose();
  };

  const status = save === 'failed' ? (error ?? 'not saved')
    : save === 'saving' ? 'saving…'
    : save === 'saved' ? 'saved'
    : kind.sentence;

  // THE NEW-TASK CARD, WITH RULES IN IT INSTEAD OF A TASK.
  //
  // So this card is not a new look, it is that card: `modal compose` carries
  // the width, the sharp corner, the theme fill (`--skin-solid`) and the
  // footer rule for free, which is what `styles.css` already said the way
  // through was: a card that should be on theme takes this same token, not a
  // new idea. Three things came off in the process, and each was a box-inside
  // -a-box the other cards do not have: the heading and lede stack over the
  // text, the border around the textarea, and the typewriter face on words
  // that are English sentences. What is left is text on the card and one line
  // of English under it, which is the new-task card's whole grammar.
  return (
    <div className="modal-backdrop compose-backdrop" onClick={close}>
      <div className="modal compose rules-card" onClick={(e) => e.stopPropagation()}>
        <textarea
          ref={ref}
          className="rules-text"
          spellCheck={false}
          value={text ?? ''}
          placeholder={text === null ? 'loading…' : kind.placeholder}
          disabled={text === null}
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => {
            // Escape closes; Enter is a newline, because these are sentences.
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            e.stopPropagation();
          }}
        />
        {/* The footer sentence, and the app's own button on the right of it:
            the same footer grammar as the new-task card and the new-project
            card. It says Done rather than Save because the box has already
            saved by the time she reads it. */}
        <div className="rules-sentence">
          <span className="rules-clauses">{status}</span>
          <button type="button" className="dock-send" onClick={close}>
            Done <kbd>esc</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
