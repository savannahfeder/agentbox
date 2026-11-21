// A power tester (2026-11-20) opened her team's group to the Team look post
// named "Agentbox" beside her own initials, "LE": the group drew every message
// by its owner's face, even one an agent wrote under its own name. The thread
// panel already draws such a message with the agent's face
// (renderer/src/team/ThreadPanel.tsx); the group now does the same.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const chat = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/team/rooms/RoomChat.tsx'), 'utf8');
const head = chat.slice(chat.indexOf('{headed && <div className="h">'), chat.indexOf('{m.editedAt && !m.deleted'));

describe('a group message an agent wrote', () => {
  it('takes its letters from the agent\'s name, drawn as an agent', () => {
    expect(head).toMatch(/<Face name=\{m\.voice \? m\.voice\.name : p\?\.name \?\? '\?'\}/);
    expect(head).toMatch(/agent=\{!!m\.voice\}/);
  });

  it('never wears the owner\'s photo', () => {
    expect(head).toMatch(/url=\{m\.voice \? undefined : p\?\.avatarUrl\}/);
  });

  it('a person\'s own message still wears their face and name', () => {
    expect(head).toMatch(/: nameOf\(m\.by\)/);
  });
});
