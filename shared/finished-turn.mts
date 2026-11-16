// Whether a session's transcript ends on a turn the agent finished, and the
// answer it finished on. Null whenever that is not certain, so the caller falls
// back to the ordinary interrupted resume.

export interface EndedTurn { text: string; at: number }

type Line = Record<string, unknown> & { timestamp?: unknown };

const parsed = (text: string): Line[] => String(text ?? '').split('\n').flatMap((raw) => {
  if (!raw.trim()) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' ? [v as Line] : [];
  } catch { return []; }
});

const when = (l: Line): number => {
  const t = Date.parse(String(l.timestamp ?? ''));
  return Number.isFinite(t) ? t : 0;
};

function codexTurn(lines: Line[]): EndedTurn | null {
  let ended: EndedTurn | null = null;
  let said = '';
  for (const l of lines) {
    if (l.type !== 'event_msg' || !l.payload || typeof l.payload !== 'object') continue;
    const p = l.payload as { type?: unknown; message?: unknown; last_agent_message?: unknown };
    if (p.type === 'task_started' || p.type === 'user_message' || p.type === 'turn_aborted') { ended = null; said = ''; }
    else if (p.type === 'agent_message' && typeof p.message === 'string') said = p.message;
    else if (p.type === 'task_complete' || p.type === 'turn_complete') {
      const text = (typeof p.last_agent_message === 'string' && p.last_agent_message.trim() ? p.last_agent_message : said).trim();
      ended = text ? { text, at: when(l) } : null;
    }
  }
  return ended;
}

function claudeTurn(lines: Line[]): EndedTurn | null {
  const last = lines.filter((l) => l.type === 'user' || l.type === 'assistant').at(-1);
  if (!last || last.type !== 'assistant') return null;
  const m = last.message as { stop_reason?: unknown; content?: unknown } | undefined;
  if (m?.stop_reason !== 'end_turn' || !Array.isArray(m.content)) return null;
  const blocks = m.content as { type?: unknown; text?: unknown }[];
  if (blocks.some((b) => b?.type === 'tool_use')) return null;
  const text = blocks.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text as string).join('\n').trim();
  return text ? { text, at: when(last) } : null;
}

export function turnThatEnded(transcript: string, engine: string): EndedTurn | null {
  const lines = parsed(transcript);
  return engine === 'codex' ? codexTurn(lines) : engine === 'claude' ? claudeTurn(lines) : null;
}
