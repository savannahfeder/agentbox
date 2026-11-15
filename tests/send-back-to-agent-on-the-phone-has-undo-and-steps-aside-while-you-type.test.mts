// SEND BACK TO AGENT ON THE PHONE HAS UNDO, AND STEPS ASIDE WHILE YOU TYPE.
//
// The 2026-11-07 phone workday (issues 24, 30, 38): three testers hit the grey
// "send back to agent" link just above the choices when they meant Send. It
// re-queued the thread with no words, left the typed reply unsent in the box,
// and its toast "Back in the queue → Agentbox" had no Undo, unlike Later,
// Close and a reply. Measured in the phone preview: typed a reply, tapped the
// link, read the toast and the box.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { planFor } from '../mobile/src/lib/actions';

const item = { product: 'dev~agentbox', id: 'w-8b9c0d1e2f', title: 'Draw three versions of the inbox', status: 'blocked', productName: 'Agentbox' };

describe('send back to agent', () => {
  it('still sends the thread back', () => {
    expect(planFor({ kind: 'send-back' }, item).steps.map((s) => s.door)).toEqual(['reopen']);
  });
  it('says so with an Undo', () => {
    expect(planFor({ kind: 'send-back' }, item).toast).toBe('Back in the queue → Agentbox · press Z to undo');
  });
  it('Undo puts the thread back as it was and stops a run it started', () => {
    const plan = planFor({ kind: 'send-back' }, item);
    expect(plan.undo()).toEqual([
      { door: 'stopSession', payload: { product: item.product, id: item.id, withdraw: true } },
      { door: 'answer', payload: { product: item.product, id: item.id, status: 'blocked' } },
    ]);
    expect(plan.undone()).toBe('Back in your inbox');
  });
  it('is not offered while the reply box holds something to send', () => {
    const page = fs.readFileSync('mobile/src/app/thread/[product]/[id].tsx', 'utf8');
    expect(page).toMatch(/offers\.sendBack && !typed \?/);
    expect(page).toMatch(/onTyped=\{setTyped\}/);
  });
});
