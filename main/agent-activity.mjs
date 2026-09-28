// Ephemeral, local status from matched tool start/end events. A persisted trace
// is history and cannot prove a command is still running. Nothing here executes
// commands, records reasoning, or changes worker permissions.
import { plainCommand, shortPath } from '../shared/work-lines.mjs';
const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
function add(session, id, label, detail) {
  if (!id || !label) return false;
  const pending = session.activeTools ??= new Map();
  if (pending.has(id)) return false;
  pending.set(id, { id, label: label.length > 240 ? `${label.slice(0, 237)}…` : label, detail: String(detail ?? ''), startedAt: Date.now() });
  return true;
}
function finish(session, id) { return session.activeTools?.delete(id) ?? false; }
function clear(session) { const changed = !!session.activeTools?.size; session.activeTools?.clear(); return changed; }
export function currentActivity(session) { return [...(session.activeTools?.values() ?? [])]; }
function toolLabel(name, input) {
  const command = clean(input.command);
  const file = clean(input.file_path ?? input.path);
  if (name === 'Bash') return ['Running ' + (plainCommand(command) || 'command'), input.command ?? ''];
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
    let changed = false;
    for (const part of Array.isArray(obj.message?.content) ? obj.message.content : []) {
      if (obj.type === 'assistant' && part.type === 'tool_use') {
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
    case 'commandExecution': return add(session, item.id, `Running ${plainCommand(clean(item.command)) || 'command'}`, item.command);
    case 'fileChange': return add(session, item.id, 'Editing files', (Array.isArray(item.changes) ? item.changes : []).map(c => c?.path ?? '').join('\n'));
    case 'mcpToolCall': return add(session, item.id, `Using ${clean(item.tool).replace(/_/g, ' ') || 'tool'}`, `${item.server ?? ''} · ${item.tool ?? ''}`);
    case 'webSearch': return add(session, item.id, 'Searching the web', item.query ?? '');
    default: return false;
  }
}
