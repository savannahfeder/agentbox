// On the Nov 26 onboarding call a person brought a Claude Code session from
// their terminal into Agentbox and typed "/" for one of their skills. The menu
// offered only Agentbox's built-in commands, and a skill typed by hand was
// refused as "not supported in Agentbox yet": the names Claude Code offers are
// only learned from a thread's own first run, and a brought-in thread has had
// none. Measured on a live copy with a stand-in terminal session: after
// Continue in Agentbox, "/" listed modes and built-ins only.
import { it, expect, vi } from 'vitest';
import { Supervisor } from '../main/supervisor.mts';
import { taskCommand } from '../main/task-commands.mts';
import { commandPrompt } from '../shared/claude-commands.mts';

type Fake = Record<string, unknown>;
const catalog = (sup: Fake, product: string, id: string) => Supervisor.prototype.commandCatalog.call(sup as unknown as Supervisor, product, id);
const namesFor = (sup: Fake, product: string, id: string) => Supervisor.prototype.nativeNamesFor.call(sup as unknown as Supervisor, product, id);

function sup(items: Record<string, { product: string }>, commands: Record<string, string[]>): Fake {
  return {
    store: { readItem: (product: string, id: string) => (items[id]?.product === product ? { id, product, ...items[id] } : null) },
    _engineFor: () => 'claude',
    _nativeCommands: commands,
    _compactions: {},
    _saveState: vi.fn(),
    onChange: vi.fn(),
    nativeNamesFor(this: Fake, product: string, id: string) { return Supervisor.prototype.nativeNamesFor.call(this as unknown as Supervisor, product, id); },
  };
}

it('a thread that has not run yet offers what Claude Code last offered in the same project', () => {
  const s = sup({ fresh: { product: 'shop' } }, { 'project:shop': ['release-checklist', 'code-review'] });
  expect(catalog(s, 'shop', 'fresh')).toEqual(['release-checklist', 'code-review']);
});

it('a terminal session row, which has no thread yet, offers its project’s commands too', () => {
  const s = sup({}, { 'project:shop': ['release-checklist'] });
  expect(catalog(s, 'shop', 'agent:4102')).toEqual(['release-checklist']);
});

it('a thread that has run keeps its own list, and another project’s list is never borrowed', () => {
  const s = sup({ ran: { product: 'shop' }, other: { product: 'blog' } }, { ran: ['deploy'], 'project:shop': ['release-checklist'], 'project:blog': ['publish'] });
  expect(catalog(s, 'shop', 'ran')).toEqual(['deploy']);
  expect(catalog(s, 'shop', 'nothing-here')).toEqual(['release-checklist']);
  expect(catalog(s, 'docs', 'nothing-here')).toEqual([]);
});

it('a list nobody has reported yet is unknown, not empty', () => {
  const s = sup({ fresh: { product: 'shop' } }, {});
  expect(namesFor(s, 'shop', 'fresh')).toBeNull();
  expect(namesFor(sup({ ran: { product: 'shop' } }, { ran: [] }), 'shop', 'ran')).toEqual([]);
});

it('a skill typed on a brought-in thread goes to Claude Code instead of being refused', async () => {
  const known = sup({ fresh: { product: 'shop' } }, { 'project:shop': ['release-checklist'] });
  expect((await taskCommand(known, 'shop', 'fresh', '/release-checklist')).state).toBe('forward');
  // Nothing reported anywhere yet: Claude Code is the one that knows.
  const unknown = sup({ fresh: { product: 'shop' } }, {});
  expect((await taskCommand(unknown, 'shop', 'fresh', '/release-checklist now')).state).toBe('forward');
});

it('a name the project’s reported list does not have is still refused', async () => {
  const s = sup({ fresh: { product: 'shop' } }, { 'project:shop': ['release-checklist'] });
  expect((await taskCommand(s, 'shop', 'fresh', '/not-a-skill')).state).toBe('failed');
});

it('the run takes a skill its project reported as a command, and an unreported name as words', () => {
  const s = sup({ fresh: { product: 'shop' } }, { 'project:shop': ['release-checklist'] });
  expect(commandPrompt('/release-checklist now', namesFor(s, 'shop', 'fresh') ?? [])).toBe('/release-checklist now');
  // Unknown is not a licence: a reply that only starts with a slash must not jump the queue as a command.
  expect(commandPrompt('/deploy the branch', namesFor(sup({}, {}), 'shop', 'fresh') ?? [])).toBeNull();
});
