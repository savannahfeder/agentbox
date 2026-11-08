// WHICH APP THIS PROCESS IS: a window onto a hub, or the whole app. Asked before
// anything heavy loads, so a client never carries the store or the supervisor.

import './terminal-falls-behind.mts';
import { readHubAddress, whichApp } from './hub-address.mjs';

const hub = readHubAddress();
const which = whichApp(hub);
if (which === 'whole') await import('./main.mts');
else {
  const client = await import('./hub-client.mjs');
  if (which === 'client') client.startHubClient(hub);
  else client.refuseToStart(hub.invalid);
}
