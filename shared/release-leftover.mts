/**
 * Whether package.json differs from the committed one only in what a deploy
 * writes there for its run (scripts/deploy.mjs), so a deploy that was cut
 * short left it. scripts/lib/deploy-rules.mjs asks the same and keeps its own
 * copy, because the pre-push hook loads it on plain Node, which cannot import this.
 */
export function leftFromARelease(committed: string, current: string): boolean {
  const rest = (t: string) => {
    try {
      const { version: _version, bakedPosthogKey: _key, ...others } = JSON.parse(t);
      return JSON.stringify(others);
    } catch { return null; }
  };
  const [a, b] = [rest(committed), rest(current)];
  return a !== null && a === b;
}
