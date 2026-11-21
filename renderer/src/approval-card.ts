// WHAT THE APPROVAL CARD SAYS, AND THE ONLY COPY OF THAT RULE.
//
// One card draws two very different questions now. A command approval asks her
// to let something RUN; a Codex file-change approval asks her to let something
// CHANGE, and it carries paths and a diff rather than a line of shell. The card
// used to hardcode "asks to run" above both, so a patch reached her as a
// sentence that was simply false about the thing under it.
//
// It also ended `input.command ?? input.file_path ?? JSON.stringify(input)`,
// which put a blob of JSON in front of the founder for any shape neither key
// covered.
//
// This is out of App.tsx for the reason renderer/src/list-rules.ts is: what a
// card FAILS to say has no symptom. Every card it draws looks plausible, and
// the cost of a wrong one is a yes she did not mean.
//
// THE CLAUDE CARD MUST NOT MOVE. Its two live shapes are a `Bash` card carrying
// `command` and a `Read(**/.env*)` card carrying `file_path`
// (worker-permissions.json is the whole ask-list), and both come out of here
// byte for byte as they came out of App.tsx before this file existed.

/** What is drawn when there is nothing readable to draw. Not JSON, and not a
 *  blank box either: it is a sentence, and the honest answer to it is Deny. */
import { Name } from '../../shared/product-name.mjs';
import { keyLabel } from '../../shared/cloud-keys.mts';
import { keySource, keySourceWords } from '../../shared/cloud-key-sources.mts';
export const UNREADABLE = `${Name} could not read what this asks for.`;
/** The `tool` of a cloud run's key card: main/cloud/key-asks.mts KEY_CARD. */
export const KEY_CARD_TOOL = 'cloud_key';

export type ApprovalReading = {
  /** The half-sentence after the product's name in the card's head. */
  what: string;
  /** What is authorised, exact. */
  body: string;
};

/** The thread that asks, which is what a person knows it by; else its project. */
export const approvalAsker = (thread: string | null | undefined, project: string) => thread || project;

/**
 * The body as the card's `<pre>` draws it. A tool call's lines break where the
 * agent broke them; every other escape stays visible, so a yes is about what it
 * says. A native card's body is not JSON and is drawn as it came.
 */
export const approvalShown = (body: string, tool?: string) => (/^mcp__/.test(tool ?? '')
  ? body.replace(/\\[\s\S]/g, (pair) => (pair === '\\n' ? '\n' : pair))
  : body);

/**
 * WHAT A PHONE IS TOLD AFTER IT ANSWERS (F-115). The stamp on the leaving card
 * is at full strength for about 170ms, which a laptop catches and a phone does
 * not; the toast outlasts it. It says what follows from the press rather than
 * the word alone, because "Denied" leaves open whether the agent heard.
 */
export const approvalAnswered = (allow: boolean) =>
  (allow ? 'Allowed. The agent carries on.' : 'Denied. The agent carries on without it.');

/**
 * One approval's `input`, as the two lines her eye actually lands on.
 *
 * `changes` is first because it is the only key that says the question is about
 * files rather than a command; main/codex-approvals.mts is the one place that
 * writes it, already capped and already marked where it was cut.
 *
 * `host` IS BEHIND `command`, AND THE ORDER IS THE POINT. A network approval
 * usually arrives WITH a command, and then the command is the thing she is
 * answering about and the host is the extra line beside it, drawn the way `cwd`
 * is. But `CommandExecutionRequestApprovalParams.command` is nullable, and such
 * a request used to be refused outright even where the host was there to show
 * -- so a card carrying only a host is a real card now, and "asks to run" over
 * one would be the card lying about the question it is asking.
 */
export function approvalReads(input: unknown, tool?: string): ApprovalReading {
  // MCP argument names are arbitrary: "command" or "host" is not native
  // permission metadata. Keep the existing card, name the server/tool, and
  // show each argument separately with lossless JSON escaping for its value.
  const mcp = /^mcp__(.+)__(.+)$/.exec(tool ?? '');
  if (mcp) {
    const identity = `${mcp[1]} / ${mcp[2]}`;
    let argumentsText = UNREADABLE;
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      try {
        const fields = Object.entries(input).map(([key, value]) => {
          const rendered = JSON.stringify(value, null, 2);
          if (rendered === undefined) throw new Error('Unreadable argument');
          return `${key}: ${rendered}`;
        });
        argumentsText = fields.length ? fields.join('\n\n') : 'No arguments.';
      } catch { /* Malformed input stays explicitly unreadable. */ }
    }
    return { what: 'asks to use', body: `${identity}\n\n${argumentsText}` };
  }
  const it = (input ?? {}) as Record<string, unknown>;
  if (typeof it.changes === 'string' && it.changes) return { what: 'asks to change', body: it.changes };
  if (typeof it.command === 'string') return { what: 'asks to run', body: it.command };
  if (typeof it.host === 'string' && it.host) return { what: 'asks to reach', body: it.host };
  if (typeof it.file_path === 'string') return { what: 'asks to run', body: it.file_path };
  return { what: 'asks to run', body: UNREADABLE };
}

export type DiffLine = { mark: 'add' | 'del' | 'head' | 'same'; text: string };
export type ApprovalView = {
  /** What it wants, in words: the worker's own description when it sent one. */
  title: string;
  body:
    | { kind: 'text'; text: string }
    | { kind: 'diff'; lines: DiffLine[]; added: number; removed: number }
    | { kind: 'fields'; rows: [string, string][] };
  /** Where, or with what, in one quiet line; null when there is nothing to add. */
  where: string | null;
};

const base = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p;
const words = (name: string) => name.replace(/[_-]+/g, ' ').trim();
const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * A folder as a person names it. A thread's own task folder is a copy of its
 * repository, and the home folder is ~. The full path stays on the card's hover.
 */
export function folderWords(cwd: string): string {
  const copy = /^(.*)\/\.claude\/worktrees\/[^/]+\/?$/.exec(cwd);
  if (copy) return `In this thread’s copy of ${base(copy[1])}`;
  const short = cwd.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, '~');
  // Past one line of the card, the end is kept: it is the part that says where.
  if (short.length <= 53) return `In ${short}`;
  return `In …/${short.replace(/\/+$/, '').split('/').slice(-2).join('/')}`;
}

// A string is shown as written unless something in it would not show (a tab,
// a control character): then it is shown escaped, so a yes is about what it says.
const shown = (v: unknown): string => {
  if (typeof v === 'string') return /[\u0000-\u0008\u000b-\u001f\u007f]/.test(v) ? JSON.stringify(v) : v;
  if (Array.isArray(v) && v.every((x) => typeof x === 'string' && !x.includes(','))) return v.join(', ');
  const out = JSON.stringify(v, null, 2);
  if (out === undefined) throw new Error('Unreadable argument');
  return out;
};

const FILE_HEAD = /^(Edit|Write|Delete|Update|Add|Move) (.+)$/;

function changeView(changes: string): ApprovalView {
  const lines: DiffLine[] = [];
  const files: { verb: string; path: string }[] = [];
  let added = 0;
  let removed = 0;
  for (const line of changes.split('\n')) {
    const head = FILE_HEAD.exec(line);
    // A block starts at a verb line, which follows the start or a blank line (main/codex-approvals.mjs).
    if (head && (lines.length === 0 || lines[lines.length - 1].text === '')) {
      files.push({ verb: head[1], path: head[2] });
      lines.push({ mark: 'head', text: line });
    } else if (line.startsWith('@@')) continue;
    else if (line.startsWith('+') && !line.startsWith('+++')) { added += 1; lines.push({ mark: 'add', text: line.slice(1) }); }
    else if (line.startsWith('-') && !line.startsWith('---')) { removed += 1; lines.push({ mark: 'del', text: line.slice(1) }); }
    else lines.push({ mark: 'same', text: line });
  }
  const one = files.length === 1 ? files[0] : null;
  const moved = one?.verb === 'Move' ? one.path.split(' -> ') : null;
  const title = !one ? `Change ${files.length || 'some'} files`
    : moved ? `Move ${base(moved[0])} to ${base(moved[1] ?? '')}`
      : `${one.verb === 'Write' || one.verb === 'Add' ? 'Write' : one.verb === 'Delete' ? 'Delete' : 'Change'} ${base(one.path)}`;
  const dir = one && !moved ? one.path.replace(/\/[^/]*$/, '') : '';
  return { title, body: { kind: 'diff', lines: files.length > 1 ? lines : lines.filter((l) => l.mark !== 'head'), added, removed }, where: dir ? folderWords(dir) : null };
}

/** "PostHog personal API key the daily report reads" as "your PostHog key"; "this key" when no service is named. */
function keyShortName(label: string | null): string {
  const words = (label ?? '').split(/\s+/);
  const noun = words.findIndex((w) => /^(key|token|secret)$/i.test(w));
  const service = words.slice(0, Math.max(noun, 0)).filter((w) => !/^(personal|api|access|auth|read|write|secret|private|the|a|an)$/i.test(w));
  return noun > 0 && service.length ? `your ${service.join(' ')} ${words[noun].toLowerCase()}` : 'this key';
}

/** One approval as the card draws it: what it wants in words, the exact thing, and where. */
export function approvalView(input: unknown, tool?: string): ApprovalView {
  const it = (input ?? {}) as Record<string, unknown>;
  // A cloud run asking this computer for a key (main/cloud/key-asks.mts KEY_CARD).
  if (tool === KEY_CARD_TOOL) {
    const label = keyLabel(String(it.what ?? ''));
    const title = `Send ${keyShortName(label)} to the cloud?`;
    const name = String(it.name ?? '');
    const src = keySource(it);
    if (!src || !/^[A-Z][A-Z0-9_]{1,79}$/.test(name)) return { title, body: { kind: 'text', text: UNREADABLE }, where: null };
    const rows: [string, string][] = [['Key', label ?? name], ['From', capital(keySourceWords(src))], ['To', `Your ${Name} Cloud, for every cloud thread`]];
    return { title, body: { kind: 'fields', rows }, where: null };
  }
  const said = typeof it.description === 'string' && it.description.trim() ? it.description.trim().slice(0, 200) : null;
  const cwd = typeof it.cwd === 'string' && it.cwd ? folderWords(it.cwd) : null;
  const mcp = /^mcp__(.+)__(.+)$/.exec(tool ?? '');
  if (mcp) {
    const server = capital(words(mcp[1]));
    const where = `With the ${server} tool ${mcp[2]}`;
    const title = `Use ${words(mcp[2])} in ${server}`;
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { title, body: { kind: 'text', text: UNREADABLE }, where };
    try {
      const rows = Object.entries(input).map(([k, v]): [string, string] => [k, shown(v)]);
      return { title, body: rows.length ? { kind: 'fields', rows } : { kind: 'text', text: 'No arguments.' }, where };
    } catch {
      return { title, body: { kind: 'text', text: UNREADABLE }, where };
    }
  }
  if (typeof it.changes === 'string' && it.changes) {
    const view = changeView(it.changes);
    return said ? { ...view, title: said } : view;
  }
  if (typeof it.command === 'string') return { title: said ?? 'Run a command', body: { kind: 'text', text: it.command }, where: cwd };
  if (typeof it.host === 'string' && it.host) return { title: said ?? `Reach ${it.host}`, body: { kind: 'text', text: it.host }, where: cwd };
  if (typeof it.file_path === 'string') {
    const title = tool === 'Read' ? `Read ${base(it.file_path)}` : `${capital(words(tool ?? 'Use'))} ${base(it.file_path)}`;
    return { title: said ?? title, body: { kind: 'text', text: it.file_path }, where: cwd };
  }
  return { title: said ?? `${Name} could not read this ask`, body: { kind: 'text', text: UNREADABLE }, where: cwd };
}
