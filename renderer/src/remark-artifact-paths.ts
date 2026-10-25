// The window's half of reading a path in a message: the url transform
// react-markdown needs. The rule itself is in artifact-paths.ts, which has no
// react-markdown in it so the phone app can share it.
import { defaultUrlTransform } from 'react-markdown';

export { CODE_PATH, isMediaPath, linkArtifactPaths, productPath, remarkArtifactPaths, type Options } from './artifact-paths';

// Local file links are handled by the app's click handler, never navigated to
// by the browser. Keep all of markdown's other protocol restrictions.
export function artifactUrlTransform(url: string): string {
  // An agent mentioned in a conversation keeps its address, which is what the
  // link component reads to draw it as a mention (w-7b9cb8636a).
  return /^(file:\/\/|agentbox-agent:)/i.test(url) ? url : defaultUrlTransform(url);
}
