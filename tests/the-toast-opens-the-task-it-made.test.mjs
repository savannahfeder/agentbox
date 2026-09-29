// THE TOAST THAT SAYS A TASK WAS MADE IS THE WAY INTO IT.
//
// These are greps over App.tsx, with the same caveat the reply-box wiring test
// carries at length: there is no renderer render harness in this repo, so a
// click cannot be driven here. What they hold is the shape, which is the part a
// later edit can undo without noticing.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');

describe('the toast can carry a way in', () => {
  it('holds the row by id rather than a closure over the list', () => {
    // A closure made at send time would hold the list from BEFORE the row
    // existed. The lookup happens at click time instead.
    expect(app).toContain("const [toast, setToast] = useState<{ text: string; goes?: { product: string; id: string } } | null>(null);");
    expect(app).toContain('const showToast = useCallback((text: string, goes?: { product: string; id: string }) => {');
  });

  it('is handed the row a new task was filed as', () => {
    expect(app).toContain('made?.id ? { product: p.product, id: made.id } : undefined');
  });

  it('opens that row, marks it seen and clears itself', () => {
    expect(app).toMatch(/setToast\(null\);\s*if \(!row\) return;/);
    expect(app).toMatch(/setFocused\(row\);\s*markSeen\(row\);/);
  });

  it('outlives noticing it, which 2.5 seconds did not', () => {
    // Her report is that she sometimes does not notice this one go past at all,
    // and a toast she is meant to CLICK has to survive reaching the trackpad.
    expect(app).toContain('setTimeout(() => setToast(null), goes ? 6000 : 2500);');
  });

  it('stays a plain announcement when there is nowhere to go', () => {
    // Nothing that is only telling her something grows a pointer or a ring.
    expect(app).toContain('<div className="toast">{toast.text}</div>');
  });

  it('says out loud that it is pressable', () => {
    expect(app).toContain('<span className="toast-go">Open it</span>');
    expect(css).toContain('.toast-goes {');
    expect(css).toMatch(/\.toast-goes \{[^}]*cursor: pointer;/s);
    expect(css).toMatch(/\.toast-goes:focus-visible \{[^}]*outline:/s);
  });
});

// AND ANSWERING A TASK IS THE SAME MOMENT AS FILING ONE.
//
// w-8ca9b50e36: after a task is submitted, the toast carries an underlined
// "Open it now" link. Answering an existing task had no such link, and it
// should carry the same one.
//
// Three actions answer a row: a typed reply, an approval, a picked option. All
// three go through deferCommit, so the way in is a parameter on that rather
// than three separate toasts.
describe('the toast after an answer carries the same way in', () => {
  it('deferCommit takes a destination', () => {
    expect(app).toMatch(/goes\?: \{ product: string; id: string \},\s*\) => \{/);
    expect(app).toContain('showToast(`${toast} · press Z to undo`, stay ? undefined : goes);');
  });

  it('a typed reply hands it the row it answered', () => {
    expect(app).toContain('`Sent → ${item.productName}`, restore, stay, { product: item.product, id: item.id }');
  });

  it('an approval hands it the row it approved', () => {
    expect(app).toContain('}, toast, undefined, undefined, { product: item.product, id: item.id });');
  });

  it('a picked option hands it the row it picked on', () => {
    expect(app).toContain('`Option ${option.n} → ${item.productName}`, undefined, undefined, { product: item.product, id: item.id }');
  });

  it('closing a row still says nothing but what happened', () => {
    // Closing, scheduling and priority are not answers: nothing starts on them
    // and there is nothing to go and watch, so those toasts stay plain.
    expect(app).toContain('}, `Closed: ${clipToSentence(item.title, TOAST_TITLE)}`);');
  });
});
