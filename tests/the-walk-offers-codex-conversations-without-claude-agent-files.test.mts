// Launch QA, 2026-10-06: the finish gate read only Claude agent files.
// One Codex conversation and zero agent files meant zero import offers.
// Wait for conversations too, and skip only after every source is empty.
import { describe, expect, it } from 'vitest';
import { finishCard } from '../renderer/src/onboarding.ts';

const ready = { missing: false };
const noFiles = { read: true, some: false };

describe('the onboarding import checks conversations as well as agent files', () => {
  it.each(['codex', 'claude'])('offers a %s conversation without any agent files', (source) => {
    const card = finishCard(ready, noFiles, [{ source, imported: false }]);
    expect(card.show).toBe(true);
    expect(card.skip).not.toBe(true);
  });

  it('waits for the conversation read instead of finishing early', () => {
    const card = finishCard(ready, noFiles, null);
    expect(card.show).toBe(false);
    expect(card.skip).not.toBe(true);
  });

  it('waits for agent files even if a conversation has arrived', () => {
    expect(finishCard(ready, { read: false, some: false }, [{}]).show).toBe(false);
  });

  it('skips when all sources have been read and there is nothing to import', () => {
    expect(finishCard(ready, noFiles, []).skip).toBe(true);
  });

  it('skips conversations already imported, but offers any remaining one', () => {
    expect(finishCard(ready, noFiles, [{ imported: true }]).skip).toBe(true);
    expect(finishCard(ready, noFiles, [{ imported: true }, {}]).show).toBe(true);
  });

  it('still offers agent files when there are no conversations', () => {
    expect(finishCard(ready, { read: true, some: true }, []).show).toBe(true);
  });

  it('keeps the setup gate when neither coding engine exists', () => {
    expect(finishCard({ missing: true }, noFiles, [{}]).blocked).toBe(true);
  });
});
