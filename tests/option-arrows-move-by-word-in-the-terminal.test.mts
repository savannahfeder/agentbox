// OPTION+ARROWS MOVE BY WORD IN THE TERMINAL, AND NEVER DELETE (2026-10-12).
//
// Reported: in the Command-J terminal, Option+Left deleted text and
// Option+Delete moved the cursor, "as though the arrow keys are swapped with
// the Delete keys".
//
// Two causes, both measured against a real zsh in a pty
// (scripts/scratch/keys.py), typing `print -r -- "[one two three`, the key,
// then `X]"`:
//
// 1. The app is started with `npm`, and npm hands everything it runs
//    `EDITOR=vi` when the person has set no editor. The running app carried it
//    and every terminal shell inherited it; zsh reads "vi" in EDITOR at start
//    and switches to vi keys. There, Option+Left's ESC is "leave insert mode"
//    and what follows is read as commands that delete; Option+Delete's ESC DEL
//    just moves left. `bindkey -lL main` gave `viins` with EDITOR=vi, `emacs`
//    without it.
// 2. xterm 6 sends Option+Left as ESC[1;3D, which zsh does not bind: even in
//    emacs keys it typed the junk `;3D` (`[one two three;3DX]`). Mac Terminal
//    sends ESC b, which moved back one word (`[one two X]three`).
import { describe, it, expect } from 'vitest';
import { terminalEnv } from '../main/task-terminals.mts';
import { optionWordKey } from '../shared/terminal-keys.mts';

const key = (k, mods = {}) => ({ type: 'keydown', key: k, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

describe('Option+Left and Option+Right on a Mac', () => {
  it('jump back and forward one word, the way Mac Terminal does', () => {
    expect(optionWordKey(key('ArrowLeft'), true)).toBe('\x1bb');
    expect(optionWordKey(key('ArrowRight'), true)).toBe('\x1bf');
  });

  it('leave every other key to the terminal', () => {
    expect(optionWordKey(key('ArrowLeft', { altKey: false }), true)).toBeUndefined();
    expect(optionWordKey(key('Backspace'), true)).toBeUndefined();
    expect(optionWordKey(key('ArrowUp'), true)).toBeUndefined();
    expect(optionWordKey(key('ArrowLeft', { shiftKey: true }), true)).toBeUndefined();
    expect(optionWordKey(key('ArrowLeft', { metaKey: true }), true)).toBeUndefined();
    expect(optionWordKey(key('ArrowLeft', { ctrlKey: true }), true)).toBeUndefined();
  });

  it('are swallowed on keyup too, so nothing else reads half the press', () => {
    expect(optionWordKey(key('ArrowLeft', { type: 'keyup' }), true)).toBe('');
  });

  it('are left alone off a Mac, where Alt+Left already means what Linux terminals send', () => {
    expect(optionWordKey(key('ArrowLeft'), false)).toBeUndefined();
    expect(optionWordKey(key('ArrowRight'), false)).toBeUndefined();
  });
});

describe('the terminal shell does not inherit npm\'s stand-in editor', () => {
  it('drops the EDITOR=vi npm adds when nobody chose one', () => {
    expect(terminalEnv({ PATH: '/bin', EDITOR: 'vi' }).EDITOR).toBeUndefined();
  });

  it('keeps an editor the person chose', () => {
    expect(terminalEnv({ PATH: '/bin', EDITOR: 'nvim' }).EDITOR).toBe('nvim');
    expect(terminalEnv({ PATH: '/bin', EDITOR: 'vim' }).EDITOR).toBe('vim');
  });

  it('keeps EDITOR=vi when VISUAL says it was chosen, since npm only invents it when both are empty', () => {
    const env = terminalEnv({ PATH: '/bin', EDITOR: 'vi', VISUAL: 'vi' });
    expect(env.EDITOR).toBe('vi');
    expect(env.VISUAL).toBe('vi');
  });
});
