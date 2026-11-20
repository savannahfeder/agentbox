// The page Stripe sends people back to: /paid on the web app.
import { paidHeadline } from '../../../cloud/gateway/paid-words.mts';

export function paidPageOf(pathname: string, search: string, onTheWebApp: boolean): { head: string } | null {
  if (!onTheWebApp || !/^\/paid\/?$/.test(pathname)) return null;
  return { head: paidHeadline(new URLSearchParams(search)) };
}
