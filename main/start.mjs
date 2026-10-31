// WHICH APP THIS PROCESS IS: a window onto a hub, or the whole app. Asked before
// anything heavy loads, so a client never carries the store or the supervisor.

import { readHubAddress } from './hub-address.mjs';

const hub = readHubAddress();
if (hub) (await import('./hub-client.mjs')).startHubClient(hub);
else await import('./main.mjs');
