// THE PHONE APP'S NEW THREAD SENDS THE MODEL IT SHOWS AND REMEMBERS YOUR PICKS.
//
// Codex's parity audit of the app against the phone site found four ways the
// app's new-thread page differed from the site's card (renderer/src/threads/
// ThreadComposer.tsx, composer-rules.ts):
// - it showed Opus 5.5 but sent no model unless one was picked, so the Mac's
//   own default answered instead (the card always names the Claude model);
// - it chose a project once, on open, so a page opened before the projects
//   arrived had none, and one whose project went stayed pointed at it;
// - it forgot the project, model and level on every open, where the card
//   remembers each the moment it is picked;
// - a level, once picked, could not be cleared.
// And a Send pressed twice while files upload could send twice. These pin the
// app's rules (mobile/src/lib/compose.ts) to the card's, with the cases that
// must not pass: a level the model does not take, and a remembered project
// that is gone.
import { describe, it, expect } from 'vitest';
import { litEffort, newThreadChoices, onceAtATime, openingChoices, pickEffort, pickModel, pickProject, projectNow } from '../mobile/src/lib/compose';
import { DEFAULT_MODEL } from '../renderer/src/models';

function memory(start = {}) {
  const kept = new Map(Object.entries(start));
  return { kept, getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => { kept.set(k, String(v)); }, removeItem: (k) => { kept.delete(k); } };
}
const P = (slug) => ({ slug, name: slug });

describe('what a new thread sends', () => {
  it('names the Claude model it shows, the default included', () => {
    expect(newThreadChoices({ priority: null, model: DEFAULT_MODEL, effort: null })).toEqual({ model: 'opus' });
    expect(newThreadChoices({ priority: null, model: 'sonnet', effort: null })).toEqual({ model: 'sonnet' });
  });

  it('sends a level only when one was picked, and only one Claude Code takes', () => {
    expect(newThreadChoices({ priority: null, model: 'opus', effort: 'high' })).toEqual({ model: 'opus', effort: 'high' });
    expect(newThreadChoices({ priority: null, model: 'opus', effort: 'ultra' })).toEqual({ model: 'opus' });
  });

  // Untagged is left out: the press (mobile/src/lib/actions.ts) sends it as Medium, the card's 5.
  it('a tag goes as its own value, and untagged is left to the press', () => {
    expect(newThreadChoices({ priority: 'urgent', model: 'opus', effort: null }).priority).toBe(9);
    expect(newThreadChoices({ priority: 'low', model: 'opus', effort: null }).priority).toBe(2);
    expect('priority' in newThreadChoices({ priority: null, model: 'opus', effort: null })).toBe(false);
  });
});

describe('which project it goes to', () => {
  it('opens on the project you last sent to', () => {
    const store = memory({ 'zero.lastProduct': 'beta' });
    expect(openingChoices([P('alpha'), P('beta')], store).product).toBe('beta');
  });

  it('falls back to the first when the remembered one is gone', () => {
    const store = memory({ 'zero.lastProduct': 'gone' });
    expect(openingChoices([P('alpha'), P('beta')], store).product).toBe('alpha');
  });

  it('has none until projects arrive, then the first, with nothing picked in between', () => {
    const store = memory();
    expect(projectNow([], null, store)).toBeNull();
    expect(projectNow([P('alpha'), P('beta')], null, store)).toBe('alpha');
  });

  it('a pick stands while its project is there, and falls back when it goes', () => {
    const store = memory();
    expect(projectNow([P('alpha'), P('beta')], 'beta', store)).toBe('beta');
    expect(projectNow([P('alpha')], 'beta', store)).toBe('alpha');
  });

  it('a pick is remembered for the next new thread', () => {
    const store = memory();
    pickProject(store, 'beta');
    expect(openingChoices([P('alpha'), P('beta')], store).product).toBe('beta');
  });
});

describe('the model and level it remembers', () => {
  it('opens on the default, and on your last pick after one', () => {
    const store = memory();
    expect(openingChoices([], store)).toMatchObject({ model: DEFAULT_MODEL, effort: null });
    pickModel(store, 'sonnet');
    expect(openingChoices([], store).model).toBe('sonnet');
  });

  it('picking the default forgets the pick rather than storing it', () => {
    const store = memory();
    pickModel(store, 'sonnet');
    pickModel(store, DEFAULT_MODEL);
    expect(store.kept.size).toBe(0);
  });

  it('a level toggles against your own pick: pressed again, it clears and is forgotten', () => {
    const store = memory();
    expect(pickEffort(store, null, 'high')).toBe('high');
    expect(openingChoices([], store).effort).toBe('high');
    expect(pickEffort(store, 'high', 'max')).toBe('max');
    expect(pickEffort(store, 'max', 'max')).toBeNull();
    expect(openingChoices([], store).effort).toBeNull();
  });

  it('lights your level, or the model\'s own when you have not picked one', () => {
    expect(litEffort(null, 'opus')).toBe('medium');
    expect(litEffort(null, 'claude-opus-5')).toBe('high');
    expect(litEffort('max', 'opus')).toBe('max');
    expect(litEffort(null, 'claude-haiku-4-5')).toBeNull();
  });
});

describe('a Send pressed twice', () => {
  it('sends once while the first is still going, and again after it ends', async () => {
    let calls = 0;
    let finish;
    const send = onceAtATime(() => { calls += 1; return new Promise((r) => { finish = r; }); });
    const first = send();
    send();
    expect(calls).toBe(1);
    finish();
    await first;
    send();
    expect(calls).toBe(2);
  });

  it('a send that fails lets the next one through', async () => {
    let calls = 0;
    const send = onceAtATime(async () => { calls += 1; throw new Error('offline'); });
    await expect(send()).rejects.toThrow('offline');
    await expect(send()).rejects.toThrow('offline');
    expect(calls).toBe(2);
  });
});
