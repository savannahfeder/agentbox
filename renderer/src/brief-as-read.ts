import { fillName } from '../../shared/product-name.mjs';

/**
 * The task brief as a worker reads it, for showing on the Instructions page:
 * the name filled in, the half for store tools this copy lacks left out, and
 * the markers gone. The same cut the supervisor makes at spawn.
 */
export function briefAsRead(template: string, { storeTools }: { storeTools: boolean }): string {
  const drop = storeTools ? 'no-store-tools' : 'store-tools';
  return fillName(template
    .replace(new RegExp(`<!-- ${drop}:start -->[\\s\\S]*?<!-- ${drop}:end -->\\n?`, 'g'), '')
    .replace(/<!-- [\w-]+:(start|end) -->\n?/g, ''));
}
