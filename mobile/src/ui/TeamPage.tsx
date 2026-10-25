// The Team page on the phone, in the desktop's words (renderer/src/team/TeamPage.tsx),
// read and changed straight in the account (renderer/src/phone-team.ts).
import { useCallback, useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { cancelInvite, inviteTo, joinTeam, readTeam, removeFromTeam, type PhoneTeam, type TeamInvite } from '../../../renderer/src/phone-team';
import { useCloud } from '../state/cloud';
import { Aside, Button, Group, Row } from './SettingsParts';
import { T } from './parts';
import { color, font } from './theme';

const message = (err: unknown) => String((err as Error)?.message ?? err);

export function TeamPage() {
  const c = useCloud();
  const cloud = c.cloud;
  const me = cloud?.session()?.user;
  const [team, setTeam] = useState<PhoneTeam | null>(null);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [read, setRead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [notNow, setNotNow] = useState<string[]>([]);
  const [leaving, setLeaving] = useState(false);

  const load = useCallback(async () => {
    if (!cloud) return;
    try { const got = await readTeam(cloud); setTeam(got.team); setInvites(got.invites); setError(null); } catch (err) { setError(message(err)); } finally { setRead(true); }
  }, [cloud]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);
  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true); setError(null);
    try { await fn(); await load(); return true; } catch (err) { setError(message(err)); return false; } finally { setBusy(false); }
  };

  const invite = invites.find((i) => !notNow.includes(i.teamId));
  const owner = team?.mine === 'owner';
  return (
    <>
      {!read ? null : team ? (
        <>
          <Group label="Team name"><Row first label={team.name} /></Group>
          <Group label="People">
            {team.people.map((p, i) => (
              <Row key={p.id} first={i === 0} label={p.id === me?.id ? 'You' : p.name || p.email || ''} desc={p.role === 'owner' ? `${p.email} · owner` : p.email}
                control={owner && p.id !== me?.id ? <Button title="Remove" disabled={busy} onPress={run(() => removeFromTeam(cloud!, team.id, p.id))} /> : undefined} />
            ))}
            {team.invited.map((e) => (
              <Row key={e} label={e} desc="Invited. They join when they sign in with this email."
                control={owner ? <Button title="Cancel" disabled={busy} onPress={run(() => cancelInvite(cloud!, team.id, e))} /> : undefined} />
            ))}
          </Group>
          <Group label="Invite people">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
              <TextInput value={email} onChangeText={setEmail} placeholder="Their email" placeholderTextColor={color.faint} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" inputMode="email"
                style={{ flex: 1, height: 36, color: color.text, fontFamily: font.regular, fontSize: 15, paddingHorizontal: 10, borderWidth: 1, borderColor: color.line, backgroundColor: color.field }} />
              <Button title="Invite" disabled={busy || !email.trim()} onPress={async () => { if (await run(() => inviteTo(cloud!, team.id, email))()) setEmail(''); }} />
            </View>
          </Group>
          <Group label="Leave">
            {leaving ? (
              <Row first label={`Leave ${team.name}?`} desc="Your threads stay on your computer; the team stops seeing them."
                control={<View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Leave" disabled={busy} onPress={run(() => removeFromTeam(cloud!, team.id, me!.id))} />
                  <Button title="Stay" onPress={() => setLeaving(false)} />
                </View>} />
            ) : <Row first label={`Leave ${team.name}`} control={<Button title="Leave" onPress={() => setLeaving(true)} />} />}
          </Group>
        </>
      ) : invite ? (
        <Group>
          <Row first label={invite.invitedBy ? `${invite.invitedBy.split(/\s+/)[0]} invited you to ${invite.teamName}. Join?` : `You are invited to ${invite.teamName}. Join?`}
            control={<View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Join" disabled={busy} onPress={run(() => joinTeam(cloud!, invite.teamId))} />
              <Button title="Not now" onPress={() => setNotNow([...notNow, invite.teamId])} />
            </View>} />
        </Group>
      ) : (
        <>
          <T style={{ fontSize: 15.5, fontFamily: font.medium, marginTop: 28 }}>Start your team</T>
          <Aside>Start it on your computer, in Settings, Team. Waiting for an invite instead? Ask a teammate to invite {me?.email}. It shows up here within a few seconds.</Aside>
        </>
      )}
      {error ? <Aside>{error}</Aside> : null}
    </>
  );
}
