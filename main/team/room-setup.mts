// What the team service needs to run Rooms on this Mac, built once for the
// desktop (main/main.mts) and the browser copy (main/serve.mts) alike.
import path from 'node:path';
import { appHome } from '../store/home.mjs';
import { readEnv } from '../../shared/product-name.mjs';
import { readCloudUsage } from '../cloud/usage.mts';
import { phoneDevice } from '../phone-inbox.mts';
import { roomPrefsFile } from './rooms.mts';
import type { PresenceFacts } from './rooms.mts';
import { createRoomHours } from './room-hours.mts';
import { writeDecisionDocs } from './decisions-doc.mjs';
import { writeTeamLookDocs } from './team-look-doc.mjs';

interface DecisionDocsArgs { teamName: string; rows: unknown[]; nameOf: (id: string) => string }

export interface RoomsSetupOptions {
  config: { alphaRooms?: boolean | null; storeRoot: string; accountRoot?: string | null };
  store: {
    listProducts(opts?: { includeArchived?: boolean }): { dir?: string | null; slug?: string; personal?: boolean; seenBy?: string; seenByPeople?: string[] }[];
    readItem(slug: string, id: string): { id: string; label?: string; title?: string } | null;
  };
  supervisor: { runsGoing(): { itemId: string; product: string; startedAt?: number }[] };
  userDir: string;
  log?: (line: string) => void;
}

export function roomsSetup({ config, store, supervisor, userDir, log = (line) => console.log(line) }: RoomsSetupOptions) {
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
    // Inside the account folder, the one the window may draw a picture or a film from.
    filesDir: config.accountRoot ? path.join(config.accountRoot, '.room-files') : null,
    decisionDocs: (args: DecisionDocsArgs) => writeDecisionDocs({ products: store.listProducts(), ...args }),
    teamLookDocs: ({ text }: { text: string }) => writeTeamLookDocs({ products: store.listProducts(), text }),
    presenceFacts: (): PresenceFacts => {
      const running = supervisor.runsGoing().map((s) => ({ itemId: s.itemId, product: s.product, startedAt: s.startedAt }));
      const items = running.map((r) => { try { return store.readItem(r.product, r.itemId); } catch { return null; } }).filter(Boolean) as NonNullable<PresenceFacts['items']>;
      let products: NonNullable<PresenceFacts['products']> = [];
      try { products = store.listProducts(); } catch { /* none to name */ }
      return { running, items, products, summary: hours.summary() };
    },
  };
}
