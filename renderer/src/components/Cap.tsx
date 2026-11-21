import { keyName } from '../onboarding';
import { chord } from '../this-keyboard';

/** One key, drawn as a cap, with its name under a symbol that has one (`keyName`). */
export function Cap({ cap, className }: { cap: string; className?: string }) {
  const shown = chord(cap);
  const name = keyName(shown);
  return (
    <kbd className={className}>
      {shown}
      {name ? <span className="fr-cap-word">{name}</span> : null}
    </kbd>
  );
}
