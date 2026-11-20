// THE PHONE'S TEAM PAGE ASKS FOR AN INVITE WHILE MULTIPLAYER IS INVITE-ONLY.
//
// The database refuses an invite from a team that is not let in
// (20261119000000_multiplayer_is_invite_only.sql), and the desktop's Team page
// asks i_have_multiplayer() and shows "Ask for an invite" instead of the
// invite field. The phone still drew the field, so an invite typed there was
// turned down. Measured on readTeam and the page's source.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cloudClient } from '../renderer/src/cloud-rest';
import { readTeam } from '../renderer/src/phone-team';
import { NOT_LET_IN, askWords } from '../renderer/src/team/multiplayer-words';

const ME = 'p-me';
const session = { access_token: 't', refresh_token: 'r', expires_at: Date.now() + 3600_000, user: { id: ME, email: 'me@example.com' } };
const store = () => { const m = new Map([['agentbox-cloud-session', JSON.stringify(session)]]); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

function cloud(answers) {
  const fetchImpl = async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${new URL(url).pathname.replace('/rest/v1/', '')}`;
    const a = answers[key];
    if (a instanceof Error) return new Response(JSON.stringify({ message: a.message }), { status: 404 });
    return new Response(JSON.stringify(typeof a === 'function' ? a(new URL(url)) : a ?? []), { status: 200 });
  };
  return cloudClient({ url: 'https://cloud.example', anonKey: 'k' }, { storage: store(), fetchImpl });
}
const onTeam = {
  'GET team_members': (u) => (u.search.includes('person_id=eq') ? [{ team_id: 't-1' }] : [{ person_id: ME, role: 'owner' }]),
  'GET teams': [{ id: 't-1', name: 'Astral' }],
  'GET people': [{ id: ME, email: 'me@example.com', name: 'Me' }],
};

describe('whether your team may invite', () => {
  it('is what the cloud says, on a team', async () => {
    expect((await readTeam(cloud({ ...onTeam, 'POST rpc/i_have_multiplayer': false }))).multiplayer).toBe(false);
    expect((await readTeam(cloud({ ...onTeam, 'POST rpc/i_have_multiplayer': true }))).multiplayer).toBe(true);
  });
  it('is what the cloud says with no team yet', async () => {
    expect((await readTeam(cloud({ 'POST rpc/i_have_multiplayer': false }))).multiplayer).toBe(false);
  });
  it('is unknown, hiding nothing, when an older cloud has no gate', async () => {
    const got = await readTeam(cloud({ ...onTeam, 'POST rpc/i_have_multiplayer': new Error('no such function') }));
    expect(got.multiplayer).toBeNull();
    expect(got.team?.name).toBe('Astral');
  });
});

describe('the page', () => {
  const page = fs.readFileSync('mobile/src/ui/TeamPage.tsx', 'utf8');
  it('uses the desktop\'s words and sends the desktop\'s ask', () => {
    expect(NOT_LET_IN).toBe('Multiplayer is invite-only for now');
    expect(askWords('me@example.com')).toBe('Please let my team into multiplayer. My email is me@example.com.');
    expect(page).toMatch(/import \{[^}]*NOT_LET_IN[^}]*\} from '..\/..\/..\/renderer\/src\/team\/multiplayer-words'/);
    expect(page).toContain('sendFeedback(askWords(');
    expect(page).toContain('Ask for an invite');
  });
  it('shows the invite field only when the team is not known to be shut out', () => {
    expect(page).toMatch(/multiplayer === false \? [\s\S]*placeholder="Their email"/);
  });
});
