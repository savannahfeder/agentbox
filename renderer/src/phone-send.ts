// WHAT THE PHONE SENDS HER MAC, for the phone site (cloud-bridge.ts) and the
// phone app (mobile/) alike: each door the screens press, the command it
// leaves, and taking one back while her Mac has not claimed it.

import { REQUEST_CHANNELS } from '../../shared/bridge-map.mjs';
import { madeHere } from '../../shared/phone-snapshot.mjs';
import {
  NOT_HERE, UNDONE, approvalCommand, commandFor, phoneSlug, phoneView, realItem, takeBack, type Aliases, type PhoneRows,
} from './phone-rows';

type Command = PhoneRows['commands'][number];
export interface SendClient {
  generation(): number;
  insertCommand(row: Record<string, unknown>): Promise<Command>;
  update(table: string, query: string, patch: Record<string, unknown>): Promise<any[]>;
}

export function phoneSender({ client, rows, setRows, aliases, changed }: {
  client: SendClient;
  rows: () => PhoneRows;
  setRows: (next: PhoneRows) => void;
  aliases: () => Aliases;
  changed: () => void;
}) {
  // Threads whose reply was just taken back: the window's own undo goes on to
  // put the schedule back and send "(withdrawn)", none of which the Mac saw.
  const withdrawn = new Map<string, number>();
  // A reply to a thread put off clears the schedule on her Mac (phone-inbox.mjs
  // ROUTES), so the window's clearing call right after it has nothing to do.
  const replied = new Map<string, number>();
  const scheduled = (p: any) => {
    const item = realItem(aliases(), p?.product, p?.id);
    const t = rows().threads.find((r) => phoneSlug(r.device, r.project) === p?.product && r.item === item)?.snapshot?.item;
    return Math.max(Number(t?.runAt) || 0, Number(t?.snoozedUntil) || 0) > Date.now();
  };

  const leave = async (channel: string, payload: any) => {
    const back = takeBack(rows(), channel, payload, aliases());
    if (back) {
      const asked = client.generation();
      // Only while the computer has not claimed it (Codex's third review, finding 3).
      const done = await client.update('phone_commands', `id=eq.${encodeURIComponent(back.id)}&taken_at=is.null&claimed_at=is.null`, { taken_at: new Date().toISOString(), outcome: UNDONE });
      if (!done.length) throw new Error('Your computer already has it. Reopen it there.');
      if (client.generation() === asked) setRows({ ...rows(), commands: rows().commands.map((c) => (c.id === back.id ? done[0] : c)) });
      if (back.kind === 'reply') withdrawn.set(`${payload.product}/${payload.id}`, Date.now());
      changed();
      return { ok: true };
    }
    if ((withdrawn.get(`${payload?.product}/${payload?.id}`) ?? 0) > Date.now() - 60_000
      && (channel === REQUEST_CHANNELS.schedule || (channel === REQUEST_CHANNELS.answer && (payload?.answer === '(withdrawn)' || !String(payload?.answer ?? '').trim())))) return { ok: true };
    if (channel === REQUEST_CHANNELS.stopSession && payload?.withdraw) throw new Error('Your computer already has it. Undo it there.');
    const cmd = commandFor(channel, channel === REQUEST_CHANNELS.answer && scheduled(payload) ? { ...payload, unschedule: true } : payload, aliases());
    if (!cmd) throw new Error(NOT_HERE);
    const asked = client.generation();
    const row = await client.insertCommand(cmd);
    if (client.generation() === asked) setRows({ ...rows(), commands: [...rows().commands, row] });
    if (cmd.kind === 'reply' && cmd.payload.unschedule) replied.set(`${payload.product}/${payload.id}`, Date.now());
    changed();
    // The row the inbox draws for a new thread until her Mac makes it, so it has Undo and Open.
    if (cmd.kind === 'new') return { id: madeHere(row.id), product: payload.product, title: String(cmd.payload.title || cmd.payload.body || '').slice(0, 200), body: String(cmd.payload.body ?? ''), status: 'open', kind: 'directive', labels: ['founder'], priority: 0, createdAt: Date.now(), updatedAt: Date.now() };
    return { ok: true };
  };

  return {
    answer: (p: unknown) => leave(REQUEST_CHANNELS.answer, p),
    stopSession: (p: unknown) => leave(REQUEST_CHANNELS.stopSession, p),
    runNow: (p: unknown) => leave(REQUEST_CHANNELS.runNow, p),
    sendNow: (p: unknown) => leave(REQUEST_CHANNELS.sendNow, p),
    reopen: (p: unknown) => leave(REQUEST_CHANNELS.reopen, p),
    snooze: (p: unknown) => leave(REQUEST_CHANNELS.snooze, p),
    compose: (p: unknown) => leave(REQUEST_CHANNELS.compose, p),
    schedule: async (p: any) => {
      if (p?.runAt === 0 && (replied.get(`${p.product}/${p.id}`) ?? 0) > Date.now() - 60_000) return { ok: true };
      return leave(REQUEST_CHANNELS.schedule, p);
    },
    // Allow and Deny go to her Mac with the card they answer (phone-inbox.mjs).
    approve: async (p: { id: string; allow: boolean; note?: string }) => {
      const cmd = approvalCommand(phoneView(rows()).cards, p);
      if (!cmd) return { ok: false, error: 'This card is no longer waiting.' };
      try {
        const asked = client.generation();
        const row = await client.insertCommand(cmd);
        if (client.generation() === asked) setRows({ ...rows(), commands: [...rows().commands, row] });
        changed();
        return { ok: true };
      } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; }
    },
  };
}

export type PhoneSender = ReturnType<typeof phoneSender>;
