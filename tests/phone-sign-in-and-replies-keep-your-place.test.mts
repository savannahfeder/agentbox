// Phone replies opened another thread, and sign-in exposed a live approval under the finishing tap.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { replyMovesOn } from '../renderer/src/advance.ts';
import { approvalStage, approvalClickAllowed } from '../renderer/src/approval-stage.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('phone replies keep their thread', () => {
  for (const onBoard of [false, true]) {
    it(`stays with a reply, board=${onBoard}`, () => {
      expect(replyMovesOn({ view: 'inbox', onBoard, index: 0, phone: true })).toBe(false);
    });
  }
  it('keeps desktop inbox advancement', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 0, phone: false })).toBe(true);
    expect(replyMovesOn({ view: 'progress', onBoard: false, index: 0, phone: false })).toBe(false);
  });
  it('passes the phone door to the shared reply rule', () => {
    expect(app).toContain('phone: onPhone()');
  });
});

describe('sign-in holds pending approval cards', () => {
  const a = { id: 'a' };
  it('hides pending and departing cards while blocked', () => {
    expect(approvalStage([a], null, null, true).card).toBeNull();
    expect(approvalStage([a], { id: 'a', allow: true }, a, true).card).toBeNull();
  });
  it('restores the same card when the handoff ends', () => {
    expect(approvalStage([a], null, null, false).card).toBe(a);
  });
  it('requires a pointer press on this phone approval, while keeping keyboard access', () => {
    expect(approvalClickAllowed(true, 1, null, 'a:true')).toBe(false);
    expect(approvalClickAllowed(true, 1, 'old:true', 'a:true')).toBe(false);
    expect(approvalClickAllowed(true, 1, 'a:false', 'a:true')).toBe(false);
    expect(approvalClickAllowed(true, 1, 'a:true', 'a:true')).toBe(true);
    expect(approvalClickAllowed(true, 0, null, 'a:true')).toBe(true);
    expect(approvalClickAllowed(false, 1, null, 'a:true')).toBe(true);
  });
  it('returns phone sign-in to the inbox and waits before showing approvals', () => {
    expect(app).toContain("if (phoneWasSigningIn.current) openView('inbox');");
    expect(app).toContain('setPhoneSignInSettling(false), 800');
    expect(app).toContain('frontApproval.current, signInGate || phoneSignInSettling');
  });
  it('registers the sign-in effect before the loading screen can return', () => {
    expect(app.indexOf("if (phoneWasSigningIn.current) openView('inbox');")).toBeLessThan(app.indexOf('if (!snap) return <Booting />'));
  });
});
