// What the team service needs to run Rooms on this Mac, built once for the
// desktop (main/main.mjs) and the browser copy (main/serve.mjs) alike.
import path from 'node:path';
import { appHome } from '../store/home.mjs';
import { readEnv } from '../../shared/product-name.mjs';
import { readCloudUsage } from '../cloud/usage.mjs';
import { phoneDevice } from '../phone-inbox.mjs';
import { roomPrefsFile } from './rooms.mjs';
import { createRoomHours } from './room-hours.mjs';

export function roomsSetup({ config, store, supervisor, userDir, log = (line) => console.log(line) }) {
  const hours = createRoomHours({
    home: appHome(),
    products: () => { try { return store.listProducts({ includeArchived: true }); } catch { return []; } },
    // A copy with a home of its own reads its own cloud runs, not this Mac's.
    cloudLines: () => (readEnv('HOME') ? readCloudUsage({ file: path.join(appHome(), 'cloud-usage.jsonl') }) : readCloudUsage()),
    log,
  });
  return {
    enabled: () => config.alphaRooms === true,
    device: () => phoneDevice(userDir, config.storeRoot),
    prefsFile: roomPrefsFile(config.storeRoot),
    presenceFacts: () => {
      const running = supervisor.runsGoing().map((s) => ({ itemId: s.itemId, product: s.product, startedAt: s.startedAt }));
      const items = running.map((r) => { try { return store.readItem(r.product, r.itemId); } catch { return null; } }).filter(Boolean);
      let products = [];
      try { products = store.listProducts(); } catch { /* none to name */ }
      return { running, items, products, summary: hours.summary() };
    },
  };
}
