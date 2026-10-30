// AN OPEN THREAD IS SENT ONLY THE AGENT LOGS THAT CHANGED
// (tests/an-open-thread-is-sent-only-the-agent-logs-that-changed.test.mjs).
//
// The window's half. `have(key)` is the stamps to send for a thread
// (`product/id`); `take(key, answer)` fills in each log marked the same from
// what it holds, and is null when it no longer holds one, so the read is asked
// again with no stamps. The computer's half is `zero:session-trace` in main/ipc.mjs.

export function traceReader({ keep = 4 } = {}) {
  const held = new Map();
  return {
    have(key) {
      const entry = held.get(key);
      return entry ? Object.fromEntries([...entry.logs].map(([at, log]) => [at, log.stamp])) : undefined;
    },
    take(key, answer) {
      if (!Array.isArray(answer?.sessions)) return answer;
      const before = held.get(key);
      held.delete(key);
      if (!answer.sessions.every((s) => s.stamp)) return answer;
      const logs = new Map();
      for (const s of answer.sessions) {
        const text = s.same ? before?.logs.get(s.startedAt)?.text : s.text;
        if (typeof text !== 'string') return null;
        logs.set(s.startedAt, { stamp: s.stamp, text });
      }
      // Nothing changed: the same list goes back, so a screen holding it need not draw again.
      const unchanged = before && answer.sessions.length === before.sessions.length
        && answer.sessions.every((s, i) => s.same && before.sessions[i].startedAt === s.startedAt);
      const kept = new Map((before?.sessions ?? []).map((s) => [s.startedAt, s]));
      const sessions = unchanged ? before.sessions : answer.sessions.map((s) => (s.same && kept.get(s.startedAt)) || { startedAt: s.startedAt, text: logs.get(s.startedAt).text });
      held.set(key, { logs, sessions });
      while (held.size > keep) held.delete(held.keys().next().value);
      return { ...answer, sessions };
    },
  };
}
