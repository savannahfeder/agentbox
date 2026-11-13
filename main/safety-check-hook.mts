// A safety-check refusal goes to the person as a card.
//
// Auto mode's classifier refusal is a plain deny and never reaches the
// --permission-prompt-tool. Two hooks get it there:
//
//   denied  PermissionDenied: note the refused call and answer `retry: true`,
//           which tells the agent it may try again.
//   pre     PreToolUse: on a noted call, answer "ask", which sends it to the
//           approval card without the classifier deciding it. The note is used
//           up, so an approval runs the call once.
//
// A call refused again after its card stays refused, so a No is never asked
// twice. The folder is the worker's to write, so a worker can only add asks,
// each still needing the person's signed answer. Pinned by
// tests/a-safety-check-refusal-asks-the-person-instead-of-stopping-the-agent.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

interface HookCall { tool_name?: unknown; tool_input?: unknown; reason?: unknown }

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  }
  return v;
}

// `description` is the agent's label for a call, not the call: a retry keeps
// the command and rewrites the description.
function callKey(tool: string, input: unknown) {
  const rest = input && typeof input === 'object' && !Array.isArray(input) ? { ...(input as Record<string, unknown>) } : input;
  if (rest && typeof rest === 'object') delete (rest as Record<string, unknown>).description;
  return crypto.createHash('sha256').update(JSON.stringify([tool, canonical(rest)])).digest('hex');
}

function answerFor(mode: string, dir: string, call: HookCall): object | null {
  if (typeof call.tool_name !== 'string' || !call.tool_name) return null;
  const key = callKey(call.tool_name, call.tool_input ?? {});
  const refused = path.join(dir, 'refused');
  const asked = path.join(dir, 'asked');
  if (mode === 'denied') {
    if (fs.existsSync(path.join(asked, key))) return null;
    fs.mkdirSync(refused, { recursive: true, mode: 0o700 });
    fs.mkdirSync(asked, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(refused, key), typeof call.reason === 'string' ? call.reason.slice(0, 500) : '', { mode: 0o600 });
    return { hookSpecificOutput: { hookEventName: 'PermissionDenied', retry: true } };
  }
  if (mode === 'pre') {
    // The rename is the one step that both uses the note up and records the ask.
    try { fs.renameSync(path.join(refused, key), path.join(asked, key)); } catch { return null; }
    let reason = '';
    try { reason = fs.readFileSync(path.join(asked, key), 'utf8').trim(); } catch { /* asked without it */ }
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: `Auto mode's safety check refused this call${reason ? ` ${reason}` : ''}, so it is asked of the person.`,
      },
    };
  }
  return null;
}

try {
  const [mode, dir] = process.argv.slice(2);
  const said = mode && dir ? answerFor(mode, dir, JSON.parse(fs.readFileSync(0, 'utf8')) as HookCall) : null;
  if (said) process.stdout.write(JSON.stringify(said));
} catch { /* silence leaves Claude Code's decision standing */ }
