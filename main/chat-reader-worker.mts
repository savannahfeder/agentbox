// Reads chats off the app's main process (chat-reader.mts).
import { parentPort } from 'node:worker_threads';
import { readChats } from './chat-reader.mts';
import type { ChatRead } from './chat-reader.mts';

parentPort!.on('message', ({ id, ask }: { id: number; ask: ChatRead }) => {
  try {
    parentPort!.postMessage({ id, ok: true, value: readChats(ask) });
  } catch (err) {
    parentPort!.postMessage({ id, ok: false, error: String((err as { message?: unknown } | null)?.message ?? err) });
  }
});
