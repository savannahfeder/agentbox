// Rooms in the app (alpha), drawn as Groups: the group open last, a person's
// page, everyone's threads and the dialogs, in one place so
// App.tsx only places them beside the narrow sidebar (GroupsSidebar.tsx).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../api';
import type { ArtifactMark, Person, Room, RoomMention, RoomMessage, RoomsState, TeamMessageFile } from '../../types';
import { listedIn, oneConversation, pairRooms } from '../../../../shared/pair-room.mts';
import './rooms.css';
import { boardPeople, boardPicked, chatPeople, groupInTab, mentionRows, noticeShown, roomTitle, readBoardLater, readBoardPicks, readNoticeSeen, readRoomTab, withMe, writeBoardLater, writeBoardPicks, writeNoticeSeen, writeRoomTab } from './room-rules';
import { OpenGroupNotice } from './OpenGroupNotice';
import { RoomViewButton } from './RoomView';
import { landed, sameMessages, storedName, withFileLinks } from './room-chat-rules';
import { RoomPage, type RoomPane } from './RoomPage';
import { FirstChatBox, RoomChat, type ChatAlong, type RoomChatCalls } from './RoomChat';
import type { RoomFileOpening } from './RoomFileView';
import { I } from './icons';
import type { Conversation } from './MessagesPage';
import { roomConversations } from './conversations';
import { MembersMenu } from './RoomDialogs';
import { tokenFromLink } from '../../../../shared/room-links.mts';
import { RoomsNotReady, RoomsSettings } from './RoomsSettings';
import { GroupPage, GroupWaits, PeoplePanel } from './GroupPage';
import { GroupMenuButton, groupChoices, type GroupMenuAction } from './GroupList';
import { SidebarGroups, groupsInOrder } from './GroupsSidebar';
import { GroupFinder, GroupsColumn, GroupsHead } from './GroupsColumn';
import { directPeople } from './direct-people';
import { decisionsOf, decisionRows } from '../decisions';
import { DecisionsList } from '../TeamLists';

type Direct = Conversation & { people: string[] };

export function useRooms({ rooms, on, meId, myName, fullName = '', hasTeam, team = [], directs = [], now, toast, onOpenDirect, onTeamMessage, onLeavePage, renderBoard, inline = false }: {
  rooms: RoomsState | null | undefined; on: boolean; meId: string | null; myName: string; fullName?: string; hasTeam: boolean;
  /** Everyone on your team, for a teammate in a direct record who is not on Groups yet. */
  team?: Person[];
  /** Teammates' direct records, listed among the groups as chats of their own. */
  directs?: Direct[];
  now: number; toast: (text: string) => void;
  /** Open a direct record, in its own view. */
  onOpenDirect: (id: string) => void;
  /** Message teammates the way the team version already does. */
  onTeamMessage: (personIds: string[]) => void;
  /** Leave whatever covers the rooms: an open thread or direct chat, the Team page, search. */
  onLeavePage: () => void;
  /** The room's board, for these people's threads. */
  renderBoard?: (people: string[], opts: { later: boolean }) => ReactNode;
  /** Drawn under Everything else's cards (w-b5f23cff71), which list the groups and the team instead. */
  inline?: boolean;
}) {
  const live = on && !!rooms?.on;
  const all = live ? rooms!.rooms : [];
  const list = all.filter((r) => r.kind !== 'group');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pane, setPane] = useState<RoomPane>('wall');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [boardPicks, setBoardPicks] = useState<Record<string, string[]>>(() => readBoardPicks());
  const [later, setLaterRaw] = useState(() => readBoardLater());
  // The group Groups opens: whichever was open last.
  const [lastId, setLastId] = useState<string | null>(() => readRoomTab());
  // Everyone's threads in the open group, one step in from its chat.
  const [boardOn, setBoardOn] = useState(false);
  const [members, setMembers] = useState<{ roomId: string; at: DOMRect } | null>(null);
  // Groups with no group to open.
  const [empty, setEmpty] = useState(false);
  // The finder G opens, over whatever page is up.
  const [finderOpen, setFinderOpen] = useState(false);
  const [answered, setAnswered] = useState<string[]>(() => readNoticeSeen());
  // One group's or one project's decisions, over whatever is on screen.
  const [listing, setListing] = useState<{ roomId: string; project: string | null; title: string } | null>(null);
  const open = openId ? all.find((r) => r.id === openId) ?? null : null;
  const nameOf = (r: Room) => roomTitle(r, meId);
  const invisibleUntil = Date.parse(rooms?.me?.invisible_until ?? '');

  // A room I left, or was removed from, closes. One just joined or made may
  // not be in the snapshot yet, so only a room that was there and went closes.
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (open) seen.current = open.id;
    else if (openId && seen.current === openId && live && rooms?.ready) { seen.current = null; setOpenId(null); }
  }, [openId, live, rooms?.ready, open]);
  useEffect(() => { if (!live) { setOpenId(null); setMembers(null); setEmpty(false); setFinderOpen(false); } }, [live]);
  useEffect(() => { setPicked(new Set()); setBoardOn(false); }, [openId]);

  const call = useCallback(async <T,>(op: string, ...args: unknown[]): Promise<{ ok: boolean; value?: T; error?: string }> => {
    const res = await api.rooms<T>(op, ...args);
    return res.ok ? { ok: true, value: res.value } : { ok: false, error: res.error };
  }, []);

  const [openingFile, setOpeningFile] = useState<(RoomFileOpening & { roomId: string }) | null>(null);
  // Every group opens as the Groups page, which then holds it.
  const openRoom = (id: string) => {
    onLeavePage(); setEmpty(false); setFinderOpen(false); setOpenId(id); setPane('wall'); setBoardOn(false);
    setLastId(id); writeRoomTab(id);
  };
  // One step back: from everyone's threads or a person's page to the group; from the group out.
  const close = () => {
    if (finderOpen) { setFinderOpen(false); return; }
    if (boardOn) { setBoardOn(false); return; }
    if (pane !== 'wall') { setPane('wall'); return; }
    setOpenId(null); setEmpty(false);
  };
  // Somewhere else was picked: no group.
  // In Chats the list's own box is the search.
  const findGroup = () => { const box = document.querySelector<HTMLInputElement>('.cx-search input'); if (box) box.focus(); else setFinderOpen(true); };
  const leave = () => { setOpenId(null); setEmpty(false); setBoardOn(false); setFinderOpen(false); };

  // Joining a team opens its group, which may not have reached this window yet.
  const wantTeam = useRef(false);
  useEffect(() => {
    if (!wantTeam.current) return;
    const own = all.find((r) => r.teamId);
    if (own) { wantTeam.current = false; openRoom(own.id); }
  });

  const decide = async (roomId: string, mark: { messageId: string; kind: 'decision' | 'priority'; on: boolean; body?: string; saidBy?: string | null; project?: string | null }) => {
    const res = await call('decide', roomId, mark);
    if (!res.ok) toast(res.error ?? 'That did not save');
    return res.ok;
  };
  const decisionsIn = (roomId: string) => rooms?.decisions?.[roomId] ?? [];
  const nameIn = (id: string | null) => {
    const everyone = all.flatMap((r) => [...r.wall, ...(r.people ?? [])]);
    return (id ? everyone.find((p) => p.id === id)?.name : null) || team.find((p) => p.id === id)?.name || 'Someone';
  };

  const tabbed = live ? groupInTab(all, lastId) : null;
  const openTab = () => {
    if (tabbed) { openRoom(tabbed.id); return; }
    onLeavePage(); setOpenId(null); setEmpty(true);
  };

  // An invite link from when groups could hold anyone: groups are your team's now.
  const join = useCallback(async (text: string) => {
    if (!tokenFromLink(text)) return false;
    toast('That invite link does not work any more');
    return true;
  }, [toast]);

  // MESSAGE SOMEONE FROM A GROUP. Teammates already have direct records, with
  // their agents and threads, so they keep using them. Anyone else is a small
  // group chat, the same one each time for the same people, opened in the tab.
  const message = async (ids: string[], from: Room | null) => {
    const people = [...new Set(ids)].filter((id) => id !== meId);
    if (!people.length) return;
    const cards = new Map((from ?? open)?.wall.map((c) => [c.id, c]) ?? []);
    if (people.every((id) => cards.get(id)?.teammate)) { onTeamMessage(people); return; }
    const want = new Set([meId, ...people]);
    const group = people.length === 1 ? pairRooms(all, people[0], listedIn)[0] : all.find((r) => r.kind === 'group' && r.members === want.size && r.wall.every((c) => want.has(c.id)) && people.every((id) => r.wall.some((c) => c.id === id)));
    let id = group?.id ?? null;
    if (!id) {
      const name = people.map((p) => cards.get(p)?.name ?? 'Someone').join(', ').slice(0, 40);
      const res = await call<string>('create', { name, kind: 'group', people });
      if (!res.ok || !res.value) { toast(res.error ?? 'Could not start the chat'); return; }
      id = res.value;
    }
    openRoom(id);
  };

  // A SEND TRIED AGAIN AFTER A DROPPED CONNECTION may already have landed: the
  // room had it and only the answer was lost. Then it is not sent twice.
  const tried = useRef(new Map<string, Set<string>>());
  const send = (roomId: string) => async (body: string, opts: { inReplyTo: string | null; mentions: string[] }) => {
    const key = `${roomId}\u0000${opts.inReplyTo ?? ''}\u0000${body}`;
    const mine = { by: meId, body, inReplyTo: opts.inReplyTo };
    const before = tried.current.get(key);
    if (before) {
      // Looked at afresh: what this window held may be from before the drop.
      const fresh = await api.rooms('refresh');
      const held = (fresh.rooms ?? rooms)?.messages[roomId] ?? [];
      if (landed(held, { ...mine, before })) { tried.current.delete(key); return null; }
    } else {
      tried.current.set(key, new Set(sameMessages(rooms?.messages[roomId] ?? [], mine).map((m) => m.id)));
    }
    const res = await call('send', roomId, body, opts);
    if (res.ok) tried.current.delete(key);
    return res.ok ? null : res.error ?? 'Not sent';
  };
  const read = (r: Room) => () => { if (r.unread > 0 || r.markedUnread) void call('markRead', r.id); };
  // Everything else a room's chat can do to a message, or to the room.
  const chatCalls = (r: Room) => ({
    openingFile: openingFile?.roomId === r.id ? openingFile : null,
    onFileOpening: () => setOpeningFile(null),
    onReact: (messageId: string, emoji: string, on: boolean) => {
      void call('react', r.id, messageId, emoji, on).then((res) => { if (!res.ok) toast(res.error ?? 'That reaction did not save'); });
    },
    onEdit: async (messageId: string, body: string, mentions: string[]) => {
      const res = await call('edit', r.id, messageId, body, { mentions });
      return res.ok ? null : res.error ?? 'That change did not save';
    },
    onDelete: (messageId: string) => {
      void call('deleteMessage', r.id, messageId).then((res) => { if (!res.ok) toast(res.error ?? 'Not deleted'); });
    },
    onMarkUnread: (at: number) => {
      void call('markUnread', r.id, at).then((res) => toast(res.ok ? 'Marked unread' : res.error ?? 'Not marked unread'));
    },
    onPutFile: async (name: string, dataBase64: string) => {
      const res = await call('putFile', r.id, { name, dataBase64 });
      return res.ok ? null : res.error ?? 'That file did not send';
    },
    onPutFileFrom: async (name: string, srcPath: string) => {
      const res = await call('putFileFrom', r.id, { name, srcPath });
      return res.ok ? null : res.error ?? 'That file did not send';
    },
    sending: rooms?.sending,
    files: {
      marks: rooms?.fileMarks?.[r.id] ?? [],
      write: async (mark: ArtifactMark) => {
        const res = await call('markFile', r.id, mark);
        return res.ok ? { ok: true } : { ok: false, error: res.error ?? 'That did not save.' };
      },
      find: async (name: string) => {
        const res = await call<string | null>('fileOnDisk', r.id, name);
        return res.ok ? res.value ?? null : null;
      },
      readText: async (name: string) => {
        const res = await call<string | null>('fileText', r.id, name);
        return res.ok ? res.value ?? null : null;
      },
    },
    loadFile: async (name: string) => {
      const res = await call<string | null>('file', r.id, name);
      if (!res.ok || !res.value) return null;
      return new Blob([Uint8Array.from(atob(res.value), (c) => c.charCodeAt(0))]);
    },
    onNotice: toast,
    // A public room's strangers have no decisions to keep.
    ...(r.listed && !r.teamId ? {} : {
      marks: decisionsOf(decisionsIn(r.id)),
      onDecide: (messageId: string, kind: 'decision' | 'priority', on: boolean) => { void decide(r.id, { messageId, kind, on }); },
    }),
  });

  // A pair who both started their chat in the same moment have two groups.
  // Their chat reads both; new words go to the one both Macs pick, and a
  // reply, an edit or a reaction to the room its message is in.
  const pairChat = (r: Room): { room: Room; rooms: string[]; messages: RoomMessage[]; calls: RoomChatCalls } => {
    const other = listedIn(r).find((id) => id !== meId);
    const twins = other ? pairRooms(all, other, listedIn) : [];
    const held = (t: Room) => rooms?.messages[t.id] ?? [];
    if (twins.length < 2 || !twins.includes(r)) return { room: r, rooms: [r.id], messages: held(r), calls: { onSend: send(r.id), onRead: read(r), ...chatCalls(r) } };
    const home = twins[0];
    const messages = oneConversation(twins.map(held));
    const roomOfMessage = (id: string) => twins.find((t) => t.id === messages.find((m) => m.id === id)?.roomId) ?? home;
    const of = (id: string) => chatCalls(roomOfMessage(id));
    const first = async <T,>(get: (t: Room) => Promise<T | null>) => {
      for (const t of twins) { const got = await get(t); if (got != null) return got; }
      return null;
    };
    const base = chatCalls(home);
    return { room: home, rooms: twins.map((t) => t.id), messages, calls: {
      ...base,
      openingFile: openingFile && twins.some((t) => t.id === openingFile.roomId) ? openingFile : null,
      onSend: (body, opts) => send(opts.inReplyTo ? roomOfMessage(opts.inReplyTo).id : home.id)(body, opts),
      onRead: () => { for (const t of twins) read(t)(); },
      onReact: (id, emoji, on) => of(id).onReact(id, emoji, on),
      onEdit: (id, body, mentions) => of(id).onEdit(id, body, mentions),
      onDelete: (id) => of(id).onDelete(id),
      marks: new Map(twins.flatMap((t) => [...decisionsOf(decisionsIn(t.id))])),
      onDecide: (id, kind, on) => of(id).onDecide?.(id, kind, on),
      files: {
        ...base.files,
        marks: twins.flatMap((t) => rooms?.fileMarks?.[t.id] ?? []),
        find: (name) => first((t) => chatCalls(t).files.find(name)),
        readText: (name) => first((t) => chatCalls(t).files.readText(name)),
      },
      loadFile: (name) => first((t) => chatCalls(t).loadFile(name)),
    } };
  };

  // Every group and every chat, a teammate's direct record among them, each its own.
  const conversations: Conversation[] = live ? [...roomConversations(rooms), ...directs] : [];
  const pinned = new Set(all.filter((r) => r.teamId || r.pinned).map((r) => `room:${r.id}`));
  const groupList = groupChoices(conversations, pinned, {
    team: new Set(all.filter((r) => r.teamId).map((r) => `room:${r.id}`)),
    open: new Set(all.filter((r) => r.listed && !r.teamId).map((r) => `room:${r.id}`)),
  });
  // A direct record opens over the group, so stepping out of it comes back here.
  const pickGroup = (key: string) => {
    setFinderOpen(false);
    if (key.startsWith('direct:')) onOpenDirect(key.slice('direct:'.length));
    else openRoom(key.slice('room:'.length));
  };
  const rows = groupsInOrder(groupList);
  const currentRow = open ? rows.find((g) => g.key === `room:${open.id}`) : undefined;

  const groupAction = async (r: Room, a: GroupMenuAction, at: DOMRect) => {
    if (a === 'board') setBoardOn(true);
    if (a === 'decisions') setListing({ roomId: r.id, project: null, title: `Decisions in ${nameOf(r)}` });
    if (a === 'members') setMembers({ roomId: r.id, at });
    if (a === 'mute' || a === 'unmute') { await call('mute', r.id, a === 'mute'); toast(a === 'mute' ? `${nameOf(r)} is muted` : `${nameOf(r)} is not muted any more`); }
    if (a === 'leave') {
      const res = await call('leave', r.id);
      toast(res.ok ? `You left ${nameOf(r)}` : res.error ?? 'Could not leave');
      if (!res.ok) return;
      const next = groupInTab(all.filter((x) => x.id !== r.id), null);
      if (next) openRoom(next.id); else { setOpenId(null); setEmpty(true); }
    }
  };

  const answerNotice = (id: string) => { const next = [...answered, id]; setAnswered(next); writeNoticeSeen(next); };

  const meInChat = meId ? { id: meId, name: rooms?.me?.display_name || myName, avatarUrl: rooms?.me?.avatar_url ?? null, me: true } : null;
  const backTitle = (title: string) => <h1 className="workspace-title">
    <button type="button" className="rm-backt" title="Back (esc)" onClick={close}>{I.back()}<span>{title}</span></button></h1>;
  // A page of its own takes the top bar's title and hides the state tabs.
  // `right` undefined keeps the bar's own buttons; null clears them.
  let heading: { title: ReactNode; right?: ReactNode } | null = null;
  let page: ReactNode = null;
  const onChat = !!open && !!rooms && pane === 'wall' && !boardOn;
  // Everyone's threads: the board of the people here whose threads reach me. Never for a chat with people.
  const onRoom = !!open && !!rooms && open.kind !== 'group' && pane === 'wall' && boardOn;
  const onBoardPeople = onRoom ? boardPeople(open!.wall) : [];
  const onBoardIds = new Set(onBoardPeople.map((c) => c.id));
  const onBoardPicked = onRoom ? boardPicked(boardPicks[open!.id], open!.wall) : [];
  const pickForBoard = (ids: string[]) => {
    if (!open) return;
    const next = { ...boardPicks, [open.id]: ids };
    setBoardPicks(next);
    writeBoardPicks(next);
  };
  const setLater = (shown: boolean) => { setLaterRaw(shown); writeBoardLater(shown); };
  const board = onRoom && renderBoard
    ? renderBoard(onBoardPicked.filter((id) => onBoardIds.has(id)), { later })
    : null;
  const viewButton: ReactNode = onRoom && renderBoard
    ? <RoomViewButton people={open!.wall} picked={onBoardPicked} onPick={pickForBoard} unseen={open!.wall.length - onBoardPeople.length} later={later} onLater={setLater} />
    : onChat ? <GroupMenuButton named={open!.kind !== 'group'} members={open!.members} muted={open!.muted} canLeave={!open!.teamId}
      decisions={open!.listed && !open!.teamId ? null : decisionRows(decisionsIn(open!.id), { project: null }).decisions.length}
      board={open!.kind !== 'group' && !!renderBoard} onPick={(a, at) => void groupAction(open!, a, at)} />
    : null;
  if (empty && live) {
    heading = { title: <h1 className="workspace-title">Groups</h1> };
    page = <div className="rm-empty gr-none"><span className="t">You are not in any groups yet.</span></div>;
  } else if (open && rooms && onChat) {
    page = <GroupPage key={open.id} inline={inline}
      notice={<><GroupWaits row={rooms.mentions.find((m) => m.roomId === open.id) ?? null} onDone={() => void call('markDone', open.id).then((res) => { if (!res.ok) toast(res.error ?? 'Not marked done'); })} />
        {rooms.me && noticeShown(open, answered) ? <OpenGroupNotice me={rooms.me}
          onLeave={() => void groupAction(open, 'leave', new DOMRect())}
          onHide={() => void call('saveProfile', { show_working: 'team' })} onOk={() => answerNotice(open.id)} /> : null}</>}
      chat={(() => {
        const c = pairChat(open);
        return <RoomChat room={c.room} messages={c.messages} people={withMe(chatPeople(c.room, meId), meInChat)} meId={meId} now={now}
          full hang head={<></>} {...c.calls} />;
      })()}
      people={inline && (open.teamId || open.members <= 2) ? null : <PeoplePanel room={open} onPerson={(id) => setPane(`person:${id}`)} />}      list={<GroupsColumn rows={rows} current={`room:${open.id}`} now={now} onOpen={pickGroup} />} />;
    heading = { title: <GroupsHead current={currentRow} onFind={() => setFinderOpen(true)} /> };
    if (inline) heading = null;
  } else if (open && rooms) {
    heading = { title: backTitle(nameOf(open)) };
    page = <RoomPage room={open} rooms={list} ranks={rooms.ranks ?? {}} me={rooms.me} now={now}
      pane={pane} onPane={setPane} chat={null} board={board}
      picked={picked} onPick={(ids) => setPicked(new Set(ids))} onMessage={(ids) => void message(ids, open)}
      onRoom={(id) => openRoom(id)}
      onSaveBio={async (bio) => { const res = await call('saveProfile', { bio }); return res.ok ? null : res.error ?? 'Your bio did not save'; }}
      onComeBack={() => void call('comeBack')} />;
  }

  const membersRoom = members ? all.find((r) => r.id === members.roomId) : null;
  const teamRoom = all.find((r) => r.teamId) ?? null;
  const dialogs: ReactNode = <>
    {listing && <DecisionsList title={listing.title} project={listing.project} rows={decisionsIn(listing.roomId)} nameOf={nameIn} onClose={() => setListing(null)}
      onTakeBack={(d) => { void decide(listing.roomId, { messageId: d.messageId, kind: d.kind, on: false }); }} />}
    {finderOpen && <GroupFinder rows={rows} current={open ? `room:${open.id}` : null} now={now} onOpen={pickGroup} onClose={() => setFinderOpen(false)} />}
    {membersRoom && members && <MembersMenu room={membersRoom} at={members.at} onClose={() => setMembers(null)}
      onPerson={(id) => { setMembers(null); openRoom(membersRoom.id); setPane(`person:${id}`); }} />}
  </>;

  const invisible = live && rooms?.me ? {
    on: invisibleUntil > now,
    onGo: (minutes: number | null) => { void call('goInvisible', minutes); },
    onComeBack: () => { void call('comeBack'); },
  } : null;

  // The Settings page: your card as your first room shows it.
  const first = list.find((r) => r.pinned) ?? list[0] ?? null;
  const settingsPane: ReactNode = live && rooms?.me ? <RoomsSettings me={rooms.me} fullName={fullName} now={now}
    roomName={first?.name ?? null} card={first?.wall.find((c) => c.me) ?? null}
    save={(patch) => { void call('saveProfile', patch); }}
    goInvisible={(minutes) => { void call('goInvisible', minutes); }}
    comeBack={() => { void call('comeBack'); }} /> : live ? <RoomsNotReady error={rooms?.error ?? null} /> : undefined;

  // Needs you counts these rows too, so a group counts once.
  const mentions: RoomMention[] = live ? mentionRows(rooms!.mentions, rooms!) : [];
  const faces = new Map(all.flatMap((r) => r.wall.map((c) => [c.id, c.avatarUrl] as const)));
  const openMention = (m: RoomMention) => {
    if (m.note || m.file) setOpeningFile({ roomId: m.roomId, note: m.note, file: m.file, at: Date.now() });
    openRoom(m.roomId);
  };

  // A chat drawn somewhere other than Groups: a person's place on the home.
  const chatIn = (roomId: string, along?: (messages: RoomMessage[], rooms: string[]) => ChatAlong): ReactNode => {
    const r = all.find((x) => x.id === roomId);
    if (!r || !rooms) return null;
    const c = pairChat(r);
    return <div className="gr-chat"><RoomChat key={c.room.id} room={c.room} messages={c.messages} people={withMe(chatPeople(c.room, meId), meInChat)} meId={meId} now={now}
      full hang head={<></>} along={along?.(c.messages, c.rooms)} {...c.calls} /></div>;
  };
  // A two-person group with them, made if there is none, without leaving the page you are on.
  const chatWith = async (personId: string, name: string): Promise<{ id: string } | { error: string }> => {
    const id = pairRooms(all, personId, listedIn)[0]?.id;
    if (id) return { id };
    const res = await call<string>('create', { name: name.slice(0, 40), kind: 'group', people: [personId] });
    return res.ok && res.value ? { id: res.value } : { error: res.error ?? 'Could not start the chat' };
  };
  const startChat = async (personId: string, name: string, first?: string, files: readonly TeamMessageFile[] = []): Promise<string | null> => {
    const got = await chatWith(personId, name);
    if ('error' in got) return got.error;
    const { id } = got;
    const put: { name: string; stored: string }[] = [];
    for (const f of files) {
      const stored = storedName(f.name);
      const res = f.srcPath ? await call('putFileFrom', id, { name: stored, srcPath: f.srcPath })
        : f.dataBase64 ? await call('putFile', id, { name: stored, dataBase64: f.dataBase64 })
          : { ok: false, error: `${f.name} could not be read` };
      if (!res.ok) return res.error ?? `${f.name} did not send`;
      put.push({ name: f.name, stored });
    }
    const body = withFileLinks(first ?? '', put);
    if (body) return send(id)(body, { inReplyTo: null, mentions: [] });
    return null;
  };
  const firstChat = (person: { id: string; name: string; avatarUrl: string | null }, placeholder: string): ReactNode => {
    const put = async (op: 'putFile' | 'putFileFrom', roomId: string, file: object) => {
      const res = await call(op, roomId, file);
      return res.ok ? null : res.error ?? 'That file did not send';
    };
    return <FirstChatBox key={person.id} person={{ ...person, me: false }} placeholder={placeholder}
      open={async () => { const got = await chatWith(person.id, person.name); if ('error' in got) throw new Error(got.error); return got.id; }}
      send={(roomId, body, mentions) => send(roomId)(body, { inReplyTo: null, mentions })}
      putFile={(roomId, name, dataBase64) => put('putFile', roomId, { name, dataBase64 })}
      putFileFrom={(roomId, name, srcPath) => put('putFileFrom', roomId, { name, srcPath })}
      sending={rooms?.sending} onNotice={toast} />;
  };

  return {
    chatIn, startChat, firstChat,
    live, openId: !live ? null : open ? openId : empty ? 'groups' : null,
    open: (id: string) => openRoom(id), close, leave, page, dialogs, join, invisible, settingsPane,
    /** The sidebar's Groups: the group open last, or none. */
    openTab,
    mentions, openMention, faces, heading,
    dialogOpen: !!members || finderOpen || !!listing,
    /** After a team invite is taken up. */
    openTeamGroup: () => { wantTeam.current = true; },
    openGroupById: openRoom,
    /** Every list of decisions there is, for Ctrl+K: each group's, and each project that has any. */
    decisionLists: live ? [
      ...all.filter((r) => r.kind !== 'group' && !(r.listed && !r.teamId)).map((r) => ({ id: `room-${r.id}`, title: `Decisions in ${nameOf(r)}`, open: () => setListing({ roomId: r.id, project: null, title: `Decisions in ${nameOf(r)}` }) })),
      ...(teamRoom ? [...new Set(decisionsIn(teamRoom.id).filter((d) => d.on && d.project).map((d) => d.project!))].map((project) => ({
        id: `project-${project}`, title: `Decisions in ${project}`, open: () => setListing({ roomId: teamRoom.id, project, title: `Decisions in ${project}` }),
      })) : []),
    ] : [],
    /** Where a conversation or a project's thread files a decision: the team's own group. */
    teamGroup: teamRoom ? { name: nameOf(teamRoom), decide: (mark: { messageId: string; body: string; saidBy: string | null; project?: string }) => decide(teamRoom.id, { ...mark, kind: 'decision', on: true }) } : null,
    /** G, from any page: the finder over your groups. Null while Groups is off. */
    findGroup: live ? findGroup : null,
    /** The header's View button over everyone's threads, and B; on a group's chat, its options. Null anywhere else. */
    viewButton,
    /** The groups you are in, newest first, and the way to open one: what the
     *  command bar lists so a group can be reached by name from anywhere. */
    groups: groupList, pickGroup,
    /** The narrow sidebar's Groups row, which opens the group you were in last. */
    sidebarGroups: (onGroupsPage: boolean, chats?: () => void, label?: string) => <SidebarGroups onGroupsPage={onGroupsPage} onGroups={chats ?? openTab} label={label ?? (chats ? 'Chats' : 'Groups')} />,
    /** The group a teammate's card was opened over, for its Back. */
    roomName: open ? nameOf(open) : null,
    /** Who is in a direct record's chat, listed the way a group lists its people. */
    chatPeople: (people: string[]) => {
      const { members, wall, roomOf } = directPeople({ people, rooms: all, team, meId });
      return <PeoplePanel room={{ members, wall }} onPerson={(id) => { if (!roomOf[id]) return; openRoom(roomOf[id]); setPane(`person:${id}`); }} />;
    },
  };
}
