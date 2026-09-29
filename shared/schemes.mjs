// THE APP'S TWO PRIVATE URL SCHEMES, NAMED FROM THE ONE PLACE THE APP IS NAMED.
//
// These were typed out as `astral-doc` and `astral-img`, two renames after the
// app stopped being called that, in main, in the renderer and in the tests. An
// agent reading any of them learns the wrong name for the app it is working
// inside, which is the fault the founder opened the row about, and the next
// rename would have had to find them all by hand.
//
// EVERY OLD SPELLING IS STILL SERVED, AND THAT IS NOT POLITENESS. A url on one
// of these schemes is STORED: a product's logo is kept in the store as
// `<scheme>://file/…` and a message she has already been sent holds picture
// urls in its body. Dropping the old scheme would not degrade those, it would
// break them, and the symptom is a broken image in a row written months ago.
// So the current name is what new urls are built with, and every name this app
// has had is still registered and still answered.

import { WAS, nameSlug } from './product-name.mjs';

const under = (was) => was.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** What a url built today is on. */
export const DOC_SCHEME = `${nameSlug}-doc`;
export const IMG_SCHEME = `${nameSlug}-img`;

/** Every spelling that must still resolve, current name first. */
export const DOC_SCHEMES = Object.freeze([DOC_SCHEME, ...WAS.map((was) => `${under(was)}-doc`)]);
export const IMG_SCHEMES = Object.freeze([IMG_SCHEME, ...WAS.map((was) => `${under(was)}-img`)]);

/** Both, for the one place that registers all of them at once. */
export const ALL_SCHEMES = Object.freeze([...DOC_SCHEMES, ...IMG_SCHEMES]);

/** True when `protocol` (as `URL` gives it, with its colon) is one of them. */
export const isScheme = (schemes, protocol) => schemes.some((s) => `${s}:` === protocol);
