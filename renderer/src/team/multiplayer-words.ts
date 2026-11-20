// What the desktop and the phone say while multiplayer is invite-only
// (cloud/supabase/migrations/20261119000000_multiplayer_is_invite_only.sql).
export const NOT_LET_IN = 'Multiplayer is invite-only for now';

export const askWords = (email: string | null | undefined) => `Please let my team into multiplayer. My email is ${email ?? 'unknown'}.`;
