// Past in-app conversations, read-only.
//
// This is continuity, not a feature: a founder and the in-app agent have already
// decided things in these logs that never made it into a document, and an
// external agent picking up a product months later should be able to find out
// why something is the way it is instead of re-deciding it.
//
// Strictly read-only, deliberately. The MCP has no business appending to a
// conversation the app owns and renders live; a message written here would
// appear in a chat with no session behind it, which reads to the founder as the
// agent talking to itself.

import { listChats, readChatLog } from '../../main/store/chats.mjs';
import { resolveProduct } from './account.mjs';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_TEXT = 4000;

export function listProductChats(ref) {
  const project = resolveProduct(ref);
  return listChats(project.dir).map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt ?? null,
    updatedAt: c.updatedAt ?? null,
  }));
}

/**
 * The tail of one conversation. Tail rather than head because the recent end is
 * almost always what a reader wants, and a long chat would otherwise spend the
 * whole budget on its opening.
 */
export function readProductChat(ref, { chatId = null, limit = DEFAULT_LIMIT } = {}) {
  const project = resolveProduct(ref);
  const chats = listChats(project.dir);
  if (!chats.length) return { chatId: null, title: null, messages: [] };

  const chat = chatId ? chats.find((c) => c.id === chatId) : chats[0]; // newest by default
  if (!chat) throw new Error(`no chat ${chatId} in ${project.name} (list_chats shows what exists)`);

  const n = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT);
  const log = readChatLog(project.dir, chat.id);

  return {
    chatId: chat.id,
    title: chat.title,
    total: log.length,
    messages: log.slice(-n).map((m) => ({
      role: m.role,
      // Truncated per message rather than per response: one enormous message
      // must not crowd out the twenty around it that give it meaning.
      text: typeof m.text === 'string' && m.text.length > MAX_TEXT ? `${m.text.slice(0, MAX_TEXT)}\n[truncated]` : (m.text ?? ''),
      ts: m.ts ?? null,
      // An unanswered question from a past session is a live loose end, so it
      // stays visible rather than being flattened into prose.
      ask: m.ask ? { status: m.ask.status, questions: (m.ask.questions ?? []).map((q) => q.question) } : undefined,
    })),
  };
}
