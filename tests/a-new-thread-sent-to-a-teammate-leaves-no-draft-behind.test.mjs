// The power test of 2026-10-25: a New thread sent to a teammate came back in
// the next New thread box, and the tester's next task went out as the old
// words glued to the new ones ("...mobile tooabooking two appointments"), one
// wrong Codex thread. The teammate send emptied the box and closed the card,
// but the draft saved on every keystroke was never dropped, as every other
// send drops it. Now it takes the draft when it sends, drops it when the send
// stands, and puts it back when it fails.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const card = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
const send = card.slice(card.indexOf('const sendToTeammate = async () => {'), card.indexOf('const send = () =>'));

describe('a New thread to a teammate', () => {
  it('drops the saved draft once the send stands, as a task or a message does', () => {
    expect(send).toMatch(/const taken = markComposeDraftSending\(\);/);
    expect(send).toMatch(/if \(err\) \{ restoreComposeDraft\(taken\); setError\(err\); \}\s*else \{ dropComposeDraft\(taken\); setText\(''\); onClose\(\); \}/);
  });
});
