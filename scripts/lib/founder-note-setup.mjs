// The pure half of scripts/set-up-founder-note.mjs.
import crypto from 'node:crypto';

export const DEFAULT_ADDRESS = 'hello@agentbox.ac';

export const noteUrl = (ref) => `https://${ref}.supabase.co/functions/v1/founder-note`;

export const senderLine = (name, address) => `${String(name).trim()} from Agentbox <${String(address).trim()}>`;

export const newKey = () => crypto.randomBytes(32).toString('hex');

export const looksLikeEmail = (s) => /^[^\s@,<>"]+@[^\s@,<>"]+\.[^\s@,<>"]{2,}$/.test(String(s ?? '').trim());

export { isPersonId } from '../../cloud/supabase/functions/_shared/founder-note.mjs';

export function ownersFrom(text) {
  return String(text ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// What `supabase secrets set --env-file` reads, quoted because the sender
// line has spaces and angle brackets.
export function secretsFile({ from, name, owners, key }) {
  const q = (v) => `"${String(v).replace(/(["\\])/g, '\\$1')}"`;
  return `FOUNDER_NOTE_FROM=${q(from)}\nFOUNDER_NOTE_NAME=${q(name)}\nFOUNDER_NOTE_OWNERS=${q(owners.join(','))}\nFOUNDER_NOTE_KEY=${q(key)}\n`;
}

// The migration with its daily job taken out, and an existing job stopped:
// the function can be tried with a dry run and a preview before anything
// goes out on its own.
export function heldMigration(sql) {
  const at = sql.indexOf('do $do$');
  if (at < 0) throw new Error('the migration has no daily job to hold');
  return `${sql.slice(0, at)}do $hold$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'founder-note';
  end if;
end
$hold$;
`;
}

// The daily job reads the function's address and key from the vault. Both
// are checked to their exact shape first, since they go into SQL text.
export function vaultSql({ url, key }) {
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/functions\/v1\/founder-note$/.test(url)) throw new Error(`not a founder-note address: ${url}`);
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('the key is not 64 hex characters');
  const put = (name, value) => `
  if exists (select 1 from vault.secrets where name = '${name}') then
    perform vault.update_secret((select id from vault.secrets where name = '${name}'), '${value}');
  else
    perform vault.create_secret('${value}', '${name}');
  end if;`;
  return `do $$\nbegin${put('founder_note_url', url)}${put('founder_note_key', key)}\nend\n$$;\n`;
}

// How many got each version and, of the addresses that replied, how many of
// each. Addresses that are not addresses are dropped before they reach SQL.
export function resultsSql(replied = []) {
  const list = [...new Set(replied.map((a) => String(a).trim().toLowerCase()).filter(looksLikeEmail))]
    .map((a) => `'${a.replace(/'/g, "''")}'`);
  return `select n.version, count(*)::int as sent,
  count(*) filter (where lower(u.email) in (${list.length ? list.join(', ') : 'null'}))::int as replied
from public.founder_notes n join auth.users u on u.id = n.person_id
group by n.version order by n.version;`;
}
