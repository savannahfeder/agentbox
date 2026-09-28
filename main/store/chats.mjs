// Chat store: per-product conversations under <project>/chats/, one JSONL log
// per chat plus a registry (chats/index.json: id, title, createdAt, updatedAt,
// lastSessionId). Same rules as the rest of the store: single writer (main),
// atomic index writes, crash-safe appends, and self-repair on read (an entry
// whose file vanished drops out instead of wedging the UI). A message is
// UPDATED by appending a line with the same id; reading folds last-line-wins.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWriteJson, readJson } from './project.mjs';

const iso = () => new Date().toISOString();
const chatsDir = (projectDir) => path.join(projectDir, 'chats');
const indexFile = (projectDir) => path.join(chatsDir(projectDir), 'index.json');

export function sanitizeChatId(id) {
  const s = String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!s) throw new Error(`bad chat id: ${id}`);
  return s;
}

export function chatFile(projectDir, chatId) {
  return path.join(chatsDir(projectDir), `${sanitizeChatId(chatId)}.jsonl`);
}

function mutateIndex(projectDir, mutate) {
  const idx = readJson(indexFile(projectDir), { chats: [] });
  mutate(idx);
  atomicWriteJson(indexFile(projectDir), idx);
  return idx;
}

// Idempotent bootstrap: creates chats/, migrates the legacy single chat.jsonl
// ONCE (copy to chats/main.jsonl, rename the original to .migrated so a failed
// first-open never strands history), carries project.lastSessionId over, and
// guarantees at least one chat exists.
export function ensureChats(projectDir, project = {}) {
  fs.mkdirSync(chatsDir(projectDir), { recursive: true });
  if (!fs.existsSync(indexFile(projectDir))) {
    const chats = [];
    const legacy = path.join(projectDir, 'chat.jsonl');
    if (fs.existsSync(legacy)) {
      fs.copyFileSync(legacy, chatFile(projectDir, 'main'));
      fs.renameSync(legacy, `${legacy}.migrated`);
      chats.push({ id: 'main', title: 'First conversation', createdAt: iso(), updatedAt: iso(), lastSessionId: project.lastSessionId ?? null });
    }
    atomicWriteJson(indexFile(projectDir), { chats });
  }
  if (listChats(projectDir).length === 0) createChat(projectDir);
  return listChats(projectDir);
}

// Registry with self-repair: entries whose log file is gone are dropped
// (and pruned from the index so they stay gone), newest first.
export function listChats(projectDir) {
  const idx = readJson(indexFile(projectDir), { chats: [] });
  const alive = (idx.chats ?? []).filter((c) => {
    try { return c?.id && fs.existsSync(chatFile(projectDir, c.id)); } catch { return false; }
  });
  if (alive.length !== (idx.chats ?? []).length) {
    mutateIndex(projectDir, (i) => { i.chats = alive; });
  }
  return [...alive].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
}

export function getChat(projectDir, chatId) {
  return listChats(projectDir).find((c) => c.id === chatId) ?? null;
}

export function createChat(projectDir, title = 'New chat', { modelId } = {}) {
  fs.mkdirSync(chatsDir(projectDir), { recursive: true });
  const id = `c-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(chatFile(projectDir, id), '');
  // modelId pins THIS conversation's model at birth (the caller passes the
  // workspace's most recent choice). Undefined = follow the global default,
  // which is what every pre-existing chat does.
  const chat = { id, title, createdAt: iso(), updatedAt: iso(), lastSessionId: null, ...(modelId ? { modelId } : {}) };
  mutateIndex(projectDir, (idx) => { idx.chats = [...(idx.chats ?? []), chat]; });
  return chat;
}

export function patchChat(projectDir, chatId, patch) {
  let out = null;
  mutateIndex(projectDir, (idx) => {
    idx.chats = (idx.chats ?? []).map((c) => {
      if (c.id !== chatId) return c;
      out = { ...c, ...patch };
      return out;
    });
  });
  return out;
}

export function renameChat(projectDir, chatId, title) {
  const t = String(title ?? '').trim();
  return t ? patchChat(projectDir, chatId, { title: t }) : null;
}

// Delete = move the log into chats/.trash/ (never rm) and drop the entry.
// The caller must close the chat's session FIRST; a trashed chat takes no
// further writes (appendChatMessage refuses unregistered chats).
export function trashChat(projectDir, chatId) {
  const entry = getChat(projectDir, chatId);
  if (!entry) return false;
  const trash = path.join(chatsDir(projectDir), '.trash');
  fs.mkdirSync(trash, { recursive: true });
  fs.renameSync(chatFile(projectDir, chatId), path.join(trash, `${sanitizeChatId(chatId)}-${Date.now()}.jsonl`));
  // Drop this chat's attachment assets (chats/<chatId>/assets/, written on send):
  // they belong to the conversation, so a trashed chat takes them with it and the
  // storage does not silt up with orphaned images. force so a chat with no assets
  // is a clean no-op.
  fs.rmSync(path.join(chatsDir(projectDir), sanitizeChatId(chatId)), { recursive: true, force: true });
  mutateIndex(projectDir, (idx) => { idx.chats = (idx.chats ?? []).filter((c) => c.id !== chatId); });
  return true;
}

// Auto-scrub abandoned empty chats. createChat writes an empty log the moment
// a chat is born, so a founder who opens "New chat" and walks away silts the
// sidebar up forever. An empty chat (zero messages, the same last-line-wins fold
// used everywhere) carries no history worth keeping, so we trash it (recoverable,
// never rm) UNLESS it is the active chat or its id is in keepIds (a chat with
// unsent composer draft text). The active chat is always protected, which is what
// keeps a scrub-then-ensure cycle from churning: ensureChats only recreates when
// zero chats remain, and the one you are looking at never gets scrubbed.
export function scrubEmptyChats(projectDir, { keepIds = [], activeId } = {}) {
  const keep = new Set([...(keepIds ?? []), ...(activeId ? [activeId] : [])]);
  const removed = [];
  for (const c of listChats(projectDir)) {
    if (keep.has(c.id)) continue;
    if (readChatLog(projectDir, c.id).length > 0) continue;
    if (trashChat(projectDir, c.id)) removed.push(c.id);
  }
  return { removed };
}

export function appendChatMessage(projectDir, chatId, message) {
  if (!getChat(projectDir, chatId)) throw new Error(`no such chat: ${chatId}`);
  fs.appendFileSync(chatFile(projectDir, chatId), JSON.stringify(message) + '\n');
  patchChat(projectDir, chatId, { updatedAt: iso() });
}

// Resolve a pending ask directly on the chat log: for a question whose
// owning session died (an app restart), no live asks registry can answer it,
// but the question must still be answerable, or it sits pending forever
// (eating tapped answers and suppressing the chat's thinking indicator).
// Folds any tapped answers into the card, persists it as answered
// (last-line-wins), and returns the resolved message, or null when there is
// no matching pending ask.
export function resolvePendingAsk(projectDir, chatId, requestId, answers = []) {
  const card = readChatLog(projectDir, chatId)
    .find((m) => m.ask?.requestId === requestId && m.ask.status === 'pending');
  if (!card) return null;
  const list = Array.isArray(answers) ? answers : [];
  const questions = (card.ask.questions ?? []).map((q) => {
    const a = list.find((x) => x?.id === q.id);
    return a
      ? {
        ...q,
        answer: {
          choiceId: a.choiceId,
          // "pick all that apply": every pill she tapped, not just the first
          ...(Array.isArray(a.choiceIds) ? { choiceIds: a.choiceIds } : {}),
          freeText: a.freeText,
          skipped: !!a.skipped,
        },
      }
      : q;
  });
  const resolved = { ...card, ask: { ...card.ask, questions, status: 'answered' } };
  appendChatMessage(projectDir, chatId, resolved);
  return resolved;
}

export function readChatLog(projectDir, chatId) {
  let lines;
  try {
    lines = fs.readFileSync(chatFile(projectDir, chatId), 'utf8').split('\n').filter(Boolean);
  } catch { return []; }
  const order = []; const byId = new Map();
  for (const l of lines) {
    let m; try { m = JSON.parse(l); } catch { continue; } // torn tail line: skip
    if (!m?.id) continue;
    if (!byId.has(m.id)) order.push(m.id);
    byId.set(m.id, { ...(byId.get(m.id) ?? {}), ...m });
  }
  return order.map((id) => byId.get(id));
}
