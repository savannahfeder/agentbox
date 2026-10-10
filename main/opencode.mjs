// READING AN OPENCODE RUN, IN OPENCODE'S OWN WORDS.
//
// The same five readers Claude Code and Codex each provide -- capture, live
// text, summary, trace, activity -- over OpenCode's `/event` stream. Nothing
// here translates an OpenCode event into a pretend Claude JSON line or a
// pretend Codex notification, for the reason docs/harnesses.md gives: the
// vocabularies are not the same shape and a fake one loses what the real one
// carries. OpenCode's `edit` approval, for instance, arrives with a whole
// unified diff in it, which neither of the other two does.
//
// EVERY SHAPE BELOW WAS READ OFF A RUNNING OPENCODE 1.18.35 ON 2026-10-07,
// not off the docs, which do not enumerate the event payloads at all. The
// ones that matter:
//
//   session.updated          properties.info.{cost,tokens,title,model,directory}
//   message.part.updated     properties.part.type: text | reasoning | tool |
//                            step-start | step-finish
//   message.part.delta       properties.{partID,field,delta}   ("field":"text")
//   permission.asked         properties.{id,sessionID,permission,patterns,
//                            metadata:{command} | metadata:{filepath,diff}}
//   session.idle             properties.sessionID
//   session.error            properties.{sessionID,error}
//
// A tool part carries `state.status` of pending | running | completed | error,
// with `state.input`, `state.output` and `state.error` beside it.

/** How much streamed prose is kept before it is dropped, as the others do. */
const SAYING_CAP = 20_000;

/** Tool names worth naming on the row, in the words a person would use. */
const TOOL_WORDS = {
  bash: 'Bash', edit: 'Edit', write: 'Write', read: 'Read', glob: 'Glob',
  grep: 'Grep', list: 'List', webfetch: 'Fetch', websearch: 'Search',
  task: 'Task', todowrite: 'Todo', patch: 'Edit', skill: 'Skill',
};

const toolWord = name => {
  const id = String(name ?? '').trim();
  if (!id) return null;
  return TOOL_WORDS[id.toLowerCase()] ?? id;
};

const partOf = properties => (properties && typeof properties === 'object' ? properties.part ?? null : null);

/**
 * WHAT THE RUN WAS, kept on the session as it goes.
 *
 * `sessionId` is the one OpenCode resumes by, and it is on nearly every event
 * as `properties.sessionID`. It is taken from the first event that carries one
 * rather than from the session-creation response, so a resumed run and a fresh
 * one record it the same way.
 *
 * The result is the LAST assistant text of the turn. OpenCode has no single
 * "here is the answer" event the way Codex's `turn/completed` does: prose
 * arrives as `text` parts that are updated in place, and the final one is the
 * answer. So each completed text part overwrites the last, and whatever is
 * standing when the session goes idle is the result.
 */
export function captureOpenCodeEvent(session, type, properties) {
  try {
    if (!session || typeof type !== 'string') return;
    const p = properties ?? {};
    if (!session.sessionId && typeof p.sessionID === 'string' && p.sessionID) session.sessionId = p.sessionID;

    if (type === 'session.updated') {
      const info = p.info ?? {};
      if (Number.isFinite(info.cost)) session.opencodeCost = info.cost;
      if (info.tokens && typeof info.tokens === 'object') session.opencodeTokens = info.tokens;
      return;
    }

    if (type === 'session.error') {
      session.result = openCodeErrorText(p.error) ?? 'OpenCode stopped with an error it did not name.';
      session.resultIsError = true;
      return;
    }

    if (type === 'message.part.updated') {
      const part = partOf(p);
      if (!part) return;
      // A WRITE THIS RUN MADE, so the card can say what changed. The `edit` and
      // `write` tools report the file they touched in `state.input.filePath`,
      // which is the only place a path appears for a change OpenCode has
      // already applied.
      if (part.type === 'tool' && part.state?.status === 'completed') {
        const path = part.state?.input?.filePath ?? part.state?.input?.path;
        if (typeof path === 'string' && path && (part.tool === 'edit' || part.tool === 'write' || part.tool === 'patch')) {
          session.opencodeChange ??= [];
          if (!session.opencodeChange.includes(path)) session.opencodeChange.push(path);
        }
      }
      if (part.type === 'step-finish') {
        if (Number.isFinite(part.cost)) session.opencodeStepCost = part.cost;
        if (part.tokens && typeof part.tokens === 'object') session.opencodeTokens = part.tokens;
      }
      // Only the assistant's prose is an answer. `reasoning` is the model
      // thinking out loud and is never the result, which is why it is matched
      // by name here rather than falling through to the text branch.
      if (part.type === 'text') {
        const text = String(part.text ?? '').trim();
        if (text) { session.result = text; session.resultIsError = false; }
      }
      return;
    }
  } catch {
    // A reader that throws kills a run that was going fine. Same rule as the
    // other two harnesses: read what parses and ignore what does not.
  }
}

/** The error on `session.error`, which is an object and not a string. */
export function openCodeErrorText(error) {
  if (!error) return null;
  if (typeof error === 'string') return error.trim() || null;
  const name = typeof error.name === 'string' ? error.name : '';
  const message = typeof error.data?.message === 'string' ? error.data.message
    : typeof error.message === 'string' ? error.message : '';
  const joined = [name, message].filter(Boolean).join(': ');
  return joined || null;
}

/**
 * THE PROSE AS IT IS TYPED, for the line on the row that moves.
 *
 * Deltas arrive as `message.part.delta` with a `field` saying which field of
 * which part is growing. Only `text` is shown: `reasoning` deltas are the
 * model's private thinking, and streaming those onto her row would put words
 * on screen that are not what the run decided.
 */
export function openCodeStreamingText(session, type, properties) {
  try {
    if (!session) return false;
    const p = properties ?? {};

    if (type === 'message.part.updated') {
      const part = partOf(p);
      // A tool starting means the talking stopped. What is already typed stays
      // until the trace carries the same words, exactly as Codex's reader does.
      if (part?.type === 'text' && !String(part.text ?? '')) { session.saying = ''; session.sayingAt = Date.now(); return true; }
      return false;
    }

    if (type !== 'message.part.delta') return false;
    if (p.field !== 'text') return false;
    const piece = String(p.delta ?? '');
    if (!piece) return false;
    // A delta for a reasoning part has the same `field: "text"`, so the part it
    // belongs to is what tells them apart. Without a remembered prose part id
    // nothing is streamed, which is the quiet answer rather than the wrong one.
    if (session.opencodeProsePart && p.partID && p.partID !== session.opencodeProsePart) return false;
    if (!session.sayingAt) session.sayingAt = Date.now();
    const next = (session.saying ?? '') + piece;
    session.saying = next.length > SAYING_CAP ? '' : next;
    return true;
  } catch {
    return false;
  }
}

/** Which part the prose is going into, so reasoning deltas can be told apart. */
export function rememberOpenCodeProsePart(session, type, properties) {
  if (!session || type !== 'message.part.updated') return;
  const part = partOf(properties);
  if (part?.type === 'text' && typeof part.id === 'string') session.opencodeProsePart = part.id;
  if (part?.type === 'step-start') session.opencodeProsePart = null;
}

/** One short line for the row: what it just did. */
export function summarizeOpenCodeEvent(type, properties) {
  try {
    const p = properties ?? {};
    if (type !== 'message.part.updated') return null;
    const part = partOf(p);
    if (!part) return null;
    if (part.type === 'text') {
      const text = String(part.text ?? '').trim();
      return text ? text.slice(0, 300) : null;
    }
    if (part.type === 'tool' && part.state?.status === 'completed') {
      const word = toolWord(part.tool);
      return word ? `tool: ${word}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** One line for the run trace, the record she can open afterwards. */
export function traceOpenCodeEvent(type, properties) {
  try {
    const p = properties ?? {};
    const at = new Date().toISOString().slice(11, 19);

    if (type === 'session.error') {
      const text = openCodeErrorText(p.error);
      return text ? `${at}  [error] ${text.slice(0, 300)}` : null;
    }

    if (type !== 'message.part.updated') return null;
    const part = partOf(p);
    if (!part) return null;

    if (part.type === 'text') {
      const text = String(part.text ?? '').trim();
      return text ? `${at}  ${text}` : null;
    }

    if (part.type === 'tool' && (part.state?.status === 'completed' || part.state?.status === 'error')) {
      const word = toolWord(part.tool);
      if (!word) return null;
      const input = part.state?.input ?? {};
      const detail = String(input.command ?? input.filePath ?? input.path ?? input.pattern ?? '').trim();
      const failed = part.state?.status === 'error' ? ' (refused)' : '';
      return `${at}  [${word}]${failed}${detail ? ` ${detail.slice(0, 200)}` : ''}`;
    }

    return null;
  } catch {
    return null;
  }
}

/** What it is doing right now, for the row's activity line. */
export function openCodeActivity(type, properties) {
  try {
    if (type !== 'message.part.updated') return null;
    const part = partOf(properties);
    if (part?.type !== 'tool') return null;
    if (part.state?.status !== 'pending' && part.state?.status !== 'running') return null;
    const word = toolWord(part.tool);
    return word ? { tool: word } : null;
  } catch {
    return null;
  }
}

/**
 * THE APPROVAL, IN THE WORDS A CARD NEEDS.
 *
 * `bash` asks carry `metadata.command`. `edit` asks carry `metadata.filepath`
 * AND `metadata.diff`, a whole unified diff of the change it wants to make --
 * measured, not assumed. That is strictly more than a Codex patch approval
 * arrives with, and it means an OpenCode card can show the change itself
 * rather than a filename.
 */
export function openCodeApprovalCard(properties) {
  const p = properties ?? {};
  const kind = typeof p.permission === 'string' ? p.permission : '';
  const metadata = p.metadata ?? {};
  const command = typeof metadata.command === 'string' ? metadata.command.trim() : '';
  const filepath = typeof metadata.filepath === 'string' ? metadata.filepath.trim() : '';
  const diff = typeof metadata.diff === 'string' ? metadata.diff : '';
  const patterns = Array.isArray(p.patterns) ? p.patterns.filter(x => typeof x === 'string') : [];

  if (command) return { kind: kind || 'bash', title: 'Run a command', detail: command, command, patterns };
  if (filepath) return { kind: kind || 'edit', title: 'Change a file', detail: filepath, filepath, diff, patterns };
  return { kind: kind || 'tool', title: 'Use a tool', detail: patterns.join(', ') || kind || 'a tool', patterns };
}

/**
 * THE PERMISSION POLICY A WORKER RUNS UNDER, as OpenCode's own config.
 *
 * This is the whole reason Agentbox can draw a card for OpenCode at all.
 * Measured 2026-10-07: with no permission config the server runs shell
 * commands and writes files with no card; with this config it raises
 * `permission.asked` and waits. The server reports back what it loaded at
 * `GET /config`, which is how the adapter can tell the policy really took.
 *
 * `read`, `glob`, `grep` and `list` are deliberately left alone: a card for
 * every file read is the 2026-08-05 card flood again, and reading inside the
 * task's own folder is what the folder is for.
 */
export function openCodePermissionConfig() {
  return {
    $schema: 'https://opencode.ai/config.json',
    permission: {
      bash: 'ask',
      edit: 'ask',
      webfetch: 'ask',
      websearch: 'ask',
      external_directory: 'ask',
      task: 'allow',
      todowrite: 'allow',
    },
  };
}
