// Agents did not know the team's look: "I couldn't find the real onboarding
// colours in your notes, so I guessed the cream and copper" (Sofia's
// agent). Measured: nothing in Files, Chats or Settings held brand
// colours, fonts or a logo for a team, and the only instructions box was
// personal. Now the team's own group holds one document, team-look.md, that
// anyone on the team edits as a new version; each copy writes the newest
// version into its projects, and a worker whose project has it is told to read
// it before visual work.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';
import { createRooms, roomPrefsFile } from '../main/team/rooms.mts';
import { writeTeamLookDocs } from '../main/team/team-look-doc.mts';
import { TEAM_LOOK, TEAM_LOOK_LINE, TEAM_LOOK_TEMPLATE, newestTeamLook } from '../shared/team-look.mts';
import { Supervisor } from '../main/supervisor.mts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const timers = { setTimeout: (fn) => { const h = { off: false }; queueMicrotask(() => { if (!h.off) fn(); }); return h; }, clearTimeout: (h) => { if (h) h.off = true; } };
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('over the team group', () => {
  let maya, sofia, room;
  beforeEach(async () => {
    const cloud = createMemoryCloud();
    const mk = (name) => {
      const id = signUpMemory(cloud, { email: `${name.toLowerCase()}@lumen.test`, name });
      const backend = memoryBackend(cloud, id);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `team-look-${name}-`));
      const p = { id, name, backend, looks: [], teamState: { team: null, people: [], cards: [] } };
      p.rooms = createRooms({
        backend: () => backend, me: () => ({ id, name }), team: () => p.teamState, enabled: () => true, device: () => 'abcdefabcdef',
        presenceFacts: () => ({ running: [], items: [], products: [], summary: null }), prefsFile: roomPrefsFile(dir), filesDir: path.join(dir, 'f'), timers,
        teamLookDocs: ({ text }) => p.looks.push(text),
      });
      return p;
    };
    maya = mk('Maya'); sofia = mk('Sofia');
    const team = await maya.backend.createTeam('Lumen');
    await maya.backend.invite(team.id, 'sofia@lumen.test');
    await sofia.backend.acceptInvite(team.id);
    const people = [maya, sofia].map((p) => ({ id: p.id, name: p.name }));
    for (const p of [maya, sofia]) { p.teamState = { team, people, cards: [] }; await p.rooms.tick(); await settle(); }
    room = maya.rooms.state().rooms.find((r) => r.teamId).id;
  });

  it('starts with one Team look in the group, posted once whoever looks first', async () => {
    await maya.rooms.refresh(); await sofia.rooms.refresh(); await settle();
    const posts = (await maya.backend.roomMessages(room)).filter((m) => m.body.includes(`](attachments/${TEAM_LOOK})`));
    expect(posts).toHaveLength(1);
    expect(maya.looks.at(-1)).toBe(TEAM_LOOK_TEMPLATE);
    expect(sofia.looks.at(-1)).toBe(TEAM_LOOK_TEMPLATE);
  });

  it('an edit by anyone is the next version, and every copy writes it', async () => {
    const stored = 'mh2xk3a1-ab12cd-team-look.md';
    await sofia.rooms.putFile(room, { name: stored, dataBase64: Buffer.from('# Team look\n\n- Main: #2F5BEA\n').toString('base64') });
    await sofia.rooms.send(room, `Updated the Team look.\n\n[${TEAM_LOOK}](attachments/${stored})`);
    await maya.rooms.refresh(); await settle();
    expect(maya.looks.at(-1)).toContain('#2F5BEA');
  });
});

describe('the newest version', () => {
  const m = (at, body, over = {}) => ({ id: `m${at}`, at, body, ...over });
  it('is the last message naming team-look.md, whatever its stored name', () => {
    expect(newestTeamLook([m(1, `[team-look.md](attachments/${TEAM_LOOK})`), m(2, '[team-look.md](attachments/mh2xk3a1-ab12cd-team-look.md)')])).toBe('mh2xk3a1-ab12cd-team-look.md');
  });
  it('is not another file, nor a deleted message', () => {
    expect(newestTeamLook([m(1, '[look.md](attachments/look.md)'), m(2, `[x](attachments/${TEAM_LOOK})`, { deleted: true })])).toBeNull();
  });
});

describe('in each project', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-look-docs-')); });
  const product = (slug, over = {}) => { fs.mkdirSync(path.join(dir, slug), { recursive: true }); return { slug, dir: path.join(dir, slug), ...over }; };

  it('is written where agents read documents, and rewritten when it changes', () => {
    const app = product('app');
    expect(writeTeamLookDocs({ products: [app], text: 'v1' })).toBe(1);
    expect(writeTeamLookDocs({ products: [app], text: 'v1' })).toBe(0);
    writeTeamLookDocs({ products: [app], text: 'v2' });
    expect(fs.readFileSync(path.join(app.dir, TEAM_LOOK), 'utf8')).toMatch(/v2$/);
  });
  it('leaves a person\'s own team-look.md and a conversation alone', () => {
    const own = product('own');
    fs.writeFileSync(path.join(own.dir, TEAM_LOOK), 'mine');
    const chat = product('chat', { team: { direct: true } });
    expect(writeTeamLookDocs({ products: [own, chat], text: 'v1' })).toBe(0);
    expect(fs.readFileSync(path.join(own.dir, TEAM_LOOK), 'utf8')).toBe('mine');
    expect(fs.existsSync(path.join(chat.dir, TEAM_LOOK))).toBe(false);
  });
});

describe('what a worker is told', () => {
  const sup = (dir) => Object.assign(Object.create(Supervisor.prototype), { store: { listProducts: () => [{ slug: 'app', dir }] } });
  it('to read it, when its project has it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'team-look-brief-'));
    fs.writeFileSync(path.join(dir, TEAM_LOOK), 'x');
    expect(sup(dir).teamLookLine('app')).toBe(TEAM_LOOK_LINE);
    expect(TEAM_LOOK_LINE).toMatch(/Before visual work.*team-look\.md/);
  });
  it('nothing, on a project without it', () => {
    expect(sup(fs.mkdtempSync(path.join(os.tmpdir(), 'team-look-none-'))).teamLookLine('app')).toBeNull();
  });
  it('rides in the system prompt beside the project instructions', () => {
    expect(read('main/supervisor.mts')).toContain('const project = [this.projectInstructions(item.product, product), this.teamLookLine(item.product, product), this.editedFilesLine(item), this.filesFoldersLine(item, product)].filter(Boolean).join');
  });
});

describe('editing it in the group', () => {
  it('a markdown file in a group has Edit, which posts the next version', () => {
    expect(read('renderer/src/components/ArtifactView.tsx')).toMatch(/onNewVersion && kind === 'markdown'/);
    expect(read('renderer/src/team/rooms/RoomFileView.tsx')).toContain('onNewVersion={onNewVersion}');
    expect(read('renderer/src/team/rooms/RoomChat.tsx')).toMatch(/Updated \$\{shownName\(name\)\}\./);
  });
});
