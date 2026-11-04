// AN APP IN THE WRONG PLACE CAN NEVER UPDATE ITSELF, AND NEVER SAID SO.
//
// macOS has two places it will happily run Agentbox from and never let it
// replace itself:
//
//   THE DISK IMAGE. You double-click the .dmg, you double-click the app
//   inside it, and it works. The volume is read-only, so Squirrel.Mac refuses
//   the swap with "Cannot update while running on a read-only volume".
//
//   A TRANSLOCATED COPY. You drag the app to Downloads and open it. Because
//   it still carries the quarantine flag and is not in Applications, macOS
//   runs it from a read-only copy it makes under
//   `/private/var/folders/…/AppTranslocation/<uuid>/d/`. Same refusal, and
//   this is why Squirrel's own sentence talks about the Downloads directory.
//
// Measured in PostHog on 2026-10-12: 23 crash reports over three weeks, two
// installs, both on 0.1.11, one report every six hours (`EVERY_MS` in
// main/updater.mts) for as long as the app was open. The reports stopped being
// filed as crashes in 292d419. The two Macs are still on 0.1.11.
//
// SO THE APP READS WHERE IT IS AND OFFERS THE ONE PRESS THAT FIXES IT. Electron
// has had `moveToApplicationsFolder` since 4: it moves the bundle, replaces an
// older copy if you say so, and relaunches from the new place. After that the
// ordinary six-hourly check works and the person never thinks about it again.
//
// EVERYTHING HERE IS A FACT AND NOT A GUESS, which is why the decision is a
// pure function with the four facts passed in: a wrong "you are in the wrong
// place" is a nag on a healthy install, and two of those are worse than the
// silence this replaces.

import { Name } from './product-name.mjs';

/** The place a copy of the app is in, as far as updating itself is concerned. */
export type AppPlace =
  | 'disk-image' | 'translocated' | 'applications' | 'elsewhere' | 'source' | 'not-mac';

export interface PlaceState { place: AppPlace; canUpdate: boolean; offerMove: boolean }

/** The parts of Electron's `app` this file reads. */
export interface PlaceApp {
  platform?: string;
  isPackaged?: boolean;
  getPath?(name: 'exe'): string;
  isInApplicationsFolder?(): boolean;
  moveToApplicationsFolder(): boolean;
}

// THE WORDS, IN ONE PLACE, and main and the renderer both read them from here.
// `cannotUpdateHere` is the sentence `shortError` in main/updater.mts puts in
// place of Squirrel's own paragraph, which is 240 characters with a URL in the
// middle and was arriving on the Settings row cut off at 160.
//
// Every sentence says where the app is and what one press does about it, and
// none of them says "read-only volume": that is the mechanism, and nobody
// holding the Mac asked about the mechanism.
export const MOVE_SAY: {
  cannotUpdateHere: string;
  button: string;
  title: string;
  where: Record<string, string>;
  shortWhere: Record<string, string>;
  fix: string;
  retry: string;
} = {
  cannotUpdateHere: `${Name} cannot update itself from where it is.`,
  button: 'Move to Applications',
  /** The sidebar card's heading. */
  title: 'Updates are stuck',
  /** What the place is, as a person would say it. */
  where: {
    'disk-image': `${Name} is running from the disk image it was downloaded in.`,
    translocated: `${Name} is running from a read-only copy macOS made of it.`,
  },
  /** The same fact in half the words, for the sidebar card, which is one
   *  column wide and had the row's sentence running to six lines in it. */
  shortWhere: {
    'disk-image': `${Name} can’t update itself from the disk image.`,
    translocated: `${Name} can’t update itself from the copy macOS made.`,
  },
  /** And the press, which is the same either way. */
  fix: 'Moving it to your Applications folder takes a few seconds and gets updates working again.',
  retry: 'Pressing it again tries again.',
};

/** The sentence for a place, or null where there is nothing to say. `short` is
 *  the sidebar card's half of it: the button beside it already says the fix. */
export function sayWhere(place: string | null | undefined, { short = false }: { short?: boolean } = {}): string | null {
  const words = short ? MOVE_SAY.shortWhere : MOVE_SAY.where;
  return place == null ? null : words[place] ?? null;
}

/** Where a copy of the app can be, as far as updating itself is concerned. */
export const PLACE: {
  diskImage: 'disk-image';
  translocated: 'translocated';
  applications: 'applications';
  elsewhere: 'elsewhere';
  source: 'source';
  notMac: 'not-mac';
} = {
  /** Run out of the mounted .dmg. Read-only; cannot update. */
  diskImage: 'disk-image',
  /** macOS is running a read-only copy of its own. Cannot update. */
  translocated: 'translocated',
  /** Where it belongs. */
  applications: 'applications',
  /** Somewhere writable that is not Applications: updates itself fine. */
  elsewhere: 'elsewhere',
  /** `npm start` from a checkout: main/source-updater.mts, nothing to move. */
  source: 'source',
  /** No Applications folder and no `moveToApplicationsFolder`. */
  notMac: 'not-mac',
};

// The folder macOS puts a translocated copy in. The path is always under
// `/private/var/folders`, but the one segment that names the mechanism is this
// one, and it is the only part Apple has kept stable. Written with "/" and
// not `path.sep`: these are only ever read on a Mac (`placeOfApp` returns
// before them anywhere else), and the screen imports this file, so it may not
// import anything from Node.
const TRANSLOCATED = '/AppTranslocation/';
// Every mounted volume lives here, including the disk image the download is.
const VOLUMES = '/Volumes/';

/**
 * PURE. The whole decision, off four facts, so every case can be tested
 * without a packaged app, a disk image, or a Mac.
 *
 * `exePath` is `app.getPath('exe')`, the binary inside the bundle;
 * `inApplications` is Electron's own `app.isInApplicationsFolder()`, which
 * knows about `~/Applications` as well as `/Applications` and is therefore
 * never re-derived from the path here.
 */
export function placeOfApp({ platform, packaged, exePath, inApplications }: {
  platform?: string;
  packaged?: boolean;
  exePath?: string | null;
  inApplications?: boolean;
} = {}): PlaceState {
  const no = (place: AppPlace): PlaceState => ({ place, canUpdate: true, offerMove: false });
  if (platform !== 'darwin') return no(PLACE.notMac);
  if (!packaged) return no(PLACE.source);
  if (inApplications) return no(PLACE.applications);
  if (typeof exePath !== 'string' || !exePath) return no(PLACE.elsewhere);
  const where = exePath.includes(TRANSLOCATED) ? PLACE.translocated
    : exePath.startsWith(VOLUMES) ? PLACE.diskImage
    : null;
  // THE PLACES THAT ARE NOT APPLICATIONS AND UPDATE THEMSELVES ANYWAY are left
  // alone on purpose. A copy sitting in Downloads that macOS did not
  // translocate is on a writable disk and Squirrel swaps it happily; offering
  // to move it would be the app asking for something it does not need.
  if (!where) return no(PLACE.elsewhere);
  return { place: where, canUpdate: false, offerMove: true };
}

/**
 * The live one, over Electron's `app`. Read ONCE, at construction: the bundle
 * cannot move under a running process except by the move below, which
 * relaunches.
 */
export function createPlace({ app, log = console }: {
  app: PlaceApp;
  log?: { warn?: (...args: unknown[]) => void };
}): {
  state(): PlaceState;
  move(): { moved: boolean; error: string | null };
} {
  const where = placeOfApp({
    platform: app?.platform ?? process.platform,
    packaged: !!app?.isPackaged,
    exePath: (() => { try { return app?.getPath?.('exe') ?? null; } catch { return null; } })(),
    inApplications: (() => { try { return !!app?.isInApplicationsFolder?.(); } catch { return false; } })(),
  });

  return {
    state: () => ({ ...where }),

    /**
     * THE PRESS. Electron moves the bundle and relaunches, so nothing after a
     * `true` here ever runs. It answers false when the person cancels its own
     * "a copy is already there" box, which is an answer and not a failure.
     */
    move() {
      if (!where.offerMove) return { moved: false, error: null };
      try {
        const moved = !!app.moveToApplicationsFolder();
        return { moved, error: null };
      } catch (e) {
        // One line, because Settings shows this string to a person.
        const error = String((e as { message?: unknown } | null | undefined)?.message ?? e ?? 'The move did not work.').split('\n')[0]!.trim();
        log.warn?.('[place] could not move the app into Applications:', error);
        return { moved: false, error };
      }
    },
  };
}
