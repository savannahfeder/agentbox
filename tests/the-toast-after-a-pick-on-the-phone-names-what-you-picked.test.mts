// THE TOAST AFTER A PICK ON THE PHONE NAMES WHAT YOU PICKED.
//
// What broke (phone tester, 2026-11-08): tapping an option raised "Option 1 →
// Agentbox", the option's number and the project, neither of which says what
// was chosen. Read from planFor's toast for a pick.
import { describe, it, expect } from 'vitest';
import { planFor } from '../mobile/src/lib/actions';

const item = { product: 'agentbox@d', id: 'w-1', status: 'blocked', title: 'Plan the phone app', productName: 'Agentbox' };
const pick = (text: string, n = 1) => planFor({ kind: 'pick', option: { n, text, recommended: n === 1 } }, item)!;

describe('the toast after a pick', () => {
  it('says the option\'s own words, with its Undo', () => {
    expect(pick('Start building the first version').toast).toBe('Picked: Start building the first version · press Z to undo');
  });
  it('drops the "(recommended)" mark the option was shown with', () => {
    expect(pick('Ship it (recommended)').toast).toBe('Picked: Ship it · press Z to undo');
  });
  it('clips a long option on a word', () => {
    const toast = pick('Mark it stopped so it shows in Needs you with the reason, and retry on another account first').toast!;
    expect(toast.replace(' · press Z to undo', '').length).toBeLessThanOrEqual('Picked: '.length + 49);
    expect(toast).not.toMatch(/Option \d/);
  });
  it('never names the option by number or the project', () => {
    expect(pick('Wait for Codex', 2).toast).not.toMatch(/Option|→|Agentbox/);
  });
  it('the Undo says what came back', () => {
    expect(pick('Wait for Codex', 2).undone!(null)).toBe('Pick withdrawn, back in your inbox');
  });
  it('the agent still reads the number and the words', () => {
    expect(pick('Wait for Codex', 2).steps[0].payload.answer).toBe('Option 2: Wait for Codex');
  });
  it('Close this task still closes and says so', () => {
    expect(pick('Close this task').toast).toMatch(/^Closed|^Done/);
  });
});
