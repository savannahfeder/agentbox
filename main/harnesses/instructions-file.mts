/**
 * THE PERSON'S STANDING INSTRUCTIONS, FOR AN ENGINE WITH NO SYSTEM PROMPT.
 *
 * Claude Code takes them on `--append-system-prompt` and Codex takes them as a
 * thread's `developerInstructions`. Every other engine we have looked at takes
 * neither: ACP has no system prompt in the protocol, and OpenCode's server
 * takes none. So the instructions are the one thing that would arrive nowhere
 * while everything else about a run looked perfect, and a worker that never
 * read them is worse than one that failed to start, because it works and
 * answers against rules it was never given.
 *
 * Decided on w-380b06bf53: they go into the file the tool itself reads, and
 * which file that is lives in the definition as data — AGENTS.md for most of
 * them, GEMINI.md for Gemini CLI. Same shape as every other name in there.
 *
 * TWO RULES THIS FILE IS BUILT AROUND, both of them other people's property.
 *
 * NEVER A TRACKED FILE. A task folder is a worktree of somebody's own
 * repository, and AGENTS.md is frequently committed in one. This codebase has
 * already paid for writing a tracked file once: every folder that had run the
 * app reported itself dirty, `releaseTaskFolder` would not reclaim a folder,
 * and change cards carried files nobody had touched (CLAUDE.md, 2026-10-07).
 * So the preferred home is the tool's own config directory, which is per-task
 * and ours; and if a definition does ask for the working folder, a path the
 * repository tracks is refused rather than written.
 *
 * NEVER SOMEBODY ELSE'S WORDS. If the file is already there, what is in it
 * stays. Only the block between our two markers is rewritten, so resuming a
 * thread fifty times leaves one block and their own text untouched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const INSTRUCTIONS_BEGIN = '<!-- agentbox:instructions -->';
export const INSTRUCTIONS_END = '<!-- /agentbox:instructions -->';

/**
 * HOW THIS ENGINE CARRIES INSTRUCTIONS: 'flag', 'file', or null for neither.
 *
 * Null is the answer that matters. It is not a default to be filled in later;
 * it is an engine that cannot be offered, because the person's rules would not
 * reach it and nothing on screen would say so.
 */
export function carriesInstructions(definition) {
  if (definition?.run?.system) return 'flag';
  if (definition?.instructions?.file) return 'file';
  return null;
}

/** The absolute path this engine's instructions belong at, or null. */
export function instructionsTarget(definition, { cwd, home } = {}) {
  const spec = definition?.instructions;
  if (!spec?.file) return null;
  const root = spec.in === 'cwd' ? cwd : home;
  return root ? path.join(root, spec.file) : null;
}

/** Whether this repository has the file under version control. */
export function fileIsTracked(file, cwd) {
  const where = cwd ?? path.dirname(file);
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', file], { cwd: where, stdio: 'ignore' });
    return true;
  } catch {
    return false;   // not tracked, or not a repository at all
  }
}

/**
 * Put the instructions in the file, and nothing else in it out.
 *
 * Idempotent on purpose: a thread resumes many times and each run writes the
 * block again, so the test that matters is that there is exactly one of them
 * afterwards. Returns the path written.
 */
export function writeInstructions({ file, text, cwd = null, tracked = null }) {
  if (!file) throw Error('There is nowhere to write these instructions');
  const isTracked = tracked ?? fileIsTracked(file, cwd);
  if (isTracked) {
    // Their file, under their version control. Writing it would dirty the
    // worktree and could ride into the change this task is for.
    throw Error(`${file} is tracked by this repository, so the instructions cannot be written there`);
  }
  const block = `${INSTRUCTIONS_BEGIN}\n${text}\n${INSTRUCTIONS_END}`;
  let before = '';
  try { before = fs.readFileSync(file, 'utf8'); } catch {}
  let next;
  const begins = before.indexOf(INSTRUCTIONS_BEGIN);
  const ends = before.indexOf(INSTRUCTIONS_END);
  if (begins >= 0 && ends > begins) {
    next = before.slice(0, begins) + block + before.slice(ends + INSTRUCTIONS_END.length);
  } else {
    next = before ? `${before.replace(/\s*$/, '')}\n\n${block}\n` : `${block}\n`;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return file;
}

/**
 * The `instructions` operation every harness answers.
 *
 * `{ by: 'flag' }` for an engine whose command line carries them, so nothing
 * is written and the existing path is untouched. `{ by: 'file', file }` once
 * they are on disk. An engine that carries them neither way has no business
 * being offered, so this throws rather than returning a shrug.
 */
export function instructionsFor(definition, { cwd, home, text } = {}) {
  const how = carriesInstructions(definition);
  if (how === 'flag') return { by: 'flag' };
  if (how !== 'file') throw Error(`${definition?.label ?? 'This engine'} has nowhere to put standing instructions`);
  const file = instructionsTarget(definition, { cwd, home });
  if (!text) return { by: 'file', file, written: false };
  return { by: 'file', file: writeInstructions({ file, text, cwd }), written: true };
}
