// Where a new project's code goes, proposed from the typed name.
//
// So there is a proposal before she does anything, and the card only ever has
// to show it.
//
// Its own module rather than a function inside the card, because the SLUG has
// to match the one `Store.createProduct` gives the project directory. Two
// copies of that expression in two languages, one on each side of the bridge,
// is a drift waiting to happen: the folder would end up named one thing and the
// project another. The test beside this file runs both.

// The `~` is deliberately NOT expanded here. The renderer does not know whose
// home this is; the main process does, and expands it on the way in.
//
// THE PARENT IS NO LONGER `~/Desktop/dev`. That was one developer's own filing
// system shipped inside the download, and worse, it is inside Desktop, which
// is one of the seven folders macOS guards: the very first project anybody
// made through this card asked the system for their Desktop before the app had
// drawn anything. `proposeParent` learns the parent from the projects they
// already have and guesses `~/dev` when there are none, which is not guarded
// and costs no panel.
export function proposedFolder(name: string, parent = '~/dev'): string | null {
  const slug = projectSlug(name);
  return slug ? `${parent.replace(/\/+$/, '')}/${slug}` : null;
}

// The same expression `Store.createProduct` uses for the project directory.
export function projectSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

// The home directory as ~, the way the rail and Settings already write a path.
export function shortFolder(full: string): string {
  return full.replace(/^\/Users\/[^/]+/, '~');
}
