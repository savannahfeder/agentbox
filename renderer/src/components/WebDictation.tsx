// Talking into a message in the web app (dictation.ts, web-speech.ts), as the
// phone app does it (mobile/src/ui/Dictation.tsx): the microphone, and while it
// listens, Stop to keep the words in the box and Send to send them.
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { dictation, IDLE, type Listening as Heard } from '../dictation';
import { dictationAllowedNow, onDictationAllowed, webSpeech } from '../web-speech';

const speech = typeof window === 'undefined' ? null : webSpeech(window as never);

export type Talk = Heard & {
  /** A paid plan, on a browser that can listen. */
  allowed: boolean;
  on: boolean;
  start: () => void;
  stop: () => void;
  send: () => void;
  /** The person typed while it listens: off, with the words already in the box. */
  typed: () => void;
};

/** Dictation into `box`; `send` runs once the last words are in it. */
export function useWebDictation(box: { text: string; setText: (text: string) => void; field: RefObject<HTMLTextAreaElement | null> }, send: () => void): Talk {
  const latest = useRef(box);
  latest.current = box;
  const paid = useSyncExternalStore(onDictationAllowed, dictationAllowedNow, dictationAllowedNow);
  const [now, setNow] = useState<Heard>(IDLE);
  const wrote = useRef(false);
  const [ctl] = useState(() => speech && dictation({
    speech,
    box: { read: () => latest.current.text, write: (text) => { wrote.current = true; latest.current.setText(text); } },
    changed: setNow,
  }));
  // A value written by code does not move the box's view, so once the box is
  // full the newest words would land out of sight below it. This runs after
  // the effects a caller declares before this hook, such as one growing the box.
  useEffect(() => {
    if (!wrote.current) return;
    wrote.current = false;
    const field = latest.current.field.current;
    if (field) field.scrollTop = field.scrollHeight;
  });
  // The send waits a render, so it reads the box with the last words in it.
  const [sending, setSending] = useState(false);
  const sendLatest = useRef(send);
  sendLatest.current = send;
  useEffect(() => { if (sending) { setSending(false); sendLatest.current(); } }, [sending]);

  useEffect(() => {
    if (!ctl) return;
    const away = () => { if (document.visibilityState === 'hidden') ctl.leave(); };
    document.addEventListener('visibilitychange', away);
    return () => { document.removeEventListener('visibilitychange', away); ctl.leave(); };
  }, [ctl]);

  return {
    ...now,
    allowed: !!ctl && paid,
    on: now.phase !== 'idle',
    // The box takes the cursor, at the end where the words go, which also puts the
    // keyboard's own microphone to hand. Tapping the box goes on listening; typing
    // stops it, so the two never write over each other.
    start: () => {
      const field = latest.current.field.current;
      if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
      void ctl?.start();
    },
    stop: () => ctl?.stop(),
    send: () => { void ctl?.finish().then(() => setSending(true)); },
    typed: () => { if (ctl?.now.phase !== 'idle') ctl?.leave(); },
  };
}

export function MicButton({ talk }: { talk: Talk }) {
  return (
    <button type="button" className="dictate-mic" aria-label="Dictate" title="Dictate" onClick={talk.start}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11.5" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
      </svg>
    </button>
  );
}

/** Four bars that follow the voice. */
function Level({ level }: { level: number }) {
  return (
    <span className="dictate-level" aria-hidden="true">
      {[0.55, 1, 0.75, 0.4].map((k, i) => <i key={i} style={{ height: Math.max(3, Math.round(14 * Math.min(1, 0.2 + level * k))) }} />)}
    </span>
  );
}

/** What takes the place of a box's foot while it listens. */
export function Listening({ talk }: { talk: Talk }) {
  const finishing = talk.phase === 'finishing';
  return (
    <span className="dictate-row" role="status">
      <span className="dictate-dot" aria-hidden="true" />
      <Level level={talk.level} />
      <span className="dictate-word">{talk.phase === 'listening' ? 'Listening' : finishing ? 'Finishing' : 'Starting'}</span>
      <button type="button" className="dictate-button" aria-label="Stop dictating" onClick={talk.stop} disabled={finishing}>Stop</button>
      <button type="button" className="dictate-button strong" aria-label="Send what you said" onClick={talk.send} disabled={finishing}>Send</button>
    </span>
  );
}
