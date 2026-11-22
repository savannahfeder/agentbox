// What `npm run feedback` asks the database and how it prints the answer,
// kept apart from the network so tests/feedback-is-kept-where-an-agent-can-read-it
// can run it.

const DEFAULT_LIMIT = 20;
const MOST = 500;

export function readArgs(argv) {
  const out = { limit: DEFAULT_LIMIT, since: null, files: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a === '--since') out.since = argv[++i] ?? null;
    else if (a === '--files') out.files = argv[++i] ?? null;
    else if (a === '--json') out.json = true;
    else throw new Error(`unknown argument ${a}; takes --limit N, --since YYYY-MM-DD, --files DIR, --json`);
  }
  return out;
}

const howMany = (limit) => {
  const n = Number.isInteger(Number(limit)) && limit !== '' && limit != null ? Number(limit) : DEFAULT_LIMIT;
  return Math.min(MOST, Math.max(1, n));
};

// The SQL is sent as text, so only a number or a plain date reaches it.
export function listSql({ limit = DEFAULT_LIMIT, since = null } = {}) {
  if (since != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(since))) throw new Error('--since takes a date as YYYY-MM-DD');
  const where = since ? ` where f.sent_at >= '${since}'` : '';
  return `select f.id, f.sent_at, f.words, f.app_version, f.os, f.install, f.mailed, f.mail_error,
  coalesce((select json_agg(json_build_object('position', x.position, 'name', x.name, 'type', x.type, 'bytes', x.bytes) order by x.position)
            from public.feedback_files x where x.feedback_id = f.id), '[]'::json) as files
from public.feedback f${where} order by f.sent_at desc limit ${howMany(limit)};`;
}

export function fileSql(id, position) {
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(position) || position < 0) throw new Error('a file is named by two whole numbers');
  return `select name, type, data from public.feedback_files where feedback_id = ${id} and position = ${position};`;
}

const size = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function describeFeedback(row) {
  const when = String(row.sent_at ?? '').replace('T', ' ').slice(0, 16);
  const from = [`Agentbox ${row.app_version || 'unknown version'}`, row.os || 'unknown OS', row.install ? `install ${String(row.install).slice(0, 8)}` : null]
    .filter(Boolean).join(' · ');
  const lines = [`#${row.id}  ${when} UTC  ${from}`, '', String(row.words || '(no words, files only)')];
  const files = Array.isArray(row.files) ? row.files : [];
  if (files.length) lines.push('', `Files: ${files.map((f) => `${f.name} (${size(Number(f.bytes) || 0)})`).join(', ')}`);
  if (row.mailed === false) lines.push('', `The email did not go: ${row.mail_error || 'no reason given'}`);
  return lines.join('\n');
}

// Two files of one name in one piece would overwrite each other.
export const savedName = (id, position, name) => `${id}-${position}-${String(name).replace(/[^\w.-]/g, '_').slice(0, 120)}`;
