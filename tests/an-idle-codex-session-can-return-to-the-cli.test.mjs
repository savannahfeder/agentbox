// Native resume failed with "already active writer" after a completed app turn.
// Release only idle account servers; other workers and compactions must survive.
import { it, expect, vi } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';
function setup() {
  const s = Object.create(Supervisor.prototype);
  s.sessions = new Map(); s._compactionJobs = new Map();
  s._codexProfileHome = profile => `/accounts/${profile}`;
  const close = vi.fn(), other = vi.fn();
  s._codexServers = new Map([
    ['/accounts/default', { client: { close } }],
    ['/accounts/other', { client: { close: other } }],
  ]);
  return { s, close, other };
}
it('releases an idle account without closing another account', () => {
  const { s, close, other } = setup(); s._releaseIdleCodex('default');
  expect(close).toHaveBeenCalledOnce(); expect(other).not.toHaveBeenCalled();
  expect(s._codexServers.has('/accounts/default')).toBe(false);
});
it.each(['worker', 'compaction'])('keeps an account with another active %s', kind => {
  const { s, close } = setup();
  (kind === 'worker' ? s.sessions : s._compactionJobs).set('busy', { engine: 'codex', profile: 'default' });
  s._releaseIdleCodex('default'); expect(close).not.toHaveBeenCalled();
});
it('does not confuse a Claude worker with a Codex writer', () => {
  const { s, close } = setup(); s.sessions.set('claude', { engine: 'claude', profile: 'default' });
  s._releaseIdleCodex('default'); expect(close).toHaveBeenCalledOnce();
});
