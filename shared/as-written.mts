// The words an agent wrote to a document, kept beside the product's documents
// (a dot folder, so out of every listing). Typing over the file in the app
// rewrites it in place, and this copy is what tells the agent's words from the
// person's when the agent writes its next version (mcp/core/reach.mts).
import path from 'node:path';

const AS_WRITTEN = '.as-written';

/** Where the copy of `rel` is kept, or null for a path outside `dir`. */
export function asWrittenFile(dir: string | null | undefined, rel: string | null | undefined): string | null {
  if (!dir || !rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) return null;
  return path.join(dir, AS_WRITTEN, rel);
}
