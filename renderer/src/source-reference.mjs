// Recognize a single source filename, optionally followed by a review line
// reference. The existing artifact resolver still decides whether it exists.
export function sourceReference(value) {
  if (typeof value !== 'string' || /[\r\n]/.test(value)) return null;
  const match = value.trim().match(/^((?:\/|\.\/)?[\w@.-]+(?:\/[\w@.-]+)*\.(?:[cm]?jsx?|tsx?|py|go|rs|rb|java|kt|swift|[ch](?:pp)?|cs|css|scss|vue|svelte|sql|sh|json|ya?ml|toml))(?::[1-9]\d*(?:-[1-9]\d*)?|#L[1-9]\d*)?$/i);
  if (!match || match[1].split('/').includes('..')) return null;
  return match[1];
}
