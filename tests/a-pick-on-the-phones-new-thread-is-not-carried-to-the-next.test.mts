// A PICK ON THE PHONE'S NEW THREAD IS NOT CARRIED TO THE NEXT.
//
// What broke (phone testers, 2026-11-08, three reports): picking Codex or
// another project for one task left the next New thread on that agent and
// project, and the next task went there unnoticed. The form wrote each pick to
// the phone's storage and opened on it. Now To and the project are picked per
// thread; the model and level are still remembered (mobile/src/lib/compose.ts).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { openingEngine, openingRecipient, pickModel, openingFor, projectNow } from '../mobile/src/lib/compose';

const form = fs.readFileSync(new URL('../mobile/src/ui/NewThreadForm.tsx', import.meta.url), 'utf8');
const memory = () => { const kept = new Map<string, string>(); return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v); }, removeItem: (k: string) => { kept.delete(k); } }; };
const both = [{ id: 'claude', label: 'Claude Code' }, { id: 'codex', label: 'Codex' }] as Parameters<typeof openingEngine>[0];

describe('the next new thread opens on the defaults', () => {
  it('the computer\'s own agent, not the last one picked', () => {
    expect(openingEngine(both, 'claude')).toBe('claude');
    expect(openingEngine(both, 'codex')).toBe('codex');
  });
  it('Auto in To', () => {
    expect(openingRecipient([{ id: 't1' }], true)).toEqual({ to: 'agent', mate: null, auto: true });
  });
  it('the first project', () => {
    expect(projectNow([{ slug: 'alpha' }, { slug: 'beta' }], null)).toBe('alpha');
  });
  it('the form writes no To, agent or project down', () => {
    expect(form).not.toMatch(/pickProject\(appStore|pickRecipient\(|pickEngine\(appStore/);
  });
});

describe('what is still remembered', () => {
  it('the model picked last for an agent', () => {
    const store = memory();
    pickModel(store, 'sonnet', 'claude');
    expect(openingFor(store, 'claude', null).model).toBe('sonnet');
  });
});
