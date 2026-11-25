// The desktop took "Send back to agent" off the foot of a stuck thread on
// 2026-11-23: it showed only while a thread was blocked with no agent, so it
// came and went from one thread to the next, and the reply box already sends
// to the agent. It stays in the command bar for a blocked thread. The phone
// parity round of 2026-11-25 found the phone still drawing the link under the
// conversation. The phone's command bar for a thread is its ⋯ menu.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const page = read('mobile/src/app/thread/[product]/[id].tsx');
const menu = read('mobile/src/ui/ThreadMenu.tsx');

describe('send back to agent on the phone', () => {
  it('is not under the conversation any more', () => {
    expect(page).not.toContain("label: 'send back to agent'");
  });

  it("is in the thread's menu, in the desktop's words, only where it applies", () => {
    expect(read('renderer/src/App.tsx')).toContain("label: 'Send back to agent'");
    expect(menu).toContain('{sendBack && <SheetRow label="Send back to agent" onPress={act(onSendBack)} />}');
    expect(page).toContain("sendBack={offers.sendBack} onSendBack={() => void press({ kind: 'send-back' })}");
  });
});
