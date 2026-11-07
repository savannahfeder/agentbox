// CODEX'S THREE MODES, FOR THE SCREENS THAT DRAW THEM.
//
// The list itself lives in `shared/codex-modes.mts`, because main/ needs it too
// and a second copy is how the picker and the run come to disagree.
//
// THIS FILE USED TO BE WHERE THE RENDERER STATED THE SHAPE, because that .mjs
// carried no type and the screen's imports of it came through as `any`. They
// do not any more: `shared/codex-modes.d.mts` sits beside it and says what each
// export is, which is what cleared four of the renderer's type errors
// (w-a170ad72b8). So the shape is stated once, there, and the three casts that
// used to stand here would now only be re-stating what the compiler already
// knows.
//
// What is left is the name the screens import by. It stays because they import
// by it and because `tests/the-permissions-copy-claims-only-what-it-governs`
// reads that import line; nothing is redefined, so a mode added or renamed in
// the shared file appears in every picker without an edit here.
export {
  CODEX_DEFAULT_MODE,
  CODEX_MODES,
  CODEX_MODE_ORDER,
  type CodexMode,
} from '../../shared/codex-modes.mts';
