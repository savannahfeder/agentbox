// PURE. The lines an agent typed, read out of the trace on disk.
//
// EVERY ONE OF THEM ENDS UP IN THE CONVERSATION NOW, which is the whole of
// what this file is for. It used to feed a block of its own at the top of a
// running task, with a window of three lines and a sentence it shut to. The
// block is gone and its four label helpers went with it; what is left is the
// reading, and item-thread.ts turns the result into thread events (a sentence
// is a message, an action is a quiet line under it).
//
// The reading is its own file because what is MISSING from a feed has no
// symptom: a parser that quietly drops half the lines still draws a perfectly
// plausible conversation. Same reason notes.ts is its own file, and the two
// read the same trace for two different purposes — that one keeps the
// SENTENCES the agent wrote, this one keeps every line it typed.
import { momentOf, type TraceSession } from './notes';

export interface TraceLine {
  // "9:12:04", in the time zone she is sitting in.
  time: string;
  // The same moment as a real one. The trace's own clock is UTC and carries no
  // date, so this is the only place the date is known (`momentOf` borrows it
  // from the session's startedAt). item-thread.ts needs it because a work line
  // inside a conversation has to sit under the right day heading.
  at: number;
  // What the agent said, what it ran, or the reason it stopped.
  kind: 'say' | 'tool' | 'stopped';
  text: string;
}

const STAMPED = /^(\d\d):(\d\d):(\d\d) {2}(.*)$/;
const EXIT = /^# exited \((-?\d+)\)/;

// The trace's clock is UTC and carries no date (supervisor.mjs stamps every
// line with toISOString.slice(11, 19)), so a local 10pm can be written "05:00:12".
// The session's own startedAt supplies the missing date; notes.ts owns that
// arithmetic and this borrows it rather than keeping a second copy.
function hers(startedAt: number, h: number, m: number, s: number): string {
  const d = new Date(momentOf(startedAt, h, m, s));
  const hour = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  return `${hour}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// WHAT IT RAN is one row and one line, so a command written across several
// lines keeps its words and loses its breaks. The cap is the safety net on a
// tool argument, not on anything she reads as prose; `workSubject` shortens
// this properly downstream and `full` carries the whole of it.
function oneLine(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= 300 ? clean : `${clean.slice(0, 300).trim()}…`;
}

// This used to run through `oneLine` too, and that was left over from when
// these lines fed a terminal panel with a three-line window. They are her
// agent's MESSAGES now, drawn as the body of the conversation, and a message
// cut at 300 characters is the answer thrown away.
//
// MEASURED ON A REAL STORE of about fifteen hundred traces: roughly one agent
// message in twelve was cut, well over a million characters were discarded,
// and the worst showed 4.2% of itself. Some were cut TWICE and came out ending
// `.……` — seven dots, the tail seen on screen: each continuation line re-truncated an
// already-truncated string and stacked another ellipsis on it.
//
// The breaks stay too. Collapsing them is what ran "Merged and closed." into
// the paragraph under it, and the pane renders markdown (`md` in Focus.tsx, no
// remark-breaks), so a blank line is a paragraph and a single newline inside
// one is already a space. Keeping the trace's own lines verbatim is therefore
// the message exactly as the agent wrote it, fenced blocks included. Exported
// because the LIVE copy of a sentence has to be compared against the traced
// one, and a second normaliser is a second answer to "are these the same
// words".
export function said(text: string): string {
  return text.replace(/[^\S\n]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Every line one session typed, in the order it typed them.
 *
 * What is deliberately not here: the `#` header the supervisor writes, its
 * `stderr:` noise, and the RESULT block at the end. The result is the message
 * already printed above this block in the pane, and printing it twice — once as
 * the answer and again as the last forty lines of the terminal — is the thing
 * that made the old panel unreadable.
 */
export function traceLines(session: TraceSession): TraceLine[] {
  const lines: TraceLine[] = [];
  let inResult = false;
  let exited = false;
  // How many blank lines have gone by since the last line of prose, so a
  // paragraph break survives and a run of them does not become a gap.
  let blanks = 0;

  for (const raw of (session?.text ?? '').split('\n')) {
    const stamped = STAMPED.exec(raw);
    if (!stamped) {
      if (EXIT.test(raw)) { exited = true; inResult = false; continue; }
      if (raw.startsWith('#')) continue;
      if (inResult || exited) continue;
      // A sentence that ran onto another line continues the row above it, and
      // a BLANK line between two of them is a paragraph break written on
      // purpose. It used to be dropped, which is why "Merged and closed." and
      // the paragraph under it arrived as one run-on line on her screen.
      const last = lines[lines.length - 1];
      if (!last || last.kind !== 'say') continue;
      if (!raw.trim()) { blanks += 1; continue; }
      last.text = said(`${last.text}${blanks ? '\n\n' : '\n'}${raw}`);
      blanks = 0;
      continue;
    }

    blanks = 0;
    const body = stamped[4];
    const at = momentOf(session.startedAt, Number(stamped[1]), Number(stamped[2]), Number(stamped[3]));
    const time = hers(session.startedAt, Number(stamped[1]), Number(stamped[2]), Number(stamped[3]));

    if (body.startsWith('== RESULT')) { inResult = true; continue; }
    inResult = false;
    if (body.startsWith('stderr:')) continue;
    if (!body.trim()) continue;

    const kind = body.startsWith('[') ? 'tool' : 'say';
    lines.push({ time, at, kind, text: kind === 'tool' ? oneLine(body) : said(body) });
  }

  return lines;
}
