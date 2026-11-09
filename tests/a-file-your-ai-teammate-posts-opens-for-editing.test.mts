// A FILE YOUR AI TEAMMATE POSTS OPENS FOR EDITING.
//
// The owner: "can't seem to edit artifacts in chats with teammates". A document
// card in an AI teammate's chat opened through the opener for a person's shared
// thread, which marks the file read-only because it is a copy of theirs. Your AI
// teammate's files are in your own project, so the pane drew them with no way to
// type. Measured by reading App.tsx: the teammates hook was handed
// openTeammateFile, which sets readOnly: true.
import { it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const opener = (name) => app.match(new RegExp(`const ${name} = useCallback\\(\\(product: string, src: string\\) => \\{ (setOpenDoc\\(\\{[^}]*\\}\\)); \\}, \\[\\]\\);`))?.[1] ?? null;
const hookOpens = app.match(/useTeammates\(\{[\s\S]*?onOpenFile: (\w+),/)?.[1];

it('the AI teammate chat opens its files with an opener of its own', () => {
  expect(hookOpens).toBeTruthy();
  expect(hookOpens).not.toBe('openTeammateFile');
});

it('that opener leaves the file editable', () => {
  const body = opener(hookOpens);
  expect(body).toBeTruthy();
  expect(body).not.toMatch(/readOnly/);
});

it("a person's shared thread still opens its copies read-only", () => {
  expect(opener('openTeammateFile')).toMatch(/readOnly: true/);
  expect(app).toMatch(/<TeammateThread[^>]*onOpenDoc=\{openTeammateFile\}/);
});
