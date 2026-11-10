// THE PHONE OPENS ITS PICKER ONLY ONCE THE ATTACH MENU HAS CLOSED.
//
// Attaching did nothing on the iPhone app (reported 2026-10-28: "I can't seem
// to attach files on the phone version"). The Attach menu is a React Native
// Modal, and Photo library and Files closed it and opened the system picker in
// the same moment. iOS will not present a picker while another view is being
// dismissed, so the picker never showed and nothing said so. The pick now
// waits for the menu's own "dismissed" on iOS, with a deadline in case that
// never comes, and runs exactly once.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { pickAfterClose, pickedName, SHEET_GONE_MS } from '../mobile/src/lib/attach';

afterEach(() => vi.useRealTimers());

describe('a pick from the Attach menu', () => {
  it('on iOS waits until the menu is gone, then runs once', () => {
    vi.useFakeTimers();
    const ran = vi.fn();
    const p = pickAfterClose({ ios: true });
    p.request(ran);
    vi.advanceTimersByTime(50);
    expect(ran).not.toHaveBeenCalled();
    p.gone();
    p.gone();
    vi.advanceTimersByTime(SHEET_GONE_MS * 2);
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('on iOS still runs, once, when the menu never says it is gone', () => {
    vi.useFakeTimers();
    const ran = vi.fn();
    const p = pickAfterClose({ ios: true });
    p.request(ran);
    vi.advanceTimersByTime(SHEET_GONE_MS - 1);
    expect(ran).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    p.gone();
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('elsewhere runs on the next turn, without waiting for a dismiss that never comes', () => {
    vi.useFakeTimers();
    const ran = vi.fn();
    pickAfterClose({ ios: false }).request(ran);
    expect(ran).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('names an iPhone photo for the JPEG the picker hands back, not the HEIC it was', () => {
    expect(pickedName('IMG_0042.HEIC', 'image', 0)).toBe('IMG_0042.jpg');
    expect(pickedName('IMG_0042.heif', 'image', 0)).toBe('IMG_0042.jpg');
    expect(pickedName('IMG_0042.PNG', 'image', 0)).toBe('IMG_0042.PNG');
    expect(pickedName('IMG_0043.MOV', 'video', 0)).toBe('IMG_0043.MOV');
    expect(pickedName(null, 'image', 1)).toBe('photo-2.jpg');
    expect(pickedName(undefined, 'video', 0)).toBe('video-1.mov');
  });

  it('closing the menu without picking runs nothing', () => {
    vi.useFakeTimers();
    const p = pickAfterClose({ ios: true });
    p.gone();
    vi.advanceTimersByTime(SHEET_GONE_MS * 2);
    // Nothing was asked for, so there is nothing to have run; a later pick still waits its turn.
    const ran = vi.fn();
    p.request(ran);
    p.gone();
    expect(ran).toHaveBeenCalledTimes(1);
  });
});
