// PURE. Agents in a conversation with a teammate (w-7b9cb8636a, approved on
// w-2e8aa16f0f, 2026-10-05).
//
// What was approved, in order of how a message moves:
//   1. Typing @ in a conversation offers people and agents in one menu.
//   2. An agent mention reads "@Codex in Agentbox Team" in the text. Clicking it
//      opens a small card with the project, the model and the effort ("Way 2").
//      The reply box and its footer never change.
//   3. Every agent works in a particular project, so Send waits until each agent
//      mention names one, and says why.
//   4. On send, each agent mention becomes a task in its project. The message
//      keeps a link to that task, so every copy of the conversation (yours and
//      your teammate's) knows which task answers it.
//   5. The chat draws the agent's answer under the message: what it said and
//      the threads it filed.
//
// THE MESSAGE CARRIES ITS AGENTS AS MARKDOWN LINKS, `[@Codex in Agentbox
// Team](agentbox-agent:codex?project=agentbox-team&model=gpt-5.5&effort=medium&task=w-…)`.
// The words are what anyone reads; the address is what the app reads. Nothing
// new is stored anywhere: a message is still one answer in the conversation's
// ledger, and it syncs to the other person exactly as before.
import { ENGINES } from '../../../shared/engines.mjs';

export interface ChatAgent { engine: string; label: string }
export interface Project { slug: string; name: string }
export interface Mention { start: number; end: number; engine: string; label: string; project: Project | null }
export interface MentionPick { model: string | null; effort: string | null }
export interface AgentLink {
  /** The whole link as written in the message. */
  raw: string;
  engine: string;
  label: string;
  project: string | null;
  model: string | null;
  effort: string | null;
  task: string | null;
}

/** The agents a conversation can bring in: the app's own coding agents. */
export const CHAT_AGENTS: ChatAgent[] = (ENGINES as Array<{ id: string; label: string }>).map((e) => ({ engine: e.id, label: e.label }));

export const AGENT_SCHEME = 'agentbox-agent:';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * WHAT THE @ MENU IS FILTERING ON, when the caret sits just after "@" and a
 * word. The @ must start a word, so an email address never opens the menu.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|[\s(])@([^\s@]{0,30})$/.exec(text.slice(0, caret));
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}

/** Whether a menu row answers what was typed after the @. */
export const matchesQuery = (name: string, query: string) =>
  !query || name.toLowerCase().split(/\s+/).some((w) => w.startsWith(query.toLowerCase())) || name.toLowerCase().startsWith(query.toLowerCase());

/**
 * EVERY AGENT MENTION IN THE TEXT, "@Codex" or "@Codex in Agentbox Team". The
 * project only counts when it is one of yours, matched by its whole name and
 * the longest name first, so "in Agentbox Team" is never read as "in Agentbox"
 * and the words after it are never swallowed into a project name.
 */
export function findMentions(text: string, projects: readonly Project[]): Mention[] {
  const agents = CHAT_AGENTS.slice().sort((a, b) => b.label.length - a.label.length);
  const names = projects.slice().sort((a, b) => b.name.length - a.name.length);
  const where = names.length ? `(?: in (${names.map((p) => escape(p.name)).join('|')}))?` : '';
  const re = new RegExp(`(^|[^\\w\\[])@(${agents.map((a) => escape(a.label)).join('|')})${where}(?![\\w])`, 'g');
  const out: Mention[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[1].length;
    const agent = agents.find((a) => a.label === m![2])!;
    const project = m[3] ? names.find((p) => p.name === m![3]) ?? null : null;
    out.push({ start, end: m.index + m[0].length, engine: agent.engine, label: agent.label, project });
  }
  return out;
}

/** Why Send has to wait, in a sentence, or null when it need not. */
export function sendBlock(mentions: readonly Mention[]): string | null {
  const loose = mentions.find((m) => !m.project);
  return loose ? `Pick a project for @${loose.label}: click it to choose.` : null;
}

/** The mention as the text writes it. */
export const mentionText = (label: string, project: Project | null) => `@${label}${project ? ` in ${project.name}` : ''}`;

/** The text with one mention's project set (or changed). */
export function withProject(text: string, mention: Mention, project: Project): string {
  return text.slice(0, mention.start) + mentionText(mention.label, project) + text.slice(mention.end);
}

const linkFor = (m: Mention, pick: MentionPick | undefined) => {
  const q = new URLSearchParams();
  if (m.project) q.set('project', m.project.slug);
  if (pick?.model) q.set('model', pick.model);
  if (pick?.effort) q.set('effort', pick.effort);
  return `[${mentionText(m.label, m.project)}](${AGENT_SCHEME}${m.engine}?${q.toString()})`;
};

/** The text as it is sent: every agent mention turned into its link. */
export function encodeMentions(text: string, mentions: readonly Mention[], picks: readonly (MentionPick | undefined)[] = []): string {
  let out = text;
  mentions.map((m, i) => ({ m, pick: picks[i] })).sort((a, b) => b.m.start - a.m.start).forEach(({ m, pick }) => {
    out = out.slice(0, m.start) + linkFor(m, pick) + out.slice(m.end);
  });
  return out;
}

const LINK = /\[(@[^\]]+)\]\((agentbox-agent:[^)\s]+)\)/g;

/** Every agent link in a message, in order. */
export function agentLinks(text: string): AgentLink[] {
  const out: AgentLink[] = [];
  for (const m of String(text ?? '').matchAll(LINK)) {
    const href = m[2];
    const [engine, query = ''] = href.slice(AGENT_SCHEME.length).split('?');
    const q = new URLSearchParams(query);
    out.push({ raw: m[0], engine, label: m[1].replace(/^@/, '').replace(/ in .*$/, ''), project: q.get('project'), model: q.get('model'), effort: q.get('effort'), task: q.get('task') });
  }
  return out;
}

/** The message with one link pointing at the task that answers it. */
export function withTask(text: string, link: AgentLink, task: string): string {
  const [words, href] = [link.raw.slice(0, link.raw.indexOf('](') + 2), link.raw.slice(link.raw.indexOf('](') + 2, -1)];
  return text.replace(link.raw, `${words}${href}${href.includes('?') ? '&' : '?'}task=${encodeURIComponent(task)})`);
}

/** The message as plain words: every agent link reduced to what it says. */
export const plainWords = (text: string) => String(text ?? '').replace(LINK, '$1');

/**
 * THE PROJECTS AN AGENT CAN BE SENT TO: every project you use, in your running
 * order, then by name. Never a conversation (it holds no work), never the
 * practice project, never one you have hidden.
 */
export function chatProjects(
  products: ReadonlyArray<{ slug: string; name: string; practice?: boolean; team?: { direct?: boolean } | null }>,
  order: readonly string[] = [], hidden: readonly string[] = [],
): Project[] {
  const rank = (slug: string) => { const i = order.indexOf(slug); return i < 0 ? Infinity : i; };
  return products
    .filter((p) => !p.team?.direct && !p.practice && !hidden.includes(p.slug))
    .sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name))
    .map((p) => ({ slug: p.slug, name: p.name }));
}

/**
 * THE CONVERSATION SO FAR, off its ledger: the opening message and every reply,
 * oldest first, each with who wrote it. A reply taken back is not part of it.
 */
export function chatTranscript(
  lines: ReadonlyArray<{ ts: number; by?: string; patch?: Record<string, unknown> | null }>,
  nameOf: (by: string | undefined) => string,
): Array<{ who: string; text: string }> {
  const out: Array<{ who: string; text: string }> = [];
  for (const l of lines.slice().sort((a, b) => a.ts - b.ts)) {
    const said = l.patch?.answer ?? l.patch?.body;
    if (typeof said !== 'string' || !said.trim() || said === '(withdrawn)') continue;
    out.push({ who: nameOf(l.by), text: said });
  }
  return out;
}

// How much of the conversation goes into the task. Enough to know what "findings
// 1 to 3" refers to; never the whole history of a long chat.
const BRIEF_MESSAGES = 12;
const BRIEF_CHARS_EACH = 1500;
const BRIEF_CHARS = 7000;

/**
 * THE TASK'S BRIEF: the ask in plain words, who asked and with whom, and the
 * conversation so far, newest last. An agent asked "make tasks from findings 1
 * to 3" has to be able to read the findings, and they are in the conversation,
 * not in the ask.
 */
export function taskBrief({ sent, asker, others, transcript }: {
  sent: string; asker: string; others: readonly string[]; transcript: ReadonlyArray<{ who: string; text: string }>;
}): string {
  const lines: string[] = [];
  let room = BRIEF_CHARS;
  for (const m of transcript.slice(-BRIEF_MESSAGES).reverse()) {
    const words = plainWords(m.text).trim();
    const text = words.length > BRIEF_CHARS_EACH ? `${words.slice(0, BRIEF_CHARS_EACH)}…` : words;
    const line = `**${m.who}:** ${text}`;
    if (line.length > room) break;
    room -= line.length;
    lines.unshift(line);
  }
  const withWhom = others.length ? ` in a conversation with ${others.join(', ')}` : ' in a conversation';
  return [
    plainWords(sent).trim(),
    '---',
    `Asked by ${asker}${withWhom}. Your answer is shown in that conversation, so write it for everyone in it.`,
    ...(lines.length ? ['The conversation so far, newest last:', ...lines] : []),
  ].join('\n\n');
}

/**
 * THE TASK'S TITLE: what was asked, read off the message as sent, with every
 * agent link taken out whole (so a project's name never loses half of itself).
 * The first line, the first letter capitalised, cut at a word near 80 characters.
 */
export function taskTitle(sent: string): string {
  const words = String(sent ?? '').replace(LINK, ' ')
    .split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const flat = words.replace(/\s+/g, ' ').replace(/^[,.:;\s-]+/, '').trim();
  const cut = flat.length > 80 ? `${flat.slice(0, 80).replace(/\s+\S*$/, '')}…` : flat;
  return cut ? cut[0].toUpperCase() + cut.slice(1) : `Asked in a conversation`;
}
