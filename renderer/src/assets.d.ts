// Vite's `?url` imports, declared for the typechecker.
//
// The fixture artifacts the shelf's preview pane renders are real files that
// Vite emits into the build and hands back as a URL. Without this they type as
// missing modules, which is a build that fails for a reason that has nothing to
// do with the code.
declare module '*?url' {
  const url: string;
  export default url;
}

// The skin pictures are imported for their emitted URLs, so they need a type
// the same way the `?url` imports above do.
declare module '*.webp' {
  const url: string;
  export default url;
}

// Vite's folder import, for the idle page's tile pictures. The page needs the
// sixteen theme pictures as URLs it can put on an <img>, and a hand-written
// list of them here would go stale the next time one is added or dropped.
// Declared rather than pulled in from vite/client because this project does not
// take Vite's ambient types.
interface ImportMeta {
  glob(pattern: string, options?: { eager?: boolean; query?: string; import?: string }): Record<string, any>;
}
