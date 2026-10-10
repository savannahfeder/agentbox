// A stand-in for `opencode serve` that speaks the shapes measured off the real
// binary (1.18.35) on 2026-10-07, so the worker's approval and lifecycle rules
// can be tested without a model, a key or a socket.
//
// The event names and payloads here are not invented: `permission.asked` with
// `{ id, sessionID, metadata: { command } }`, `session.idle`, `session.error`
// and `message.part.updated` all came off the real `/event` stream, and the
// reply endpoint really does take `{ response: 'once' | 'reject' }`.
export function fakeOpenCodeServer({ sessionId = 'ses_fake' } = {}) {
  const listeners = new Set();
  const state = {
    sessionId,
    created: 0,
    prompts: [],
    replies: [],
    aborted: [],
    summarized: [],
    commands: [],
  };

  let startedResolve;
  const started = new Promise(resolve => { startedResolve = resolve; });

  const emit = async (type, properties) => {
    for (const listener of [...listeners]) listener({ type, properties });
    // Let the worker's own awaits (the card, then the reply) settle before the
    // test looks at what the server was told.
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  };

  const client = {
    url: 'http://127.0.0.1:0',
    async createSession() { state.created += 1; return { id: state.sessionId }; },
    async prompt(id, body) {
      state.prompts.push({ sessionId: id, body });
      startedResolve();
    },
    async abort(id) { state.aborted.push(id); return true; },
    async replyPermission(id, permissionId, response) {
      state.replies.push({ sessionId: id, permissionId, response });
      return true;
    },
    async summarize(id, model) { state.summarized.push({ sessionId: id, model }); return true; },
    async runCommand(id, body) { state.commands.push({ sessionId: id, body }); return { ok: true }; },
    events() {
      let push;
      const queue = [];
      const listener = event => { queue.push(event); push?.(); };
      listeners.add(listener);
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              while (!queue.length) {
                if (!listeners.has(listener)) return { done: true, value: undefined };
                await new Promise(resolve => { push = resolve; });
              }
              return { done: false, value: queue.shift() };
            },
            async return() { listeners.delete(listener); push?.(); return { done: true, value: undefined }; },
          };
        },
        close() { listeners.delete(listener); push?.(); },
      };
    },
  };

  return {
    client,
    started,
    get sessionId() { return state.sessionId; },
    get created() { return state.created; },
    get prompts() { return state.prompts; },
    get replies() { return state.replies; },
    get aborted() { return state.aborted; },
    get summarized() { return state.summarized; },
    get commands() { return state.commands; },
    ask: (properties, type = 'permission.asked') => emit(type, properties),
    say: (type, properties) => emit(type, properties),
    finish: (id = state.sessionId) => emit('session.idle', { sessionID: id }),
    fail: (error, id = state.sessionId) => emit('session.error', { sessionID: id, error }),
  };
}
