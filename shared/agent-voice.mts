// WHICH AGENT WROTE A MESSAGE THAT ITS OWNER'S COPY SENT.
//
// A message an agent sends is a line by its owner (the cloud knows only people),
// with a mark on it naming the agent. The owner is always the line's own writer,
// never anything the mark says, so nobody can sign a message as another person's
// agent.
const MARK_ID = /^t-[0-9a-f]{6,}$/;
const RUN_ID = /^w-[0-9a-f]{6,}$/;

// A thread that is no AI teammate's writes under this name.
export const PLAIN_AGENT = 'Agent';

export interface AgentVoice { name: string; id?: string; run?: string }

export function cleanVoice(input: unknown): AgentVoice | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const v = input as { name?: unknown; id?: unknown; run?: unknown };
  const name = typeof v.name === 'string' ? v.name.trim().slice(0, 40) : '';
  if (!name) return null;
  return {
    name,
    ...(typeof v.id === 'string' && MARK_ID.test(v.id) ? { id: v.id } : {}),
    ...(typeof v.run === 'string' && RUN_ID.test(v.run) ? { run: v.run } : {}),
  };
}

const firstWord = (name: string | null | undefined): string => String(name ?? '').trim().split(/\s+/)[0] ?? '';

/** "Chief of staff, Maya's" to everyone else; just its name to its owner. */
export function voiceName(voice: { name: string }, ownerName: string | null | undefined, { mine = false }: { mine?: boolean } = {}): string {
  const first = firstWord(ownerName);
  return mine || !first ? voice.name : `${voice.name}, ${first}'s`;
}

// A group's message has no room for a mark in the cloud, so it rides at the head
// of the words. An older copy shows it as a plain first line.
const ROOM_MARK = /^\[agent(?: (t-[0-9a-f]{6,}))?(?: (w-[0-9a-f]{6,}))?: ([^\]\n]{1,40})\]\n/;

export function roomBody(voice: AgentVoice, text: string): string {
  const parts = [voice.id, voice.run].filter(Boolean).join(' ');
  return `[agent${parts ? ` ${parts}` : ''}: ${voice.name}]\n${text}`;
}

/** A room message with its mark taken off the words and kept as `voice`. One with no mark comes back as it was. */
export function readRoomMessage<T extends { body?: unknown }>(m: T): T & { voice?: AgentVoice } {
  const found = typeof m?.body === 'string' ? ROOM_MARK.exec(m.body) : null;
  if (!found) return m as T & { voice?: AgentVoice };
  const voice = cleanVoice({ id: found[1], run: found[2], name: found[3] });
  return voice ? { ...m, body: (m.body as string).slice(found[0].length), voice } : m as T & { voice?: AgentVoice };
}
