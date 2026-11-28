// What an invite box holds: one address or many, typed or pasted. The desktop's
// Team page, the phone's and a shared file's "Add people" all read it here.

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export interface InviteList { emails: string[]; onTeam: string[]; notEmails: string[] }
export interface Have { onTeam?: Iterable<string | null | undefined>; invited?: Iterable<string | null | undefined> }

const lowered = (list: Iterable<string | null | undefined> | undefined) => new Set([...(list ?? [])].filter((e): e is string => !!e).map((e) => e.toLowerCase()));

export function splitInvites(text: string, have: Have = {}): InviteList {
  const onTeam = lowered(have.onTeam);
  const invited = lowered(have.invited);
  // `Name <address>` becomes the address alone. The name is the quoted parts and
  // whole words without an @ just before it on its line, commas included for
  // Outlook's "Last, First <address>"; an address typed before it is not a name.
  // Each word and gap matches whole, so a long box cannot backtrack for ever.
  const bare = !text.includes('<') ? text : text.replace(/(?<=^|[\s,;>])(?:"[^"]*"|[^<>;\n"@\s,]+(?![^<>;\n"@\s,])|[ \t,]+(?![ \t,]))*<([^<>]*)>/g, ' $1 ');
  const out: InviteList = { emails: [], onTeam: [], notEmails: [] };
  const seen = new Set<string>();
  for (const raw of bare.split(/[\s,;]+/)) {
    const token = raw.replace(/^mailto:([^?]*)(\?.*)?$/i, '$1').replace(/^["'(<[]+|["')>\].]+$/g, '');
    if (!token) continue;
    if (!EMAIL.test(token)) { out.notEmails.push(raw); continue; }
    const email = token.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    if (onTeam.has(email)) out.onTeam.push(email);
    else if (!invited.has(email)) out.emails.push(email);
  }
  return out;
}

/** A pasted list of lines, as one line: an input drops the line breaks and runs the addresses together. */
export function pastedInvites(text: string): string | null {
  if (!/[\r\n]/.test(text)) return null;
  return text.split(/\r?\n|\r/).map((l) => l.trim()).filter(Boolean).join(', ');
}

const and = (list: string[]) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

/** Invites each address in turn, stopping at the first refusal (the cloud allows 20 a day). `left` is what stays in the box. */
export async function inviteEach(text: string, have: Have, inviteOne: (email: string) => Promise<string | null>) {
  const { emails, onTeam, notEmails } = splitInvites(text, have);
  const invited: string[] = [];
  let refused: string | null = null;
  let unsent: string[] = [];
  for (const [i, email] of emails.entries()) {
    refused = await inviteOne(email);
    if (refused) { unsent = emails.slice(i); break; }
    invited.push(email);
  }
  const bad = notEmails.length === 1 ? `${notEmails[0]} is not an email address.` : notEmails.length ? `${and(notEmails)} are not email addresses.` : null;
  const already = !emails.length && !notEmails.length && onTeam.length ? `${and(onTeam)} ${onTeam.length === 1 ? 'is' : 'are'} already on the team.` : null;
  const problem = [refused, bad, already].filter(Boolean).join(' ') || null;
  return { invited, left: [...unsent, ...notEmails].join(', '), problem };
}
