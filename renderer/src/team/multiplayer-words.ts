// What the desktop and the phone say while multiplayer is invite-only
// (cloud/supabase/migrations/20261119000000_multiplayer_is_invite_only.sql).
export const NOT_LET_IN = 'Multiplayer is invite-only for now';

// Where inviting would be, for a team without Pro (20261121130000_team_features_need_pro.sql).
export const PRO_FOR_INVITES = 'Inviting people comes with Pro.';
const ownerName = (owner: string | null | undefined) => owner?.trim().split(/\s+/)[0] || 'your team’s owner';
export const askOwnerForPro = (owner: string | null | undefined) => `${PRO_FOR_INVITES} Ask ${ownerName(owner)} to start it.`;
/** Said where a thread would go to or come from a teammate while the team has no Pro, or null while it has. */
export function sharingNeedsPro(state: { pro?: boolean | null; people?: { id: string; name?: string | null; role?: string }[]; me?: { id: string } | null } | null | undefined): string | null {
  if (state?.pro !== false) return null;
  const owner = state.people?.find((p) => p.role === 'owner');
  return `Sharing threads comes with Pro. ${owner && owner.id === state.me?.id ? 'Start it in Settings, Team.' : `Ask ${ownerName(owner?.name)} to start it.`}`;
}

export const askWords =(email: string | null | undefined) => `Please let my team into multiplayer. My email is ${email ?? 'unknown'}.`;
