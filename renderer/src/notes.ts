// The working notes: what an agent did, in its own words.
//
// Nothing new is recorded to make this. The supervisor already writes one trace
// per session under <product>/sessions/<item-id>/<startedAt>.log, and every
// line in it is either the agent narrating itself in plain English or a raw
// action. The narration IS the diary; the actions are the count under it and
// the thing behind "show everything it typed".
//
// This file is the ONLY copy of that reading. It is out of the component
// because what is MISSING from a diary has no symptom: a parser that quietly
// drops half the steps still draws a perfectly plausible panel, and the founder
// would be reading a confident, incomplete account of work she did not watch.
//
// The one rule it must never break: EVERY LINE HERE WAS TYPED BY THE AGENT.
// Nothing is summarised, inferred or smoothed. If the run said little, the
// panel says little (the fix for that is briefs/worker.md, not this file).

export interface Step {
  // Wall-clock, as the trace recorded it: "5:16pm".
  time: string;
  text: string;
  // Raw actions that ran under this step, before the agent said anything else.
  actions: number;
  // The last thing a failed run has to say for itself.
  failed?: boolean;
}

export interface Notes {
  steps: Step[];
  // Every tool call in the run: the 109 behind the eight sentences.
  actions: number;
  // Files written or edited, and work items filed. Counted, never guessed.
  files: number;
  filed: number;
  startedAt: number;
  // The moment the last session exited, or null while one is still running.
  endedAt: number | null;
  // TIME WORKED, which is not the same as time elapsed, and the difference is
  // measured in days on her real store: one item ran across 24 sessions over 45
  // hours, of which the agents were awake for a fraction. Elapsed would have
  // said "101 steps in 44h 57m", which reads as a machine grinding for two days
  // on one row. This is the sum of each session's own life.
  worked: number;
  // Set while a session is still running, so a live panel can add the time
  // since it started without the caller knowing how sessions add up.
  openSince: number | null;
  failed: boolean;
  // What went wrong, in words rather than an API error code.
  failure: string | null;
  sessions: number;
  raw: string;
}

export interface TraceSession { startedAt: number; text: string }

const LINE = /^(\d\d):(\d\d):(\d\d) {2}(.*)$/;
const EXIT = /^# exited \((-?\d+)\)(?:\s+(\S+))?/;

// "17:16:04" as the founder reads a clock.
function clock(h: number, m: number): string {
  const suffix = h < 12 ? 'am' : 'pm';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')}${suffix}`;
}

// THE TRACE'S CLOCK IS UTC AND CARRIES NO DATE. The supervisor stamps every
// line with `new Date.toISOString.slice(11, 19)` (supervisor.mjs), so a step
// she watched at 10:01pm is written "05:01:32", and printing those digits
// straight out put her own evening seven hours into the morning: the fold on
// read 5:01am, 6:39am, 12:15am, 4:29am for one continuous run. The session's
// own startedAt supplies the missing date, and the moment comes back as a real
// one; the day rolls forward when a run crosses midnight UTC.
//
// AGAINST THE START'S WHOLE SECOND, because the stamp has none smaller. A run
// spawned at 18:30:28.097 whose only line read "18:30:28" was 97ms "before"
// it began, so that line was put on the next day, and a message from tomorrow
// sat under everything the next run wrote (2026-10-04). The store's practice
// traces floored their start for the same reason; this is the reader's copy.
export function momentOf(startedAt: number, h: number, m: number, s: number): number {
  const began = new Date(startedAt);
  const at = Date.UTC(began.getUTCFullYear(), began.getUTCMonth(), began.getUTCDate(), h, m, s);
  return at < Math.floor(startedAt / 1000) * 1000 ? at + 86_400_000 : at;
}

// The same moment, in the time zone she is sitting in.
function hers(at: number): string {
  const d = new Date(at);
  return clock(d.getHours(), d.getMinutes());
}

// A step is one sentence she can read, not a wall. Workers end a session by
// typing their whole result into the transcript, and that result is already on
// screen above the notes; only its opening survives here, and the duplicate is
// dropped outright below.
function firstParagraph(text: string): string {
  const para = text.split(/\n\s*\n/)[0].trim();
  if (para.length <= 300) return para;
  const cut = para.slice(0, 300);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return `${(stop > 120 ? cut.slice(0, stop + 1) : cut).trim()}…`;
}

// The sign-off and the result are the same words, but never the same LENGTH:
// the trace records the message the agent typed, and the result block records
// it again truncated (and sometimes the other way round). So they are compared
// on whichever opening is shorter, with enough of it to be sure.
function sameOpening(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/[\s*_`#]+/g, ' ').trim().toLowerCase();
  const [x, y] = [norm(a), norm(b)];
  const width = Math.min(x.length, y.length, 60);
  if (width < 25) return false;
  return x.slice(0, width) === y.slice(0, width);
}

// Claude's own failure text, said the way she would say it. Anything we have
// not met keeps the words it arrived in, minus the "API Error:" label: an
// unrecognised failure must never be softened into a friendlier lie.
export function humanFailure(text: string): string {
  const raw = text.trim();
  if (!raw) return 'The run stopped without saying why.';
  if (/usage limit|rate.?limit|quota/i.test(raw)) {
    const reset = raw.match(/resets? at ([^.\n]+)/i)?.[1];
    return `Claude turned the session away: the usage limit is used up${reset ? `, and resets at ${reset.trim()}` : ''}.`;
  }
  if (/went to sleep mid-response/i.test(raw)) {
    return 'Your computer went to sleep mid-response, so the agent was cut off part-way.';
  }
  if (/credit balance|insufficient/i.test(raw)) return 'Claude refused the session: the account is out of credit.';
  return raw.replace(/^API Error:\s*/i, '').split('\n')[0].slice(0, 300);
}

function readSession(session: TraceSession) {
  const steps: Step[] = [];
  const files = new Set<string>();
  let actions = 0;
  let filed = 0;
  let current: Step | null = null;
  let inResult = false;
  let resultText = '';
  let resultFailed = false;
  let exitCode: number | null = null;
  let endedAt: number | null = null;
  // The moment the run reported a result, for the sessions that never got an
  // exit line written for them: a killed worker leaves its RESULT and nothing
  // after it, and calling that session still open made its span grow while she
  // read it (two of the nine runs on claimed 8h 37m and 6h 37m of work that
  // took minutes).
  let saidAt: number | null = null;

  for (const line of session.text.split('\n')) {
    const stamped = LINE.exec(line);
    if (!stamped) {
      const exit = EXIT.exec(line);
      if (exit) {
        exitCode = Number(exit[1]);
        const at = Date.parse(exit[2] ?? '');
        if (!Number.isNaN(at)) endedAt = at;
        current = null;
        continue;
      }
      if (line.startsWith('#')) continue;
      if (inResult) { resultText += `${line}\n`; continue; }
      // A narrated step that ran onto more lines. Only prose continues a step;
      // once an action has intervened there is nothing to continue.
      if (current && line.trim()) current.text += `\n${line}`;
      continue;
    }

    const body = stamped[4];

    if (body.startsWith('== RESULT')) {
      inResult = true;
      saidAt = momentOf(session.startedAt, Number(stamped[1]), Number(stamped[2]), Number(stamped[3]));
      resultFailed = /ERROR/.test(body) || /error/i.test(body.match(/\(([^)]*)\)/)?.[1] ?? '');
      current = null;
      continue;
    }
    inResult = false;

    if (body.startsWith('[')) {
      const close = body.indexOf(']');
      const tool = close > 0 ? body.slice(1, close) : '';
      const hint = close > 0 ? body.slice(close + 1).trim() : '';
      actions += 1;
      if (current) current.actions += 1;
      if (/^(Write|Edit|NotebookEdit)$/.test(tool) && hint) files.add(hint);
      if (/create_work_item/.test(tool)) filed += 1;
      continue;
    }
    if (body.startsWith('stderr:')) continue;
    if (!body.trim()) continue;

    current = {
      time: hers(momentOf(session.startedAt, Number(stamped[1]), Number(stamped[2]), Number(stamped[3]))),
      text: body,
      actions: 0,
    };
    steps.push(current);
  }

  // The sign-off is the result, and the result is already printed above the
  // notes. Printing it again as the final step is how a two-line panel became
  // a page.
  const last = steps[steps.length - 1];
  if (last && resultText && sameOpening(last.text, resultText)) steps.pop();

  for (const step of steps) step.text = firstParagraph(step.text);

  // A run that said its result is over, whether or not anything wrote its exit
  // line: the supervisor writes that line after the CLI returns, and a killed
  // one never returns.
  if (endedAt === null && saidAt !== null) endedAt = saidAt;

  const failed = resultFailed || (exitCode !== null && exitCode !== 0);
  if (failed) {
    const said = humanFailure(resultText);
    steps.push({
      time: endedAt ? hers(endedAt) : '',
      text: said,
      actions: 0,
      failed: true,
    });
  }

  return { steps, actions, files, filed, failed, endedAt, exitCode };
}

// Every session that has run on this item, read as one diary in the order it
// happened. A continuation is not a new story; it is the next few lines of
// this one.
export function readNotes(sessions: TraceSession[]): Notes | null {
  const ordered = [...sessions].filter((s) => s && s.text).sort((a, b) => a.startedAt - b.startedAt);
  if (!ordered.length) return null;

  const steps: Step[] = [];
  const files = new Set<string>();
  let actions = 0;
  let filed = 0;
  let failed = false;
  let failure: string | null = null;
  let endedAt: number | null = null;
  let worked = 0;
  let openSince: number | null = null;

  for (const session of ordered) {
    const read = readSession(session);
    steps.push(...read.steps);
    read.files.forEach((f) => files.add(f));
    actions += read.actions;
    filed += read.filed;
    // Only the LAST run's fate is this item's fate: a first attempt that died
    // and a second that finished is a finished item, not a failed one.
    failed = read.failed;
    failure = read.failed ? read.steps[read.steps.length - 1]?.text ?? null : null;
    endedAt = read.endedAt;
    if (read.endedAt) { worked += Math.max(0, read.endedAt - session.startedAt); openSince = null; }
    else openSince = session.startedAt;
  }

  return {
    steps,
    actions,
    files: files.size,
    filed,
    startedAt: ordered[0].startedAt,
    endedAt,
    worked,
    openSince,
    failed,
    failure,
    sessions: ordered.length,
    raw: ordered.map((s) => s.text).join('\n'),
  };
}

// "5 minutes", "3 seconds", "1h 12m". Never a bare number of milliseconds and
// never a rounded-up lie: 90 seconds is "1 minute", not "2 minutes".
export function spanLabel(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// How long the agents were actually awake on this item.
export function workedFor(notes: Notes, now = Date.now()): number {
  return notes.worked + (notes.openSince ? Math.max(0, now - notes.openSince) : 0);
}

// The one line the notes wear when they are closed. It says what the run did,
// or, on a run that did not finish, that it did not finish. A run that narrated
// nothing counts what it can count instead of announcing "0 steps".
export function closedLine(notes: Notes, now = Date.now()): string {
  const span = spanLabel(workedFor(notes, now));
  if (notes.failed) return `what happened · stopped after ${span}`;
  const count = notes.steps.length;
  if (!count) return `what it did · ${notes.actions} action${notes.actions === 1 ? '' : 's'} in ${span}, none of them said out loud`;
  return `what it did · ${count} step${count === 1 ? '' : 's'} in ${span}`;
}

// The footer under the opened list: only what was counted. "no code touched" is
// a claim about a repo nobody read, so it is never said here; a zero simply
// does not appear.
export function tallyLine(notes: Notes, now = Date.now()): string {
  const parts = [spanLabel(workedFor(notes, now))];
  const count = notes.steps.length;
  if (count) parts.push(`${count} step${count === 1 ? '' : 's'}`);
  // A run that never got a tool call away read nothing and changed nothing, and
  // that is the most useful thing this line can say about it. "0 actions" is
  // the same fact written as a broken counter.
  parts.push(notes.actions ? `${notes.actions} action${notes.actions === 1 ? '' : 's'}` : 'nothing read, nothing changed');
  if (notes.files) parts.push(`${notes.files} file${notes.files === 1 ? '' : 's'} written`);
  if (notes.filed) parts.push(`${notes.filed} task${notes.filed === 1 ? '' : 's'} filed`);
  if (notes.sessions > 1) parts.push(`${notes.sessions} sessions`);
  return parts.join(' · ');
}

// What the agent is doing RIGHT NOW, out of the live tail the supervisor
// streams. The tail carries summarised actions ("tool: Bash") beside the
// agent's own sentences; only the sentences are steps.
export function liveStep(tail: string[] | undefined): string | null {
  if (!tail?.length) return null;
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const line = (tail[i] ?? '').trim();
    if (!line) continue;
    if (/^(tool:|stderr:|done:|session exited|fast exit)/.test(line)) continue;
    return firstParagraph(line);
  }
  return null;
}
