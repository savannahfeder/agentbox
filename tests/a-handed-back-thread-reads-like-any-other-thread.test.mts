// A HANDED-BACK THREAD READS LIKE ANY OTHER THREAD.
//
// After a teammate handed a thread back, its foot showed "Send back to agent"
// and "Ask for help or a review". Focus.tsx drew both only while the thread was
// blocked with no agent running, so they came and went from one thread to the
// next and the founder could not tell what they were for: "it only does that
// sometimes on certain threads. I don't really get this function." (2026-11-21).
// Both did what every thread already offers: the reply box sends to the agent,
// and Share asks someone for help or a review. So the foot of a blocked thread
// is the same as any other, and "Send back to agent" stays in ⌘K.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.join(import.meta.dirname, '..', rel), 'utf8');
const focus = read('renderer/src/components/Focus.tsx');
const app = read('renderer/src/App.tsx');
const share = read('renderer/src/threads/SharePanel.tsx');
const rowAt = focus.indexOf('<div className="focus-actions">');
const row = focus.slice(rowAt, focus.indexOf('focus-dock', rowAt));
const drawnWhen = focus.slice(focus.lastIndexOf('{((', rowAt), rowAt);

describe('the foot of a blocked thread', () => {
  it('has no buttons of its own', () => {
    expect(row).not.toContain('>Send back to agent<');
    expect(row).not.toContain('Ask for help or a review');
    expect(drawnWhen).not.toContain("item.status === 'blocked'");
  });
  it('still draws the row for the states that have nothing else, later, scheduled and outside agents', () => {
    expect(drawnWhen).toContain("item.start === 'later'");
    expect(drawnWhen).toContain('scheduledHere');
    expect(drawnWhen).toContain('onReveal');
  });
});

describe('what the buttons did is still there', () => {
  it('Send back to agent is in ⌘K for a blocked thread', () => {
    expect(app).toMatch(/target\.status === 'blocked'\s*\?\s*\[\{ id: 'send-back', label: 'Send back to agent'/);
  });
  it('Share asks someone for help or a review', () => {
    expect(share).toContain('Ask for help…');
    expect(share).toContain('Ask for a review…');
  });
});
