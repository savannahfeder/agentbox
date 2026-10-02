// Ephemeral, local status from matched tool start/end events. A persisted trace
// is history and cannot prove a command is still running. Nothing here executes
// commands, records reasoning, or changes worker permissions.
import { commandWork, isBookkeeping, plainCommand, shortPath } from '../shared/work-lines.mjs';
const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
function add(session, id, label, detail) {
  if (!id || !label) return false;
  const pending = session.activeTools ??= new Map();
  if (pending.has(id)) return false;
  pending.set(id, { id, label: label.length > 240 ? `${label.slice(0, 237)}…` : label, detail: String(detail ?? ''), startedAt: Date.now() });
  return true;
}
function finish(session, id) { return session.activeTools?.delete(id) ?? false; }
// A turn ending clears what it was doing, but not a background job: that is
// still running, and the session is kept open waiting for it
// (main/claude-input.mjs), so the row keeps saying what it waits on.
function clear(session) {
  let changed = false;
  for (const [id, entry] of session.activeTools ?? []) {
    if (entry.background) continue;
    session.activeTools.delete(id);
    changed = true;
  }
  return changed;
}
function backgroundJobs(session, tasks) {
  const pending = session.activeTools ??= new Map();
  const live = new Set(tasks.map(t => `bg:${t?.task_id}`));
  let changed = false;
  for (const [id, entry] of pending) if (entry.background && !live.has(id)) { pending.delete(id); changed = true; }
  for (const task of tasks) {
    const description = clean(task?.description);
    const plain = commandWork(description);
    const label = plain ? `${plain.doing} ${plain.subject}`.trim() : `Waiting on: ${description || 'a background job'}`;
    if (add(session, `bg:${task?.task_id}`, label, description)) { pending.get(`bg:${task?.task_id}`).background = true; changed = true; }
  }
  return changed;
}
export function currentActivity(session) { return [...(session.activeTools?.values() ?? [])]; }
function toolLabel(name, input) {
  const command = clean(input.command);
  const file = clean(input.file_path ?? input.path);
  if (name === 'Bash') {
    // WHAT IT IS DOING, IN WORDS, when the whole command is recognised. The
    // line under a running row is the same event as the line in the thread
    // above it, read in the present tense (`doing`, shared/work-lines.mjs).
    const plain = commandWork(command);
    if (plain) return [`${plain.doing} ${plain.subject}`.trim(), input.command ?? ''];
    return ['Running ' + (plainCommand(command) || 'command'), input.command ?? ''];
  }
  if (['Read','Write','Edit','MultiEdit'].includes(name)) return [`${name === 'Read' ? 'Reading' : name === 'Write' ? 'Writing' : 'Editing'} ${shortPath(file) || 'file'}`, file];
  if (['Grep','Glob','WebSearch'].includes(name)) return [`Searching ${clean(input.pattern ?? input.query) || 'files'}`, input.pattern ?? input.query ?? ''];
  if (name === 'WebFetch') return ['Reading web page', input.url ?? ''];
  const friendly = clean(name).split('__').pop().replace(/_/g, ' ');
  return [`Using ${friendly || 'tool'}`, clean(input.description ?? input.title)];
}
export function claudeActivity(session, line) {
  try {
    const obj = JSON.parse(line);
    if (obj.parent_tool_use_id) return false;
    if (obj.type === 'result') return clear(session);
    if (obj.type === 'system' && obj.subtype === 'background_tasks_changed' && Array.isArray(obj.tasks)) return backgroundJobs(session, obj.tasks);
    let changed = false;
    for (const part of Array.isArray(obj.message?.content) ? obj.message.content : []) {
      if (obj.type === 'assistant' && part.type === 'tool_use') {
        // The store's own records never become the word on the row: taking the
        // item is not what the session is doing (w-0bd0d8b2ef).
        if (isBookkeeping(part.name)) continue;
        const [label, detail] = toolLabel(part.name, part.input ?? {});
        changed = add(session, part.id, label, detail) || changed;
      }
      if (obj.type === 'user' && part.type === 'tool_result') changed = finish(session, part.tool_use_id) || changed;
    }
    return changed;
  } catch { return false; }
}
export function codexActivity(session, method, params) {
  if (method === 'turn/completed' || method === 'turn/failed') return clear(session);
  const item = params?.item;
  if (!item?.id) return false;
  if (method === 'item/completed') return finish(session, item.id);
  if (method !== 'item/started') return false;
  if (item.status && !['inProgress', 'in_progress', 'running'].includes(item.status)) return false;
  switch (item.type) {
    case 'commandExecution': {
      const plain = commandWork(clean(item.command));
      const label = plain ? `${plain.doing} ${plain.subject}`.trim() : `Running ${plainCommand(clean(item.command)) || 'command'}`;
      return add(session, item.id, label, item.command);
    }
    case 'fileChange': return add(session, item.id, 'Editing files', (Array.isArray(item.changes) ? item.changes : []).map(c => c?.path ?? '').join('\n'));
    case 'mcpToolCall': return isBookkeeping(clean(item.tool)) ? false
      : add(session, item.id, `Using ${clean(item.tool).replace(/_/g, ' ') || 'tool'}`, `${item.server ?? ''} · ${item.tool ?? ''}`);
    case 'webSearch': return add(session, item.id, 'Searching the web', item.query ?? '');
    default: return false;
  }
}
