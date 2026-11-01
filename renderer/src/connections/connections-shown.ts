// WHAT THE CONNECTIONS PAGE SAYS, apart from drawing it, so a test can read it.
import { defaultUrlTransform } from 'react-markdown';
import { clockAt } from '../../../shared/connections-catalog.mjs';
import type { ConnectionTile, Person } from '../types';

function agoWords(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
}

type Timed = Pick<ConnectionTile, 'state' | 'word' | 'at'> & Partial<Pick<ConnectionTile, 'since' | 'nextTryAt' | 'stoppedTryingAt' | 'lastUsedAt' | 'failures'>>;

/** A use that failed after the last good check, which "Works" would be a lie over. */
const failedSinceCheck = (tile: Timed) => {
  const f = tile.failures?.[0];
  return f && tile.state === 'works' && f.at > (tile.at ?? 0) ? f : null;
};

/** The state word on a tile, with the one time that makes it more useful. */
export function stateLine(tile: Timed, now: number): string {
  const failed = failedSinceCheck(tile);
  if (failed) return `${failed.wrote ? 'A change' : 'A read'} failed at ${clockAt(failed.at, now)}`;
  if (tile.state === 'works' && tile.lastUsedAt && tile.lastUsedAt > (tile.at ?? 0)) return `Works, used ${agoWords(Math.max(0, now - tile.lastUsedAt))}`;
  if (tile.state === 'works' && tile.at) return `Works ${agoWords(Math.max(0, now - tile.at))}`;
  const since = tile.since ?? tile.at;
  if (tile.state === 'down' && since) return `Down since ${clockAt(since, now)}`;
  return tile.word;
}

/** When it was last tried and whether the app tries again by itself. Null where no time helps. */
export function whenLine(tile: Timed, now: number): string | null {
  if (tile.state === 'not_signed_in' && (tile.since ?? tile.at)) return `It stopped working at ${clockAt((tile.since ?? tile.at) as number, now)}.`;
  if (!tile.at || (tile.state !== 'down' && tile.state !== 'unreachable')) return null;
  const last = `Last tried ${clockAt(tile.at, now)}.`;
  if (tile.state === 'unreachable') return tile.since && tile.since < tile.at ? `Since ${clockAt(tile.since, now)}. ${last}` : last;
  if (tile.nextTryAt) return `${last} Tries again by itself at ${clockAt(tile.nextTryAt, now)}.`;
  if (tile.stoppedTryingAt) return `${last} Stopped trying by itself at ${clockAt(tile.stoppedTryingAt, now)}, so Check now is the way to try again.`;
  return last;
}

const counted = (n: number, things: string, atLeast: boolean) => `${atLeast ? 'at least ' : ''}${n} ${n === 1 ? things.replace(/s$/, '') : things}`;

/** What a check just found, said where the person pressed. */
export function checkResultLine(tile: ConnectionTile, after: 'connect' | 'check', now: number): string | null {
  const first = after === 'connect';
  if (tile.state === 'works') {
    const lead = first ? 'Connected' : 'Works';
    return tile.seen != null && tile.things ? `${lead}, I can see ${counted(tile.seen, tile.things, tile.seenAtLeast)}.` : `${lead}.`;
  }
  const when = tile.at ? clockAt(tile.at, now) : null;
  const at = when ? ` at ${when}` : '';
  if (tile.state === 'down') {
    if (first) return `Signed in, but it did not answer${at}.`;
    return tile.since && tile.at && tile.since < tile.at ? `Still down${at}.` : `It did not answer${at}.`;
  }
  // After Check now the sheet's own state word already says this.
  if (tile.state === 'unreachable') return first ? 'Signed in, but it could not reach its tools.' : null;
  if (tile.state === 'nothing_to_read') return `${first ? 'Connected' : 'Works'}, but there is nothing to read yet.`;
  return null;
}

const article = (noun: string) => (/^[aeio]/.test(noun) ? `an ${noun}` : `a ${noun}`);

/** A word on a tile that nobody has connected: what it will take, in as few words as true. */
export function offerLine(tile: Pick<ConnectionTile, 'access' | 'name'>): string {
  if (tile.access === 'vendor_approval') return `Needs ${tile.name}'s approval`;
  if (tile.access === 'own_client') return 'Needs an app made in it';
  if (tile.access === 'key') return 'Takes a personal token';
  return 'Not connected';
}

/** The one line a working tile shows about its copy. */
export function copyLine(copy: NonNullable<ConnectionTile['copy']>, now: number): string {
  const n = `${copy.count} ${copy.count === 1 ? 'file' : 'files'}`;
  if (copy.stoppedAt) return `${n} in Files. Stopped trying at ${clockAt(copy.stoppedAt, now)}`;
  if (copy.failed.length && copy.okAt !== copy.ranAt) return `${n} in Files. Failed at ${clockAt(copy.ranAt ?? 0, now)}`;
  if (copy.failed.length) return `${n} in Files, ${copy.failed.length} could not be read`;
  return `${n} in Files, copied ${copy.okAt ? clockAt(copy.okAt, now) : 'not yet'}`;
}

/** When a copy runs next, said in the sheet. */
export function copyNextLine(copy: NonNullable<ConnectionTile['copy']>, now: number): string | null {
  if (copy.nextAt) return `Runs again by itself at ${clockAt(copy.nextAt, now)}.`;
  if (copy.stoppedAt) return 'It will not try again by itself. Copy now runs it.';
  return 'It starts again when you sign in.';
}

/** Who reads a copy, in the words the project setting uses. */
export function whoReadsCopies(seenBy: 'private' | 'team' | 'people', project: string): string {
  if (seenBy === 'private') return `Only you can read these, because ${project} is just you.`;
  if (seenBy === 'people') return `Only the people who can see ${project} can read these.`;
  return `Everyone on the team can read these, because they can see ${project}.`;
}

/** Tiles a search leaves, by name or by the group they sit in. */
export function tilesFound<T extends { name: string; group: string }>(tiles: T[], query: string, groups: { id: string; name: string }[]): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return tiles.filter((t) => {
    const hay = `${t.name} ${groups.find((g) => g.id === t.group)?.name ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** One failed use on a card: when, what, why. */
export function failureLine(f: ConnectionTile['failures'][number], now: number): string {
  return `${clockAt(f.at, now)} ${toolWords(f.tool)}. ${f.why}`.trim();
}

const GOOD_FOR_INITIALS = new Set(['works', 'down', 'nothing_to_read', 'unreachable']);

/** Who a card shows. My own initials mean my sign-in holds, so they go with it. */
export function peopleOnCard(tile: Pick<ConnectionTile, 'id' | 'state'>, people: readonly Person[] | undefined, me: string | null | undefined): Person[] {
  return whoHasIt(tile.id, people).filter((p) => p.id !== me || GOOD_FOR_INITIALS.has(tile.state));
}

/** `get_issue`, `notion-fetch` or `getJiraIssue` as a person would say it. */
export function toolWords(name: string): string {
  const bare = name.replace(/^(notion|slack)[-_]/, '').replace(/([a-z])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
  const [verb, ...rest] = bare.split('_');
  const noun = rest.join(' ');
  const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (noun === 'self' || noun === 'me' || bare === 'whoami') return 'See who is signed in';
  if (bare === 'fetch') return 'Read a page';
  const some = /[^su]s$/.test(noun) ? noun : article(noun);
  if (verb === 'get') return `Read ${some}`;
  if (verb === 'create' || verb === 'update') return `${sentence(verb)} ${some}`;
  return sentence(`${verb} ${noun}`.trim());
}

export function whoHasIt(id: string, people: readonly Person[] | undefined): Person[] {
  return (people ?? []).filter((p) => p.connections?.includes(id));
}

const LINK = /^agentbox:\/\/connections(?:\/([a-z0-9-]*))?$/;

/** What a link an agent wrote opens: the page, or one tool's sheet. Null for any other link. */
export function connectionLinkOf(href: string | undefined): { id: string | null } | null {
  const m = LINK.exec(href ?? '');
  return m ? { id: m[1] || null } : null;
}

/** For markdown, which drops any scheme it does not know, as it should for all but this. */
export function keepConnectionLinks(url: string): string {
  return connectionLinkOf(url) ? url : defaultUrlTransform(url);
}

/** One press from any thread to the page; App listens. */
export function openConnections(id: string | null): void {
  window.dispatchEvent(new CustomEvent('agentbox:open-connections', { detail: { id } }));
}
