// WHAT THE PHONE APP DRAWS OVER EVERY SCREEN: an agent's permission ask and
// the toast after a press, by the phone site's rules (App.tsx,
// approval-card.ts, approval-stage.ts, toast-parts.ts).
import { approvalReads } from '../../../renderer/src/approval-card';
import { approvalStage, type Answered } from '../../../renderer/src/approval-stage';
import { toastOpens, type ToastGoes } from '../../../renderer/src/toast-parts';
import { PHONE_UNDO_MS } from '../../../shared/phone-undo.mjs';

// App.tsx's TOAST_GOES_MS, its plain toast's 2500, and APPROVAL_EXIT_MS. The
// toast's Undo lasts as long as her Mac waits for it, less a margin (shared/phone-undo.mjs).
export const TOAST_GOES_MS = PHONE_UNDO_MS;
const TOAST_PLAIN_MS = 2500;
export const APPROVAL_EXIT_MS = 420;

export interface Approval { id: string; at: number; product: string; item: string; tool: string; input: Record<string, unknown> }
type Here = { product: string; id: string } | null;

export const toastLife = (toast: { goes?: ToastGoes }) => (toast.goes ? TOAST_GOES_MS : TOAST_PLAIN_MS);

/** How far a toast is swiped toward its edge before it goes. */
export const TOAST_SWIPE_PX = 24;
// What a thread keeps at its foot: the reply box, 51 tall at the bottom of the screen.
const OVER_THE_REPLY_BOX = 64;
const OVER_THE_FOOT = 20;

export interface ToastPlace { edge: 'top' | 'bottom'; lift: number; pill: boolean }
// The three placements shown for a pick (w-e08ebeb562); the two not picked are deleted.
export type ToastLook = 'bottom-bar' | 'top-bar' | 'bottom-pill';
export const TOAST_LOOKS: ToastLook[] = ['bottom-bar', 'top-bar', 'bottom-pill'];
// The preview's photographs switch it from outside; the app always draws the first.
const look = (): ToastLook => (globalThis as { agentboxToastLook?: ToastLook }).agentboxToastLook ?? 'bottom-bar';

/**
 * Where the toast sits. At the foot it rides just over a thread's reply box,
 * where the screen holds nothing she is reading; elsewhere just over the edge.
 */
export function toastPlace(onThread: boolean, which: ToastLook = look()): ToastPlace {
  if (which === 'top-bar') return { edge: 'top', lift: 0, pill: false };
  return { edge: 'bottom', lift: onThread ? OVER_THE_REPLY_BOX : OVER_THE_FOOT, pill: which === 'bottom-pill' };
}
export const toastTapOpens = (toast: { goes?: ToastGoes }, here: Here) => toastOpens(toast, here);

/** The thread the screen shows, read from the route. */
export function threadOnScreen(segments: readonly string[], params: Record<string, unknown>): Here {
  if (segments[0] !== 'thread' || typeof params.product !== 'string' || typeof params.id !== 'string') return null;
  return { product: params.product, id: params.id };
}

export const cardOnStage = (pending: readonly Approval[], answered: Answered | null, leaving: Approval | null) => approvalStage(pending, answered, leaving);

/** One card's words, as App.tsx writes them. */
export function approvalCard(a: Approval, waiting: number, products: { slug: string; name: string }[], items: { product: string; id: string; title?: string }[]) {
  const reads = approvalReads(a.input, a.tool);
  const mcp = a.tool.startsWith('mcp__');
  const input = a.input as Record<string, unknown> | null;
  const project = products.find((p) => p.slug === a.product)?.name ?? a.product ?? 'an agent';
  const said = !mcp && input?.description ? String(input.description).slice(0, 200) : null;
  const cwd = !mcp && input?.cwd ? String(input.cwd) : null;
  const row = items.find((i) => i.product === a.product && i.id === a.item);
  return {
    lede: said ?? `${project} ${reads.what}`,
    waiting: waiting > 0 ? `+${waiting} waiting` : null,
    command: reads.body,
    opens: [
      ...(!mcp && input?.host ? [`opens the network to ${String(input.host)}`] : []),
      ...(!mcp && input?.grantRoot ? [`and asks to write anywhere under ${String(input.grantRoot)} for the rest of this run`] : []),
    ],
    where: [said ? reads.what : null, cwd ? `in ${cwd}` : null].filter(Boolean).join(' '),
    task: row ? { title: String(row.title ?? ''), product: a.product, id: a.item } : null,
  };
}
