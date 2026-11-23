// Which face an AI teammate wears, and the paper behind it. The drawing itself
// is the screen's (renderer/src/teammates/face-drawing.ts), so the main process
// never loads it.

/** Lilac, peach, sand, mint, rose, sky. */
export const FACE_PAPERS = ['#d9d3f5', '#f6d9c8', '#ece2cc', '#cfe3dc', '#f3d1dd', '#d4e2f3'] as const;

export interface FaceOwner { id?: string | null; name?: string | null; face?: string | null }

/** The id, not the name, so a rename keeps the face; a face picked on purpose wins. */
export function faceSeed(t: FaceOwner): string {
  return t.face || t.id || t.name || '?';
}

/** The face a thread's offer of a new teammate shows, which the teammate keeps if you make it. */
export function offerFace(threadId: string): string {
  return `offer:${threadId}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function facePaper(seed: string): string {
  return FACE_PAPERS[hash(seed) % FACE_PAPERS.length];
}
