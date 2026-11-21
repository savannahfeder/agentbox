// What the desktop and the phone say while multiplayer is invite-only
// (cloud/supabase/migrations/20261119000000_multiplayer_is_invite_only.sql).
export const NOT_LET_IN = 'Multiplayer is invite-only for now';

// Where inviting would be, for a team without Pro (20261121120000_team_features_need_pro.sql).
export const PRO_FOR_INVITES = 'Inviting people comes with Pro.';
export const askOwnerForPro = (owner: string | null | undefined) => `${PRO_FOR_INVITES} Ask ${owner?.trim().split(/\s+/)[0] || 'your team’s owner'} to start it.`;

export const askWords =(email: string | null | undefined) => `Please let my team into multiplayer. My email is ${email ?? 'unknown'}.`;
