// The rules of the founder's thank-you note (functions/founder-note), kept
// free of Deno so tests/a-thank-you-note-reaches-each-new-account-once can run
// them.

export const NOTE_WINDOW = Object.freeze({ oldestDays: 7, youngestDays: 3 });
// A first run after a quiet week must not turn into a blast.
export const NOTES_PER_RUN = 50;

// "Hey ada.lovelace92" and "Hey J" read as a mail merge, so a username or an
// initial counts as no name. A name typed in one case is capitalised; one
// with its own mix of capitals (DeShawn) is left alone.
export function firstNameFor(name) {
  const first = String(name ?? '').trim().split(/\s+/)[0];
  if (!first || /[@._\d]/.test(first) || [...first].length < 2 || !/\p{L}/u.test(first)) return null;
  if (first === first.toLowerCase() || first === first.toUpperCase()) {
    const lower = first.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return first;
}

const addressIn = (from) => {
  const m = /<([^<>]+)>\s*$/.exec(String(from));
  return (m ? m[1] : String(from)).trim();
};

// The two versions being compared: option 1 as approved, and the lowercase
// one written on the thread.
export const VERSIONS = Object.freeze(['name', 'lowercase']);

// From the account id, so a retry gets the same version as the first try.
export function versionFor(id) {
  let h = 2166136261;
  for (const c of String(id ?? '').toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return VERSIONS[(h >>> 0) % VERSIONS.length];
}

// Plain text only: no HTML, logo or link, so it reads as typed.
export function noteFor(person, { from, signoff }, version) {
  const first = firstNameFor(person.name);
  const letter = {
    name: () => ({
      subject: 'Thanks for trying Agentbox',
      text: `Hey${first ? ` ${first}` : ''},\n\nJust a quick note to say thanks for trying Agentbox.\n\nHope it's been treating you well.\n\n${signoff}\n`,
    }),
    lowercase: () => ({
      subject: 'thanks for trying agentbox',
      text: `hey${first ? ` ${first.toLowerCase()}` : ''},\n\njust a quick note to say thanks for trying agentbox. hope it's been treating you well!\n\n${signoff.toLowerCase()}\n`,
    }),
  }[version];
  if (!letter) throw new Error(`no version called ${version}`);
  return { from, to: [person.email], reply_to: addressIn(from), ...letter() };
}

export function keysMatch(given, expected) {
  const a = String(given ?? '');
  const b = String(expected ?? '');
  if (!b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Owners are account ids rather than addresses, so the sender's own address
// is never written into a setting.
export const isPersonId = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(s ?? ''));

// Null until every secret is set, which is how the note is switched off.
export function readNoteConfig(get) {
  const v = (name) => String(get(name) ?? '').trim();
  const config = {
    from: v('FOUNDER_NOTE_FROM'),
    signoff: v('FOUNDER_NOTE_NAME'),
    owners: v('FOUNDER_NOTE_OWNERS').split(',').map((s) => s.trim().toLowerCase()).filter(isPersonId),
    key: v('FOUNDER_NOTE_KEY'),
    resendKey: v('RESEND_API_KEY'),
  };
  return config.from && config.signoff && config.owners.length && config.key && config.resendKey ? config : null;
}

// The note as the sender's own inbox will show it. Only to an owner's
// account, so the key alone cannot aim it at a stranger.
export function previewFor(person, config, version) {
  if (!person?.email || !config.owners.includes(String(person.id ?? '').toLowerCase())) return null;
  return noteFor({ name: config.signoff, email: person.email }, config, version);
}

// The mark goes down before the send, so two runs at once cannot both write
// to someone; a failed send lifts it again and tomorrow's run retries.
export async function sendFounderNotes({ db, send, config, dryRun = false }) {
  const due = await db.due({ owners: config.owners, ...NOTE_WINDOW, limit: NOTES_PER_RUN });
  if (dryRun) {
    const versions = Object.fromEntries(VERSIONS.map((v) => [v, due.filter((p) => versionFor(p.id) === v).length]));
    return { sent: 0, failed: 0, due: due.length, dryRun: true, names: due.map((p) => firstNameFor(p.name) ?? '(no name)'), versions };
  }
  const out = { sent: 0, failed: 0, due: due.length };
  for (const person of due) {
    const version = versionFor(person.id);
    if (!(await db.claim(person.id, version))) continue;
    const res = await send(noteFor(person, config, version), person.id);
    if (res.ok) { out.sent++; continue; }
    out.failed++;
    out.error = res.error;
    await db.release(person.id);
  }
  return out;
}
