// CODEX'S THREE MODES, FOR THE SCREENS THAT DRAW THEM.
//
// The list itself lives in `shared/codex-modes.mts`, because main/ needs it too
// and a second copy is how the picker and the run come to disagree.
//
// The types are stated once, in that file's own source.
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
