import type {ReactNode} from 'react';

/** One optical scale for the three artifact corner actions. */
export function ArtifactControlGlyph({kind,children}:{kind?:'open'|'close';children?:ReactNode}) {
 return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {kind==='open' ? <path d="M11 3h6v6m0-6-8 8M7 4H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3"/> : kind==='close' ? <path d="m5 5 10 10M15 5 5 15"/> : children}
 </svg>;
}
