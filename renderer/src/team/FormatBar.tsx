// THE BAR UNDER THE REPLY BOX IN A CHAT (drawing A, w-2e8aa16f0f).
//
// @, attach, a voice note and emoji, then Aa, which brings out bold, italic,
// strike, link, the two lists, quote and code. Square, monochrome, in the app's
// own materials: round one came back as "no colour, no rounded corners" and
// nothing here has either.
//
// IT IS ONLY EVER ON A CHAT. The reply box on a thread with an agent is a box
// you type an instruction into, and an instruction is not formatted; the bar
// there would be eleven controls that make the agent read asterisks.
//
// What each button does to the text is ./compose-format.ts, which is pure and
// pinned by a test, because where the caret ends up is the half of a formatting
// button that has no symptom when it is wrong.
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { EmojiPick } from './ChatActions';
import { useVoiceRecorder, type Arrival, type Recorded, type VoiceControl } from './useVoiceRecorder';
import { VOICE_MAX_MS, voiceClock } from './voice-note';
import './voice-note.css';
import { applyFormat, insertAt, type Format } from './compose-format';
import { CHAT_KEYS } from './chat-editor';
import type { RichBox } from './RichReply';
import './chat.css';
import { chord } from '../this-keyboard';

// EACH BUTTON SAYS ITS KEY when pointed at, the way Slack's do, so the keys
// are found from the bar rather than from somebody else telling you.
// TipTap's own spelling of a chord becomes the app's, and `chord` then says it
// in this keyboard's words (⌘⇧X here, Ctrl+Shift+X on Linux).
const KEYS_SHOWN: Partial<Record<Format, string>> = Object.fromEntries(Object.entries(CHAT_KEYS).map(([key, what]) => [
  what,
  chord(key.replace('Mod-', '⌘').replace('Shift-', '⇧').replace(/-?([a-z0-9])$/, (_m, k: string) => k.toUpperCase())),
]));

// The eight that write markdown, in the order the drawing has them, each with
// the glyph it wears. Stroked SVG rather than a letter where a letter would be
// ambiguous; B, I and S are drawn as type because that is what they are.
const WRITES: { what: Format; title: string; glyph: JSX.Element }[] = [
  { what: 'bold', title: 'Bold', glyph: <span className="fmt-letter fmt-b">B</span> },
  { what: 'italic', title: 'Italic', glyph: <span className="fmt-letter fmt-i">I</span> },
  { what: 'strike', title: 'Strikethrough', glyph: <span className="fmt-letter fmt-s">S</span> },
  { what: 'link', title: 'Link', glyph: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.4-2.4a2.6 2.6 0 0 0-3.7-3.7l-1 1" />
      <path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l1-1" />
    </svg>
  ) },
  { what: 'bullet', title: 'Bulleted list', glyph: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M6 4h8M6 8h8M6 12h8" />
      <path d="M2.6 4h.01M2.6 8h.01M2.6 12h.01" strokeWidth="1.8" />
    </svg>
  ) },
  { what: 'number', title: 'Numbered list', glyph: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5" />
      <path d="M2 2.9h.9V5M1.4 11.2h1.6L1.4 13h1.7" strokeWidth="1.1" />
    </svg>
  ) },
  { what: 'quote', title: 'Quote', glyph: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M2.6 3.4v9.2" strokeWidth="1.8" />
      <path d="M6 4.8h8M6 8h8M6 11.2h5" />
    </svg>
  ) },
  { what: 'code', title: 'Code', glyph: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="miter" aria-hidden="true">
      <path d="M5.6 4.4 1.8 8l3.8 3.6M10.4 4.4 14.2 8l-3.8 3.6" />
    </svg>
  ) },
];

// ATTACH IS A PAPERCLIP, NOT A PLUS (w-140ac855b1, 2026-10-13). The bar drew a
// +, and the person using it said "there doesn't seem to be an easy way to
// attach something" with that + on the screen in front of them. A + says "add"
// and could mean anything; a paperclip says attach. The thread panel's box
// draws the same one (./ThreadPanel.tsx).
export function ClipGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m13.6 7.6-5.5 5.5a3.4 3.4 0 0 1-4.8-4.8l5.6-5.6a2.3 2.3 0 0 1 3.3 3.3L6.6 11.6a1.15 1.15 0 0 1-1.6-1.6l5.1-5.1" />
    </svg>
  );
}

export function MicGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
      <rect x="5.8" y="1.8" width="4.4" height="8" rx="2.2" />
      <path d="M3.4 7.6a4.6 4.6 0 0 0 9.2 0M8 12.2v2.2" />
    </svg>
  );
}

// WHETHER THE MARKS ARE OUT. They wait behind Aa so the bar under the box is
// five quiet buttons, and stay out once you want them.
const MARKS_KEY = 'chat.formatting';
const marksWereOut = () => { try { return localStorage.getItem(MARKS_KEY) === '1'; } catch { return false; } };

// A note longer than this asks once before the cross throws it away.
const ASK_BEFORE_DISCARD_MS = 5000;

export function FormatBar({ box, onChange, onAttach, onVoice, onNotice, voiceKey = '', voice: control, onRecording }: {
  /** The reply box itself: the bar works on the selection that is in it. */
  box: { current: HTMLTextAreaElement | null };
  onChange: (text: string) => void;
  /** Open the file picker. Absent where there is nothing to attach to. */
  onAttach?: () => void;
  /** A voice note for the box. Absent where one cannot be sent. */
  onVoice?: (note: Recorded, how: Arrival) => void;
  /** Say something, such as the microphone being refused. */
  onNotice?: (text: string) => void;
  /** Which conversation and box a note belongs to, so one kept comes back to it. */
  voiceKey?: string;
  /** Filled in for the box, so Send can finish a note being recorded. */
  voice?: MutableRefObject<VoiceControl | null>;
  /** Whether a note is being recorded, which keeps the box open. */
  onRecording?: (on: boolean) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [marks, setMarks] = useState(marksWereOut);
  const canVoice = !!onVoice && !!voiceKey;
  const voice = useVoiceRecorder({
    key: canVoice ? voiceKey : '',
    onSay: (text) => onNotice?.(text),
    onDone: (note, how) => { onVoice?.(note, how); if (how === 'recorded') box.current?.focus(); },
  });
  if (control) control.current = canVoice ? { recording: voice.recording, finish: voice.finish, restore: voice.restore } : null;
  const recordingNow = voice.phase !== 'idle';
  useEffect(() => { onRecording?.(recordingNow); }, [recordingNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const [askDiscard, setAskDiscard] = useState(false);
  useEffect(() => {
    if (!askDiscard) return undefined;
    const t = setTimeout(() => setAskDiscard(false), 3000);
    return () => clearTimeout(t);
  }, [askDiscard]);
  useEffect(() => { if (!recordingNow) setAskDiscard(false); }, [recordingNow]);
  const discard = () => {
    if (voice.elapsed > ASK_BEFORE_DISCARD_MS && !askDiscard) { setAskDiscard(true); return; }
    setAskDiscard(false);
    voice.cancel();
  };
  const emojiWrap = useRef<HTMLSpanElement>(null);
  // THE BOX MAY BE THE EDITOR THAT SHOWS ITS FORMATTING (./RichReply.tsx), in
  // which case B makes the words bold rather than typing asterisks round them.
  const rich = () => (box.current as RichBox | null)?.rich ?? null;
  // A LINK NEEDS AN ADDRESS, and an editor has no brackets to leave the caret
  // in, so the button asks for it in a line of its own above the bar.
  const [asking, setAsking] = useState(false);
  const [href, setHref] = useState('');

  // EVERY BUTTON WORKS ON THE SELECTION THAT WAS IN THE BOX, which means the
  // box must not lose it. A plain button steals focus on mousedown and the
  // selection collapses before the click ever fires, so every press below is
  // prevented at mousedown and the focus is handed straight back afterwards.
  const onText = (make: (text: string, from: number, to: number) => { text: string; from: number; to: number }) => {
    const el = box.current;
    if (rich()) return;
    if (!el) return;
    const out = make(el.value, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length);
    onChange(out.text);
    // After React has written the new value, not before it: setting the range
    // on the old string puts the caret at a position in text that is gone.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(out.from, out.to);
    });
  };

  const hold = (e: React.MouseEvent) => e.preventDefault();

  const press = (what: Format) => {
    const editor = rich();
    if (!editor) { onText((text, from, to) => applyFormat(text, from, to, what)); return; }
    if (what === 'link') { setHref(''); setAsking(true); return; }
    editor.format(what);
  };
  const put = (what: string) => {
    const editor = rich();
    if (editor) editor.insert(what);
    else onText((text, from, to) => insertAt(text, from, to, what));
  };
  const linkDone = (apply: boolean) => {
    setAsking(false);
    if (apply) rich()?.link(href);
    else box.current?.focus();
  };

  const showMarks = (on: boolean) => {
    setMarks(on);
    try { localStorage.setItem(MARKS_KEY, on ? '1' : '0'); } catch { /* not kept */ }
  };
  // WHILE A NOTE RECORDS, THE BAR IS THE RECORDING: throw it away, how long it
  // has been, what the microphone hears, and done.
  if (voice.phase !== 'idle') {
    return (
      <div className="fmt-bar fmt-recording" role="toolbar" aria-label="Recording a voice note">
        <button type="button" className={`fmt-btn${askDiscard ? ' fmt-discard-ask' : ''}`} title={askDiscard ? 'Press again to discard' : 'Discard voice note'}
          aria-label={askDiscard ? 'Press again to discard the voice note' : 'Discard voice note'} onMouseDown={hold} onClick={discard}>
          {askDiscard
            ? <span className="fmt-discard-word">Discard?</span>
            : <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>}
        </button>
        <span className="voice-rec-dot" aria-hidden="true" />
        <span className="voice-rec-time">{voice.phase === 'asking' ? 'Waiting for the microphone' : `${voiceClock(voice.elapsed)} / ${voiceClock(VOICE_MAX_MS)}`}</span>
        <span className="voice-meter" aria-hidden="true">
          {Array.from({ length: 36 }, (_, i) => voice.levels[voice.levels.length - 36 + i] ?? 0).map((v, i) => (
            <span key={i} style={{ height: `${Math.round(Math.max(0.08, v) * 100)}%` }} />
          ))}
        </span>
        <button type="button" className="fmt-btn fmt-done" title="Done, add the voice note" aria-label="Done, add the voice note"
          disabled={voice.phase !== 'recording'} onMouseDown={hold} onClick={voice.stop}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" aria-hidden="true"><path d="M3.2 8.4l3.1 3 6.5-6.8" /></svg>
        </button>
      </div>
    );
  }

  return (
    <div className="fmt-bar" role="toolbar" aria-label="Formatting">
      {asking && (
        <input
          className="fmt-link-ask"
          autoFocus
          placeholder="Paste a link, then Return"
          aria-label="Link address"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onBlur={() => setAsking(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); linkDone(true); }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); linkDone(false); }
          }}
        />
      )}
      {/* WHAT PUTS SOMETHING INTO THE MESSAGE comes first; the marks that
          change what is already there wait behind Aa, after a gap. */}
      <button type="button" className="fmt-btn" title="Mention someone" aria-label="Mention someone"
        onMouseDown={hold} onClick={() => put('@')}>
        <span className="fmt-letter">@</span>
      </button>
      {onAttach && (
        <button type="button" className="fmt-btn" title="Attach a file" aria-label="Attach a file"
          onMouseDown={hold} onClick={onAttach}>
          <ClipGlyph />
        </button>
      )}
      {canVoice && (
        <button type="button" className="fmt-btn" title="Record a voice note" aria-label="Record a voice note"
          onMouseDown={hold} onClick={() => void voice.start()}>
          <MicGlyph />
        </button>
      )}
      <span className="fmt-emoji-wrap" ref={emojiWrap}>
        {picking && (
          <EmojiPick
            title="Add an emoji"
            onClose={() => setPicking(false)}
            onPick={(emoji) => { setPicking(false); put(emoji); }}
          />
        )}
        <button type="button" className="fmt-btn" title="Add an emoji" aria-label="Add an emoji"
          onMouseDown={hold} onClick={() => setPicking((was) => !was)}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="8" cy="8" r="6" />
            <path d="M5.8 6.4h.01M10.2 6.4h.01" strokeWidth="1.6" />
            <path d="M5.6 9.6c.6.8 1.4 1.2 2.4 1.2s1.8-.4 2.4-1.2" />
          </svg>
        </button>
      </span>
      <button type="button" className={`fmt-btn fmt-aa${marks ? ' on' : ''}`} title={marks ? 'Hide formatting' : 'Show formatting'}
        aria-label="Formatting marks" aria-pressed={marks} onMouseDown={hold} onClick={() => showMarks(!marks)}>
        <span className="fmt-letter">Aa</span>
      </button>
      {marks && <span className="fmt-gap" aria-hidden="true" />}
      {marks && WRITES.map(({ what, title, glyph }) => (
        <button
          key={what}
          type="button"
          className="fmt-btn fmt-mark"
          title={KEYS_SHOWN[what] ? `${title} (${KEYS_SHOWN[what]})` : title}
          aria-label={title}
          onMouseDown={hold}
          onClick={() => press(what)}
        >{glyph}</button>
      ))}
    </div>
  );
}
