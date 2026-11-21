// HANDING A THREAD OVER LETS GO OF ANYONE ASKED ONTO IT (w-f702d60afe, 2026-11-21).
//
// A review of the hand-off flow: Sam asked Theo for a review, then handed the
// thread to Lena. Theo's ask stayed open, so he went on reviewing a thread that
// was no longer Sam's. An AI teammate's hand-over also said "Given to".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const give = app.slice(app.indexOf('const giveThread = async'), app.indexOf('const askOnThread = async'));

describe('handing a thread over', () => {
  it('closes every open ask on it once the hand-over went', () => {
    expect(give).toContain('const asked = out.ok && team ? asksOnThread(items, team.me, item.id).filter((a) => a.open) : [];');
    expect(give).toContain("await api.answer({ product: (a.row as WorkItem).product, id: a.row.id, status: 'done' })");
  });
  it('says who no longer has the ask', () => {
    expect(give).toContain("no longer ${asked.length === 1 ? 'has' : 'have'} the ask");
  });
  it('says Handed over to an AI teammate too', () => {
    expect(give).toContain('.then(() => showToast(handedToWhom(to.name))');
    expect(give).not.toContain('Given to');
  });
});
