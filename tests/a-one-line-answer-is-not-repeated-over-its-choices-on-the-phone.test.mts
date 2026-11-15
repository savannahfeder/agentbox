// A ONE-LINE ANSWER IS NOT REPEATED OVER ITS CHOICES ON THE PHONE.
//
// The 2026-11-07 phone workday (issues 13, 22, 23): "Shipped. Each account
// meter now ends with its reset time" was drawn as the answer and again as the
// heading of the choices card right under it. The desktop heads the choices
// with `askHeading`, which leaves the heading off over an answer that is only
// that one line; the phone used `askLine`, which never does. Measured by
// opening the thread in the phone preview and reading the screen.
import { describe, it, expect } from 'vitest';
import { previewRows } from '../mobile/src/lib/preview';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { threadOf } from '../mobile/src/lib/thread';

const NOW = Date.parse('2026-11-07T19:00:00Z');

describe('the heading over a thread\'s choices on the phone', () => {
  const rows = previewRows(NOW);
  const view = phoneView(rows, NOW);
  const open = (project, id) => threadOf(rows, view, phoneSlug(rows.projects[0].device, project), id);

  it('is left off when the answer is only that one line', () => {
    const t = open('site', 'w-3c4d5e6f7a');
    expect(t.outcome?.text ?? '').toMatch(/^Shipped\. Each account meter/);
    expect(t.ask).toBe('');
  });

  it('stays over a longer answer', () => {
    const t = open('agentbox', 'w-2b3c4d5e6f');
    expect(t.ask).toMatch(/run that hits its limit/);
  });
});
