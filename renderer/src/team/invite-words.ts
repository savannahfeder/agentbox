// The invite a teammate copies from Settings > Team and sends by their own mail:
// the app sends no email itself, so this is how an invited person hears of it.
import { Name } from '../../../shared/product-name.mjs';

const DOWNLOAD = 'https://agentbox.ac/download';

export function inviteWords({ from, team, email }: { from: string | null | undefined; team: string; email: string }): string {
  const first = String(from ?? '').trim().split(/\s+/)[0];
  const who = first ? `${first} invited you` : 'You are invited';
  return `${who} to ${team} on ${Name}. To join, download ${Name} from ${DOWNLOAD} and sign in with ${email}.`;
}
