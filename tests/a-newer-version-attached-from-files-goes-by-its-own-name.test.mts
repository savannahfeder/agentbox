// A NEWER VERSION ATTACHED FROM FILES WENT OUT UNDER ITS FIRST VERSION'S NAME.
//
// A power tester on a team (2026-11-23) searched booking-flow-v2.html in Attach
// from Files, picked the one match and sent it to her teammate in a group chat.
// The attachment read booking-flow.html, and he opened it on v1 of 2 with no
// retry path: Files lists a file under its first name, and attachmentOf named
// the attachment that, though it sent the newest version's bytes. The group then
// held two attachments called booking-flow.html, and the name opened the first.
// The same happened to checkout-prototype-v3.html. Measured on her web-app
// ledger: booking-flow-v2.html is the next version of booking-flow.html.
import { describe, it, expect } from 'vitest';
import { attachmentOf } from '../renderer/src/files/from-files.ts';
import type { PlacedFile } from '../renderer/src/types.ts';

const flow = (opened: string, over: Partial<PlacedFile> = {}) => ({
  key: 'k-flow', project: 'Web app', name: 'booking-flow.html', kind: 'page', versions: 2, at: 10, by: null, open: 0, approvedBy: [], sentIn: [],
  versionNames: ['booking-flow-v2.html'], opened, ...over,
}) as unknown as PlacedFile;

describe('a file attached from Files', () => {
  it("goes by the name of the version it sends, not the file's first name", () => {
    expect(attachmentOf(flow('/store/web-app/designs/w-2/booking-flow-v2.html'))?.name).toBe('booking-flow-v2.html');
    expect(attachmentOf(flow('/store/checkout/checkout-prototype-v3.html', { name: 'checkout-prototype.html', versionNames: ['checkout-prototype-v2.html', 'checkout-prototype-v3.html'] }))?.name).toBe('checkout-prototype-v3.html');
  });

  it('reads the name past the prefix a saved attachment carries', () => {
    expect(attachmentOf(flow('/store/web-app/attachments/mwtpsnsm-il1m2g-booking-flow-v2.html'))?.name).toBe('booking-flow-v2.html');
  });

  it('keeps the first name when that is the version on this computer', () => {
    expect(attachmentOf(flow('/store/web-app/attachments/mwtpsnsm-il1m2g-booking-flow.html'))?.name).toBe('booking-flow.html');
    expect(attachmentOf(flow('/store/web-app/booking-flow.html', { versionNames: undefined }))?.name).toBe('booking-flow.html');
  });

  it('keeps the first name when the copy on disk is named neither', () => {
    expect(attachmentOf(flow('/store/web-app/a1b2c3.html'))?.name).toBe('booking-flow.html');
  });
});
