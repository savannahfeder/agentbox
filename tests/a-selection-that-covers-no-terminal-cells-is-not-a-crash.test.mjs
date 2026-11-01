// THE SECOND HALF OF LAUNCH WEEK'S LAST CRASH, AND WHAT IT TOOK TO SEE IT.
//
// "invalid range", one install, two frames, all of it inside xterm's own
// AccessibilityManager. The first half (w-cc11e92b9d) stopped turning
// `screenReaderMode` on for people who are not using a screen reader, which
// took the population who can meet this from every install down to VoiceOver
// and NVDA users. It repaired nothing: that handler is still wrong, and the
// people the feature exists for still have it.
//
// IT REPRODUCES NOW, and without a screen reader. The handler listens on the
// DOCUMENT for 'selectionchange', so an ordinary programmatic Range reaches it
// by the same path VoiceOver's selection does. Measured on 2026-10-09 in an
// offscreen Electron 43 window (Chromium 150) against the published
// @xterm/xterm@6.0.0 bundle, 80x24, screenReaderMode on, five selections:
//
//   ok      all of the first row
//   ok      across a row boundary with content either side
//   THREW   end of a full row to the start of the next
//   THREW   above the terminal to the start of the first row
//   THREW   end of the last row to below the terminal
//
// WHY. `toRowColumn` finishes with "if (column >= cols) { ++row; column = 0 }".
// One offset past the last character of a row that fills every column is
// therefore (row + 1, 0) — the same point the start of the next row maps to.
// The assertion below it sees begin.column >= end.column on one row and throws.
// The other two arrive there through the handler's own clamps, which can put
// `begin` at (0, 0) or pull `end` back onto exactly where `begin` already is.
// All three are selections covering no cells, which is an ordinary thing for a
// screen reader to produce, not a corrupt state worth an assertion.
//
// WHAT THIS SHIPS. Not a patched bundle: the artifact we build against is
// minified, and a dependency rewritten at build time is machinery that has to
// survive `npm ci` on two CI runners and every release. The handler is reached
// as `() => this._handleSelectionChange()`, so one own property on the manager
// instance shadows it, and shared/xterm-invalid-range.mts puts a try/catch
// there that swallows exactly this one message and nothing else.
//
// CLEARING THE SELECTION IS THE PART THAT IS EASY TO GET WRONG. Codex flagged
// it on the thread and the measurement confirmed it: the throw happens BEFORE
// the handler mirrors the selection, so the terminal keeps whatever was
// selected before, and a copy afterwards takes stale text. Swallowing the
// error alone would keep that. The guard clears the terminal's selection,
// because a selection that covers no cells means nothing is selected.
//
// The real fix is upstream, where the assertion should be a clearSelection and
// a return; this guard goes when a release carries it.

import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INVALID_RANGE, guardInvalidRange } from '../shared/xterm-invalid-range.mts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// A stand-in for the two objects the guard touches: xterm's public Terminal,
// and the AccessibilityManager instance reached through its core.
function terminalWithAHandler(handler) {
  const manager = { _handleSelectionChange: handler };
  return {
    manager,
    clearSelection: vi.fn(),
    _core: { _accessibilityManager: { value: manager } }
  };
}

describe('a selection that covers no terminal cells is not a crash', () => {
  it('swallows xterm\'s invalid range and leaves nothing selected', () => {
    const warn = vi.fn();
    const terminal = terminalWithAHandler(() => { throw new Error(INVALID_RANGE); });
    expect(guardInvalidRange(terminal, { warn })).toBe(true);

    expect(() => terminal.manager._handleSelectionChange()).not.toThrow();
    // The handler threw before mirroring the selection, so the terminal still
    // holds the old one. Saying so is the whole point of clearing it.
    expect(terminal.clearSelection).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(INVALID_RANGE);
  });

  it('lets every other failure out, with the selection untouched', () => {
    const warn = vi.fn();
    const terminal = terminalWithAHandler(() => { throw new Error('columns is null'); });
    guardInvalidRange(terminal, { warn });

    expect(() => terminal.manager._handleSelectionChange()).toThrow('columns is null');
    expect(terminal.clearSelection).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('is the message and not the shape of the throw', () => {
    // A bare string is not xterm's assertion, and swallowing one would hide
    // somebody else's bug.
    const terminal = terminalWithAHandler(() => { throw INVALID_RANGE; });
    guardInvalidRange(terminal, { warn: () => {} });
    expect(() => terminal.manager._handleSelectionChange()).toThrow(INVALID_RANGE);
    expect(terminal.clearSelection).not.toHaveBeenCalled();
  });

  it('leaves a selection that does cover cells alone', () => {
    const warn = vi.fn();
    const handler = vi.fn();
    const terminal = terminalWithAHandler(handler);
    guardInvalidRange(terminal, { warn });

    terminal.manager._handleSelectionChange();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(terminal.clearSelection).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('has nothing to do when there is no accessibility tree', () => {
    // screenReaderMode off, which is every install that is not running a
    // screen reader: no manager is built at all.
    const terminal = { clearSelection: vi.fn(), _core: { _accessibilityManager: { value: undefined } } };
    expect(guardInvalidRange(terminal, { warn: () => {} })).toBe(false);
    expect(guardInvalidRange({}, { warn: () => {} })).toBe(false);
    expect(guardInvalidRange(undefined, { warn: () => {} })).toBe(false);
  });

  it('wraps the handler once however often it is asked', () => {
    const handler = vi.fn();
    const terminal = terminalWithAHandler(handler);
    expect(guardInvalidRange(terminal, { warn: () => {} })).toBe(true);
    expect(guardInvalidRange(terminal, { warn: () => {} })).toBe(false);

    terminal.manager._handleSelectionChange();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('is still needed by the xterm we ship, and still reaches it', () => {
    // If an xterm release repairs the arithmetic, or moves what the guard
    // reaches for, this is where it says so instead of the guard quietly
    // becoming decoration.
    const bundle = read('node_modules/@xterm/xterm/lib/xterm.mjs');
    expect(bundle).toContain('throw new Error("invalid range")');
    expect(bundle).toContain('_accessibilityManager');
    // Dispatched off the instance, which is what makes one own property enough.
    expect(bundle).toContain('"selectionchange",()=>this._handleSelectionChange()');
  });

  it('is applied to the terminal the app actually opens', () => {
    const pane = read('renderer/src/components/TaskTerminal.tsx');
    expect(pane).toMatch(/guardInvalidRange\(terminal\)/);
    // After open(), because the manager does not exist until then.
    expect(pane.indexOf('terminal.open(')).toBeLessThan(pane.indexOf('guardInvalidRange(terminal)'));
    expect(pane).toMatch(/import\s*\{guardInvalidRange\}\s*from\s*'\.\.\/\.\.\/\.\.\/shared\/xterm-invalid-range\.mts'/);
  });
});
