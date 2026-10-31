// WHAT THE PHONE'S WORKER KEEPS OF THE SCREEN (relay/phone/sw.mjs, w-f430aa863d).
// Kept apart from the worker so a test can hold the rule without a worker.
//
// Every open used to fetch all 2.5 MB of the screen's script and style from the
// computer again, through the relay, because an answer the worker makes is
// never kept by the browser. Each built file's name carries a hash of what is
// in it, so a name once fetched never changes: kept, it is never asked for
// again, and a new build of the app arrives under new names in the page, which
// is always asked for. Only those files: never the page, the inbox or her own
// files.

export const KEPT = 'agentbox-screen-files-v1';
/** Builds come often; the oldest names go past this many. */
export const KEPT_MOST = 80;

export const isScreenFile = (request, url) => request.method === 'GET' && /^\/assets\/[^/]+$/.test(url.pathname);

/**
 * The phone server answers a name it does not have with the page itself
 * (main/serve.mjs), which must never be kept under a file's name.
 */
export const mayKeep = (res) => res.ok && !(res.headers.get('content-type') ?? '').startsWith('text/html');
