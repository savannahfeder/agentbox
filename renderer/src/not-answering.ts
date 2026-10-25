// PURE. WHAT THE SCREEN SAYS WHEN THE APP ITSELF HAS STOPPED ANSWERING.
//
// The window and the app are two processes, and the window keeps drawing after
// the app stops replying. Three screens wait on an answer that may never come
// (the boot screen, a conversation being read, a new thread handed over), and
// each waited silently. The words are constants here, beside the one number
// that decides when they are said, because copy is part of the design and a
// test has to be able to hold them.
//
// What they are for is in tests/the-app-says-when-it-has-stopped-answering.

import { Name } from '../../shared/product-name.mjs';

/**
 * How long a wait has to run before the screen says anything. Longer than any
 * answer takes, the slowest being a phone through the relay at under two
 * seconds, and shorter than somebody takes to decide the app is broken.
 */
export const NOT_ANSWERING_MS = 6_000;

/** And how long before the boot screen offers the only way out there is. */
export const RESTART_IT_MS = 45_000;

/** The waiting screens: the boot screen and a conversation being read. */
export const NOT_ANSWERING = `${Name} is not answering.`;

/** The boot screen alone, once waiting has plainly stopped being the advice. */
export const RESTART_IT = `${Name} is not answering. Quit and open it again if it stays like this.`;

/**
 * A send the app has not taken yet. It says the thing that stops the damage:
 * silence after Send reads as the send not having happened, and the task gets
 * written out and sent a second time.
 */
export const SEND_NOT_TAKEN = `${Name} has not taken this yet. It is not lost.`;
